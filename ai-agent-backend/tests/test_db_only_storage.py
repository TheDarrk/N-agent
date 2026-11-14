"""
Nothing may be stored on local disk (Render's disk is ephemeral and counts toward memory):
research knowledge base, chart images, history records, pipeline logs -> DB / memory only.
Also covers the scheduler's catch-up coalescing and concurrency cap.
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

import pytest

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from database import init_db  # noqa: E402

BACKEND = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


def _snapshot_files():
    out = set()
    for root, dirs, files in os.walk(BACKEND):
        dirs[:] = [d for d in dirs if d not in ("__pycache__", ".pytest_cache", "tests", ".git", "node_modules")]
        for f in files:
            if f.endswith((".json", ".png", ".sqlite3", ".bin", ".pickle")):
                out.add(os.path.join(root, f))
    return out


def test_db_collection_upsert_query_count_and_no_files():
    from autonomous_agents import research_crawler_tool  # puts backend/scrapper first on sys.path
    sc = research_crawler_tool.scrapper
    assert sc is not None and hasattr(sc, "DBCollection"), "backend scrapper (DB-backed) must be the one imported"
    before = _snapshot_files()
    col = sc.get_collection()
    topic = f"t{uuid.uuid4().hex[:6]}"
    now = datetime.now(timezone.utc).isoformat()
    docs = [
        "NEAR liquid staking yields stNEAR LiNEAR validator APY rewards and delegation explained in depth for stakers",
        "Ref Finance concentrated liquidity pools and swap fees on NEAR DEX with TVL statistics for traders",
        "Hackathon grants and developer bounties for builders with submission deadlines and prizes",
    ]
    metas = [{"url": f"https://x/{i}", "title": f"doc{i}", "topic": topic, "depth": 0, "published_date": "2026-01-01",
              "year": "2026", "classification": "Latest", "crawled_at": now} for i in range(3)]
    col.upsert(ids=[f"{topic}-{i}" for i in range(3)], documents=docs, metadatas=metas)

    assert col.count(where={"topic": topic}) == 3
    res = col.query(query_texts=["liquid staking validator yields"], n_results=2, where={"topic": topic})
    assert res["documents"][0][0] == docs[0]
    assert 0 < res["distances"][0][0] < 1
    # research() end-to-end ranking + date filter
    out = sc.research(topic, "hackathon grants bounties", n=1)
    assert out and "Hackathon" in out[0]["text"]
    # no keyword overlap still returns fresh evidence instead of zero sources
    assert sc.research(topic, "zzzzqqq", n=2)
    assert _snapshot_files() == before, "knowledge base must not create files on disk"


def test_record_ids_in_db_and_no_files(tmp_path):
    from history_store import record_trade_trace, record_research_report, get_recent_trade_traces
    before = _snapshot_files()
    w = f"nofile_{uuid.uuid4().hex[:6]}.near"
    tid = asyncio.run(record_trade_trace({"user_wallet": w, "symbol": "ETH", "verdict": "BUY"}))
    rid = asyncio.run(record_research_report({"requester": w, "topic": "x"}))
    assert tid.startswith("TRC-") and rid.startswith("RSH-")
    assert get_recent_trade_traces(wallet_address=w)[0]["cid"] == tid
    assert _snapshot_files() == before


def test_chart_rendered_in_memory_only():
    from chart_visualizer import render_chart_image
    before = _snapshot_files()
    candles = [{"open": 10 + i * .1, "high": 10.5 + i * .1, "low": 9.5 + i * .1, "close": 10.2 + i * .1,
                "volume": 1000 + i, "timestamp": 1700000000 + i * 3600} for i in range(40)]
    res = render_chart_image(candles, "NEAR", "1h", "Bull Flag", 14.0, 9.0, 11.0)
    assert res["data_uri"].startswith("data:image/png;base64,") or res["data_uri"] == ""
    assert res["file_path"] == ""
    assert _snapshot_files() == before, "chart rendering must not create image files"


# ---------------- scheduler: coalescing + concurrency ----------------

@pytest.fixture(autouse=True)
def _fast_moderator(monkeypatch):
    """Scheduler tests must not run a real fleet audit; the cadence check is stubbed."""
    from autonomous_agents.moderator_agent import ModeratorAgent

    async def _noop(self, wallet):
        return None
    monkeypatch.setattr(ModeratorAgent, "run_cadence_check", _noop)


def _job(next_run_at, interval=3600, jid=None):
    return {"job_id": jid or f"w.near:moderator:{uuid.uuid4().hex[:4]}", "wallet": "w.near", "agent_type": "moderator",
            "interval_seconds": interval, "next_run_at": next_run_at, "config": {}}


def test_scheduler_coalesces_six_missed_cycles_into_one_run(monkeypatch):
    import database
    import main
    calls = []
    monkeypatch.setattr(database, "mark_job_run", lambda jid, nxt, *a, **k: calls.append((jid, nxt)) or True)
    monkeypatch.setattr(database, "is_user_active_recently", lambda *a, **k: True)
    main._INFLIGHT_JOBS.clear()

    overdue = (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat()  # 6 missed hourly cycles
    job = _job(overdue)
    asyncio.run(main.execute_persisted_job(job))

    assert len(calls) == 1, "six missed cycles must produce exactly ONE run"
    next_dt = datetime.fromisoformat(calls[0][1])
    assert next_dt > datetime.now(timezone.utc) + timedelta(minutes=55), "next run is scheduled from NOW, not replayed"
    assert not main._INFLIGHT_JOBS


def test_scheduler_skips_inflight_and_respects_concurrency_cap(monkeypatch):
    import database
    import main
    calls = []
    monkeypatch.setattr(database, "mark_job_run", lambda jid, nxt, *a, **k: calls.append(jid) or True)
    monkeypatch.setattr(database, "is_user_active_recently", lambda *a, **k: True)

    due = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    job = _job(due, jid="same:job")

    main._INFLIGHT_JOBS.clear()
    main._INFLIGHT_JOBS.add("same:job")  # previous cycle still running
    asyncio.run(main.execute_persisted_job(job))
    assert calls == []

    main._INFLIGHT_JOBS.clear()
    monkeypatch.setattr(main, "MAX_CONCURRENT_JOBS", 1)
    main._INFLIGHT_JOBS.add("other:running")  # cap reached
    asyncio.run(main.execute_persisted_job(_job(due)))
    assert calls == [], "deferred jobs stay due (next_run_at untouched)"
    main._INFLIGHT_JOBS.clear()
