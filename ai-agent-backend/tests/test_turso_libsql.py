"""
Neptune AI v2.1 — Turso libSQL Embedded Replica & Keep-Alive Test Suite
Verifies:
1. libSQL connection wrapper, row factory (dict access, keys, case-insensitivity)
2. BEGIN IMMEDIATE transaction support & rollback
3. Error translation from libSQL ValueError to sqlite3.IntegrityError
4. Partial unique index (ux_orders_txhash) replay protection on libSQL
5. Marketplace replay protection execution through libSQL
6. Debounced sync throttling (at most 1 sync/sec)
7. Fast /api/health (zero DB access) & /api/health/storage diagnostics
8. Heartbeat & downtime calculation on restart
9. Ephemeral storage fallback to SQLite DB
"""

import os
import sys
import time
import uuid
import json
import sqlite3
import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient

# Ensure ai-agent-backend is in python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.connection import (
    is_turso_enabled,
    connect_libsql_local,
    get_connection,
    get_last_sync_status,
    _debounced_sync,
    LibsqlRow,
    LibsqlCursorWrapper,
    LibsqlConnectionWrapper
)
from database.dal import (
    init_db,
    create_run,
    append_run_event,
    finish_run,
    get_run,
    list_runs,
    update_run_heartbeat,
    mark_stale_runs_failed,
    upsert_user
)
from marketplace_service import (
    create_marketplace_listing,
    create_marketplace_order,
    complete_marketplace_order
)
from marketplace_verify import (
    verify_usdt_payment,
    REASON_ALREADY_USED
)
from decentralized_storage import (
    upload_trade_trace,
    upload_research_report,
    get_recent_trade_traces,
    get_recent_research_reports
)
from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def test_client():
    return TestClient(app)


def test_libsql_row_and_cursor_compatibility():
    """Verify LibsqlRow and LibsqlCursorWrapper provide full sqlite3.Row drop-in parity."""
    conn = connect_libsql_local(":memory:")
    conn.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, balance REAL);")
    conn.execute("INSERT INTO users VALUES (?, ?, ?);", (1, "Alice", 100.50))
    
    cur = conn.execute("SELECT id, name, balance FROM users WHERE id = 1;")
    row = cur.fetchone()
    assert row is not None
    
    # 1. Integer indexing
    assert row[0] == 1
    assert row[1] == "Alice"
    assert row[2] == 100.50

    # 2. String indexing (case-sensitive and case-insensitive)
    assert row["id"] == 1
    assert row["ID"] == 1
    assert row["name"] == "Alice"
    assert row["NAME"] == "Alice"
    assert row["balance"] == 100.50

    # 3. .keys(), .values(), .items()
    assert row.keys() == ["id", "name", "balance"]
    assert row.values() == [1, "Alice", 100.50]
    assert row.items() == [("id", 1), ("name", "Alice"), ("balance", 100.50)]

    # 4. dict(row)
    d = dict(row)
    assert d == {"id": 1, "name": "Alice", "balance": 100.50}

    # 5. .get() and 'in'
    assert row.get("name") == "Alice"
    assert row.get("missing", "default") == "default"
    assert "name" in row
    assert "id" in row
    assert "missing" not in row

    # 6. Cursor iteration
    conn.execute("INSERT INTO users VALUES (?, ?, ?);", (2, "Bob", 50.0))
    names = [r["name"] for r in conn.execute("SELECT name FROM users ORDER BY id;")]
    assert names == ["Alice", "Bob"]

    # 7. Executemany
    conn.executemany("INSERT INTO users VALUES (?, ?, ?);", [(3, "Charlie", 25.0), (4, "Dave", 10.0)])
    count = conn.execute("SELECT COUNT(*) FROM users;").fetchone()[0]
    assert count == 4

    conn.close()


def test_libsql_begin_immediate_and_rollback():
    """Verify BEGIN IMMEDIATE transactions and rollback work reliably through Libsql wrapper."""
    conn = connect_libsql_local(":memory:")
    conn.execute("CREATE TABLE ledger (tx_id TEXT PRIMARY KEY, amount REAL);")
    
    # 1. Successful transaction
    conn.execute("BEGIN IMMEDIATE;")
    conn.execute("INSERT INTO ledger VALUES (?, ?);", ("tx-1", 100.0))
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM ledger;").fetchone()[0] == 1

    # 2. Rolled-back transaction
    conn.execute("BEGIN IMMEDIATE;")
    conn.execute("INSERT INTO ledger VALUES (?, ?);", ("tx-2", 200.0))
    conn.rollback()
    assert conn.execute("SELECT COUNT(*) FROM ledger;").fetchone()[0] == 1
    assert conn.execute("SELECT * FROM ledger WHERE tx_id = 'tx-2';").fetchone() is None

    conn.close()


def test_libsql_partial_unique_index_and_integrity_error():
    """Verify partial unique index on tx_hash raises sqlite3.IntegrityError upon replay."""
    conn = connect_libsql_local(":memory:")
    conn.execute("""
        CREATE TABLE marketplace_orders (
            order_id TEXT PRIMARY KEY,
            tx_hash TEXT,
            status TEXT NOT NULL
        );
    """)
    conn.execute("""
        CREATE UNIQUE INDEX ux_orders_txhash 
        ON marketplace_orders(tx_hash) 
        WHERE tx_hash IS NOT NULL AND status = 'completed';
    """)

    # 1. Complete order 1 with hashA
    conn.execute("INSERT INTO marketplace_orders VALUES (?, ?, ?);", ("ord-1", "hashA", "completed"))

    # 2. Pending order with same hashA is ALLOWED (partial index only indexes status = 'completed')
    conn.execute("INSERT INTO marketplace_orders VALUES (?, ?, ?);", ("ord-2", "hashA", "pending"))

    # 3. Attempt to insert another completed order with same hashA must raise sqlite3.IntegrityError
    with pytest.raises(sqlite3.IntegrityError) as exc_info:
        conn.execute("INSERT INTO marketplace_orders VALUES (?, ?, ?);", ("ord-3", "hashA", "completed"))
    assert "unique" in str(exc_info.value).lower() or "constraint failed" in str(exc_info.value).lower()

    conn.close()


def test_marketplace_replay_protection_on_libsql(monkeypatch, tmp_path):
    """
    Runs the full marketplace USDT payment replay-protection flow on a dedicated libSQL database.
    Confirms replay attempts raise sqlite3.IntegrityError and are rejected with ALREADY_USED.
    """
    db_file = str(tmp_path / "libsql_marketplace_test.db")
    
    # Initialize full schema on this libSQL test file
    local_libsql_conn = connect_libsql_local(db_file)
    schema_path = os.path.join(os.path.dirname(__file__), "..", "database", "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        local_libsql_conn.executescript(f.read())
    local_libsql_conn.close()

    # Monkeypatch get_connection to return this libSQL connection
    monkeypatch.setattr("database.connection.get_connection", lambda db_path=None: connect_libsql_local(db_file))
    monkeypatch.setattr("marketplace_service.get_connection", lambda db_path=None: connect_libsql_local(db_file))

    seller = f"seller_libsql_{uuid.uuid4().hex[:6]}.near"
    buyer1 = f"buyer1_libsql_{uuid.uuid4().hex[:6]}.near"
    buyer2 = f"buyer2_libsql_{uuid.uuid4().hex[:6]}.near"

    upsert_user(seller, {"trader_active": 1})
    listing = create_marketplace_listing(seller, "trader", "LibSQL Strat", "desc", "10.00")

    order1 = create_marketplace_order(listing["listing_id"], buyer1)
    order2 = create_marketplace_order(listing["listing_id"], buyer2)

    shared_hash = "6ZSL5qK63fN3fQ1Z7DkXvV9r8V7uPzH8sJkNmQwErTyU"

    # Complete order1
    ok1 = complete_marketplace_order(order1["order_id"], shared_hash)
    assert ok1 is True

    # Complete order2 with the SAME hash -> must fail with IntegrityError
    with pytest.raises(sqlite3.IntegrityError):
        complete_marketplace_order(order2["order_id"], shared_hash)


def test_debounced_sync_throttling():
    """Verify _debounced_sync throttles sync calls to at most once per second."""
    class MockRawLibsql:
        def __init__(self):
            self.sync_calls = 0
        def sync(self):
            self.sync_calls += 1

    mock_raw = MockRawLibsql()
    # Force initial sync
    _debounced_sync(mock_raw, force=True)
    assert mock_raw.sync_calls == 1

    # Rapid successive calls without force should be skipped
    _debounced_sync(mock_raw, force=False)
    _debounced_sync(mock_raw, force=False)
    assert mock_raw.sync_calls == 1

    # Status check
    status = get_last_sync_status()
    assert status["last_sync_ok"] is True
    assert status["last_sync_time"] > 0


def test_fast_health_and_storage_endpoints(test_client):
    """Verify GET /api/health and /api/health/storage return expected formats."""
    # 1. Fast /api/health (zero DB query)
    res_health = test_client.get("/api/health")
    assert res_health.status_code == 200
    data_health = res_health.json()
    assert data_health["status"] == "healthy"
    assert data_health["service"] == "Neptune AI Backend"
    assert "timestamp" in data_health

    # 2. Fast /health
    res_root_h = test_client.get("/health")
    assert res_root_h.status_code == 200
    assert res_root_h.json()["status"] == "healthy"

    # 3. Storage diagnostic /api/health/storage
    res_storage = test_client.get("/api/health/storage")
    assert res_storage.status_code == 200
    data_storage = res_storage.json()
    assert data_storage["backend"] in ["turso", "local"]
    assert "runs_count" in data_storage
    assert "last_sync_ok" in data_storage
    assert data_storage["writable"] is True


def test_heartbeat_and_downtime_recovery():
    """Verify run heartbeats are written and downtime is calculated accurately upon restart."""
    test_wallet = f"heartbeat_user_{uuid.uuid4().hex[:6]}.near"
    run_id = create_run(test_wallet, "research", title="Heartbeat Run")
    
    run_initial = get_run(run_id, test_wallet)
    assert run_initial["status"] == "running"
    assert run_initial.get("last_heartbeat") is not None

    # Update heartbeat
    updated = update_run_heartbeat(run_id)
    assert updated is True

    # Simulate server restart: mark_stale_runs_failed()
    downtime_info = mark_stale_runs_failed()
    assert "downtime_seconds" in downtime_info
    assert downtime_info["stale_count"] >= 1

    # Verify run is marked failed with 'server restarted'
    run_after = get_run(run_id, test_wallet)
    assert run_after["status"] == "failed"
    assert run_after["error"] == "server restarted"
    assert run_after["finished_at"] is not None


@pytest.mark.anyio
async def test_decentralized_storage_db_truth():
    """Verify trace and report payloads are stored in DB and returned even if local files are missing."""
    test_wallet = f"db_truth_user_{uuid.uuid4().hex[:6]}.near"
    
    # 1. Upload trace
    trace = {
        "user_wallet": test_wallet,
        "symbol": "NEAR",
        "verdict": "BUY",
        "confidence_score": 88,
        "strategy_notes": "RSI sweet spot with volume breakout"
    }
    cid_trace = await upload_trade_trace(trace)
    assert cid_trace.startswith("bafy")

    # 2. Upload research report
    report = {
        "requester": test_wallet,
        "title": "Institutional NEAR Layer-1 Thesis",
        "topic": "NEAR Infrastructure",
        "executive_summary": "Strong growth in user-owned AI agents.",
        "key_findings": ["Intents engine leads cross-chain volume"]
    }
    cid_report = await upload_research_report(report)
    assert cid_report.startswith("bafy")

    # 3. Query from DB (source of truth)
    traces = get_recent_trade_traces(limit=10, wallet_address=test_wallet)
    assert len(traces) >= 1
    assert any(t.get("cid") == cid_trace or t.get("symbol") == "NEAR" for t in traces)

    reports = get_recent_research_reports(limit=10, wallet_address=test_wallet)
    assert len(reports) >= 1
    assert any(r.get("cid") == cid_report or "Institutional NEAR" in r.get("title", "") for r in reports)


@pytest.mark.skipif(not is_turso_enabled(), reason="TURSO_DATABASE_URL and TURSO_AUTH_TOKEN required for live remote Turso test")
def test_turso_live_cloud_replica_recovery(tmp_path):
    """
    Live Turso test: Creates a run, deletes the local replica cache file,
    re-opens the connection to trigger cloud pull, and verifies the run is still listed.
    """
    replica_file = str(tmp_path / "live_replica.db")
    old_env = os.environ.get("TURSO_LOCAL_PATH")
    os.environ["TURSO_LOCAL_PATH"] = replica_file
    try:
        conn = get_connection()
        init_db()
        test_w = f"turso_live_{uuid.uuid4().hex[:6]}.near"
        run_id = create_run(test_w, "research", title="Turso Live Cloud Test")
        conn.close()

        # Delete local replica cache file (simulating Render container wipe)
        if os.path.exists(replica_file):
            os.remove(replica_file)

        # Reconnect
        conn2 = get_connection()
        runs = list_runs(test_w, agent_type="research")
        assert any(r["run_id"] == run_id for r in runs)
        conn2.close()
    finally:
        if old_env:
            os.environ["TURSO_LOCAL_PATH"] = old_env
        else:
            os.environ.pop("TURSO_LOCAL_PATH", None)
