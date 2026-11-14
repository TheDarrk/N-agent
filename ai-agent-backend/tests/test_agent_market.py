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
from history_store import (
    record_trade_trace, record_research_report,
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


def test_history_store_db_only_with_ids():
    import uuid
    wallet = f"hist_{uuid.uuid4().hex[:6]}.near"
    t_ids = [asyncio.run(record_trade_trace({"user_wallet": wallet, "symbol": "NEAR", "verdict": "BUY", "test_trade_id": i})) for i in range(3)]
    r_ids = [asyncio.run(record_research_report({"requester": wallet, "topic": "Yields", "test_report_id": i})) for i in range(3)]
    assert all(i.startswith("TRC-") for i in t_ids) and all(i.startswith("RSH-") for i in r_ids)
    assert len(set(t_ids)) == 3 and len(set(r_ids)) == 3

    traces = get_recent_trade_traces(limit=20, wallet_address=wallet)
    reports = get_recent_research_reports(limit=20, wallet_address=wallet)
    assert {t["cid"] for t in traces} == set(t_ids)
    assert {r["cid"] for r in reports} == set(r_ids)
    # never leaks across tenants / without a wallet
    assert get_recent_trade_traces(limit=20) == [] and get_recent_research_reports(limit=20) == []


def test_rebalancer_agent():
    rebalancer = RebalancerAgent()
    res = asyncio.run(rebalancer.evaluate_and_rebalance(
        user_wallet="test_user.near",
        target_allocation={"near": 30.0, "usdc": 70.0},
        drift_threshold_pct=5.0
    ))
    # With Hard Validator Guard active, unassigned or out-of-balance users are cleanly evaluated or dropped
    assert res["status"] in ("REBALANCED", "IN_BALANCE", "DROPPED", "INACTIVE")
    assert "max_drift_pct" in res


def test_research_agent_and_a2a_hire():
    researcher = ResearchAgent()
    hire_res = asyncio.run(researcher.hire_by_trader_agent(
        trader_wallet="test_trader.near",
        symbol="NEAR"
    ))
    assert hire_res["hire_type"] in ("INTER_AGENT_SECOND_OPINION", "AGENT_TO_AGENT_RENTAL")
    assert "0 NEAR" in hire_res["fee_transferred"]
    assert "report_cid" in hire_res


def test_moderator_watchdog():
    moderator = ModeratorAgent()
    status = asyncio.run(moderator.get_watchdog_status("test_trader.near"))
    assert status["has_evaluation"] is False or status["health_score"] is not None
    assert "total_open_exposure_usd" in status
