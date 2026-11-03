import sys
import os
import uuid
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import json
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock

from autonomous_agents.rebalancer_agent import (
    RebalancerAgent,
    TokenStrategyItem,
    RebalancerStrategySchema
)
from database import (
    init_db,
    save_rebalancer_strategy,
    get_active_rebalancer_strategy,
    get_rebalancer_strategy_history,
    drop_rebalancer_strategy,
    create_rebalancer_execution,
    get_rebalancer_execution,
    update_rebalancer_execution_state,
    get_rebalancer_execution_by_idempotency_key
)


@pytest.fixture(autouse=True)
def setup_database():
    init_db()


def test_pydantic_token_strategy_item():
    """Verify TokenStrategyItem Pydantic schema validation."""
    item = TokenStrategyItem(
        token_index=1,
        target_percentage=25.0,
        tp_price_usd=5.50,
        sl_price_usd=3.20,
        action_reasoning="1d EMA20 bounce with ATR stop loss buffer"
    )
    assert item.token_index == 1
    assert item.target_percentage == 25.0
    assert item.tp_price_usd == 5.50
    assert item.sl_price_usd == 3.20
    assert "EMA20" in item.action_reasoning


def test_pydantic_rebalancer_strategy_schema():
    """Verify full RebalancerStrategySchema Pydantic validation."""
    schema = RebalancerStrategySchema(
        strategy_name="7-Day Layer 1 Momentum Rebalance",
        executive_summary="Strategic allocation favoring Layer 1 majors with 25% cash buffer.",
        market_regime="BULLISH_EXPANSION",
        rebalance_cadence_days=7,
        risk_level="MODERATE",
        target_allocations=[
            TokenStrategyItem(
                token_index=0,
                target_percentage=25.0,
                tp_price_usd=1.0,
                sl_price_usd=1.0,
                action_reasoning="Cash reserve in USDT"
            ),
            TokenStrategyItem(
                token_index=1,
                target_percentage=40.0,
                tp_price_usd=5.50,
                sl_price_usd=3.20,
                action_reasoning="NEAR above 1d EMA50"
            ),
            TokenStrategyItem(
                token_index=2,
                target_percentage=35.0,
                tp_price_usd=3100.0,
                sl_price_usd=2400.0,
                action_reasoning="ETH consolidating above support"
            )
        ]
    )
    assert schema.rebalance_cadence_days == 7
    assert len(schema.target_allocations) == 3
    assert sum(t.target_percentage for t in schema.target_allocations) == 100.0


def test_rebalancer_database_lifecycle():
    """Verify that generating a new strategy marks old active strategies as DROPPED."""
    test_wallet = f"pytest_user_{uuid.uuid4().hex[:6]}.near"

    # Save Strategy 1
    s1 = save_rebalancer_strategy(
        user_wallet=test_wallet,
        selected_coins=["NEAR", "ETH"],
        user_expectation="Initial conservative allocation",
        cadence_days=7,
        allocations={"USDT": 40.0, "NEAR": 30.0, "ETH": 30.0},
        tp_sl_rules=[{"symbol": "NEAR", "tp": 5.0, "sl": 3.0}],
        market_regime="RANGE_BOUND",
        overall_strategy="Rangebound strategy",
        raw_pydantic_output={"name": "s1"},
        min_stable_pct=20.0
    )
    assert s1["status"] == "ACTIVE"
    s1_id = s1["id"]

    # Verify Active
    active = get_active_rebalancer_strategy(test_wallet)
    assert active is not None
    assert active["id"] == s1_id
    assert active["status"] == "ACTIVE"

    # Save Strategy 2 (should supersede Strategy 1)
    s2 = save_rebalancer_strategy(
        user_wallet=test_wallet,
        selected_coins=["NEAR", "ETH", "DOGE"],
        user_expectation="Aggressive trend following",
        cadence_days=3,
        allocations={"USDT": 15.0, "NEAR": 45.0, "ETH": 25.0, "DOGE": 15.0},
        tp_sl_rules=[{"symbol": "NEAR", "tp": 6.5, "sl": 3.4}],
        market_regime="BULLISH_EXPANSION",
        overall_strategy="Aggressive bull strategy",
        raw_pydantic_output={"name": "s2"},
        min_stable_pct=15.0
    )
    s2_id = s2["id"]
    assert s2_id != s1_id

    # Verify Strategy 1 is DROPPED and Strategy 2 is ACTIVE
    active_now = get_active_rebalancer_strategy(test_wallet)
    assert active_now["id"] == s2_id
    assert active_now["status"] == "ACTIVE"

    history = get_rebalancer_strategy_history(test_wallet)
    assert len(history) >= 2
    dropped_s1 = next((s for s in history if s["id"] == s1_id), None)
    assert dropped_s1 is not None
    assert dropped_s1["status"] == "DROPPED"


def test_rebalancer_execution_state_machine_lifecycle():
    """Verify execution state machine records in DB and handles terminal states."""
    exec_id = f"test_exec_{uuid.uuid4().hex[:8]}"
    wallet = f"test_user_{uuid.uuid4().hex[:6]}.near"
    idemp_key = f"idemp_{uuid.uuid4().hex[:8]}"

    rec = create_rebalancer_execution(
        execution_id=exec_id,
        user_wallet=wallet,
        strategy_id=1,
        state="VALIDATION",
        token_in="NEAR",
        token_out="USDT",
        amount_in_usd=50.0,
        amount_in_atomic="50000000000000000000",
        amount_out_expected="50.0",
        slippage_tolerance_bps=50,
        estimated_slippage_bps=35,
        idempotency_key=idemp_key
    )
    assert rec["state"] == "VALIDATION"
    assert rec["estimated_slippage_bps"] == 35

    # Check idempotency lookup
    same_rec = get_rebalancer_execution_by_idempotency_key(idemp_key)
    assert same_rec is not None
    assert same_rec["execution_id"] == exec_id

    # Advance to EXECUTION with signature
    sig = "ed25519:test_signature_xyz"
    update_rebalancer_execution_state(
        execution_id=exec_id,
        state="EXECUTION",
        deposit_address="dep_addr_123",
        signature=sig
    )
    upd = get_rebalancer_execution(exec_id)
    assert upd["state"] == "EXECUTION"
    assert upd["signature"] == sig

    # Transition to terminal status REFUNDED
    update_rebalancer_execution_state(
        execution_id=exec_id,
        state="REFUNDED",
        terminal_status="REFUNDED",
        refund_reason="Price slipped beyond tolerance"
    )
    term = get_rebalancer_execution(exec_id)
    assert term["state"] == "REFUNDED"
    assert term["terminal_status"] == "REFUNDED"
    assert term["refund_reason"] == "Price slipped beyond tolerance"


def test_rebalancer_agent_generate_strategy_mocked():
    """Verify that RebalancerAgent generates strategy, enforces min_stable_pct, and resolves indices."""
    agent = RebalancerAgent()
    test_user_wallet = f"test_mock_{uuid.uuid4().hex[:6]}.near"

    mock_compact_charts = {
        "symbol": "NEAR",
        "current_price": 4.0,
        "timeframes": {
            "1h": {"current_price": 4.0, "ema20": 3.95, "ema50": 3.90, "ema200": None, "rsi14": 55.0},
            "1d": {"current_price": 4.0, "ema20": 3.80, "ema50": 3.60, "ema200": 3.10, "rsi14": 58.0},
            "1w": {"current_price": 4.0, "ema20": 3.20, "ema50": 2.80, "ema200": None, "rsi14": 50.0}
        }
    }

    mock_llm_json = {
        "strategy_name": "Multi-Timeframe Trend Rebalance",
        "executive_summary": "Maintain 25% cash buffer and accumulate NEAR and ETH at structural pullbacks.",
        "market_regime": "BULLISH_EXPANSION",
        "risk_level": "MODERATE",
        "rebalance_cadence_days": 7,
        "target_allocations": [
            {
                "token_index": 0,
                "target_percentage": 5.0,  # Below user min_stable_pct (20.0%) to test programmatic guardrail!
                "tp_price_usd": 1.0,
                "sl_price_usd": 1.0,
                "action_reasoning": "USDT liquidity shock absorber"
            },
            {
                "token_index": 1,
                "target_percentage": 55.0,
                "tp_price_usd": 6.0,
                "sl_price_usd": 3.4,
                "action_reasoning": "1h/1d EMA stack aligned"
            },
            {
                "token_index": 2,
                "target_percentage": 40.0,
                "tp_price_usd": 3200.0,
                "sl_price_usd": 2350.0,
                "action_reasoning": "Macro 1w support holding"
            }
        ]
    }

    with patch.object(agent, "_fetch_compact_chart_intelligence", new=AsyncMock(return_value=mock_compact_charts)), \
         patch.object(agent, "_call_llm_json", new=AsyncMock(return_value=json.dumps(mock_llm_json))), \
         patch("autonomous_agents.rebalancer_agent.compute_btc_beta_and_correlations", new=AsyncMock(return_value={"btc_beta": {}, "btc_correlation": {}})), \
         patch("autonomous_agents.rebalancer_agent.get_swap_quote", return_value={"estimated_slippage_bps": 25, "amount_out": 49.5}), \
         patch("autonomous_agents.rebalancer_agent.get_wallet_portfolio", new=AsyncMock(return_value={"near": 10.0, "usdt": 50.0})):

        res = asyncio.run(
            agent.generate_strategy(
                user_wallet=test_user_wallet,
                selected_coins=["USDT", "NEAR", "ETH"],
                user_expectation="Take profit on NEAR at resistance",
                cadence_days=7,
                min_stable_pct=20.0  # Guardrail should boost USDT from 5% to at least 20%!
            )
        )

        assert res["success"] is True
        allocations = res["allocations"]
        assert "USDT" in allocations
        assert "NEAR" in allocations
        assert "ETH" in allocations
        
        # Verify min_stable_pct guardrail was enforced
        assert allocations["USDT"] >= 20.0
        # Verify sum equals 100.0%
        assert round(sum(allocations.values()), 1) == 100.0


def test_rebalancer_agent_dynamic_stablecoin_expansion_above_floor():
    """Verify that if the agent assesses high risk and allocates > min_stable_pct to USDT, that higher allocation is preserved."""
    agent = RebalancerAgent(api_key="mock_key")
    test_user_wallet = f"user_risk_{uuid.uuid4().hex[:6]}.near"

    mock_compact_charts = {
        "symbol": "NEAR",
        "current_price": 4.0,
        "timeframes": {
            "1h": {"current_price": 4.0, "ema20": 4.10, "ema50": 4.20, "ema200": None, "rsi14": 35.0},
            "1d": {"current_price": 4.0, "ema20": 4.50, "ema50": 4.80, "ema200": 5.10, "rsi14": 32.0},
            "1w": {"current_price": 4.0, "ema20": 5.20, "ema50": 5.80, "ema200": None, "rsi14": 30.0}
        }
    }

    # Model detects high volatility/bearish breakdown and elevates USDT to 60%, even though user floor is only 10%
    mock_llm_json = {
        "strategy_name": "Capital Preservation Defensive Rebalance",
        "executive_summary": "Elevated market risk and multi-timeframe bearish breakdown. Dynamically elevating USDT to 60%.",
        "market_regime": "HIGH_VOLATILITY_SHOCK",
        "risk_level": "LOW",
        "rebalance_cadence_days": 7,
        "target_allocations": [
            {
                "token_index": 0,
                "target_percentage": 60.0,
                "tp_price_usd": 1.0,
                "sl_price_usd": 1.0,
                "action_reasoning": "Autonomous risk mitigation elevating USDT to 60%"
            },
            {
                "token_index": 1,
                "target_percentage": 25.0,
                "tp_price_usd": 5.5,
                "sl_price_usd": 3.5,
                "action_reasoning": "Defensive position with tight stop"
            },
            {
                "token_index": 2,
                "target_percentage": 15.0,
                "tp_price_usd": 3000.0,
                "sl_price_usd": 2200.0,
                "action_reasoning": "Reduced ETH beta exposure"
            }
        ]
    }

    with patch.object(agent, "_fetch_compact_chart_intelligence", new=AsyncMock(return_value=mock_compact_charts)), \
         patch.object(agent, "_call_llm_json", new=AsyncMock(return_value=json.dumps(mock_llm_json))), \
         patch("autonomous_agents.rebalancer_agent.compute_btc_beta_and_correlations", new=AsyncMock(return_value={"btc_beta": {}, "btc_correlation": {}})), \
         patch("autonomous_agents.rebalancer_agent.get_swap_quote", return_value={"estimated_slippage_bps": 25, "amount_out": 49.5}), \
         patch("autonomous_agents.rebalancer_agent.get_wallet_portfolio", new=AsyncMock(return_value={"near": 10.0, "usdt": 50.0})):

        res = asyncio.run(
            agent.generate_strategy(
                user_wallet=test_user_wallet,
                selected_coins=["USDT", "NEAR", "ETH"],
                user_expectation="Protect capital in volatile market",
                cadence_days=7,
                min_stable_pct=10.0
            )
        )

        assert res["success"] is True
        allocations = res["allocations"]
        assert allocations["USDT"] == 60.0, f"Expected USDT to be preserved at 60.0%, got {allocations['USDT']}"
        assert allocations["NEAR"] == 25.0
        assert allocations["ETH"] == 15.0
        assert round(sum(allocations.values()), 1) == 100.0
