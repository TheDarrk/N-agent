import os
import sys
import pytest
from datetime import datetime, timezone, timedelta

# Ensure backend root is on PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.connection import get_connection, normalize_wallet
from database.dal import (
    init_db,
    upsert_scheduled_job,
    list_enabled_jobs,
    mark_job_run,
    disable_job,
    is_user_active_recently,
    create_run,
    save_chat_message
)

TEST_DB = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_sched_persistence.db"))

@pytest.fixture(autouse=True)
def setup_test_db(monkeypatch):
    monkeypatch.setenv("TURSO_DATABASE_URL", "")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "")
    monkeypatch.setenv("RENDER", "")
    monkeypatch.setattr("database.connection.is_turso_enabled", lambda: False)
    monkeypatch.setattr("database.dal.is_turso_enabled", lambda: False)
    monkeypatch.setattr("database.connection.DB_PATH", TEST_DB)
    monkeypatch.setattr("database.dal.DB_PATH", TEST_DB)

    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

    init_db(TEST_DB)
    yield
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass


def test_upsert_and_list_scheduled_jobs():
    wallet = "testuser.near"
    job = upsert_scheduled_job(
        wallet=wallet,
        agent_type="trader",
        purpose="trade_poll",
        interval_seconds=3600,
        config={"symbol": "NEAR", "timeframe": "1h"},
        enabled=1,
        db_path=TEST_DB
    )
    assert job["job_id"] == "testuser.near:trader:trade_poll"
    assert job["wallet"] == "testuser.near"
    assert job["interval_seconds"] == 3600
    assert job["enabled"] == 1
    assert job["config"]["symbol"] == "NEAR"

    # List enabled jobs
    jobs = list_enabled_jobs(db_path=TEST_DB)
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "testuser.near:trader:trade_poll"
    assert jobs[0]["config"]["timeframe"] == "1h"


def test_mark_job_run_updates_timestamp():
    wallet = "testuser.near"
    upsert_scheduled_job(
        wallet=wallet,
        agent_type="rebalancer",
        purpose="rebalance_cadence",
        interval_seconds=604800,
        config={"cadence_days": 7},
        db_path=TEST_DB
    )
    job_id = "testuser.near:rebalancer:rebalance_cadence"
    new_next_run = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    ok = mark_job_run(job_id, new_next_run, db_path=TEST_DB)
    assert ok is True

    jobs = list_enabled_jobs(agent_type="rebalancer", db_path=TEST_DB)
    assert len(jobs) == 1
    assert jobs[0]["next_run_at"] == new_next_run


def test_disable_job():
    wallet = "testuser.near"
    job_id = "testuser.near:trader:trade_poll"
    upsert_scheduled_job(
        wallet=wallet,
        agent_type="trader",
        purpose="trade_poll",
        interval_seconds=3600,
        db_path=TEST_DB
    )
    assert len(list_enabled_jobs(db_path=TEST_DB)) == 1

    disable_job(job_id, db_path=TEST_DB)
    # Disabled jobs should no longer be listed
    assert len(list_enabled_jobs(db_path=TEST_DB)) == 0


def test_user_inactivity_check():
    wallet = "inactive_whale.near"
    active_wallet = "active_trader.near"

    # Brand new wallet with no activity is NOT active
    assert is_user_active_recently(wallet, days=14, db_path=TEST_DB) is False

    # Simulate run for active_wallet
    run_id = create_run(active_wallet, "trader", title="Test Run", db_path=TEST_DB)
    assert run_id is not None
    assert is_user_active_recently(active_wallet, days=14, db_path=TEST_DB) is True

    # Chat message also marks active
    chat_wallet = "chatty_user.near"
    assert is_user_active_recently(chat_wallet, days=14, db_path=TEST_DB) is False
    save_chat_message(chat_wallet, "user", "Hello Neptune", db_path=TEST_DB)
    assert is_user_active_recently(chat_wallet, days=14, db_path=TEST_DB) is True


def test_overdue_job_recovery_logic():
    wallet = "recovering_user.near"
    # Create job scheduled 2 hours ago (server was asleep)
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    upsert_scheduled_job(
        wallet=wallet,
        agent_type="trader",
        purpose="trade_poll",
        interval_seconds=3600,
        next_run_at=past_iso,
        db_path=TEST_DB
    )

    jobs = list_enabled_jobs(db_path=TEST_DB)
    assert len(jobs) == 1
    job = jobs[0]
    next_dt = datetime.fromisoformat(job["next_run_at"])
    now_utc = datetime.now(timezone.utc)
    # Overdue check
    is_overdue = next_dt <= now_utc
    assert is_overdue is True
