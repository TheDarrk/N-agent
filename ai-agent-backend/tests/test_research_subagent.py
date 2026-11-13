import os
import json
import pytest
import asyncio
from unittest.mock import patch, AsyncMock
from autonomous_agents.research_agent import (
    get_default_sources_for_coins,
    run_research_subagent,
    ResearchAgent,
    _SUBAGENT_CACHE
)


@pytest.fixture(autouse=True)
def disable_turso_and_clean_cache(monkeypatch):
    """Disable Turso remote sync and reset in-memory cache for clean testing."""
    monkeypatch.setattr("database.connection.is_turso_enabled", lambda: False)
    _SUBAGENT_CACHE.clear()
    yield
    _SUBAGENT_CACHE.clear()


def test_default_sources_loading():
    """Verify default_sources.json exists and loads correct seed URLs for coins."""
    sources_near = get_default_sources_for_coins(["NEAR"])
    assert len(sources_near) >= 3
    urls_near = [s["url"] for s in sources_near]
    assert any("near.org" in u for u in urls_near)

    sources_multi = get_default_sources_for_coins(["BTC", "ETH", "USDT"])
    assert len(sources_multi) >= 3
    urls_multi = [s["url"] for s in sources_multi]
    assert any("bitcoin.org" in u or "mempool.space" in u for u in urls_multi)
    assert any("ethereum.org" in u for u in urls_multi)
    assert any("tether.to" in u for u in urls_multi)


def test_subagent_trader_parameters():
    """Verify trader calling agent defaults to depth 2 and trader focus."""
    async def _run():
        mock_report = {
            "title": "Mock Trader Research",
            "executive_summary": "Strong bullish momentum confirmed across DEX order books.",
            "findings": "Liquidity concentration at current range.",
            "risk_factors": "Low volume retracement risk.",
            "signals": [{"direction": "BUY", "confidence": 85}]
        }

        with patch.object(ResearchAgent, "generate_research_report", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_report
            res = await run_research_subagent(
                wallet="test_trader_wallet.near",
                calling_agent="trader",
                coins=["NEAR"]
            )

            assert res["calling_agent"] == "trader"
            assert res["depth"] == 2
            assert res["signal"] == "BUY"
            assert res["confidence"] == 85
            assert res["cached"] is False
            assert len(res["sources"]) > 0
            assert mock_gen.called

    asyncio.run(_run())


def test_subagent_rebalancer_parameters():
    """Verify rebalancer calling agent defaults to depth 1 and rebalancer focus."""
    async def _run():
        mock_report = {
            "title": "Mock Rebalancer Research",
            "executive_summary": "Macro correlations indicate risk-on regime.",
            "findings": "Stablecoin peg stability is optimal.",
            "risk_factors": "Beta expansion across volatile pairs.",
            "signals": [{"direction": "BALANCED", "confidence": 90}]
        }

        with patch.object(ResearchAgent, "generate_research_report", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_report
            res = await run_research_subagent(
                wallet="test_rebal_wallet.near",
                calling_agent="rebalancer",
                coins=["NEAR", "USDT"]
            )

            assert res["calling_agent"] == "rebalancer"
            assert res["depth"] == 1
            assert res["signal"] == "BALANCED"
            assert res["confidence"] == 90
            assert res["cached"] is False
            assert len(res["sources"]) > 0
            assert mock_gen.called

    asyncio.run(_run())


def test_subagent_5min_cache_hit():
    """Verify 5-minute cache returns cached result without invoking generate_research_report twice."""
    async def _run():
        mock_report = {
            "title": "Mock Cached Research",
            "executive_summary": "First run execution.",
            "findings": "Initial data snapshot.",
            "risk_factors": "None",
            "signals": [{"direction": "ACCUMULATE", "confidence": 80}]
        }

        with patch.object(ResearchAgent, "generate_research_report", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = mock_report

            res1 = await run_research_subagent(
                wallet="cache_wallet.near",
                calling_agent="trader",
                coins=["NEAR"]
            )
            assert res1["cached"] is False
            assert mock_gen.call_count == 1

            # Second identical call within 5 minutes
            res2 = await run_research_subagent(
                wallet="cache_wallet.near",
                calling_agent="trader",
                coins=["NEAR"]
            )
            assert res2["cached"] is True
            assert res2["signal"] == "ACCUMULATE"
            # Should NOT have invoked generate_research_report a second time
            assert mock_gen.call_count == 1

    asyncio.run(_run())


def test_subagent_parent_run_events():
    """Verify run events are logged when parent_run_id is provided."""
    async def _run():
        events_logged = []

        def mock_append_event(run_id, event):
            events_logged.append((run_id, event))

        with patch.object(ResearchAgent, "generate_research_report", new_callable=AsyncMock) as mock_gen, \
             patch("database.dal.append_run_event", side_effect=mock_append_event):
            mock_gen.return_value = {
                "title": "Run Event Test",
                "executive_summary": "Done.",
                "findings": "Findings.",
                "risk_factors": "Risk.",
                "signals": [{"direction": "BUY", "confidence": 77}]
            }

            res = await run_research_subagent(
                wallet="event_wallet.near",
                calling_agent="trader",
                coins=["NEAR"],
                parent_run_id="run_test_12345"
            )

            assert len(events_logged) == 2
            assert events_logged[0][0] == "run_test_12345"
            assert events_logged[0][1]["type"] == "subagent_research_start"
            assert events_logged[1][0] == "run_test_12345"
            assert events_logged[1][1]["type"] == "subagent_research_complete"
            assert events_logged[1][1]["signal"] == "BUY"

    asyncio.run(_run())


def test_hire_by_trader_agent_returns_sources():
    """Verify ResearchAgent.hire_by_trader_agent delegates to subagent and returns sources."""
    async def _run():
        agent = ResearchAgent()
        with patch.object(ResearchAgent, "generate_research_report", new_callable=AsyncMock) as mock_gen:
            mock_gen.return_value = {
                "title": "Trader Hire Test",
                "executive_summary": "Second opinion valid.",
                "findings": "Liquidity confirmed.",
                "risk_factors": "None.",
                "signals": [{"direction": "ACCUMULATE", "confidence": 88}]
            }

            res = await agent.hire_by_trader_agent(
                trader_wallet="buyer.near",
                symbol="NEAR",
                caller_agent="Trader"
            )

            assert res["hire_type"] == "INTER_AGENT_SECOND_OPINION"
            assert res["signal"] == "ACCUMULATE"
            assert "sources" in res
            assert len(res["sources"]) > 0
            assert "source_links_used" in res
            assert any("near.org" in u for u in res["source_links_used"])

    asyncio.run(_run())
