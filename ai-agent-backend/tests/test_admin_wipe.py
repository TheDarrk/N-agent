import os
import json
import pytest
import tempfile
from fastapi.testclient import TestClient

from main import app
from database.connection import get_connection, is_turso_enabled
from database.dal import init_db, wipe_all_data, create_run, append_run_event


@pytest.fixture
def wipe_test_env(monkeypatch):
    """Setup isolated test database for wipe testing."""
    monkeypatch.setattr("database.connection.is_turso_enabled", lambda: False)
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    monkeypatch.setenv("NEPTUNE_DB_PATH", path)
    monkeypatch.setenv("ADMIN_WIPE_TOKEN", "test_admin_secret_wipe_token_123")

    # Seed data
    conn = get_connection(path)
    conn.execute(
        "INSERT OR REPLACE INTO chat_messages (message_id, wallet, role, content) VALUES ('msg_1', 'user1.near', 'user', 'hello')"
    )
    conn.execute(
        "INSERT OR REPLACE INTO scheduled_jobs (job_id, wallet, agent_type, purpose, interval_seconds, next_run_at) "
        "VALUES ('job_1', 'user1.near', 'trader', 'trade_poll', 3600, '2026-11-14T00:00:00Z')"
    )
    conn.commit()
    conn.close()

    create_run(wallet="user1.near", agent_type="trader", db_path=path)

    yield path

    if os.path.exists(path):
        try:
            os.remove(path)
        except Exception:
            pass


def test_wipe_all_data_direct(wipe_test_env):
    """Verify wipe_all_data purges all user data tables and returns deleted count."""
    db_path = wipe_test_env

    # Confirm data exists before wipe
    conn = get_connection(db_path)
    cur = conn.execute("SELECT COUNT(*) FROM chat_messages")
    assert cur.fetchone()[0] > 0
    cur = conn.execute("SELECT COUNT(*) FROM scheduled_jobs")
    assert cur.fetchone()[0] > 0
    cur = conn.execute("SELECT COUNT(*) FROM agent_runs")
    assert cur.fetchone()[0] > 0
    conn.close()

    # Perform wipe
    stats = wipe_all_data(db_path)
    assert stats["status"] == "success"
    assert stats["records_deleted"] >= 3
    assert "chat_messages" in stats["tables_wiped"]
    assert "agent_runs" in stats["tables_wiped"]
    assert "scheduled_jobs" in stats["tables_wiped"]

    # Confirm tables are empty after wipe
    conn = get_connection(db_path)
    assert conn.execute("SELECT COUNT(*) FROM chat_messages").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM scheduled_jobs").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0] == 0
    conn.close()


def test_admin_wipe_endpoint_auth_and_safeguards(wipe_test_env):
    """Verify API endpoint enforces X-Admin-Token and exact confirmation phrase."""
    client = TestClient(app)

    # 1. Missing X-Admin-Token -> 401
    resp = client.request("DELETE", "/api/admin/wipe-all", json={"confirm": "WIPE ALL DATA"})
    assert resp.status_code == 401
    assert "Unauthorized" in resp.json()["detail"]

    # 2. Invalid X-Admin-Token -> 401
    resp = client.request(
        "DELETE",
        "/api/admin/wipe-all",
        headers={"X-Admin-Token": "wrong_token"},
        json={"confirm": "WIPE ALL DATA"}
    )
    assert resp.status_code == 401

    # 3. Valid token, but missing or wrong confirmation phrase -> 400
    resp = client.request(
        "DELETE",
        "/api/admin/wipe-all",
        headers={"X-Admin-Token": "test_admin_secret_wipe_token_123"},
        json={"confirm": "please delete"}
    )
    assert resp.status_code == 400
    assert "Confirmation phrase required" in resp.json()["detail"]

    # 4. Valid token + exact confirmation phrase -> 200 Success
    resp = client.request(
        "DELETE",
        "/api/admin/wipe-all",
        headers={"X-Admin-Token": "test_admin_secret_wipe_token_123"},
        json={"confirm": "WIPE ALL DATA"}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "tables_wiped" in data
    assert isinstance(data["records_deleted"], int)
