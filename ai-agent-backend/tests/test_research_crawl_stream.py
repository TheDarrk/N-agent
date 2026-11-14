"""
Research crawl is the first streamed step, runs seeds in parallel, reports live progress,
and duplicate start requests collapse into one live run.
"""
import asyncio
import os
import sys
import threading
import time

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))


def test_stream_crawl_emits_progress_and_runs_seeds_in_parallel():
    from autonomous_agents.research_agent import ResearchAgent
    agent = ResearchAgent()
    threads_seen = set()

    def fake_crawl(urls, topic, date_range, max_pages_per_seed, max_depth, progress_cb, budget_seconds):
        def seed_worker(u):
            threads_seen.add(threading.get_ident())
            for i in range(3):
                time.sleep(0.2)
                progress_cb({"event": "page", "seed": u, "url": f"{u}/p{i}", "depth": i, "pages": i + 1,
                             "result": "indexed" if i % 2 == 0 else "seen"})
            progress_cb({"event": "seed_done", "seed": u, "indexed": 2})
        ts = [threading.Thread(target=seed_worker, args=(u,)) for u in urls]
        [t.start() for t in ts]
        [t.join() for t in ts]
        return {"indexed": 6, "skipped": 0}

    agent.crawler_tool.crawl_custom_sources = fake_crawl

    async def run():
        evs = []
        t0 = time.monotonic()
        async for ev in agent._stream_crawl(["https://a.io", "https://b.io", "https://c.io"], "1_month"):
            evs.append(ev)
        return evs, time.monotonic() - t0

    evs, took = asyncio.run(run())
    assert evs[0]["type"] == "pre_crawl" and evs[0]["status"] == "started" and evs[0]["seeds_total"] == 3
    assert evs[-1]["status"] == "done" and evs[-1]["pages"] == 9 and evs[-1]["indexed"] == 6
    assert any(e["status"] == "progress" for e in evs)
    assert len(threads_seen) == 3, "each seed must crawl in its own thread"
    assert took < 1.2, f"3 seeds x 0.6s must overlap (sequential would be 1.8s), took {took:.2f}s"


def test_concurrent_start_requests_reuse_one_live_run():
    import main

    async def scenario():
        main._LIVE_RUNS.clear()
        main._STARTING_RUNS.clear()
        main.RUNNING_TASKS.clear()
        first = await main._reuse_live_run("dup.near", "research")
        assert first is None  # claimed the slot

        async def second():
            return await main._reuse_live_run("dup.near", "research")

        waiter = asyncio.create_task(second())
        await asyncio.sleep(0.2)

        async def never_ending():
            await asyncio.sleep(5)

        task = asyncio.create_task(never_ending())
        main.RUNNING_TASKS["run-1"] = task
        main._register_live_run("dup.near", "research", "run-1")
        assert await waiter == "run-1"
        assert await main._reuse_live_run("dup.near", "research") == "run-1"
        # another agent / another wallet is independent
        assert await main._reuse_live_run("dup.near", "trader") is None
        main._STARTING_RUNS.clear()
        task.cancel()
        main.RUNNING_TASKS.clear()
        main._LIVE_RUNS.clear()

    asyncio.run(scenario())
