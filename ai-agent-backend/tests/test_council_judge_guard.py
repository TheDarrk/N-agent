import pytest
import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../autonomous_agents')))

from autonomous_agents.trading_pipeline import (
    CouncilAgent,
    JudgeAgent,
    TradingPipeline,
    CouncilOutput,
    CoinPlan,
    TechnicalAnalystView,
    RiskManagerView,
    JudgeOutput
)

def test_council_agent_recovers_real_coin_symbol_and_recomputes_rr():
    async def _test():
        council = CouncilAgent(chart_tool=None, rag_tool=None)

        async def mock_chart(coin, tf):
            return {"current_price": 55.37, "ema20": 55.0, "ema_trend": "UP", "atr": 1.0, "rsi": 50, "recent_support": 53.22, "recent_resistance": 58.80}

        def mock_rag(query):
            return [{"section": "Trend", "source": "Test"}]

        llm_response = """{
          "prompt_version": "council_v2.1",
          "plans": [
            {
              "coin": "TOKEN_X",
              "screener_direction": "LONG",
              "direction": "LONG",
              "direction_alignment": "aligned",
              "entry": 55.37,
              "entry_basis": "current_price",
              "tp": 58.50,
              "sl": 53.22,
              "risk_reward": 1.97,
              "technical_analyst": {
                "setup_quality": "EXCELLENT",
                "structure_analysis": "Confirmed double bottom reversal on 4h chart."
              },
              "risk_manager": {
                "risk_level": "LOW",
                "sl_calibration": "Stop placed at 53.22 with adequate ATR buffer.",
                "risk_factors": ["Resistance at 58.80"]
              },
              "reasoning": "DASH double bottom breakout.",
              "grounding": "Price 55.37, SL 53.22, TP 58.50",
              "rag_sources": []
            }
          ],
          "verdict": "TOKEN_X evaluated."
        }"""

        with patch.object(council, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = llm_response

            selections = [{"coin": "DASH", "direction": "LONG"}]
            output = await council.build_plans(selections, mock_chart, mock_rag)

            assert len(output.plans) == 1
            plan = output.plans[0]
            assert plan.coin == "DASH"
            assert plan.risk_reward == 1.46
            assert plan.technical_analyst.setup_quality == "EXCELLENT"
            assert "double bottom" in plan.technical_analyst.structure_analysis
            assert plan.risk_manager.risk_level == "LOW"
            assert plan.risk_manager.risk_factors == ["Resistance at 58.80"]

    asyncio.run(_test())

def test_judge_agent_recovers_real_coin_symbol():
    async def _test():
        judge = JudgeAgent()

        plan = CoinPlan(
            coin="DASH",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=55.37,
            entry_basis="current_price",
            tp=58.80,
            sl=53.22,
            risk_reward=1.60,
            technical_analyst=TechnicalAnalystView(
                setup_quality="EXCELLENT",
                structure_analysis="4h double bottom above EMA20"
            ),
            risk_manager=RiskManagerView(
                risk_level="LOW",
                sl_calibration="SL anchored to recent_support with 1.5 ATR buffer",
                risk_factors=[]
            ),
            reasoning="DASH clean setup",
            grounding="Price 55.37, TP 58.80, SL 53.22",
            rag_sources=[]
        )
        council_output = CouncilOutput(
            plans=[plan],
            verdict="DASH setup",
            tool_log=[{"symbol": "DASH", "current_price": 55.37}]
        )

        judge_llm_json = """{
          "prompt_version": "judge_v2.1",
          "chosen_coin": "TOKEN_X",
          "runner_up": null,
          "direction": "LONG",
          "entry": 55.37,
          "tp": 58.80,
          "sl": 53.22,
          "confidence": 0.85,
          "reasoning": "TOKEN_X verified cleanly by Technical Analyst and Risk Manager.",
          "hallucination_flags": [],
          "chosen_plan_grounded": true,
          "all_plans_audited": true,
          "final_decision": "EXECUTE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            judge_out = await judge.audit(council_output)

            assert judge_out.final_decision == "EXECUTE"
            assert judge_out.chosen_coin == "DASH"

    asyncio.run(_test())

def test_judge_does_not_reject_on_high_risk_or_low_rr():
    """Grounded plans with low R:R or high risk must still EXECUTE with downgraded confidence."""
    async def _test():
        judge = JudgeAgent()

        plan = CoinPlan(
            coin="NEAR",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=5.00,
            entry_basis="current_price",
            tp=5.39,
            sl=4.70,
            risk_reward=1.30,
            technical_analyst=TechnicalAnalystView(
                setup_quality="MODERATE",
                structure_analysis="Trend continuation"
            ),
            risk_manager=RiskManagerView(
                risk_level="HIGH",
                sl_calibration="Tighter SL at 4.70 due to high risk",
                risk_factors=["Overhead resistance"]
            ),
            reasoning="Honest low R:R setup",
            grounding="Price 5.00, TP 5.39, SL 4.70",
            rag_sources=[]
        )
        council_output = CouncilOutput(
            plans=[plan],
            verdict="NEAR setup",
            tool_log=[{"symbol": "NEAR", "current_price": 5.00, "recent_support": 4.70, "recent_resistance": 5.39}]
        )

        # Confidence: base 0.70 - 0.20 (HIGH risk) - 0.15 (R:R < 1.5) = 0.35 -> Still EXECUTE because grounded!
        judge_llm_json = """{
          "prompt_version": "judge_v2.1",
          "chosen_coin": "NEAR",
          "runner_up": null,
          "direction": "LONG",
          "entry": 5.00,
          "tp": 5.39,
          "sl": 4.70,
          "confidence": 0.35,
          "reasoning": "Plan is grounded in tool logs. High risk and low R:R downgrade confidence to 0.35, but decision is EXECUTE.",
          "hallucination_flags": [],
          "chosen_plan_grounded": true,
          "all_plans_audited": true,
          "final_decision": "EXECUTE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            judge_out = await judge.audit(council_output)

            assert judge_out.final_decision == "EXECUTE"
            assert judge_out.chosen_coin == "NEAR"
            assert judge_out.confidence == 0.35

    asyncio.run(_test())

def test_judge_rejects_on_hallucinated_entry():
    """Judge rejects ONLY when figures are ungrounded / hallucinated."""
    async def _test():
        judge = JudgeAgent()

        plan = CoinPlan(
            coin="SPX",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=10.00,
            entry_basis="current_price",
            tp=11.40,
            sl=9.70,
            risk_reward=4.67,
            technical_analyst=TechnicalAnalystView(setup_quality="MODERATE", structure_analysis="Reversal"),
            risk_manager=RiskManagerView(risk_level="HIGH", sl_calibration="SL at 9.70", risk_factors=[]),
            reasoning="SPX plan",
            grounding="Price 10.00, SL 9.70",
            rag_sources=[]
        )
        council_output = CouncilOutput(
            plans=[plan],
            verdict="SPX setup",
            tool_log=[{"symbol": "SPX", "current_price": 10.00, "recent_support": 9.20}]
        )

        judge_llm_json = """{
          "prompt_version": "judge_v2.1",
          "chosen_coin": null,
          "runner_up": null,
          "direction": null,
          "entry": null,
          "tp": null,
          "sl": null,
          "confidence": 0.0,
          "reasoning": "SPX rejected: SL 9.70 is an invented number not present in tool log.",
          "hallucination_flags": [
            {"coin": "SPX", "field": "sl", "issue": "value 9.70 does not appear in tool log", "severity": "major"}
          ],
          "chosen_plan_grounded": false,
          "all_plans_audited": true,
          "final_decision": "NO_TRADE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            judge_out = await judge.audit(council_output)

            assert judge_out.final_decision == "NO_TRADE"
            assert judge_out.chosen_coin is None
            assert len(judge_out.hallucination_flags) > 0

    asyncio.run(_test())

def test_pipeline_user_confidence_gating():
    """User threshold controls execution: if confidence < threshold, stand aside; if >= threshold, execute."""
    async def _test():
        async def dummy_chart(coin, tf):
            return {"current_price": 5.0, "ema20": 4.9, "recent_support": 4.7, "recent_resistance": 5.39}
        def dummy_rag(q):
            return []
        executed_trades = []
        async def dummy_execute(**kwargs):
            executed_trades.append(kwargs)
            return {"status": "SUCCESS"}

        pipeline = TradingPipeline(dummy_chart, dummy_rag, dummy_execute)

        # Mock screener to return 1 coin
        with patch.object(pipeline.screener, 'screen', new_callable=AsyncMock) as mock_screen:
            from autonomous_agents.trading_pipeline import ScreenerOutput, ScreenerSelection
            mock_screen.return_value = ScreenerOutput(
                selections=[ScreenerSelection(coin="NEAR", direction="LONG")],
                selection_reasoning="NEAR qualifies"
            )

            # Mock council to return grounded plan
            with patch.object(pipeline.council, 'build_plans', new_callable=AsyncMock) as mock_council:
                mock_council.return_value = CouncilOutput(
                    plans=[CoinPlan(
                        coin="NEAR",
                        direction="LONG",
                        entry=5.0,
                        tp=5.39,
                        sl=4.7,
                        risk_reward=1.30,
                        technical_analyst=TechnicalAnalystView(setup_quality="MODERATE", structure_analysis="trend"),
                        risk_manager=RiskManagerView(risk_level="HIGH", sl_calibration="tight", risk_factors=[]),
                        reasoning="test",
                        grounding="test"
                    )],
                    verdict="NEAR plan",
                    tool_log=[]
                )

                # Mock judge to return confidence 0.50 (50%)
                with patch.object(pipeline.judge, 'audit', new_callable=AsyncMock) as mock_judge:
                    mock_judge.return_value = JudgeOutput(
                        chosen_coin="NEAR",
                        direction="LONG",
                        entry=5.0,
                        tp=5.39,
                        sl=4.7,
                        confidence=0.50,
                        reasoning="Grounded but confidence is 0.50",
                        final_decision="EXECUTE"
                    )

                    # Case A: User min_confidence = 70 -> 50% < 70% -> Stand aside
                    res_high = await pipeline.run({"NEAR": {}}, dry_run=False, min_confidence=70)
                    assert res_high["status"] == "stand_aside"
                    assert len(executed_trades) == 0

                    # Case B: User min_confidence = 45 -> 50% >= 45% -> Execute
                    res_low = await pipeline.run({"NEAR": {}}, dry_run=False, min_confidence=45)
                    assert res_low["status"] == "executed"
                    assert len(executed_trades) == 1
                    assert executed_trades[0]["coin"] == "NEAR"

    asyncio.run(_test())

def test_judge_filters_false_positive_rr_hallucination_flag():
    """Verify that if LLM hallucinates an R:R flag where drift is <= 0.01 (e.g. 0.0036), the guard discards it."""
    async def _test():
        judge = JudgeAgent()
        plan = CoinPlan(
            coin="BCH",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=289.42,
            entry_basis="current_price",
            tp=294.80,
            sl=273.82,
            risk_reward=0.27, # |294.80 - 289.42| / |289.42 - 273.82| = 5.38 / 15.6 = 0.3448 (or 0.27)
            technical_analyst=TechnicalAnalystView(setup_quality="MODERATE", structure_analysis="uptrend"),
            risk_manager=RiskManagerView(risk_level="LOW", sl_calibration="sl", risk_factors=[]),
            reasoning="test",
            grounding="test"
        )
        # Recalibrate so actual_rr matches exactly 0.27
        # reward = 4.21, risk = 15.6 -> 4.21 / 15.6 = 0.26987 -> rounds to 0.27!
        plan.tp = plan.entry + 4.21
        plan.risk_reward = 0.27

        council_output = CouncilOutput(
            plans=[plan],
            verdict="test",
            tool_log=[{"symbol": "BCH", "current_price": 289.42}]
        )

        judge_llm_json = """{
          "prompt_version": "judge_v2.2",
          "chosen_coin": null,
          "runner_up": null,
          "direction": null,
          "entry": null,
          "tp": null,
          "sl": null,
          "confidence": 0.0,
          "reasoning": "Plan rejected: stated R:R 0.27 differs from recomputed 0.2736 by 0.0036 (> 0.01 tolerance)",
          "hallucination_flags": [
            {"coin": "BCH", "field": "risk_reward", "issue": "stated R:R 0.27 differs from recomputed 0.2736 by 0.0036 (> 0.01 tolerance)", "severity": "major"}
          ],
          "chosen_plan_grounded": false,
          "all_plans_audited": true,
          "final_decision": "NO_TRADE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            out = await judge.audit(council_output)

            # Programmatic guard should discard the false positive flag and recover execution!
            assert len(out.hallucination_flags) == 0
            assert out.final_decision == "EXECUTE"
            assert out.chosen_coin == "BCH"

    asyncio.run(_test())


def test_council_agent_direction_alignment_and_rag_normalization():
    """Verify macro 12h trend contradiction sets direction_alignment='counter' and risk_level='HIGH', and normalizes RAG."""
    async def _test():
        council = CouncilAgent(chart_tool=None, rag_tool=None)

        async def mock_chart(coin, tf):
            if tf == "12h":
                return {
                    "symbol": coin,
                    "timeframe": "12h",
                    "current_price": 50.0,
                    "ema20": 48.0,
                    "ema50": 52.0,  # 12h EMA20 < EMA50 (Downtrend stack)
                    "ema_trend": "BEARISH",
                    "atr": 2.0
                }
            return {
                "symbol": coin,
                "timeframe": "4h",
                "current_price": 50.0,
                "ema20": 49.5,
                "ema50": 49.0,
                "recent_support": 46.0,
                "recent_resistance": 56.0,
                "pattern": "double_bottom",
                "atr": 2.0
            }

        def mock_rag(query):
            return [{
                "chapter_id": "c1",
                "chapter_title": "Classical Chart Patterns",
                "section_id": "s1",
                "section_title": "Double Bottom Rules",
                "keywords": ["double bottom"],
                "content": "Reversal target is neckline breakout.",
                "rules": [{"rule_id": "r1", "text": "SL below trough"}]
            }]

        llm_response = """{
          "prompt_version": "council_v2.2",
          "plans": [
            {
              "coin": "ZEC",
              "screener_direction": "LONG",
              "direction": "LONG",
              "direction_alignment": "aligned",
              "entry": 50.0,
              "entry_basis": "current_price",
              "tp": 56.0,
              "sl": 46.0,
              "risk_reward": 1.5,
              "risk_reward_structural": 1.5,
              "technical_analyst": {
                "setup_quality": "EXCELLENT",
                "structure_analysis": "Double bottom breakout on 4h."
              },
              "risk_manager": {
                "risk_level": "LOW",
                "sl_calibration": "Standard 1.5 ATR buffer",
                "risk_factors": []
              },
              "reasoning": "ZEC LONG plan",
              "grounding": "Price 50.0, SL 46.0, TP 56.0",
              "rag_sources": []
            }
          ],
          "verdict": "ZEC evaluated."
        }"""

        with patch.object(council, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = llm_response

            selections = [{"coin": "ZEC", "direction": "LONG"}]
            output = await council.build_plans(selections, mock_chart, mock_rag)

            assert len(output.plans) == 1
            plan = output.plans[0]
            assert plan.coin == "ZEC"
            # 12h EMA stack is BEARISH -> direction_alignment must be overridden to "counter"
            assert plan.direction_alignment == "counter"
            assert plan.risk_manager.risk_level == "HIGH"

            # RAG citation fallback should be populated from retrieved knowledge with section and source
            assert len(plan.rag_sources) > 0
            assert plan.rag_sources[0]["section"] == "Double Bottom Rules"
            assert plan.rag_sources[0]["source"] == "Classical Chart Patterns"

    asyncio.run(_test())


def test_judge_filters_drift_within_0_02():
    """Verify that Judge programmatic guard accepts R:R drift up to 0.02 without flagging."""
    async def _test():
        judge = JudgeAgent()
        plan = CoinPlan(
            coin="ETH",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=100.0,
            entry_basis="current_price",
            tp=115.0,
            sl=90.0,
            risk_reward=1.50, # actual = 15 / 10 = 1.50
            technical_analyst=TechnicalAnalystView(setup_quality="MODERATE", structure_analysis="uptrend"),
            risk_manager=RiskManagerView(risk_level="LOW", sl_calibration="sl", risk_factors=[]),
            reasoning="test",
            grounding="test"
        )
        # Stated is 1.50, suppose actual is 1.515 (drift = 0.015 <= 0.02)
        plan.tp = 115.15

        council_output = CouncilOutput(
            plans=[plan],
            verdict="test",
            tool_log=[{"symbol": "ETH", "current_price": 100.0}]
        )

        judge_llm_json = """{
          "prompt_version": "judge_v2.2",
          "chosen_coin": null,
          "runner_up": null,
          "direction": null,
          "entry": null,
          "tp": null,
          "sl": null,
          "confidence": 0.0,
          "reasoning": "Plan rejected: stated R:R 1.50 differs from recomputed 1.515 by 0.015 (> 0.01 tolerance)",
          "hallucination_flags": [
            {"coin": "ETH", "field": "risk_reward", "issue": "stated R:R 1.50 differs from recomputed 1.515 by 0.015", "severity": "major"}
          ],
          "chosen_plan_grounded": false,
          "all_plans_audited": true,
          "final_decision": "NO_TRADE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            out = await judge.audit(council_output)

            # 0.015 <= 0.02 tolerance -> discarded!
            assert len(out.hallucination_flags) == 0
            assert out.final_decision == "EXECUTE"
            assert out.chosen_coin == "ETH"

    asyncio.run(_test())


def test_pipeline_recomputed_rr_prevents_judge_rejection_on_bch():
    """Verify that Judge cannot falsely reject BCH when rr_match is True (pre-computed ground truth)."""
    async def _test():
        judge = JudgeAgent()
        plan = CoinPlan(
            coin="BCH",
            screener_direction="LONG",
            direction="LONG",
            direction_alignment="aligned",
            entry=292.33,
            entry_basis="current_price",
            tp=298.85,
            sl=267.15,
            risk_reward=0.26,
            risk_reward_structural=0.68,
            recomputed_rr=0.26,
            recomputed_rr_structural=0.68,
            rr_match=True,  # Pre-computed ground truth
            technical_analyst=TechnicalAnalystView(setup_quality="MODERATE", structure_analysis="Range consolidation"),
            risk_manager=RiskManagerView(risk_level="MODERATE", sl_calibration="sl", risk_factors=[]),
            reasoning="test",
            grounding="test"
        )

        council_output = CouncilOutput(
            plans=[plan],
            verdict="test",
            tool_log=[{"symbol": "BCH", "current_price": 292.33}]
        )

        judge_llm_json = """{
          "prompt_version": "judge_v2.2",
          "chosen_coin": null,
          "runner_up": null,
          "direction": null,
          "entry": null,
          "tp": null,
          "sl": null,
          "confidence": 0.0,
          "reasoning": "BCH rejected for major hallucination -- stated risk_reward 0.26 and risk_reward_structural 0.68 both differ from recomputed R:R 0.68 by > 0.02 tolerance",
          "hallucination_flags": [
            {"coin": "BCH", "field": "risk_reward", "issue": "stated risk_reward 0.26 and risk_reward_structural 0.68 both differ from recomputed R:R 0.68", "severity": "major"}
          ],
          "chosen_plan_grounded": false,
          "all_plans_audited": true,
          "final_decision": "NO_TRADE"
        }"""

        with patch.object(judge, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = judge_llm_json
            out = await judge.audit(council_output)

            # Because rr_match is True, Judge's math confusion is discarded by programmatic guard!
            assert len(out.hallucination_flags) == 0
            assert out.final_decision == "EXECUTE"
            assert out.chosen_coin == "BCH"

    asyncio.run(_test())


def test_council_tp_magnitude_cap():
    """Verify that a >15% TP move is capped at recent_resistance and noted in risk_factors."""
    async def _test():
        council = CouncilAgent(chart_tool=None, rag_tool=None)

        async def mock_chart(coin, tf):
            return {
                "current_price": 1000.0,
                "ema20": 980.0,
                "recent_support": 950.0,
                "recent_resistance": 1100.0,  # +10% resistance
                "atr": 30.0,
                "rsi": 50
            }

        def mock_rag(query):
            return [{"section": "Target Rules", "source": "Trading Guide"}]

        # Model returns an unhinged +30% TP (1300.0)
        llm_response = """{
          "prompt_version": "council_v2.2",
          "plans": [
            {
              "coin": "ZEC",
              "screener_direction": "LONG",
              "direction": "LONG",
              "direction_alignment": "aligned",
              "entry": 1000.0,
              "entry_basis": "current_price",
              "tp": 1300.0,
              "sl": 950.0,
              "risk_reward": 6.0,
              "technical_analyst": {
                "setup_quality": "EXCELLENT",
                "structure_analysis": "Measured move projection"
              },
              "risk_manager": {
                "risk_level": "MODERATE",
                "sl_calibration": "sl",
                "risk_factors": []
              },
              "reasoning": "Extended breakout",
              "grounding": "Price 1000.0",
              "rag_sources": []
            }
          ],
          "verdict": "ZEC evaluated."
        }"""

        with patch.object(council, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = llm_response
            selections = [{"coin": "ZEC", "direction": "LONG"}]
            output = await council.build_plans(selections, mock_chart, mock_rag)

            assert len(output.plans) == 1
            plan = output.plans[0]
            # TP must be capped to structural resistance 1100.0!
            assert plan.tp == 1100.0
            assert any("TP capped from extended projection" in rf for rf in plan.risk_manager.risk_factors)

    asyncio.run(_test())


def test_screener_pre_filters_low_volume_and_tight_range():
    """Verify Screener pre-filters exclude coins with rel_vol < 1.0 or tight range (<3% to both S/R)."""
    async def _test():
        from autonomous_agents.trading_pipeline import ScreenerAgent
        screener = ScreenerAgent()

        coin_data = {
            "GOOD_COIN": {
                "price": 10.0,
                "rel_vol": 1.5,
                "dist_to_swing_high_pct": 5.0,
                "dist_to_swing_low_pct": 4.0
            },
            "LOW_VOL_COIN": {
                "price": 20.0,
                "rel_vol": 0.5, # < 1.0 -> should be filtered
                "dist_to_swing_high_pct": 5.0,
                "dist_to_swing_low_pct": 4.0
            },
            "SQUEEZED_COIN": {
                "price": 30.0,
                "rel_vol": 1.2,
                "dist_to_swing_high_pct": 1.0, # < 3.0%
                "dist_to_swing_low_pct": 1.5   # < 3.0% -> squeezed
            }
        }

        # Mock LLM to return GOOD_COIN
        llm_response = """{
          "selection_reasoning": "GOOD_COIN selected.",
          "selections": [{"coin": "GOOD_COIN", "direction": "LONG"}]
        }"""

        with patch.object(screener, '_call_llm', new_callable=AsyncMock) as mock_llm:
            mock_llm.return_value = llm_response
            out = await screener.screen(coin_data)
            assert len(out.selections) == 1
            assert out.selections[0]["coin"] == "GOOD_COIN"
            # Verify that only GOOD_COIN was transmitted in user prompt
            call_args = mock_llm.call_args[0]
            user_prompt_sent = call_args[1]
            assert "GOOD_COIN" in user_prompt_sent
            assert "LOW_VOL_COIN" not in user_prompt_sent
            assert "SQUEEZED_COIN" not in user_prompt_sent

    asyncio.run(_test())


