"""
A busy/locked database must put a run ON HOLD (never fail it), runs persist off the event loop in batches,
the lock reports who blocks whom, and the two pollers (frequent / lazy) are wired.
"""
import asyncio
import json
import logging
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


def test_run_waits_on_locked_db_then_resumes_without_failing(monkeypatch):
    import main
    import database
    from database import create_run, get_run, get_run_events

    wallet = f"hold_{uuid.uuid4().hex[:6]}.near"
    run_id = create_run(wallet, "research", title="hold test")

    real_batch = database.append_run_events_batch
    calls = {"n": 0}

    def flaky_batch(rid, events):
        calls["n"] += 1
        if calls["n"] <= 3:
            raise ValueError("Failed to checkpoint WAL: database is locked")
        return real_batch(rid, events)

    monkeypatch.setattr(database, "append_run_events_batch", flaky_batch)
    monkeypatch.setattr(main.asyncio, "sleep", main.asyncio.sleep)  # keep real sleep; backoff is capped

    async def scenario():
        async def gen():
            yield json.dumps({"type": "step", "step_number": 1, "message": "one"}) + "\n"
            yield json.dumps({"type": "step", "step_number": 2, "message": "two"}) + "\n"
            yield json.dumps({"type": "result", "data": {"cid": "RSH-TEST", "title": "ok"}}) + "\n"

        saw_hold = {"v": False}

        async def watcher():
            for _ in range(200):
                if run_id in main._HOLD_STATE:
                    saw_hold["v"] = True
                    return
                await asyncio.sleep(0.05)

        w = asyncio.create_task(watcher())
        await main._execute_run(run_id, "research", wallet, gen)
        # the pipeline finished instantly; the DB writes are still being retried by the background writer
        deadline = time.time() + 40
        while time.time() < deadline:
            run = await asyncio.to_thread(get_run, run_id, wallet)
            if run and run["status"] != "running":
                break
            await asyncio.sleep(0.5)
        await w
        return saw_hold["v"]

    saw_hold = asyncio.run(scenario())

    run = get_run(run_id, wallet=wallet)
    assert run["status"] == "completed", f"a busy DB must not fail the run: status={run['status']} error={run.get('error')}"
    assert saw_hold, "run should have been ON HOLD while the DB was locked"
    assert run_id not in main._HOLD_STATE, "hold must be cleared after resume"
    msgs = [e.get("message") for e in get_run_events(run_id) if e.get("type") == "step"]
    assert msgs == ["one", "two"], "events saved in order"
    assert calls["n"] >= 4


def test_stream_reports_on_hold_and_keeps_going(monkeypatch):
    import main

    class Req:
        async def is_disconnected(self):
            return False

    main._HOLD_STATE["run-x"] = {"since": time.time() - 3, "reason": "database busy"}

    def boom(*a, **k):
        raise ValueError("database is locked")

    monkeypatch.setattr(main, "get_run_events", boom)

    async def scenario():
        gen = main._stream_run_events("run-x", None, 0, Req())
        first = json.loads(await gen.__anext__())
        second = json.loads(await gen.__anext__())
        await gen.aclose()
        return first, second

    first, second = asyncio.run(scenario())
    main._HOLD_STATE.pop("run-x", None)
    assert first["type"] == "on_hold" and "waiting for the database" in first["message"]
    assert second["type"] == "on_hold"  # read error also reported as hold, stream is not terminated


def test_lock_logs_who_blocks_whom(caplog):
    from database.connection import _TrackedLock
    lock = _TrackedLock()
    release = threading.Event()
    started = threading.Event()

    def holder():
        lock.acquire_for("UPDATE big_table SET x = 1", 30)
        started.set()
        release.wait(10)
        lock.release()

    t = threading.Thread(target=holder, name="holder-thread")
    t.start()
    started.wait(5)

    def freer():
        time.sleep(2.2)
        release.set()

    threading.Thread(target=freer).start()
    with caplog.at_level(logging.WARNING, logger="neptune.database.connection"):
        lock.acquire_for("INSERT INTO agent_run_events", 30)
        lock.release()
    t.join()
    text = " ".join(r.getMessage() for r in caplog.records)
    assert "DB-WAIT" in text and "holder-thread" in text and "UPDATE big_table" in text


def test_pollers_frequent_and_lazy_are_configured_and_tick_endpoint(monkeypatch):
    import main
    assert main.FREQUENT_POLL_SECONDS < main.LAZY_POLL_SECONDS
    assert main.FREQUENT_POLL_SECONDS >= 10 and main.LAZY_POLL_SECONDS >= 60

    ran = {"frequent": 0, "lazy": 0}

    async def fake_due():
        ran["frequent"] += 1
        return {"status": "ok", "launched": 0}

    async def fake_lazy():
        ran["lazy"] += 1
        return {}

    monkeypatch.setattr(main, "run_due_persisted_jobs", fake_due)
    monkeypatch.setattr(main, "lazy_poll_tick", fake_lazy)
    main._last_lazy_run = 0.0  # lazy pass overdue -> the keep-alive tick also runs it
    res = asyncio.run(main.scheduler_tick(wait=True))
    assert ran["frequent"] == 1 and ran["lazy"] == 1 and res["lazy_ran"] is True


def test_tick_endpoint_accepts_head_get_post_for_uptime_monitors():
    """UptimeRobot (free plan) probes with HEAD: the endpoint must not answer 405 and must answer instantly."""
    from fastapi.testclient import TestClient
    import main
    client = TestClient(main.app)
    for method in ("HEAD", "GET", "POST"):
        t0 = time.monotonic()
        r = client.request(method, "/api/scheduler/tick")
        assert r.status_code == 200, f"{method} -> {r.status_code}"
        assert time.monotonic() - t0 < 3, f"{method} must answer immediately (work runs in the background)"
