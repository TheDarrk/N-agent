# -*- coding: utf-8 -*-
"""
Neptune AI — Comprehensive Test Suite for Pro Trader Math, MCP Tools & CoT Prompting
Validates:
1. Non-stable tokens near $1.00 are never dropped by price alone
2. Custom Pro Trader minimum 24h volume threshold enforcement
3. Custom Pro Trader minimum price move % and ATR volatility threshold enforcement
4. Custom Pro Trader minimum Risk-to-Reward ratio (R:R) enforcement
5. Exact mathematical calculations for Fibonacci retracements & Golden Pocket
6. Exact mathematical calculations for Standard Floor & Camarilla Pivot Points
7. Dynamic ATR Volatility level calculations across risk tiers
8. Crypto Fear & Greed Index live fetch and fallback handling
9. MCP Pattern geometry validator & slippage estimation
10. End-to-end Council & Judge Chain-of-Thought pipeline grounding
"""

import pytest
import os
import sys
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure ai-agent-backend is on path
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from coin_scanner import is_stablecoin_asset, check_tradeability, _evaluate_single_coin, scan_coin_universe
from trader_mcp import (
    calculate_fibonacci_confluence,
    calculate_pivot_points,
    calculate_dynamic_volatility_levels,
    estimate_trade_slippage_and_fees,
    validate_pattern_geometry,
)
from market_sentiment import (
    get_crypto_fear_and_greed_index,
    get_aggregate_market_sentiment,
    get_token_market_sentiment,
)
from autonomous_agents.trading_pipeline import (
    CouncilAgent,
    JudgeAgent,
    TradingPipeline,
    CoinPlan,
    CouncilOutput,
    CouncilLLMResponse,
    JudgeOutput,
)


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: Stablecoin filter allows valid tokens near $1.00
# ═══════════════════════════════════════════════════════════════════════════════
def test_stablecoin_filter_allows_valid_token_near_one_dollar():
    """Verify that a volatile altcoin trading at $0.999 is NOT dropped by price alone."""
    volatile_candles = [
        {"open": 0.950, "high": 1.020, "low": 0.940, "close": 0.998},
        {"open": 0.998, "high": 1.045, "low": 0.985, "close": 1.030},
        {"open": 1.030, "high": 1.050, "low": 0.970, "close": 0.985},
        {"open": 0.985, "high": 1.010, "low": 0.950, "close": 0.999},
        {"open": 0.999, "high": 1.035, "low": 0.980, "close": 1.015},
        {"open": 1.015, "high": 1.060, "low": 0.990, "close": 1.040},
        {"open": 1.040, "high": 1.055, "low": 0.975, "close": 0.995},
        {"open": 0.995, "high": 1.025, "low": 0.960, "close": 0.998},
        {"open": 0.998, "high": 1.030, "low": 0.970, "close": 1.005},
        {"open": 1.005, "high": 1.040, "low": 0.980, "close": 0.999},
    ]
    # Should NOT be flagged as stablecoin
    is_stable = is_stablecoin_asset("ALPHA", 0.998, volatile_candles)
    assert is_stable is False, "Volatile token near $1.00 was incorrectly flagged as stablecoin!"

    # Known pegged stablecoins should always be identified
    assert is_stablecoin_asset("USDC", 1.000) is True
    assert is_stablecoin_asset("USDT", 0.999) is True

    # Flatline coin with <0.25% variance should be identified
    flatline_candles = [{"open": 1.0001, "high": 1.0004, "low": 0.9998, "close": 1.0002} for _ in range(12)]
    assert is_stablecoin_asset("FLAT_COIN", 1.0002, flatline_candles) is True


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: Custom Pro Trader minimum 24h volume threshold enforcement
# ═══════════════════════════════════════════════════════════════════════════════
def test_pro_trader_custom_volume_threshold():
    """Verify that check_tradeability enforces custom min_volume_usd correctly."""
    # 24 candles with volume yielding $35,000 estimated volume at price $5.0 (7000 units * $5.0 = $35,000)
    # Price oscillating between 4.8 and 5.2 gives ~8% price range (> 1.0%)
    candles = [
        {"open": 4.8, "high": 5.2, "low": 4.7, "close": 4.85 if i % 2 == 0 else 5.15, "volume": 7000.0 / 24.0}
        for i in range(25)
    ]
    indicators = {
        "current_price": 5.0,
        "candles": candles,
        "ema20": 4.95,
        "ema50": 4.90,
        "atr_pct": 2.5,
    }
    pattern_data = {"dominant_pattern": "bull_flag", "risk_reward_ratio": 2.0}

    # Default min_volume_usd ($25,000) -> $35,000 passes volume check
    res_default = check_tradeability(indicators, pattern_data, min_volume_usd=25000.0, min_move_pct=1.0, min_atr_pct=0.20, min_weekly_volume_usd=25000.0)
    assert not any("volume" in r for r in res_default["reasons"]), f"Should not fail volume check: {res_default['reasons']}"

    # Custom Pro Trader min_volume_usd ($50,000) -> $35,000 fails volume check
    res_strict = check_tradeability(indicators, pattern_data, min_volume_usd=50000.0, min_move_pct=1.0, min_atr_pct=0.20, min_weekly_volume_usd=50000.0)
    assert any("volume" in r for r in res_strict["reasons"]), "Token with $35k volume must fail volume check when threshold is $50k"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: Custom Pro Trader minimum price move % and ATR thresholds
# ═══════════════════════════════════════════════════════════════════════════════
def test_pro_trader_custom_atr_and_price_move_thresholds():
    """Verify that custom min_price_move_pct and min_atr_pct filter out flat tokens."""
    # Flat candles with only 1.2% price swing
    candles = [
        {"open": 10.0, "high": 10.12, "low": 10.0, "close": 10.06, "volume": 10000}
        for _ in range(25)
    ]
    indicators = {
        "current_price": 10.0,
        "candles": candles,
        "atr_pct": 0.40,  # 0.40% ATR
    }
    pattern_data = {"risk_reward_ratio": 2.0}

    # Pro setting: user demands min 2.5% move range -> fails
    res_move = check_tradeability(indicators, pattern_data, min_move_pct=2.5, min_atr_pct=0.20, min_volume_usd=1000.0)
    assert res_move["eligible"] is False, "Token with only 1.2% move must be rejected by min_move_pct=2.5"
    assert any("price_range" in r for r in res_move["reasons"])

    # Pro setting: user demands min 0.80% ATR -> fails
    res_atr = check_tradeability(indicators, pattern_data, min_move_pct=1.0, min_atr_pct=0.80, min_volume_usd=1000.0)
    assert res_atr["eligible"] is False, "Token with only 0.40% ATR must be rejected by min_atr_pct=0.80"
    assert any("atr" in r for r in res_atr["reasons"])


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: Custom Pro Trader minimum Risk-to-Reward ratio (R:R) enforcement
# ═══════════════════════════════════════════════════════════════════════════════
def test_pro_trader_custom_min_risk_reward_threshold():
    """Verify that setups with R:R below user threshold are flagged/rejected."""
    # Test through dynamic volatility calculator
    low_rr_levels = calculate_dynamic_volatility_levels(
        current_price=100.0,
        atr=4.0,
        direction="LONG",
        risk_multiplier=2.5,   # wide stop loss 10.0
        reward_multiplier=1.5  # tight target 6.0 -> R:R = 0.60
    )
    assert low_rr_levels["risk_reward_ratio"] == 0.60
    assert low_rr_levels["is_positive_expectancy"] is False

    high_rr_levels = calculate_dynamic_volatility_levels(
        current_price=100.0,
        atr=4.0,
        direction="LONG",
        risk_multiplier=1.0,   # stop loss 4.0
        reward_multiplier=3.0  # target 12.0 -> R:R = 3.00
    )
    assert high_rr_levels["risk_reward_ratio"] == 3.00
    assert high_rr_levels["is_positive_expectancy"] is True


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: Exact mathematical calculations for Fibonacci retracements & Golden Pocket
# ═══════════════════════════════════════════════════════════════════════════════
def test_fibonacci_confluence_math():
    """Validate exact mathematical calculation of Fibonacci retracement & extension levels."""
    high = 100.0
    low = 50.0

    # Bullish trend retracement math from high
    res_bull = calculate_fibonacci_confluence(high=high, low=low, current_price=69.10, trend="BULLISH")
    levels = res_bull["levels"]

    assert levels["0.236_retrace"] == 100.0 - (50.0 * 0.236)  # 88.2
    assert levels["0.382_retrace"] == 100.0 - (50.0 * 0.382)  # 80.9
    assert levels["0.500_equilibrium"] == 100.0 - (50.0 * 0.500)  # 75.0
    assert levels["0.618_golden_pocket"] == 100.0 - (50.0 * 0.618)  # 69.1
    assert levels["0.650_golden_pocket_ext"] == 100.0 - (50.0 * 0.650)  # 67.5
    assert levels["1.618_golden_expansion"] == 100.0 + (50.0 * 0.618)  # 130.9

    # Golden pocket confluence detection (price at 69.10 is exactly on 0.618)
    assert res_bull["in_golden_pocket"] is True, "Price at 69.10 should trigger Golden Pocket confluence!"
    assert "0.618" in res_bull["closest_fib_level"]


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: Exact mathematical calculations for Standard Floor & Camarilla Pivot Points
# ═══════════════════════════════════════════════════════════════════════════════
def test_pivot_points_standard_and_camarilla_math():
    """Validate classic floor pivots and Camarilla breakout equations."""
    high = 110.0
    low = 90.0
    close = 105.0

    pivots = calculate_pivot_points(high=high, low=low, close=close)
    std = pivots["standard_pivots"]
    cam = pivots["camarilla_pivots"]

    # Standard Floor Pivot: P = (H + L + C) / 3 = (110 + 90 + 105) / 3 = 101.666667
    expected_p = (110.0 + 90.0 + 105.0) / 3.0
    assert abs(std["Pivot"] - expected_p) < 1e-4
    # R1 = 2P - L
    assert abs(std["R1"] - (2 * expected_p - 90.0)) < 1e-4
    # S1 = 2P - H
    assert abs(std["S1"] - (2 * expected_p - 110.0)) < 1e-4

    # Camarilla: H3 = C + (H - L) * 1.1 / 4
    rng = high - low  # 20.0
    expected_h3 = close + (rng * 1.1 / 4.0)  # 105 + 5.5 = 110.5
    assert abs(cam["H3_Reversal"] - expected_h3) < 1e-4
    # L3 = C - (H - L) * 1.1 / 4
    expected_l3 = close - (rng * 1.1 / 4.0)  # 105 - 5.5 = 99.5
    assert abs(cam["L3_Reversal"] - expected_l3) < 1e-4


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 7: Dynamic ATR Volatility level calculations across risk tiers
# ═══════════════════════════════════════════════════════════════════════════════
def test_dynamic_volatility_levels_math():
    """Validate dynamic ATR trailing buffer and target scaling."""
    current_price = 100.0
    atr = 4.0

    # LONG setup with 1.5x ATR buffer and 2.5x ATR target
    levels = calculate_dynamic_volatility_levels(
        current_price=current_price,
        atr=atr,
        direction="LONG",
        risk_multiplier=1.5,
        reward_multiplier=2.5
    )

    expected_sl = 100.0 - (1.5 * 4.0)  # 94.0
    expected_tp = 100.0 + (2.5 * 4.0)  # 110.0
    assert levels["recommended_stop_loss"] == expected_sl
    assert levels["recommended_take_profit"] == expected_tp
    assert levels["atr_pct"] == 4.0  # (4 / 100) * 100
    assert levels["risk_reward_ratio"] == round((110.0 - 100.0) / (100.0 - 94.0), 2)  # 1.67


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8: Crypto Fear & Greed Index live fetch and fallback handling
# ═══════════════════════════════════════════════════════════════════════════════
def test_crypto_fear_and_greed_index_fetch_and_fallback():
    """Verify institutional Crypto Fear & Greed Index returns structured data."""
    fng = get_crypto_fear_and_greed_index()
    assert isinstance(fng, dict)
    assert "value" in fng or "index_value" in fng
    val = fng.get("value") or fng.get("index_value")
    assert 0 <= val <= 100
    assert "regime" in fng
    assert "guidance" in fng

    # Aggregate market sentiment test
    agg = get_aggregate_market_sentiment("NEAR")
    assert "fear_and_greed" in agg
    assert "macro_regime" in agg
    assert "token_sentiment" in agg
    assert agg["token_sentiment"]["symbol"] == "NEAR"


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 9: MCP Pattern geometry validator & slippage estimation
# ═══════════════════════════════════════════════════════════════════════════════
def test_pattern_geometry_and_slippage_mcp():
    """Validate pattern geometry mathematical checks and exchange slippage."""
    # Bull flag geometry check
    geom = validate_pattern_geometry(
        pattern_name="bull_flag",
        pattern_data={"flagpole_height": 15.0, "risk_reward_ratio": 2.0},
        current_price=112.0
    )
    assert geom["is_structurally_sound"] is True
    assert geom["pattern"] == "bull_flag"

    # Slippage estimation check
    slip = estimate_trade_slippage_and_fees(
        order_size_usd=100.0,
        volume_24h_usd=250000.0
    )
    assert slip["is_safe"] is True
    assert slip["estimated_slippage_pct"] >= 0.0
    assert slip["round_trip_fee_usd"] > 0.0


# ═══════════════════════════════════════════════════════════════════════════════
# TEST 10: End-to-end Council & Judge Chain-of-Thought pipeline grounding
# ═══════════════════════════════════════════════════════════════════════════════
def test_council_and_judge_cot_pipeline_grounding():
    """
    Integration test: verifies Council builds plans with MCP math and sentiment tools,
    and Judge audits mathematical grounding with zero hallucinations.
    """
    async def _run():
        mock_chart_data = {
            "symbol": "DASH",
            "timeframe": "4h",
            "current_price": 182.40,
            "candles": [
                {"time": 1700000000 + i * 3600, "open": 175.0 + i, "high": 185.0, "low": 174.0, "close": 182.40, "volume": 5000}
                for i in range(20)
            ],
            "indicators": {
                "current_price": 182.40,
                "ema20": 181.00,
                "ema50": 177.20,
                "atr": 2.80,
                "recent_support": 178.70,
                "recent_resistance": 185.50,
                "rsi": 56.0,
            },
            "pattern_name": "bull_flag",
            "measured_target": 195.00,
            "stop_loss": 174.50,
        }

        async def mock_chart_tool(sym, tf):
            return mock_chart_data

        def mock_rag_tool(q):
            return [
                {"section_title": "Bull Flag Continuation", "chapter_title": "Bulkowski Encyclopedia", "rules": ["Target = flagpole height"]}
            ]

        council = CouncilAgent(mock_chart_tool, mock_rag_tool)
        judge = JudgeAgent()

        # Council mock LLM returning valid grounded plan
        mock_council_response = CouncilLLMResponse(
            plans=[
                CoinPlan(
                    coin="DASH",
                    direction="LONG",
                    direction_alignment="aligned",
                    entry=182.40,
                    entry_basis="current_price",
                    tp=195.00,
                    sl=174.50,
                    risk_reward=1.59,
                    risk_reward_structural=1.59,
                    grounding="Current price 182.40 matches 4h chart. TP 195.00 from bull flag. SL 174.50 below support.",
                    rag_sources=[{"section": "Bull Flag Continuation", "source": "Bulkowski Encyclopedia"}]
                )
            ],
            verdict="DASH confirmed aligned bull flag continuation."
        )

        with patch.object(council, "_call_llm", return_value=mock_council_response.model_dump_json()):
            selections = [{"coin": "DASH", "direction": "LONG"}]
            council_output = await council.build_plans(selections, mock_chart_tool, mock_rag_tool)

        assert len(council_output.plans) == 1
        dash_plan = council_output.plans[0]
        assert dash_plan.coin == "DASH"
        assert dash_plan.recomputed_rr == 1.59
        assert dash_plan.rr_match is True

        # Verify tool log recorded chart, rag, mcp_math, and market_sentiment tools
        tool_names = [t["tool"] for t in council_output.tool_log]
        assert "chart" in tool_names
        assert "rag" in tool_names
        assert "mcp_math" in tool_names
        assert "market_sentiment" in tool_names

        # Judge mock LLM verifying zero hallucinations
        mock_judge_response = JudgeOutput(
            chosen_coin="DASH",
            direction="LONG",
            entry=182.40,
            tp=195.00,
            sl=174.50,
            confidence=0.90,
            reasoning="DASH verified against raw chart and MCP math logs: entry 182.40 matches price, R:R 1.59 matches ground truth.",
            hallucination_flags=[],
            chosen_plan_grounded=True,
            final_decision="EXECUTE"
        )

        with patch.object(judge, "_call_llm", return_value=mock_judge_response.model_dump_json()):
            judge_output = await judge.audit(council_output)

        assert judge_output.final_decision == "EXECUTE"
        assert judge_output.chosen_coin == "DASH"
        assert judge_output.chosen_plan_grounded is True
        assert len(judge_output.hallucination_flags) == 0

    asyncio.run(_run())
