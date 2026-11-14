"""
1) Turso replica 'database is locked' on writes is retried (and serialized) instead of failing the run.
2) Research reports are saved and retrieved even when the latest runs failed / were duplicated.
3) Obsolete scheduled job types are disabled once.
4) Reads never secretly write (upsert_user on an existing user performs zero writes).
"""
import asyncio
import os
import sys
import threading
import time
import uuid

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from database import init_db  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


class _FlakyRawCursor:
    def __init__(self, fail_times):
        self.fail_times = fail_times
        self.calls = 0
        self.description = None

    def execute(self, sql, params=None):
        self.calls += 1
        if self.calls <= self.fail_times:
            raise ValueError("Failed to checkpoint WAL: database is locked")

    def close(self):
        pass


def test_locked_write_is_retried_then_succeeds():
    from database.connection import LibsqlCursorWrapper
    raw = _FlakyRawCursor(fail_times=2)
    cur = LibsqlCursorWrapper(raw)
    t0 = time.monotonic()
    cur.execute("UPDATE t SET a = ?", (1,))
    assert raw.calls == 3, "two 'locked' failures then success"
    assert time.monotonic() - t0 >= 0.25  # backoff 0.1 + 0.2


def test_non_lock_errors_are_not_retried():
    from database.connection import LibsqlCursorWrapper

    class Bad(_FlakyRawCursor):
        def execute(self, sql, params=None):
            self.calls += 1
            raise ValueError("syntax error near FOO")

    raw = Bad(0)
    with pytest.raises(ValueError):
        LibsqlCursorWrapper(raw).execute("UPDATE t SET a = 1")
    assert raw.calls == 1


def test_writes_never_overlap_between_threads():
    from database.connection import LibsqlCursorWrapper
    active = {"n": 0, "max": 0}
    guard = threading.Lock()

    class Slow(_FlakyRawCursor):
        def execute(self, sql, params=None):
            with guard:
                active["n"] += 1
                active["max"] = max(active["max"], active["n"])
            time.sleep(0.05)
            with guard:
                active["n"] -= 1

    ts = [threading.Thread(target=lambda: LibsqlCursorWrapper(Slow(0)).execute("INSERT INTO t VALUES (1)")) for _ in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert active["max"] == 1, "all writes must be serialized by the process-wide write lock"


def test_reports_saved_and_listed_even_when_latest_runs_failed():
    from database import create_run, finish_run
    from history_store import record_research_report, get_recent_research_reports

    wallet = f"rep_{uuid.uuid4().hex[:6]}.near"
    rid = asyncio.run(record_research_report({"requester": wallet, "topic": "NEAR yields", "title": "Report A"}))

    # 12 newer runs that all failed (e.g. DB lock / duplicate starts) must not hide the saved report
    for _ in range(12):
        run = create_run(wallet, "research", title="dup")
        finish_run(run, None, None, "Failed to checkpoint WAL: database is locked")

    reports = get_recent_research_reports(limit=10, wallet_address=wallet)
    assert [r["cid"] for r in reports] == [rid]
    assert reports[0]["title"] == "Report A"


def test_report_payload_can_be_updated_with_final_cards():
    from history_store import record_research_report, get_recent_research_reports
    from database import update_research_report_full

    wallet = f"rep2_{uuid.uuid4().hex[:6]}.near"
    report = {"requester": wallet, "topic": "x", "title": "T"}
    rid = asyncio.run(record_research_report(report))
    final = dict(report, cot_step_cards=[{"step_number": 1}, {"step_number": 2}, {"step_number": 3}])
    assert update_research_report_full(rid, final) is True
    got = get_recent_research_reports(limit=5, wallet_address=wallet)[0]
    assert len(got["cot_step_cards"]) == 3 and got["cid"] == rid


def test_obsolete_research_job_is_disabled_once(monkeypatch):
    import database
    import main
    disabled, marked = [], []
    monkeypatch.setattr(database, "disable_job", lambda jid, *a, **k: disabled.append(jid) or True)
    monkeypatch.setattr(database, "mark_job_run", lambda *a, **k: marked.append(a) or True)
    job = {"job_id": "w.near:research:fleet_deliberation", "wallet": "w.near", "agent_type": "research",
           "interval_seconds": 300, "next_run_at": "2020-01-01T00:00:00+00:00", "config": {}}
    asyncio.run(main.execute_persisted_job(job))
    assert disabled == ["w.near:research:fleet_deliberation"] and marked == []


def test_upsert_user_on_existing_user_does_no_writes(monkeypatch):
    """A 'read' (fleet / wallet config) must not cost five remote writes when the user already exists."""
    from database import upsert_user
    from database import connection as c
    wallet = f"nowrite_{uuid.uuid4().hex[:6]}.near"
    upsert_user(wallet)  # first call creates the rows

    writes = []
    real = c.sqlite3.Connection.execute if hasattr(c, "sqlite3") else None

    class Spy(c.sqlite3.Connection):
        def execute(self, sql, *a, **k):
            if not c._is_read_statement(sql):
                writes.append(" ".join(sql.split())[:60])
            return super().execute(sql, *a, **k)

    orig_get = c.get_connection

    def spy_get(db_path=None):
        import sqlite3
        conn = orig_get(db_path)
        if isinstance(conn, sqlite3.Connection):
            target = db_path or os.getenv("DATABASE_PATH") or os.getenv("NEPTUNE_DB_PATH") or c.DB_PATH
            conn.close()
            conn = sqlite3.connect(target, timeout=30.0, check_same_thread=False, factory=Spy)
            conn.row_factory = sqlite3.Row
        return conn

    import database.dal as dal
    monkeypatch.setattr(dal, "get_connection", spy_get)
    dal.upsert_user(wallet)
    assert writes == [], f"existing user must not trigger INSERTs, got {writes}"
