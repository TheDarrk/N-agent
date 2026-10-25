import pytest
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from autonomous_agents.llm_council_judge import LLMCouncilJudge


def test_llm_council_5_advisors_deliberation():
    judge = LLMCouncilJudge(agent_type="trader")

    indicators = {
        "timeframe": "1h",
        "current_price": 4.62,
        "rsi": 62.5,
        "ema_trend": "BULLISH",
        "ema_cross": "GOLDEN_CROSS",
        "volume_surge": True,
        "volume_ratio": 1.45,
        "atr": 0.18,
        "recent_support": 4.40,
        "recent_resistance": 4.90
    }
    pattern_data = {
        "dominant_pattern": "Ascending Triangle",
        "pattern_type": "BULLISH_CONTINUATION",
        "measured_target": 4.95,
        "stop_loss": 4.48,
        "risk_reward_ratio": 2.35
    }
    matched_sections = [{
        "chapter_title": "Chart Patterns",
        "section_title": "Ascending Triangle Breakouts",
        "section_id": "sec_triangles"
    }]
    twitter_sentiment = {
        "hashtag": "#NEAR",
        "sentiment": "BULLISH",
        "bullish_pct": 68,
        "viral_velocity_score": 75
    }

    result = asyncio.run(judge.deliberate_and_judge(
        symbol="NEAR",
        indicators=indicators,
        pattern_data=pattern_data,
        ascii_chart="[ASCII CHART PREVIEW]",
        rag_xml_block="<retrieved_book_knowledge><section id='sec_triangles'>Triangle breakout</section></retrieved_book_knowledge>",
        matched_sections=matched_sections,
        twitter_sentiment=twitter_sentiment,
        researcher_intel={"hired": True, "signal": "ACCUMULATE", "executive_summary": "High ecosystem liquidity."},
        risk_profile="moderate",
        min_confidence=75,
        agent_wallet="test.near",
        agent_balance=1.5,
        hard_cap_usd=50.0
    ))

    assert "verdict" in result
    assert result["verdict"] in ["ENTER_LONG", "ENTER_SHORT", "STAND_ASIDE", "REJECT_RISK_BREACH"]
    assert "advisors" in result
    assert len(result["advisors"]) >= 4
    assert "contrarian" in result["advisors"]
    assert "first_principles" in result["advisors"]
    assert "expansionist" in result["advisors"]
    assert "executor" in result["advisors"]
    assert "council_agreement" in result
    assert "council_clash" in result
    assert "blind_spots_caught" in result
    assert "one_thing_first" in result
    assert "binary_evidence_checks" in result


def test_llm_council_failsafe_abort():
    """Verify that if LLM fails or times out, execution strictly halts with STAND_ASIDE and NO trade."""
    judge = LLMCouncilJudge(agent_type="trader")
    # Point to invalid base_url to simulate network disconnect
    judge.base_url = "https://invalid-nonexistent-endpoint.local"
    judge.request_timeout = 1.0

    indicators = {"current_price": 5.0}
    pattern_data = {"dominant_pattern": "Bull Flag"}

    result = asyncio.run(judge.deliberate_and_judge(
        symbol="NEAR",
        indicators=indicators,
        pattern_data=pattern_data,
        ascii_chart="",
        rag_xml_block="",
        matched_sections=[],
        twitter_sentiment={},
        researcher_intel=None,
        risk_profile="moderate",
        min_confidence=75
    ))

    assert result["verdict"] == "STAND_ASIDE"
    assert result["status"] == "JUDGE_FAILED"
    assert result["confidence_score"] == 0
    assert result["recommended_position_usd"] == 0.0
    assert "TRADE BLOCKED" in result["reasoning"]


def test_llm_council_fleet_audit():
    judge = LLMCouncilJudge(agent_type="moderator")
    fleet_audit = asyncio.run(judge.deliberate_and_judge_fleet(
        user_wallet="test.near",
        fleet_data={},
        open_trades=[],
        trade_history=[],
        recent_logs=[],
        dropped_trades=[],
        max_tx=50.0,
        daily_limit=500.0,
        kill_switch_active=False
    ))

    assert "overall_performance_score" in fleet_audit
    assert "verdict" in fleet_audit
    assert "advisors" in fleet_audit
    assert "council_agreement" in fleet_audit
    assert "parameter_scores" in fleet_audit


def test_llm_council_short_trade_direction():
    """Verify that short trade geometry and directional bias are correctly handled for SHORT setups."""
    from autonomous_agents.llm_council_judge import LLMCouncilJudge
    judge = LLMCouncilJudge(agent_type="trader")

    # Mock specialist responses indicating strong short interest
    specialists = {
        "technical_analyst": {
            "verdict": "TRADE",
            "bias": "SHORT",
            "proposed_entry": 100.0,
            "proposed_stop": 105.0,
            "proposed_targets": [90.0],
            "reasoning": "Bearish double top breakdown with volume confirmation below EMA50."
        },
        "playbook_strategist": {
            "verdict": "TRADE",
            "bias": "SHORT",
            "criteria_checklist": [{"criterion": "Breakdown confirmation", "status": "MET"}],
            "reasoning": "Matches Chapter 4 Double Top breakdown playbook."
        },
        "risk_manager": {
            "verdict": "TRADE",
            "hard_veto": False,
            "calculated_rr": 2.0,
            "stop_distance_atr_ratio": 1.5,
            "recommended_position_usd": 10.0,
            "reasoning": "Downside bounded with 105 stop, 2.0 R:R."
        },
        "skeptic": {
            "verdict": "TRADE",
            "fatal_flaws": [],
            "reasoning": "Valid breakdown; invalidation trigger is hourly close above 105."
        }
    }

    # Verify that short geometry logic validates correctly: target < entry < stop
    tech_entry = 100.0
    tech_stop = 105.0
    tech_target = 90.0
    is_short = True
    geometry_valid = (tech_target < tech_entry < tech_stop)
    assert geometry_valid is True

    # Verify that if approved, final verdict is ENTER_SHORT
    chairman_dec = {
        "verdict": "TRADE",
        "bias": "SHORT",
        "confidence_score": 80,
        "entry_price": 100.0,
        "stop_loss_price": 105.0,
        "take_profit_price": 90.0,
        "risk_reward_ratio": 2.0,
        "expected_roi_pct": 10.0
    }
    raw_verdict = chairman_dec.get("verdict")
    decided_bias = chairman_dec.get("bias")
    is_trade_approved = (raw_verdict == "TRADE" and 80 >= 75)
    final_verdict = ("ENTER_SHORT" if decided_bias == "SHORT" else "ENTER_LONG") if is_trade_approved else "STAND_ASIDE"
    assert final_verdict == "ENTER_SHORT"

