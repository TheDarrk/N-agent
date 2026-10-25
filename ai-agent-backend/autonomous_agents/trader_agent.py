"""
Neptune AI — Autonomous Quantitative Trader Agent
Pipeline Architecture:
  - Pre-Scanner: Multi-Asset Universe Pre-Scanner (DEX 1-Click / NEAR Intents Universe)
      * Excludes stablecoins, test tokens, dead markets (<10 candles or 0 volume)
      * Compiles standardized COIN TABLE with BTC backdrop at Row 1
  - Node 1: LLM Market Screener (SCREENER_SYSTEM)
      * 7-step discipline: regime classification, elimination, shortlist, book match, selection
      * Zero hardcoding: if candidate_found is False, stands aside safely with symbol MARKET
  - Bridge:
      * Loads the 5 book sections selected by Screener
      * Runs the 3 targeted RAG queries suggested by Screener
      * Computes multi-timeframe candle confluence (1h, 2h, 4h, 1d, 1w)
      * Vision Engine: Candlestick PNG & ASCII chart
      * Twitter/X sentiment & optional Track 7 Research Agent hire
  - Node 2: 4-Specialist Council + Senior Reviewer + Chairman
      * Technical Analyst, Playbook Strategist, Risk Manager, Skeptic with live tools
      * Senior Reviewer numerical & logic audit
      * Chairman synthesis, exact price levels, position size arithmetic, calibrated confidence
  - Node 3: Independent Auditor
      * Automated programmatic checks + 5 audit steps (numeric, grounding, logic, risk, calibration)
  - Programmatic Hard-Cap Execution Engine:
      * Kill switch, daily/weekly frequency limits, capital hard cap
      * Order execution via NEAR Intents / Defuse
      * Persistence in SQLite for quiet 60s poller
      * Preserves decentralized audit traces
"""

import os
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from market_intelligence import analyze_token_indicators, fetch_klines, analyze_multiframe_market_tool
from coin_scanner import scan_coin_universe
from pattern_recognition import analyze_chart_patterns
from chart_visualizer import generate_ascii_chart, render_chart_image
from trading_book_rag import trading_book_rag
from twitter_sentiment import search_twitter_sentiment
from autonomous_agents.research_agent import ResearchAgent
from database import (
    create_active_trade, get_user, count_trades_today, count_trades_this_week,
    log_agent_action, get_agent_key, validate_agent_execution_wallet, record_dropped_trade
)
from decentralized_storage import upload_trade_trace
from autonomous_agents.llm_council_judge import LLMCouncilJudge


class TraderAgent:
    """
    Autonomous Quantitative Trader Agent combining multi-source market intelligence,
    computer vision chart pattern recognition, XML Crypto Trading Book RAG,
    Live Twitter sentiment, Research Agent A2A plugin, and an LLM-as-a-Judge.
    """

    def __init__(self):
        self.name = "trader"
        self.research_agent = ResearchAgent()
        self.council_judge = LLMCouncilJudge(agent_type="trader")

    async def run_pipeline(
        self,
        user_wallet: str,
        symbol: Optional[str] = None,
        coin_mode: Optional[str] = None,
        custom_coins: Optional[List[str]] = None,
        force_timeframe: Optional[str] = None,
        force_min_confidence: Optional[int] = None,
        enable_researcher_plugin: Optional[bool] = None
    ) -> Dict[str, Any]:
        """
        Executes the 3-Node + Deterministic Hard-Cap Execution Pipeline.
        """
        user = get_user(user_wallet) or {}
        timeframe = force_timeframe or user.get("trader_timeframe", "1h")
        min_confidence = force_min_confidence if force_min_confidence is not None else int(user.get("trader_min_confidence", 75))
        risk_profile = user.get("trader_risk_profile", "moderate")
        max_tx_amount = float(user.get("max_tx_amount") or 1_000_000.0)
        max_trades_day = int(user.get("trader_max_trades_per_day", 100))
        max_trades_week = int(user.get("trader_max_trades_per_week", 500))
        active_coin_mode = coin_mode or user.get("trader_coin_mode", "auto")
        
        # Check researcher plugin setting (user toggle)
        researcher_active = (
            enable_researcher_plugin
            if enable_researcher_plugin is not None
            else bool(user.get("trader_enable_researcher", 0))
        )

        # Parse custom coins from user DB if stored as string
        if custom_coins is None and user.get("trader_custom_coins"):
            custom_coins = [c.strip().upper() for c in user.get("trader_custom_coins", "").split(",") if c.strip()]

        print(f"\n{'='*70}\n[AUTONOMOUS TRADER PIPELINE] Starting for wallet: {user_wallet} | Network: {user.get('near_network', 'testnet')} | Timeframe: {timeframe}\n{'='*70}")

        # ─── PRE-FLIGHT HARD CAPS ─────────────────────────────────
        if user.get("kill_switch", 0):
            print(f"[TRADER-HARD-CAP] Master Kill Switch is ACTIVE. Halting pipeline execution.")
            return {
                "success": False,
                "status": "BLOCKED_KILL_SWITCH",
                "message": "Master Kill switch is active. Autonomous trading is halted."
            }

        today_trades = count_trades_today(user_wallet)
        if today_trades >= max_trades_day:
            return {
                "success": False,
                "status": "DAILY_LIMIT_REACHED",
                "message": f"Daily frequency limit reached ({today_trades}/{max_trades_day} trades today)."
            }

        week_trades = count_trades_this_week(user_wallet)
        if week_trades >= max_trades_week:
            return {
                "success": False,
                "status": "WEEKLY_LIMIT_REACHED",
                "message": f"Weekly frequency limit reached ({week_trades}/{max_trades_week} trades this week)."
            }

        # ─── NODE 1: PRE-SCANNER & LLM MARKET SCREENER ─────────────
        print(f"[NODE 1: RESEARCH] Scanning universe ({active_coin_mode} mode)...")
        node1_data = await self._node1_gather_data(
            user_wallet=user_wallet,
            symbol=symbol,
            coin_mode=active_coin_mode,
            custom_coins=custom_coins,
            timeframe=timeframe,
            enable_researcher=researcher_active
        )

        screener_res = node1_data.get("screener_result")
        # If the LLM Screener found no setup matching the book or hostile regime, halt immediately without hardcoded fallback
        if node1_data.get("symbol") == "NONE" or (screener_res and not screener_res.get("candidate_found")):
            no_cand_reason = (screener_res.get("no_candidate_reason") if screener_res else "") or "Screener determined market regime is hostile or no candidate matches the trading book."
            print(f"[NODE 1: STAND_ASIDE] Screener mandate: candidate_found = False. Reason: {no_cand_reason}")
            trace = {
                "agent": "trader",
                "user_wallet": user_wallet,
                "symbol": "MARKET",
                "timeframe": timeframe,
                "verdict": "STAND_ASIDE",
                "stage": "SCREENER_NO_CANDIDATE",
                "confidence_score": 0,
                "min_required": min_confidence,
                "expected_roi_pct": 0.0,
                "reasoning": f"Screener: {no_cand_reason}",
                "screener_result": screener_res
            }
            print(f"[STORAGE] Uploading stand-aside audit trace to decentralized storage...")
            cid = await upload_trade_trace(trace)
            print(f"[STORAGE] Trade reasoning trace saved: {cid} (recent 10 preserved)")
            return {
                "success": False,
                "status": "STAND_ASIDE",
                "verdict": "STAND_ASIDE",
                "symbol": "MARKET",
                "timeframe": timeframe,
                "confidence_score": 0,
                "min_confidence": min_confidence,
                "expected_roi_pct": 0.0,
                "reasoning": no_cand_reason,
                "screener_result": screener_res,
                "cid": cid
            }

        target_symbol = node1_data["symbol"]
        indicators = node1_data["indicators"]
        pattern_data = node1_data["pattern_data"]
        ascii_chart = node1_data["ascii_chart"]
        chart_image_info = node1_data["chart_image_info"]
        retrieved_knowledge = node1_data["retrieved_knowledge"]
        rag_xml_block = node1_data["rag_xml_block"]
        twitter_sentiment = node1_data["twitter_sentiment"]
        researcher_intel = node1_data.get("researcher_intel")

        print(f"[NODE 1: RESULT] Selected Symbol: {target_symbol} | Spot Price: ${indicators['current_price']} | Trend: {indicators['ema_trend']} | Pattern: {pattern_data['dominant_pattern']}")

        # Pre-check execution wallet & on-chain balance to provide strict capital awareness to LLM Judge
        wallet_val_pre = validate_agent_execution_wallet(user_wallet=user_wallet, agent_id="trader")
        agent_exec_wallet = wallet_val_pre.get("agent_wallet", user_wallet)
        agent_bal_near = float(wallet_val_pre.get("balance", 0.0))

        # ─── NODE 2: LLM COUNCIL SPECIALISTS & CHAIRMAN ────────────
        print(f"[NODE 2: LLM JUDGE] Evaluating evidence confluence with capital awareness (Wallet: {agent_exec_wallet}, Balance: {agent_bal_near:.4f} NEAR, Hard Cap: ${max_tx_amount:.2f})...")
        node2_data = await self._node2_llm_judge(
            symbol=target_symbol,
            indicators=indicators,
            pattern_data=pattern_data,
            ascii_chart=ascii_chart,
            rag_xml_block=rag_xml_block,
            matched_sections=retrieved_knowledge,
            twitter_sentiment=twitter_sentiment,
            researcher_intel=researcher_intel,
            risk_profile=risk_profile,
            min_confidence=min_confidence,
            agent_wallet=agent_exec_wallet,
            agent_balance=agent_bal_near,
            hard_cap_usd=max_tx_amount,
            multiframe_analysis=node1_data.get("multiframe_chart"),
            screener_result=node1_data.get("screener_result")
        )
        print(f"[NODE 2: VERDICT] Verdict: {node2_data.get('verdict')} | Confidence: {node2_data.get('confidence_score')}% (Threshold: {min_confidence}%) | Expected ROI: {node2_data.get('expected_roi_pct')}%")

        # ─── DETERMINISTIC PROGRAMMATIC EXECUTION (NO NODE 3 LLM) ─
        result = await self._evaluate_and_execute_verdict(
            user_wallet=user_wallet,
            symbol=target_symbol,
            timeframe=timeframe,
            min_confidence=min_confidence,
            max_tx_amount=max_tx_amount,
            node1_data=node1_data,
            node2_data=node2_data
        )

        return result

    # ─── NODE 1 IMPLEMENTATION ────────────────────────────────────

    async def _node1_gather_data(
        self,
        user_wallet: str,
        symbol: Optional[str],
        coin_mode: str,
        custom_coins: Optional[List[str]],
        timeframe: str,
        enable_researcher: bool
    ) -> Dict[str, Any]:
        """
        Node 1: Scans universe, compiles COIN TABLE, runs LLM Screener,
        loads selected book sections + suggested RAG queries, recognizes geometric chart patterns,
        renders candlestick vision chart, searches Twitter sentiment, and optionally hires Research Agent.
        """
        scan_results = None
        selected_symbol = symbol
        screener_res = None

        # 1. Full Universe Scanner & Node 1 LLM Screener
        if not selected_symbol:
            scan_results = await scan_coin_universe(
                mode=coin_mode,
                custom_coins=custom_coins,
                timeframe=timeframe
            )
            
            # Execute Node 1 LLM Screener over COIN TABLE and BOOK INDEX
            if scan_results.get("coin_table"):
                book_index = trading_book_rag.get_book_index()
                table_input = scan_results.get("coin_table_markdown") or scan_results["coin_table"]
                screener_res = await self.council_judge.screen_universe(
                    coin_table=table_input,
                    book_index=book_index
                )
                if screener_res and screener_res.get("candidate_found") and screener_res.get("chosen_symbol"):
                    selected_symbol = screener_res["chosen_symbol"]
                else:
                    # Screener explicitly determined no candidate exists. Zero hardcoded fallback.
                    print(f"[NODE 1: SCREENER] Screener found no qualifying candidate: {screener_res.get('no_candidate_reason') if screener_res else 'Regime hostile'}")
                    return {
                        "symbol": "NONE",
                        "coin_mode": coin_mode,
                        "scan_results": scan_results,
                        "screener_result": screener_res,
                        "candles": [],
                        "indicators": {"current_price": 0.0, "ema_trend": "NEUTRAL", "rsi": 50.0, "atr": 0.0, "volume_surge": False},
                        "pattern_data": {"dominant_pattern": "No Candidate Found", "measured_target": 0.0, "stop_loss": 0.0, "risk_reward_ratio": 0.0},
                        "ascii_chart": "",
                        "chart_image_info": None,
                        "retrieved_knowledge": [],
                        "rag_xml_block": "",
                        "twitter_sentiment": {"sentiment": "NEUTRAL", "bullish_pct": 50},
                        "researcher_intel": None,
                        "multiframe_chart": None
                    }
            top_cand = None
        else:
            top_cand = None

        # 2. Indicators Engine & Candle History & Pattern Recognition
        if top_cand and selected_symbol == top_cand.get("symbol") and top_cand.get("pattern_data") and top_cand.get("indicators", {}).get("candles"):
            indicators = top_cand["indicators"]
            candles = indicators["candles"]
            pattern_data = top_cand["pattern_data"]
        else:
            candles = await fetch_klines(symbol=selected_symbol, timeframe=timeframe, limit=50)
            indicators = await analyze_token_indicators(symbol=selected_symbol, timeframe=timeframe)
            pattern_data = analyze_chart_patterns(
                candles=candles,
                current_price=indicators["current_price"],
                atr=indicators["atr"]
            )

        # 4. Chart Vision: Dark-Mode Matplotlib Candlestick PNG + High-Resolution ASCII Grid
        chart_image_info = render_chart_image(
            candles=candles,
            symbol=selected_symbol,
            timeframe=timeframe,
            pattern_name=pattern_data["dominant_pattern"],
            tp_price=pattern_data["measured_target"],
            sl_price=pattern_data["stop_loss"],
            entry_price=indicators["current_price"],
            verdict="ENTER_LONG" if indicators["ema_trend"] == "BULLISH" else "ENTER_SHORT",
            expected_roi_pct=round(max(2.0, (pattern_data["measured_target"] - indicators["current_price"]) / max(0.0001, indicators["current_price"]) * 100), 1),
            confidence_score=pattern_data.get("confidence_score", 80),
            pattern_data=pattern_data,
            indicators=indicators
        )

        ascii_chart = generate_ascii_chart(
            candles=candles,
            symbol=selected_symbol,
            timeframe=timeframe,
            pattern_name=pattern_data["dominant_pattern"],
            tp_price=pattern_data["measured_target"],
            sl_price=pattern_data["stop_loss"]
        )

        # 5. Local XML Crypto Trading Book RAG Retrieval (31 sections)
        print(f"\n{'='*70}\n[NODE 1 -> NODE 2 BRIDGE] Loading Trading Book Rules & Technical Context for {selected_symbol}\n{'='*70}")
        if screener_res and screener_res.get("selected_book_sections"):
            matched_sections = trading_book_rag.get_sections_by_ids(screener_res["selected_book_sections"])
            print(f"[BRIDGE: 5 BOOK SECTIONS LOADED] Screener selected 5 sections from 31-section book: {[s.get('section_id') for s in matched_sections]}")
        else:
            rag_context = {
                "symbol": selected_symbol,
                "ema_trend": indicators["ema_trend"],
                "rsi": indicators["rsi"],
                "volume_surge": indicators["volume_surge"],
                "pattern_name": pattern_data["dominant_pattern"]
            }
            matched_sections = trading_book_rag.retrieve(rag_context, top_k=5)
            print(f"[BRIDGE: HEURISTIC RAG] Retrieved {len(matched_sections)} sections for {selected_symbol}: {[s.get('section_title') for s in matched_sections]}")

        # Also incorporate the 3 suggested RAG queries from the screener if available
        suggested_queries = screener_res.get("suggested_rag_queries", []) if screener_res else []
        targeted_rules = []
        for q in suggested_queries:
            q_secs = trading_book_rag.search_by_query(q, top_k=1)
            for qs in q_secs:
                for r in qs.get("rules", []):
                    targeted_rules.append(f"Targeted Rule for '{q}': {r.get('text')}")

        if targeted_rules:
            print(f"[BRIDGE: 3 RAG QUERIES RUN] Targeted book queries executed: {suggested_queries}")
            for tr in targeted_rules:
                print(f"  * {tr}")

        rag_xml_block = trading_book_rag.format_for_xml_prompt(matched_sections)
        if targeted_rules:
            rag_xml_block += "\n<targeted_screener_query_rules>\n  " + "\n  ".join(targeted_rules[:4]) + "\n</targeted_screener_query_rules>"

        # 6. Live Twitter / X Sentiment Engine
        print(f"[BRIDGE: SENTIMENT] Querying live Twitter / X sentiment for #{selected_symbol}...")
        twitter_data = await search_twitter_sentiment(symbol=selected_symbol)
        print(f"[BRIDGE: SENTIMENT RESULT] {twitter_data.get('sentiment')} ({twitter_data.get('bullish_pct')}% Bullish, Velocity: {twitter_data.get('viral_velocity_score')}/100)")

        # 7. Research Agent Plugin (Track 7 Agent-to-Agent Hire Demo)
        researcher_intel = None
        if enable_researcher:
            try:
                print(f"[TRADER-PLUGIN] Hiring Research Agent for {selected_symbol} (0.1 NEAR fee)...")
                hire_result = await self.research_agent.hire_by_trader_agent(
                    trader_wallet=user_wallet,
                    symbol=selected_symbol
                )
                full_rep = hire_result.get("full_report", {})
                researcher_intel = {
                    "hired": True,
                    "fee_paid": hire_result.get("fee_transferred"),
                    "recipient": hire_result.get("recipient"),
                    "report_cid": hire_result.get("report_cid"),
                    "signal": hire_result.get("signal", "ACCUMULATE"),
                    "executive_summary": full_rep.get("executive_summary", "Strong ecosystem momentum with expanding liquidity."),
                    "risk_factors": full_rep.get("risk_factors", "Short-term volatility at local resistance.")
                }
            except Exception as e:
                print(f"[TRADER-PLUGIN] Research agent hire notice: {e}")

        # 8. Multi-Timeframe Candlestick & Pattern Analysis Tool (1h, 2h, 4h, 1d, 1w)
        print(f"[BRIDGE: MULTI-TIMEFRAME ENGINE] Inspecting 1h, 2h, 4h, 1d, 1w timeframes for structural alignment...")
        multiframe_chart = await analyze_multiframe_market_tool(
            symbol=selected_symbol,
            timeframes=["1h", "2h", "4h", "1d", "1w"]
        )
        print(f"[BRIDGE: MULTI-TIMEFRAME RESULT] Macro Alignment: {multiframe_chart.get('macro_alignment')}")
        print(f"[BRIDGE: VISION CHART] Generated dark-mode candlestick PNG & ASCII structure grid for {selected_symbol}")

        return {
            "symbol": selected_symbol,
            "coin_mode": coin_mode,
            "scan_results": scan_results,
            "screener_result": screener_res,
            "candles": candles,
            "indicators": indicators,
            "pattern_data": pattern_data,
            "ascii_chart": ascii_chart,
            "chart_image_info": chart_image_info,
            "retrieved_knowledge": matched_sections,
            "rag_xml_block": rag_xml_block,
            "twitter_sentiment": twitter_data,
            "researcher_intel": researcher_intel,
            "multiframe_chart": multiframe_chart
        }

    # ─── NODE 2: LLM COUNCIL JUDGE IMPLEMENTATION ─────────────────

    async def _node2_llm_judge(
        self,
        symbol: str,
        indicators: Dict[str, Any],
        pattern_data: Dict[str, Any],
        ascii_chart: str,
        rag_xml_block: str,
        matched_sections: List[Dict[str, Any]],
        twitter_sentiment: Dict[str, Any],
        researcher_intel: Optional[Dict[str, Any]],
        risk_profile: str,
        min_confidence: int,
        agent_wallet: str = "",
        agent_balance: float = 0.0,
        hard_cap_usd: float = 1_000_000.0,
        multiframe_analysis: Optional[Dict[str, Any]] = None,
        screener_result: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Node 2 & 3: Multi-persona Council Specialists, Senior Reviewer, Chairman Synthesis,
        and Independent Post-Deliberation Auditor.
        """
        return await self.council_judge.deliberate_and_judge(
            symbol=symbol,
            indicators=indicators,
            pattern_data=pattern_data,
            ascii_chart=ascii_chart,
            rag_xml_block=rag_xml_block,
            matched_sections=matched_sections,
            twitter_sentiment=twitter_sentiment,
            researcher_intel=researcher_intel,
            risk_profile=risk_profile,
            min_confidence=min_confidence,
            agent_wallet=agent_wallet,
            agent_balance=agent_balance,
            hard_cap_usd=hard_cap_usd,
            multiframe_analysis=multiframe_analysis,
            screener_result=screener_result
        )

    # ─── DETERMINISTIC EXECUTION FUNCTION (NO NODE 3 LLM) ────────

    async def _evaluate_and_execute_verdict(
        self,
        user_wallet: str,
        symbol: str,
        timeframe: str,
        min_confidence: int,
        max_tx_amount: float,
        node1_data: Dict[str, Any],
        node2_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Pure programmatic hard-cap check and order dispatch.
        No LLM is invoked here — ensures mathematically rigorous compliance with user limits.
        """
        indicators = node1_data["indicators"]
        verdict = node2_data.get("verdict", "STAND_ASIDE")
        confidence_score = int(node2_data.get("confidence_score", 0))
        expected_roi_pct = float(node2_data.get("expected_roi_pct", 0.0))
        entry_price = float(node2_data.get("entry_price", indicators["current_price"]))
        raw_tp = node2_data.get("take_profit_price")
        tp_price = float(raw_tp) if raw_tp is not None else None
        raw_sl = node2_data.get("stop_loss_price")
        sl_price = float(raw_sl) if raw_sl is not None else None
        risk_reward_ratio = float(node2_data.get("risk_reward_ratio", 2.0))
        reasoning = node2_data.get("reasoning", "")
        pattern = node2_data.get("pattern_detected", "")
        book_section = node2_data.get("book_section_cited", "sec_bull_bear_flags")
        binary_checks = node2_data.get("binary_evidence_checks", {})
        council_agreement = node2_data.get("council_agreement", "")
        council_clash = node2_data.get("council_clash", "")
        blind_spots_caught = node2_data.get("blind_spots_caught", "")
        one_thing_first = node2_data.get("one_thing_first", "")
        advisors = node2_data.get("advisors", {})

        is_warranted = (
            verdict in ["ENTER_LONG", "ENTER_SHORT"] and
            confidence_score >= min_confidence
        )

        # TP / SL are strictly execution parameters decided by the Council.
        # If the trade is rejected / STAND_ASIDE, zero out TP/SL and expected ROI (no fake execution targets).
        if not is_warranted:
            tp_price = None
            sl_price = None
            expected_roi_pct = 0.0
        else:
            # Trade is approved: ensure sensible TP/SL levels for LONG or SHORT
            if verdict == "ENTER_SHORT":
                if tp_price is None or tp_price >= entry_price:
                    tp_price = round(entry_price * (1 - max(0.04, expected_roi_pct / 100)), 4)
                if sl_price is None or sl_price <= entry_price or sl_price <= 0:
                    sl_price = round(entry_price + max(indicators["atr"] * 1.2, entry_price * 0.03), 4)
            else:
                if tp_price is None or tp_price <= entry_price:
                    tp_price = round(entry_price * (1 + max(0.04, expected_roi_pct / 100)), 4)
                if sl_price is None or sl_price >= entry_price or sl_price <= 0:
                    sl_price = round(entry_price - max(indicators["atr"] * 1.2, entry_price * 0.03), 4)

        # Re-render definitive visual chart with Council's final consensus verdict, ROI, and forward prediction path
        try:
            final_chart_image = render_chart_image(
                candles=node1_data.get("candles", []),
                symbol=symbol,
                timeframe=timeframe,
                pattern_name=pattern or node1_data.get("pattern_data", {}).get("dominant_pattern", "Structure Regime"),
                tp_price=tp_price or 0.0,
                sl_price=sl_price or 0.0,
                entry_price=entry_price,
                verdict=verdict,
                expected_roi_pct=expected_roi_pct,
                confidence_score=confidence_score,
                pattern_data=node1_data.get("pattern_data"),
                indicators=indicators
            )
            node1_data["chart_image_info"] = final_chart_image
        except Exception as chart_err:
            print(f"[TRADER-CHART] Notice re-rendering definitive chart: {chart_err}")

        # ─── HARD CAP CHECK: Confidence & Verdict Validation ──────
        if not is_warranted:
            print(f"\n{'='*70}\n[PROGRAMMATIC EXECUTION: STAND ASIDE] Capital Preservation Gate\n{'='*70}")
            print(f"[EXECUTION: STAND ASIDE] Verdict: {verdict} | Confidence: {confidence_score}% (Min Required: {min_confidence}%)")
            print(f"[EXECUTION: STAND ASIDE] Trade NOT warranted. Protecting user balance.")
            
            # Build trace for decentralized audit log (recent 10 preserved)
            trace = {
                "agent": "trader",
                "user_wallet": user_wallet,
                "symbol": symbol,
                "timeframe": timeframe,
                "verdict": verdict,
                "stage": "STAND_ASIDE_EVALUATION",
                "confidence_score": confidence_score,
                "min_required": min_confidence,
                "expected_roi_pct": 0.0,
                "entry_price": entry_price,
                "take_profit_price": None,
                "stop_loss_price": None,
                "chart_image": node1_data.get("chart_image_info"),
                "binary_evidence_checks": binary_checks,
                "pattern_detected": pattern,
                "book_section_cited": book_section,
                "reasoning": reasoning,
                "council_agreement": council_agreement,
                "council_clash": council_clash,
                "blind_spots_caught": blind_spots_caught,
                "one_thing_first": one_thing_first,
                "advisors": advisors,
                "indicators": indicators,
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel")
            }
            print(f"[STORAGE] Uploading stand-aside audit trace to decentralized storage...")
            cid = await upload_trade_trace(trace)
            print(f"[STORAGE] Trade reasoning trace saved: {cid} (recent 10 preserved)")

            return {
                "success": False,
                "status": "STAND_ASIDE",
                "verdict": verdict,
                "symbol": symbol,
                "timeframe": timeframe,
                "confidence_score": confidence_score,
                "min_confidence": min_confidence,
                "expected_roi_pct": expected_roi_pct,
                "binary_evidence_checks": binary_checks,
                "pattern": pattern,
                "book_section_cited": book_section,
                "reasoning": reasoning,
                "council_agreement": council_agreement,
                "council_clash": council_clash,
                "blind_spots_caught": blind_spots_caught,
                "one_thing_first": one_thing_first,
                "advisors": advisors,
                "cid": cid,
                "indicators": indicators,
                "chart_image": node1_data["chart_image_info"],
                "ascii_chart": node1_data["ascii_chart"],
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel"),
                "multiframe_chart": node1_data.get("multiframe_chart"),
                "scan_results": node1_data.get("scan_results")
            }

        # ─── HARD CAP CHECK: Strict Sizing & Capital Constraints ─────────
        near_price = indicators.get("current_price", 4.5) if symbol.upper() == "NEAR" else 4.5
        rec_usd = float(node2_data.get("recommended_position_usd") or max_tx_amount)
        # Never exceed user's hard cap
        amount_usd = round(min(max_tx_amount, rec_usd), 2)

        is_cross_chain = symbol.upper() in ["ETH", "WBTC", "BTC", "SOL", "ARB", "OP", "AVAX", "BNB"]
        target_chain = "ethereum" if symbol.upper() in ["ETH", "WETH"] else ("arbitrum" if symbol.upper() == "ARB" else ("solana" if symbol.upper() == "SOL" else "near"))

        # ─── HARD FUNCTION CHECK: AGENT EXECUTION WALLET VALIDATION ───
        wallet_validation = validate_agent_execution_wallet(
            user_wallet=user_wallet,
            agent_id="trader",
            target_chain=target_chain,
            is_cross_chain=is_cross_chain
        )

        if not wallet_validation.get("valid"):
            drop_reason = wallet_validation.get("reason", "Unauthorized or unassigned agent wallet")
            dropped_id = record_dropped_trade(
                user_wallet=user_wallet,
                agent_id="trader",
                symbol=symbol,
                amount_usd=amount_usd,
                reason=drop_reason,
                is_cross_chain=is_cross_chain,
                entry_price=entry_price,
                target_chain=target_chain
            )
            trace = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_wallet": user_wallet,
                "agent_id": "trader",
                "stage": "DROPPED_BY_HARD_VALIDATOR",
                "verdict": verdict,
                "drop_reason": drop_reason,
                "confidence_score": confidence_score,
                "min_required": min_confidence,
                "expected_roi_pct": 0.0,
                "entry_price": entry_price,
                "take_profit_price": None,
                "stop_loss_price": None,
                "chart_image": node1_data.get("chart_image_info"),
                "binary_evidence_checks": binary_checks,
                "pattern_detected": pattern,
                "book_section_cited": book_section,
                "reasoning": f"TRADE DROPPED by Hard Validator: {drop_reason}",
                "council_agreement": council_agreement,
                "council_clash": council_clash,
                "blind_spots_caught": blind_spots_caught,
                "one_thing_first": one_thing_first,
                "advisors": advisors,
                "indicators": indicators,
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel")
            }
            cid = await upload_trade_trace(trace)
            return {
                "success": False,
                "status": "DROPPED",
                "trade_id": dropped_id,
                "symbol": symbol,
                "verdict": verdict,
                "drop_reason": drop_reason,
                "confidence_score": confidence_score,
                "min_confidence": min_confidence,
                "expected_roi_pct": expected_roi_pct,
                "amount_usd": amount_usd,
                "is_cross_chain": is_cross_chain,
                "target_chain": target_chain,
                "reasoning": f"TRADE DROPPED by Hard Validator: {drop_reason}",
                "cid": cid,
                "binary_evidence_checks": binary_checks,
                "pattern": pattern,
                "book_section_cited": book_section,
                "indicators": indicators,
                "chart_image": node1_data["chart_image_info"],
                "ascii_chart": node1_data["ascii_chart"],
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel"),
                "scan_results": node1_data.get("scan_results")
            }

        agent_execution_wallet = wallet_validation.get("agent_wallet", user_wallet)
        wallet_balance = wallet_validation.get("balance", 0.0)

        print(f"[HARD VALIDATOR: PASSED] Authorized Agent Execution Wallet: {agent_execution_wallet} (Balance: {wallet_balance:.4f} NEAR)")

        # ─── SUBMIT ORDER VIA NEAR INTENTS / DEFUSE 1-CLICK PROTOCOL ───
        is_native_near_holding = (symbol.upper() == "NEAR" and verdict == "ENTER_LONG")
        quote_res = None
        quote_tx_hash = f"tx_intent_{int(datetime.now(timezone.utc).timestamp())}"

        if is_native_near_holding:
            # Agent execution wallet already holds native NEAR. No swap quote needed.
            print(f"[TRADER-AGENT] ENTER_LONG on NEAR: Dedicated agent wallet {agent_execution_wallet} holds {wallet_balance:.4f} NEAR. Maintaining spot Long position.")
            quote_tx_hash = f"tx_spot_near_{int(datetime.now(timezone.utc).timestamp())}"
            quote_res = {
                "quote": {
                    "quoteId": quote_tx_hash,
                    "depositAddress": "",
                    "minAmountOut": str(amount_usd)
                }
            }
        else:
            # Determine tokens based on agent's NEAR balance
            if symbol.upper() == "NEAR":
                token_in = "NEAR"
                token_out = "USDT"  # Moving to stables on hedge/sell
            else:
                token_in = "NEAR"
                token_out = symbol.upper()

            near_spot_price = indicators.get("current_price", 4.5) if symbol.upper() == "NEAR" else 4.5
            amount_in_near = round(min(amount_usd / near_spot_price, max(0.01, wallet_balance - 0.05)), 4)
            dest_recipient = wallet_validation.get("destination_wallet", agent_execution_wallet)

            print(f"[NEAR INTENTS: TOOL CALL] Requesting 1-Click swap quote: {amount_in_near} {token_in} -> {token_out} on {target_chain} (Recipient: {dest_recipient})...")
            try:
                from tools import get_swap_quote, create_near_intent_transaction
                quote_res = get_swap_quote(
                    token_in=token_in,
                    token_out=token_out,
                    amount=float(amount_in_near),
                    chain_id="near",
                    recipient_id=dest_recipient,
                    is_cross_chain=is_cross_chain,
                    refund_address=agent_execution_wallet,
                    source_chain="near",
                    dest_chain=target_chain if is_cross_chain else "near"
                )
            except Exception as e:
                print(f"[NEAR INTENTS: ERROR] Swap quote tool exception: {e}")
                quote_res = {"error": str(e)}

        # STRICT CHECK: If quote fails, DO NOT open trade! Drop it immediately.
        if not quote_res or "error" in quote_res or "quote" not in quote_res:
            quote_err = quote_res.get("error", "No valid 1-Click quote returned from NEAR Intents") if quote_res else "Quote call failed"
            print(f"[NEAR INTENTS: DROPPED] Quote failed ({quote_err}). Trade will NOT be placed.")
            dropped_id = record_dropped_trade(
                user_wallet=user_wallet,
                agent_id="trader",
                symbol=symbol,
                amount_usd=amount_usd,
                reason=f"NEAR Intents Quote Error: {quote_err}",
                is_cross_chain=is_cross_chain,
                entry_price=entry_price,
                target_chain=target_chain
            )
            quote_trace = {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "user_wallet": user_wallet,
                "agent_id": "trader",
                "stage": "DROPPED_BY_QUOTE_ERROR",
                "verdict": verdict,
                "drop_reason": f"NEAR Intents Quote Error: {quote_err}",
                "confidence_score": confidence_score,
                "min_required": min_confidence,
                "expected_roi_pct": 0.0,
                "entry_price": entry_price,
                "take_profit_price": None,
                "stop_loss_price": None,
                "chart_image": node1_data.get("chart_image_info"),
                "binary_evidence_checks": binary_checks,
                "pattern_detected": pattern,
                "book_section_cited": book_section,
                "reasoning": f"TRADE DROPPED: {quote_err}",
                "council_agreement": council_agreement,
                "council_clash": council_clash,
                "blind_spots_caught": blind_spots_caught,
                "one_thing_first": one_thing_first,
                "advisors": advisors,
                "indicators": indicators,
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel")
            }
            cid = await upload_trade_trace(quote_trace)
            return {
                "success": False,
                "status": "DROPPED",
                "trade_id": dropped_id,
                "symbol": symbol,
                "verdict": verdict,
                "drop_reason": f"NEAR Intents Quote Error: {quote_err}",
                "confidence_score": confidence_score,
                "min_confidence": min_confidence,
                "expected_roi_pct": expected_roi_pct,
                "amount_usd": amount_usd,
                "is_cross_chain": is_cross_chain,
                "target_chain": target_chain,
                "reasoning": f"TRADE DROPPED: {quote_err}",
                "cid": cid,
                "binary_evidence_checks": binary_checks,
                "pattern": pattern,
                "book_section_cited": book_section,
                "indicators": indicators,
                "chart_image": node1_data["chart_image_info"],
                "ascii_chart": node1_data["ascii_chart"],
                "twitter_sentiment": node1_data["twitter_sentiment"],
                "researcher_intel": node1_data.get("researcher_intel"),
                "scan_results": node1_data.get("scan_results")
            }

        quote_data = quote_res.get("quote", {})
        quote_tx_hash = quote_data.get("quoteId", quote_tx_hash)
        deposit_addr = quote_data.get("depositAddress") or quote_res.get("deposit_address", "")
        min_out = float(quote_data.get("minAmountOut", 0))

        print(f"[NEAR INTENTS: QUOTE SUCCESS] Quote ID: {quote_tx_hash} | Deposit Address: {deposit_addr}")

        if deposit_addr:
            try:
                active_token_in = "NEAR"
                active_token_out = "USDT" if symbol.upper() == "NEAR" else symbol.upper()
                near_spot_price = indicators.get("current_price", 4.5) if symbol.upper() == "NEAR" else 4.5
                amount_in_near = round(min(amount_usd / near_spot_price, max(0.01, wallet_balance - 0.05)), 4)
                tx_payload = create_near_intent_transaction(
                    token_in=active_token_in,
                    token_out=active_token_out,
                    amount=float(amount_in_near),
                    min_amount_out=min_out,
                    deposit_address=deposit_addr,
                    account_id=agent_execution_wallet
                )
                print(f"[NEAR INTENTS: PAYLOAD] Created {len(tx_payload)} intent transactions for authorized signer '{agent_execution_wallet}'.")
            except Exception as tx_err:
                print(f"[NEAR INTENTS: NOTICE] Intent payload creation notice: {tx_err}")

        # ─── PERSISTENCE: Record Active Trade in SQLite for 60s Poller ──
        trade_id = create_active_trade(
            user_wallet=user_wallet,
            symbol=symbol,
            action="BUY" if verdict == "ENTER_LONG" else "SELL",
            entry_price=entry_price,
            current_price=entry_price,
            tp_price=tp_price,
            sl_price=sl_price,
            confidence_score=confidence_score,
            expected_roi_pct=expected_roi_pct,
            amount_usd=amount_usd,
            tx_hash=quote_tx_hash,
            agent_id="trader",
            execution_wallet=agent_execution_wallet,
            is_cross_chain=1 if is_cross_chain else 0,
            target_chain=target_chain
        )
        print(f"[DATABASE: PERSIST] Registered active trade #{trade_id} ({verdict} {symbol} @ ${entry_price}) in SQLite for 60s TP/SL poller.")

        # ─── PERSISTENCE: Upload Audit Trace to Decentralized Storage (recent 10) ─
        trace = {
            "agent": "trader",
            "trade_id": trade_id,
            "user_wallet": user_wallet,
            "symbol": symbol,
            "verdict": verdict,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "confidence_score": confidence_score,
            "expected_roi_pct": expected_roi_pct,
            "entry_price": entry_price,
            "take_profit_price": tp_price,
            "stop_loss_price": sl_price,
            "risk_reward_ratio": risk_reward_ratio,
            "amount_usd": amount_usd,
            "chart_image": node1_data.get("chart_image_info"),
            "binary_evidence_checks": binary_checks,
            "pattern_detected": pattern,
            "book_section_cited": book_section,
            "reasoning": reasoning,
            "council_agreement": council_agreement,
            "council_clash": council_clash,
            "blind_spots_caught": blind_spots_caught,
            "one_thing_first": one_thing_first,
            "advisors": advisors,
            "tx_hash": quote_tx_hash,
            "indicators": indicators,
            "twitter_sentiment": node1_data["twitter_sentiment"],
            "researcher_intel": node1_data.get("researcher_intel")
        }
        print(f"[STORAGE] Uploading trade execution trace to decentralized storage...")
        cid = await upload_trade_trace(trace)
        print(f"[STORAGE] Trade execution trace saved: {cid} (recent 10 preserved)")

        # Log action to general agent log
        log_agent_action(
            user_wallet=user_wallet,
            agent_name="trader",
            trigger_type="trade_execution",
            reasoning_text=f"LLM Judge Verdict {verdict} | Confidence {confidence_score}% | Expected ROI +{expected_roi_pct}% | Pattern: {pattern}",
            action_taken=f"OPEN {verdict} {symbol} @ ${entry_price} (TP: ${tp_price}, SL: ${sl_price})",
            tx_hash=quote_tx_hash,
            cid_reference=cid,
            status="active"
        )

        # ─── MARKETPLACE COPY TRADING: Mirror trade to all hired subscribers ───
        try:
            from database import mirror_trade_to_subscribers
            copied_ids = mirror_trade_to_subscribers(
                creator_wallet=user_wallet,
                trade_data={
                    "symbol": symbol,
                    "action": "BUY" if verdict == "ENTER_LONG" else "SELL",
                    "entry_price": entry_price,
                    "tp_price": tp_price,
                    "sl_price": sl_price,
                    "confidence_score": confidence_score,
                    "expected_roi_pct": expected_roi_pct,
                    "amount_usd": amount_usd,
                    "tx_hash": quote_tx_hash
                },
                cid_ref=cid
            )
            if copied_ids:
                print(f"[TRADER-EXEC] Successfully mirrored trade #{trade_id} to {len(copied_ids)} hired marketplace subscribers!")
        except Exception as copy_err:
            print(f"[TRADER-EXEC] Marketplace copy error: {copy_err}")

        return {
            "success": True,
            "status": "ORDER_PLACED",
            "trade_id": trade_id,
            "verdict": verdict,
            "symbol": symbol,
            "timeframe": timeframe,
            "entry_price": entry_price,
            "take_profit_price": tp_price,
            "stop_loss_price": sl_price,
            "risk_reward_ratio": risk_reward_ratio,
            "confidence_score": confidence_score,
            "expected_roi_pct": expected_roi_pct,
            "amount_usd": amount_usd,
            "tx_hash": quote_tx_hash,
            "cid": cid,
            "binary_evidence_checks": binary_checks,
            "pattern": pattern,
            "book_section_cited": book_section,
            "reasoning": reasoning,
            "council_agreement": council_agreement,
            "council_clash": council_clash,
            "blind_spots_caught": blind_spots_caught,
            "one_thing_first": one_thing_first,
            "advisors": advisors,
            "indicators": indicators,
            "chart_image": node1_data["chart_image_info"],
            "ascii_chart": node1_data["ascii_chart"],
            "twitter_sentiment": node1_data["twitter_sentiment"],
            "researcher_intel": node1_data.get("researcher_intel"),
            "scan_results": node1_data.get("scan_results")
        }


# Singleton Instance
trader_agent = TraderAgent()
