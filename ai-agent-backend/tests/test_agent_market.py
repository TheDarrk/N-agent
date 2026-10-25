import pytest
import asyncio
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from trading_knowledge_base import retrieve_trading_rules, format_rag_context_for_prompt
from market_intelligence import _calc_rsi, _calc_ema, _calc_atr
from autonomous_agents.trader_agent import TraderAgent
from autonomous_agents.trade_poller import poll_active_trades
from autonomous_agents.rebalancer_agent import RebalancerAgent
from autonomous_agents.research_agent import ResearchAgent
from autonomous_agents.moderator_agent import ModeratorAgent
from decentralized_storage import (
    upload_trade_trace, upload_research_report,
    get_recent_trade_traces, get_recent_research_reports
)


def test_indicator_math():
    prices = [10.0, 10.5, 11.0, 10.8, 11.2, 11.5, 12.0, 11.8, 12.2, 12.5, 13.0, 12.8, 13.2, 13.5, 14.0]
    rsi = _calc_rsi(prices, period=5)
    assert 0.0 <= rsi <= 100.0
    ema = _calc_ema(prices, period=5)
    assert ema > 0.0


def test_rag_retrieval():
    indicators = {
        "ema_trend": "BULLISH",
        "rsi": 55,
        "volume_surge": True,
        "atr_ratio": 1.4,
        "price_near_support": False
    }
    rules = retrieve_trading_rules(indicators)
    assert len(rules) > 0
    context = format_rag_context_for_prompt(rules)
    assert "Retrieved Trading Knowledge" in context


def test_decentralized_storage_recent_10():
    for i in range(15):
        asyncio.run(upload_trade_trace({"test_trade_id": i, "symbol": "NEAR"}))
        asyncio.run(upload_research_report({"test_report_id": i, "topic": "Yields"}))

    traces = get_recent_trade_traces(limit=20)
    reports = get_recent_research_reports(limit=20)

    # Must be capped at at most 10
    assert len(traces) <= 10
    assert len(reports) <= 10


def test_rebalancer_agent():
    rebalancer = RebalancerAgent()
    res = asyncio.run(rebalancer.evaluate_and_rebalance(
        user_wallet="test_user.near",
        target_allocation={"near": 30.0, "usdc": 70.0},
        drift_threshold_pct=5.0
    ))
    # With Hard Validator Guard active, unassigned or out-of-balance users are cleanly evaluated or dropped
    assert res["status"] in ("REBALANCED", "IN_BALANCE", "DROPPED")
    assert "max_drift_pct" in res


def test_research_agent_and_a2a_hire():
    researcher = ResearchAgent()
    hire_res = asyncio.run(researcher.hire_by_trader_agent(
        trader_wallet="test_trader.near",
        symbol="NEAR"
    ))
    assert hire_res["hire_type"] == "AGENT_TO_AGENT_RENTAL"
    assert "0.1 NEAR" in hire_res["fee_transferred"]
    assert "report_cid" in hire_res


def test_moderator_watchdog():
    moderator = ModeratorAgent()
    status = asyncio.run(moderator.get_watchdog_status("test_trader.near"))
    assert status["health_score"] >= 0
    assert "total_open_exposure_usd" in status
