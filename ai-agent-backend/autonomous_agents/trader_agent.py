"""
Neptune AI — Autonomous Quantitative Trader Agent
Pipeline Architecture:
  - Pre-Scanner: Multi-Asset Universe Pre-Scanner (DEX 1-Click / NEAR Intents Universe)
      * Excludes stablecoins, test tokens, dead markets (<10 candles or 0 volume)
       * Compiles standardized COIN TABLE with functional market context only
  - Node 1: LLM Market Screener (SCREENER_SYSTEM)
      * 7-step discipline: regime classification, elimination, shortlist, book match, selection
      * Zero hardcoding: if candidate_found is False, stands aside safely with symbol MARKET
  - Bridge:
      * Loads the 5 book sections selected by Screener
      * Runs the 3 targeted RAG queries suggested by Screener
      * Computes multi-timeframe candle confluence (1h, 2h, 4h, 1d, 1w)
      * Vision Engine: Candlestick PNG & ASCII chart
      * Twitter/X sentiment & optional Track 7 Research Agent hire
   - Node 2: 4-Specialist Council + combined Senior Reviewer/Chairman/Auditor
       * Technical Analyst, Playbook Strategist, Risk Manager, Skeptic
       * Review, final direction/levels, position size, and five audit checks in one structured response
  - Programmatic Hard-Cap Execution Engine:
      * Kill switch, daily/weekly frequency limits, capital hard cap
      * Order execution via NEAR Intents / Defuse
      * Persistence in SQLite for quiet 60s poller
      * Preserves decentralized audit traces
"""

import os
import json
import asyncio
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from market_intelligence import analyze_token_indicators, fetch_klines, get_chart_data_bundle, fetch_chart_tool
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
from autonomous_agents.trading_pipeline import TradingPipeline


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
        elif custom_coins is None and symbol:
            custom_coins = [symbol.strip().upper()]

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

        # ─── DISPATCH: REFACTORED SCREENER -> COUNCIL -> JUDGE PIPELINE ────
        use_refactored = os.getenv("USE_REFACTORED_PIPELINE", "true").lower() in ("true", "1", "yes")
        if use_refactored:
            return await self.run_screener_council_judge_pipeline(
                user_wallet=user_wallet,
                coin_mode=active_coin_mode,
                custom_coins=custom_coins,
                timeframe=timeframe,
                dry_run=False
            )

        # ─── LEGACY NODE 1: PRE-SCANNER & LLM MARKET SCREENER ─────────────
        print(f"[NODE 1: RESEARCH] Scanning universe ({active_coin_mode} mode)...")
        node1_data = await self._node1_gather_data(
            user_wallet=user_wallet,
            symbol=symbol,
            coin_mode=active_coin_mode,
            custom_coins=custom_coins,
            timeframe=timeframe,
            enable_researcher=researcher_active
        )
        # Execution funding/venue configuration is separate from market
        # selection. The LLM never chooses a funding token by guessing.
        node1_data["execution_source_token"] = str(user.get("trader_execution_token") or "").upper()
        node1_data["source_chain"] = str(user.get("trader_source_chain") or "").lower()
        node1_data["target_chain"] = str(user.get("trader_target_chain") or "").lower()

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

        target_symbol = node1_data.get("symbol", "NONE")
        indicators = node1_data.get("indicators", {})
        pattern_data = node1_data.get("pattern_data", {})
        ascii_chart = node1_data.get("ascii_chart", "")
        chart_image_info = node1_data.get("chart_image_info")
        retrieved_knowledge = node1_data.get("retrieved_knowledge", [])
        rag_xml_block = node1_data.get("rag_xml_block", "")
        twitter_sentiment = node1_data.get("twitter_sentiment", {})
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
            screener_result=node1_data.get("screener_result"),
            scanner_candidates=node1_data.get("scanner_candidates"),
            candidate_bundles=node1_data.get("candidate_bundles"),
            execution_source_token=node1_data.get("execution_source_token"),
            execution_target_chain=node1_data.get("target_chain"),
        )
        print(f"[NODE 2: VERDICT] Decisions: {len(node2_data.get('decisions', [])) or 1} | Primary: {node2_data.get('verdict')} | Confidence: {node2_data.get('confidence_score')}% (Threshold: {min_confidence}%)")

        batch_decisions = node2_data.get("decisions") or []
        if len(batch_decisions) > 1:
            candidate_by_symbol = {
                str(item.get("symbol", "")).upper(): item
                for item in node1_data.get("candidate_bundles", [])
            }
            executions = []
            for decision in batch_decisions:
                if str(decision.get("verdict", "")).upper() not in {"ENTER_LONG", "ENTER_SHORT", "TRADE"}:
                    executions.append({"success": False, "status": "STAND_ASIDE", **decision})
                    continue
                candidate = candidate_by_symbol.get(str(decision.get("symbol", "")).upper())
                if not candidate:
                    executions.append({"success": False, "status": "DROPPED", "symbol": decision.get("symbol"), "reasoning": "Candidate data missing at execution boundary."})
                    continue
                bundle = candidate.get("chart_bundle", {})
                timeframe_data = bundle.get("timeframe_details", {}).get(timeframe, {})
                candidate_indicators = candidate.get("scanner_data", {}).get("indicators", indicators)
                candidate_node = dict(node1_data)
                candidate_node.update({
                    "symbol": decision.get("symbol"),
                    "indicators": candidate_indicators,
                    "candles": candidate_indicators.get("candles", []),
                    "pattern_data": candidate.get("scanner_data", {}).get("pattern_data", pattern_data),
                    "multiframe_chart": bundle,
                    "chart_image_info": node1_data.get("chart_image_info"),
                })
                executions.append(await self._evaluate_and_execute_verdict(
                    user_wallet=user_wallet,
                    symbol=str(decision.get("symbol")).upper(),
                    timeframe=timeframe,
                    min_confidence=min_confidence,
                    max_tx_amount=max_tx_amount,
                    node1_data=candidate_node,
                    node2_data=decision,
                ))
            return {
                "success": any(item.get("success") for item in executions),
                "status": "BATCH_COMPLETED",
                "decisions": batch_decisions,
                "executions": executions,
                "screener_result": node1_data.get("screener_result"),
                "scanner_candidates": node1_data.get("scanner_candidates", []),
            }

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

    async def run_screener_council_judge_pipeline(
        self,
        user_wallet: str,
        coin_mode: Optional[str] = None,
        custom_coins: Optional[List[str]] = None,
        timeframe: Optional[str] = None,
        dry_run: bool = False
    ) -> Dict[str, Any]:
        """
        Executes the refactored Screener → Council → Judge → Execution pipeline.
        - Pre-Scanner: Scans ~208 tokens, filters dead pairs/stablecoins, evaluates tradeability (~40 qualifying tokens)
        - Screener: Evaluates all qualifying tokens, picks max 3 coins + direction (no tools, no RAG)
        - Council: Verifies and builds trade plan (TP/SL) using chart + RAG tools
        - Judge: Audits Council for hallucination and picks the single best coin (no tools)
        - Execution: Programmatic hard-cap execution via _evaluate_and_execute_verdict
        """
        user = get_user(user_wallet) or {}
        max_tx_amount = float(user.get("max_tx_amount") or 1_000_000.0)
        max_trades_day = int(user.get("trader_max_trades_per_day", 100))
        max_trades_week = int(user.get("trader_max_trades_per_week", 500))
        min_confidence = int(user.get("trader_min_confidence", 75))
        effective_timeframe = timeframe or user.get("trader_timeframe", "1h")
        active_coin_mode = coin_mode or user.get("trader_coin_mode", "auto")

        print(f"\n{'='*70}\n[REFACTORED PIPELINE: SCREENER -> COUNCIL -> JUDGE]\nWallet: {user_wallet} | Mode: {active_coin_mode} | Timeframe: {effective_timeframe} | Dry Run: {dry_run}\n{'='*70}")

        # Pre-flight hard cap checks
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

        # ─── PRE-SCANNER EXECUTION ─────────────────────────────────────
        # In custom mode: scans user custom coins.
        # In auto mode: scans full ~208 token universe, filters stablecoins, test tokens,
        # applies tradeability gate, and outputs standardized COIN TABLE (~39-50 qualifying tokens).
        if active_coin_mode == "custom":
            watch_coins = custom_coins or [
                c.strip().upper() for c in user.get("trader_custom_coins", "").split(",") if c.strip()
            ]
            if not watch_coins:
                print("[PRE-SCANNER] Custom Watchlist mode active, but no coins are configured in watchlist. Standing aside.")
                return {
                    "success": False,
                    "status": "EMPTY_CUSTOM_WATCHLIST",
                    "verdict": "STAND_ASIDE",
                    "symbol": "NONE",
                    "timeframe": effective_timeframe,
                    "confidence_score": 0,
                    "min_confidence": min_confidence,
                    "expected_roi_pct": 0.0,
                    "reasoning": "Custom Watchlist mode is selected, but no coins are configured in your watchlist. Please add coins in the Trader Panel.",
                    "cid": None,
                    "pipeline": None,
                    "binary_evidence_checks": {},
                    "chart_image": None,
                    "ascii_chart": "",
                    "twitter_sentiment": {},
                }
            print(f"[PRE-SCANNER] Running custom watchlist mode on {len(watch_coins)} coins: {watch_coins}")
            scan_res = await scan_coin_universe(
                mode="custom",
                custom_coins=watch_coins,
                timeframe=effective_timeframe
            )
        else:
            print(f"[PRE-SCANNER] Running auto mode on full DEX 1-Click Universe (~208 tokens)...")
            scan_res = await scan_coin_universe(
                mode="auto",
                custom_coins=None,
                timeframe=effective_timeframe
            )

        coin_table = scan_res.get("coin_table") or []
        if not coin_table:
            print("[PRE-SCANNER] No qualifying candidates passed tradeability gate. Standing aside.")
            return {
                "success": False,
                "status": "NO_CANDIDATES",
                "message": "No qualifying tokens met pre-scanner tradeability criteria. Standing aside to protect capital."
            }

        print(f"[PRE-SCANNER -> SCREENER] Passing all {len(coin_table)} qualifying tokens into Stage 1 Screener (Threshold: {min_confidence})...")
        coin_data = {}
        for row in coin_table:
            sym = row["symbol"]
            coin_data[sym] = {
                "screener_line": row.get("screener_line"),
                "price": row.get("price", 0.0),
                "volume_24h": row.get("24h_volume_usd", 0.0),
                "ema20": row.get("ema20", 0.0),
                "ema50": row.get("ema50", 0.0),
                "ema200": row.get("ema200", 0.0),
                "rsi": row.get("rsi14", 50.0),
                "atr_pct": row.get("atr_pct", 2.0),
                "trend_4h": row.get("bias", "NEUTRAL"),
                "trend_12h": row.get("bias", "NEUTRAL"),
                "pattern": row.get("pattern") or "none",
                "dist_from_ema20_pct": row.get("dist_from_ema20_pct", 0.0),
                "dist_from_ema50_pct": row.get("dist_from_ema50_pct", 0.0),
                "volume_vs_avg": row.get("volume_vs_avg", 1.0)
            }

        # Tools for Council
        async def chart_tool_wrapper(symbol: str, timeframe: str) -> Dict[str, Any]:
            return await fetch_chart_tool(symbol=symbol, timeframe=timeframe)

        def rag_query_wrapper(query: str) -> List[Dict[str, Any]]:
            return trading_book_rag.search_by_query(query, top_k=2)

        # Execution callback wired into existing programmatic hard-cap execution
        async def execute_callback(coin: str, direction: str, entry: float, tp: float, sl: float, reasoning: str = "") -> Dict[str, Any]:
            try:
                chosen_ind = await analyze_token_indicators(symbol=coin, timeframe="4h")
            except Exception:
                chosen_ind = {"current_price": entry, "candles": [], "pattern_data": {}}

            candles = chosen_ind.get("candles", [])
            pattern_data = chosen_ind.get("pattern_data", {})
            pat_name = pattern_data.get("dominant_pattern") or pattern_data.get("pattern") or "Technical Setup"
            roi = round(abs(tp - entry) / max(1e-6, entry) * 100, 2)

            ascii_chart = ""
            if candles:
                try:
                    ascii_chart = generate_ascii_chart(
                        candles=candles,
                        symbol=coin,
                        timeframe="4h",
                        pattern_name=str(pat_name),
                        tp_price=float(tp),
                        sl_price=float(sl)
                    )
                except Exception as ae:
                    print(f"[CHART] Warning: generate_ascii_chart failed for {coin}: {ae}")
                    ascii_chart = ""

            chart_image_info = None
            try:
                chart_image_info = render_chart_image(
                    candles=candles,
                    symbol=coin,
                    timeframe="4h",
                    pattern_name=str(pat_name),
                    tp_price=float(tp),
                    sl_price=float(sl),
                    entry_price=float(entry),
                    verdict="ENTER_LONG" if direction == "LONG" else "ENTER_SHORT",
                    expected_roi_pct=roi,
                    confidence_score=85,
                    pattern_data=pattern_data,
                    indicators=chosen_ind
                )
            except Exception as e:
                print(f"[CHART] Warning: render_chart_image failed for {coin}: {e}")
                chart_image_info = None

            node1_data = {
                "symbol": coin,
                "indicators": chosen_ind,
                "candles": candles,
                "pattern_data": pattern_data,
                "chart_image_info": chart_image_info,
                "ascii_chart": ascii_chart,
                "execution_source_token": str(user.get("trader_execution_token") or "NEAR").upper(),
                "source_chain": str(user.get("trader_source_chain") or "near").lower(),
                "target_chain": str(user.get("trader_target_chain") or "near").lower(),
                "twitter_sentiment": {"sentiment": "neutral", "score": 50},
                "researcher_intel": None,
                "scan_results": None,
                "screener_result": None,
                "scanner_candidates": [],
            }
            node2_data = {
                "verdict": "ENTER_LONG" if direction == "LONG" else "ENTER_SHORT",
                "confidence_score": 85,
                "expected_roi_pct": round(abs(tp - entry) / max(1e-6, entry) * 100, 2),
                "entry_price": entry,
                "take_profit_price": tp,
                "stop_loss_price": sl,
                "risk_reward_ratio": round(abs(tp - entry) / max(1e-6, abs(entry - sl)), 2),
                "reasoning": reasoning,
                "execution_ready": True
            }
            return await self._evaluate_and_execute_verdict(
                user_wallet=user_wallet,
                symbol=coin,
                timeframe="4h",
                min_confidence=min_confidence,
                max_tx_amount=max_tx_amount,
                node1_data=node1_data,
                node2_data=node2_data
            )

        pipeline = TradingPipeline(
            chart_data_fn=chart_tool_wrapper,
            rag_query_fn=rag_query_wrapper,
            execute_fn=execute_callback
        )

        pipeline_res = await pipeline.run(coin_data, dry_run=dry_run, min_confidence=min_confidence)

        # If executed, merge execution outcome with full pipeline output
        if pipeline_res.get("status") == "executed" and pipeline_res.get("execution"):
            combined = dict(pipeline_res["execution"])
            combined["pipeline"] = pipeline_res
            return combined

        # Stand aside or no candidates
        stand_aside_reason = (
            (pipeline_res.get("judge") or {}).get("reasoning")
            or "Screener found no qualifying setups scoring >= 70 against selection rubric."
        )
        chosen_sym = (pipeline_res.get("judge") or {}).get("chosen_coin") or "MARKET"

        # Stand aside: render chart for the evaluated or primary candidate so frontend always has visual context
        chart_image_info = None
        target_sym = chosen_sym if (chosen_sym and chosen_sym != "MARKET") else (list(coin_data.keys())[0] if coin_data else None)
        if target_sym and target_sym in coin_data:
            try:
                chosen_ind = await analyze_token_indicators(symbol=target_sym, timeframe="4h")
                candles = chosen_ind.get("candles", [])
                if candles:
                    p_data = chosen_ind.get("pattern_data", {})
                    p_name = p_data.get("dominant_pattern") or "Market Overview"
                    cur_p = float(chosen_ind.get("current_price") or coin_data[target_sym].get("price", 1.0))
                    chart_image_info = render_chart_image(
                        candles=candles,
                        symbol=target_sym,
                        timeframe="4h",
                        pattern_name=str(p_name),
                        tp_price=cur_p * 1.05,
                        sl_price=cur_p * 0.95,
                        entry_price=cur_p,
                        verdict="STAND_ASIDE",
                        expected_roi_pct=0.0,
                        confidence_score=0,
                        pattern_data=p_data,
                        indicators=chosen_ind
                    )
            except Exception as ce:
                print(f"[CHART] Stand-aside chart rendering notice for {target_sym}: {ce}")

        trace = {
            "agent": "trader",
            "user_wallet": user_wallet,
            "symbol": chosen_sym,
            "timeframe": "4h",
            "verdict": "STAND_ASIDE",
            "stage": "REFACTORED_PIPELINE_STAND_ASIDE",
            "confidence_score": 0,
            "min_required": min_confidence,
            "expected_roi_pct": 0.0,
            "reasoning": stand_aside_reason,
            "chart_image": chart_image_info,
            "pipeline": pipeline_res
        }
        cid = await upload_trade_trace(trace)

        return {
            "success": False,
            "status": "STAND_ASIDE",
            "verdict": "STAND_ASIDE",
            "symbol": chosen_sym,
            "timeframe": "4h",
            "confidence_score": 0,
            "min_confidence": min_confidence,
            "expected_roi_pct": 0.0,
            "reasoning": stand_aside_reason,
            "cid": cid,
            "pipeline": pipeline_res,
            "binary_evidence_checks": {},
            "chart_image": chart_image_info,
            "ascii_chart": "",
            "twitter_sentiment": {},
        }

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
        selected_scan_candidate = None
        scanner_candidates = []
        candidate_bundles = []

        # 1. Full Universe Scanner & Node 1 LLM Screener
        if not selected_symbol:
            scan_results = await scan_coin_universe(
                mode=coin_mode,
                custom_coins=custom_coins,
                timeframe=timeframe
            )
            
            # Execute Node 1 LLM Screener over COIN TABLE and BOOK INDEX
            if scan_results.get("coin_table"):
                # The screener receives routing metadata only. Full book rules
                # are retrieved after it selects candidates.
                book_index = trading_book_rag.get_screener_catalog()
                print(f"[SCREENER CONTEXT] Sending catalog only: {len(trading_book_rag.sections)} section routes; full rules withheld")
                table_input = scan_results["coin_table"]
                screener_res = await self.council_judge.screen_universe(
                    coin_table=table_input,
                    book_index=book_index
                )
                if screener_res and screener_res.get("candidate_found") and screener_res.get("chosen_symbol"):
                    selected_symbol = screener_res["chosen_symbol"]
                    shortlist_symbols = [
                        str(candidate.get("symbol", "")).upper()
                        for candidate in screener_res.get("shortlist", [])[:5]
                        if candidate.get("symbol")
                    ]
                    shortlist_symbols.insert(0, str(selected_symbol).upper())
                    shortlist_symbols = list(dict.fromkeys(shortlist_symbols))[:5]
                    scanner_candidates = [
                        candidate for candidate in scan_results.get("ranked_coins", [])
                        if str(candidate.get("symbol", "")).upper() in shortlist_symbols
                    ]
                    selected_scan_candidate = next(
                        (
                            candidate for candidate in scanner_candidates
                            if str(candidate.get("symbol", "")).upper() == str(selected_symbol).upper()
                        ),
                        None,
                    )
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
                        "multiframe_chart": None,
                        "scanner_candidates": [],
                    }
        # 2. Indicators Engine & Candle History & Pattern Recognition.
        # Reuse the functional scanner's complete result when the LLM selected
        # one of its rows; otherwise fetch the requested symbol once.
        if selected_scan_candidate and selected_scan_candidate.get("pattern_data") and selected_scan_candidate.get("indicators", {}).get("candles"):
            indicators = selected_scan_candidate["indicators"]
            candles = indicators["candles"]
            pattern_data = selected_scan_candidate["pattern_data"]
        else:
            indicators = await analyze_token_indicators(symbol=selected_symbol, timeframe=timeframe)
            candles = indicators.get("candles") or await fetch_klines(symbol=selected_symbol, timeframe=timeframe, limit=50)
            pattern_data = analyze_chart_patterns(
                candles=candles,
                current_price=indicators["current_price"],
                atr=indicators["atr"]
            )

        if not scanner_candidates:
            scanner_candidates = [{
                "symbol": selected_symbol,
                "indicators": indicators,
                "pattern_data": pattern_data,
            }]

        # 4. Chart Vision: Dark-Mode Matplotlib Candlestick PNG + High-Resolution ASCII Grid
        chart_is_short = "BEARISH" in str(pattern_data.get("pattern_type", "")).upper()
        chart_expected_roi = (
            (indicators["current_price"] - pattern_data["measured_target"])
            / max(0.0001, indicators["current_price"]) * 100
            if chart_is_short
            else (pattern_data["measured_target"] - indicators["current_price"])
            / max(0.0001, indicators["current_price"]) * 100
        )
        chart_image_info = render_chart_image(
            candles=candles,
            symbol=selected_symbol,
            timeframe=timeframe,
            pattern_name=pattern_data["dominant_pattern"],
            tp_price=pattern_data["measured_target"],
            sl_price=pattern_data["stop_loss"],
            entry_price=indicators["current_price"],
            verdict="ENTER_SHORT" if chart_is_short else "ENTER_LONG",
            expected_roi_pct=round(max(0.0, chart_expected_roi), 1),
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
            print(f"[BRIDGE: RAG] Retrieved selected sections: {[s.get('section_id') for s in matched_sections]}")
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
            print(f"[BRIDGE: RAG CALL] query={q!r} top_k=1")
            q_secs = trading_book_rag.search_by_query(q, top_k=5)
            print(f"[BRIDGE: RAG RESULT] query={q!r} sections={[s.get('section_id') for s in q_secs]}")
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

        # 6-8. Independent bridge work runs concurrently. The same complete
        # chart bundle is reused by every specialist and the combined judge.
        requested_timeframes = (screener_res or {}).get("requested_timeframes") or ["1h", "2h", "4h", "1d", "1w"]
        allowed_timeframes = {"1h", "2h", "4h", "12h", "1d", "1w"}
        requested_timeframes = [
            tf for tf in dict.fromkeys([timeframe] + requested_timeframes)
            if str(tf).lower() in allowed_timeframes
        ][:5]
        requested_days = 1
        for shortlist_item in (screener_res or {}).get("shortlist", []):
            chart_reqs = shortlist_item.get("chart_requests", []) if isinstance(shortlist_item, dict) else []
            for request in chart_reqs:
                try:
                    if isinstance(request, dict):
                        requested_days = max(requested_days, min(7, int(request.get("days", 1))))
                    elif isinstance(request, (int, float)):
                        requested_days = max(requested_days, min(7, int(request)))
                except (TypeError, ValueError, AttributeError):
                    continue
        print(f"[BRIDGE: SENTIMENT] Querying live Twitter / X sentiment for #{selected_symbol}...")
        print(f"[BRIDGE: MULTI-TIMEFRAME ENGINE] Inspecting {', '.join(requested_timeframes)} for structural alignment...")
        print(
            f"[BRIDGE: CHART CALL] symbol={selected_symbol} days={requested_days} "
            f"timeframes={requested_timeframes} reason=selected_candidate"
        )

        async def _research():
            if not enable_researcher:
                return None
            try:
                print(f"[TRADER-PLUGIN] Hiring Research Agent for {selected_symbol} (0.1 NEAR fee)...")
                hire_result = await self.research_agent.hire_by_trader_agent(
                    trader_wallet=user_wallet,
                    symbol=selected_symbol
                )
                full_rep = hire_result.get("full_report", {})
                return {
                    "hired": True,
                    "fee_paid": hire_result.get("fee_transferred"),
                    "recipient": hire_result.get("recipient"),
                    "report_cid": hire_result.get("report_cid"),
                    "signal": hire_result.get("signal", "ACCUMULATE"),
                    "executive_summary": full_rep.get("executive_summary", ""),
                    "risk_factors": full_rep.get("risk_factors", "")
                }
            except Exception as e:
                print(f"[TRADER-PLUGIN] Research agent hire notice: {e}")
                return None

        twitter_data, researcher_intel, multiframe_chart = await asyncio.gather(
            search_twitter_sentiment(symbol=selected_symbol),
            _research(),
            get_chart_data_bundle(
                symbol=selected_symbol,
                timeframes=requested_timeframes,
                prefetched={
                    "timeframe": timeframe,
                    "indicators": indicators,
                        "pattern_data": pattern_data,
                        "days": requested_days,
                    },
                days=requested_days,
            ),
            return_exceptions=True,
        )
        
        # Handle potential exceptions from gather
        if isinstance(twitter_data, Exception):
            print(f"[BRIDGE: SENTIMENT ERROR] {twitter_data}")
            twitter_data = {"sentiment": "NEUTRAL", "bullish_pct": 50.0, "viral_velocity_score": 0}
        if isinstance(researcher_intel, Exception):
            print(f"[BRIDGE: RESEARCH ERROR] {researcher_intel}")
            researcher_intel = None
        if isinstance(multiframe_chart, Exception):
            print(f"[BRIDGE: CHART ERROR] {multiframe_chart}")
            import traceback
            traceback.print_exc()
            multiframe_chart = {"macro_alignment": "UNKNOWN", "timeframe_details": {}, "full_data": {}}
        
        print(f"[BRIDGE: MULTI-TIMEFRAME RESULT] Macro Alignment: {multiframe_chart.get('macro_alignment')}")
        print(f"[BRIDGE: SENTIMENT RESULT] {twitter_data.get('sentiment')} ({twitter_data.get('bullish_pct')}% Bullish, Velocity: {twitter_data.get('viral_velocity_score')}/100)")
        print(f"[BRIDGE: VISION CHART] Generated dark-mode candlestick PNG & ASCII structure grid for {selected_symbol}")

        # Only the 1-5 LLM-shortlisted candidates receive deeper chart data.
        # The functional scanner table remains the broad, cheap pre-screen.
        candidate_symbols = [
            str(candidate.get("symbol", "")).upper()
            for candidate in scanner_candidates
            if candidate.get("symbol")
        ]
        candidate_symbols = list(dict.fromkeys(candidate_symbols))[:5]
        async def _build_candidate_bundle(candidate):
            candidate_symbol = str(candidate.get("symbol", "")).upper()
            shortlist_item = next(
                (
                    item for item in (screener_res or {}).get("shortlist", [])
                    if str(item.get("symbol", "")).upper() == candidate_symbol
                ),
                {},
            )
            candidate_timeframes = requested_timeframes
            candidate_days = requested_days
            chart_requests = shortlist_item.get("chart_requests", [])
            if chart_requests:
                request = chart_requests[0]
                candidate_timeframes = [
                    str(tf).lower() for tf in request.get("timeframes", requested_timeframes)
                    if str(tf).lower() in allowed_timeframes
                ][:5] or requested_timeframes
                try:
                    candidate_days = max(1, min(7, int(request.get("days", requested_days))))
                except (TypeError, ValueError):
                    candidate_days = requested_days
            if candidate_symbol == str(selected_symbol).upper():
                bundle = multiframe_chart
                print(f"[BRIDGE: CHART REUSE] symbol={candidate_symbol} using selected-candidate chart bundle")
            else:
                print(
                    f"[BRIDGE: CHART CALL] symbol={candidate_symbol} days={candidate_days} "
                    f"timeframes={candidate_timeframes} reason=screener_shortlist"
                )
                bundle = await get_chart_data_bundle(
                    symbol=candidate_symbol,
                    timeframes=candidate_timeframes,
                    days=candidate_days,
                    prefetched={
                        "timeframe": timeframe,
                        "indicators": candidate.get("indicators", {}),
                        "pattern_data": candidate.get("pattern_data", {}),
                    },
                )
            section_ids = shortlist_item.get("book_section_ids", [])
            print(f"[BRIDGE: RAG CALL] symbol={candidate_symbol} section_ids={section_ids}")
            book_sections = trading_book_rag.get_sections_by_ids(section_ids)
            print(f"[BRIDGE: RAG RESULT] symbol={candidate_symbol} sections={[s.get('section_id') for s in book_sections]}")
            rag_queries = shortlist_item.get("rag_queries", [])
            targeted = []
            for query in rag_queries:
                print(f"[BRIDGE: RAG CALL] symbol={candidate_symbol} query={query!r} top_k=5")
                for section in trading_book_rag.search_by_query(query, top_k=5):
                    print(f"[BRIDGE: RAG RESULT] symbol={candidate_symbol} query={query!r} section={section.get('section_id')}")
                    targeted.append({
                        "query": query,
                        "section_id": section.get("section_id"),
                        "rules": section.get("rules", []),
                    })
            return {
                "symbol": candidate_symbol,
                "bias": candidate.get("bias", "NONE"),
                "scanner_data": candidate,
                "chart_bundle": bundle,
                "book_sections": book_sections,
                "targeted_rag": targeted,
            }

        candidate_bundles = await asyncio.gather(*[
            _build_candidate_bundle(candidate) for candidate in scanner_candidates
        ])

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
            "multiframe_chart": multiframe_chart,
            "scanner_candidates": scanner_candidates,
            "candidate_bundles": candidate_bundles,
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
        screener_result: Optional[Dict[str, Any]] = None,
        scanner_candidates: Optional[List[Dict[str, Any]]] = None,
        candidate_bundles: Optional[List[Dict[str, Any]]] = None,
        execution_source_token: Optional[str] = None,
        execution_target_chain: Optional[str] = None,
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
            screener_result=screener_result,
            scanner_candidates=scanner_candidates,
            candidate_bundles=candidate_bundles,
            execution_source_token=execution_source_token,
            execution_target_chain=execution_target_chain,
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
        execution_ready = bool(node2_data.get("execution_ready", True))

        is_warranted = (
            verdict in ["ENTER_LONG", "ENTER_SHORT"] and
            confidence_score >= min_confidence and
            execution_ready
        )

        # TP / SL are strictly execution parameters decided by the Council.
        # If the trade is rejected / STAND_ASIDE, zero out TP/SL and expected ROI (no fake execution targets).
        if not is_warranted:
            tp_price = None
            sl_price = None
            expected_roi_pct = 0.0
        else:
            # Trade is approved: ensure sensible TP/SL levels for LONG or SHORT
            if tp_price is None or sl_price is None or tp_price <= 0 or sl_price <= 0:
                return {
                    "success": False,
                    "status": "DROPPED",
                    "symbol": symbol,
                    "verdict": verdict,
                    "drop_reason": "Judge did not provide complete execution levels.",
                    "confidence_score": confidence_score,
                }

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
                "chart_image": node1_data.get("chart_image_info"),
                "ascii_chart": node1_data.get("ascii_chart", ""),
                "twitter_sentiment": node1_data.get("twitter_sentiment", {}),
                "researcher_intel": node1_data.get("researcher_intel"),
                "multiframe_chart": node1_data.get("multiframe_chart"),
                "scan_results": node1_data.get("scan_results"),
                "screener_result": node1_data.get("screener_result"),
                "scanner_candidates": node1_data.get("scanner_candidates", []),
            }

        # ─── HARD CAP CHECK: Strict Sizing & Capital Constraints ─────────
        rec_usd = float(node2_data.get("recommended_position_usd") or max_tx_amount)
        # Never exceed user's hard cap
        amount_usd = round(min(max_tx_amount, rec_usd), 2)

        source_token = str(node1_data.get("execution_source_token") or "").upper()
        target_chain = str(node2_data.get("target_chain") or node1_data.get("target_chain") or "").lower()
        if not source_token or not target_chain:
            return {
                "success": False,
                "status": "DROPPED",
                "symbol": symbol,
                "verdict": verdict,
                "drop_reason": "Execution source token or target chain was not supplied by configuration/judge.",
                "confidence_score": confidence_score,
            }
        is_cross_chain = target_chain != str(node1_data.get("source_chain") or "near").lower()

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
                "chart_image": node1_data.get("chart_image_info"),
                "ascii_chart": node1_data.get("ascii_chart", ""),
                "twitter_sentiment": node1_data.get("twitter_sentiment", {}),
                "researcher_intel": node1_data.get("researcher_intel"),
                "scan_results": node1_data.get("scan_results"),
                "screener_result": node1_data.get("screener_result"),
                "scanner_candidates": node1_data.get("scanner_candidates", []),
            }

        agent_execution_wallet = wallet_validation.get("agent_wallet", user_wallet)
        wallet_balance = wallet_validation.get("balance", 0.0)

        print(f"[HARD VALIDATOR: PASSED] Authorized Agent Execution Wallet: {agent_execution_wallet} (Balance: {wallet_balance:.4f} NEAR)")

        # ─── VENUE DISPATCH: HYPERLIQUID L1 BRACKET ORDER VS NEAR INTENTS ───
        from autonomous_agents.hyperliquid_adapter import HyperliquidAdapter
        hl_adapter = HyperliquidAdapter()

        hl_executed = False
        hl_order_res = None
        if hl_adapter.is_configured() and hl_adapter.is_asset_supported(symbol):
            print(f"[TRADER: HYPERLIQUID] Configured with Agent Key! Placing native crash-proof Bracket Order (normalTpsl) on Hyperliquid...")
            is_buy = (verdict == "ENTER_LONG")
            hl_order_res = hl_adapter.place_bracket_order(
                coin=symbol,
                is_buy=is_buy,
                amount_usd=amount_usd,
                entry_price=entry_price,
                tp_price=tp_price,
                sl_price=sl_price
            )
            if hl_order_res.get("success"):
                hl_executed = True
                target_chain = "hyperliquid"
                quote_tx_hash = f"hl_{hl_adapter.network}_{int(datetime.now(timezone.utc).timestamp())}"
                quote_res = {"quote": {"quoteId": quote_tx_hash, "depositAddress": "", "minAmountOut": str(amount_usd)}}
                print(f"[TRADER: HYPERLIQUID SUCCESS] Native L1 Bracket Order confirmed! TP (${tp_price}) and SL (${sl_price}) managed by Hyperliquid validators.")
            else:
                print(f"[TRADER: HYPERLIQUID NOTICE] Order not filled on Hyperliquid ({hl_order_res.get('error')}). Proceeding with NEAR Intents...")

        if not hl_executed:
            # ─── SUBMIT ORDER VIA NEAR INTENTS / DEFUSE 1-CLICK PROTOCOL ───
            is_native_holding = (symbol.upper() == source_token and verdict == "ENTER_LONG")
            quote_res = None
            quote_tx_hash = f"tx_intent_{int(datetime.now(timezone.utc).timestamp())}"

            if is_native_holding:
                # Agent execution wallet already holds the configured source asset.
                print(f"[TRADER-AGENT] ENTER_LONG on {source_token}: dedicated execution wallet holds {wallet_balance:.4f} source units.")
                quote_tx_hash = f"tx_spot_{source_token.lower()}_{int(datetime.now(timezone.utc).timestamp())}"
                quote_res = {
                    "quote": {
                        "quoteId": quote_tx_hash,
                        "depositAddress": "",
                        "minAmountOut": str(amount_usd)
                    }
                }
            else:
                # Determine tokens based on agent's NEAR balance
                token_in = source_token
                token_out = symbol.upper()
                from knowledge_base import get_1click_token_price
                source_price = get_1click_token_price(token_in)
                if not source_price or source_price <= 0:
                    quote_res = {"error": f"No live price available for execution source token {token_in}."}
                    amount_in_source = 0.0
                else:
                    amount_in_source = round(min(amount_usd / float(source_price), max(0.0, wallet_balance - 0.05)), 4)
                dest_recipient = wallet_validation.get("destination_wallet", agent_execution_wallet)

                print(f"[NEAR INTENTS: TOOL CALL] Requesting 1-Click swap quote: {amount_in_source} {token_in} -> {token_out} on {target_chain} (Recipient: {dest_recipient})...")
                try:
                    from tools import get_swap_quote, create_near_intent_transaction
                    quote_res = get_swap_quote(
                        token_in=token_in,
                        token_out=token_out,
                        amount=float(amount_in_source),
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
        if not quote_res or "error" in quote_res or ("quote" not in quote_res and "deposit_address" not in quote_res):
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
                "twitter_sentiment": node1_data.get("twitter_sentiment", {}),
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
                "chart_image": node1_data.get("chart_image_info"),
                "ascii_chart": node1_data.get("ascii_chart", ""),
                "twitter_sentiment": node1_data.get("twitter_sentiment", {}),
                "researcher_intel": node1_data.get("researcher_intel"),
                "scan_results": node1_data.get("scan_results")
            }

        quote_data = quote_res.get("quote", {})
        quote_tx_hash = quote_data.get("quoteId") or quote_res.get("quoteId", quote_tx_hash)
        deposit_addr = quote_data.get("depositAddress") or quote_res.get("deposit_address", "")
        min_out = float(quote_data.get("minAmountOut", quote_res.get("amount_out", 0)))

        print(f"[NEAR INTENTS: QUOTE SUCCESS] Quote ID: {quote_tx_hash} | Deposit Address: {deposit_addr}")

        if deposit_addr:
            try:
                active_token_in = source_token
                active_token_out = symbol.upper()
                from knowledge_base import get_1click_token_price
                source_price = get_1click_token_price(active_token_in)
                if not source_price or source_price <= 0:
                    raise ValueError(f"No live price available for execution source token {active_token_in}")
                amount_in_source = round(min(amount_usd / float(source_price), max(0.0, wallet_balance - 0.05)), 4)
                tx_payload = create_near_intent_transaction(
                    token_in=active_token_in,
                    token_out=active_token_out,
                    amount=float(amount_in_source),
                    min_amount_out=min_out,
                    deposit_address=deposit_addr,
                    account_id=agent_execution_wallet
                )
                print(f"[NEAR INTENTS: PAYLOAD] Created {len(tx_payload)} intent transactions for authorized signer '{agent_execution_wallet}'.")

                # Autonomous On-Chain Broadcast via Delegated Agent Key
                agent_key = get_agent_key(user_wallet, "near")
                if agent_key and agent_key.get("encrypted_private_key"):
                    from key_manager import decrypt_private_key
                    from autonomous_agents.near_submitter import submit_near_transaction
                    try:
                        decrypted_key = decrypt_private_key(agent_key.get("encrypted_private_key"))
                        print(f"[NEAR INTENTS: BROADCAST] Submitting {len(tx_payload)} transaction(s) to NEAR network for {agent_execution_wallet}...")
                        onchain_hash = await submit_near_transaction(
                            tx_payload=tx_payload,
                            agent_address=agent_execution_wallet,
                            private_key=decrypted_key
                        )
                        if onchain_hash:
                            quote_tx_hash = onchain_hash
                            print(f"[NEAR INTENTS: SUCCESS] Transaction broadcasted on-chain! Tx Hash: {onchain_hash}")
                    except Exception as submit_err:
                        print(f"[NEAR INTENTS: BROADCAST ERROR] Failed to broadcast transaction: {submit_err}")
                else:
                    print(f"[NEAR INTENTS: MANUAL SIGN] No encrypted agent key found for {user_wallet}. Tx payload created for frontend wallet selector signing.")
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
            "chart_image": node1_data.get("chart_image_info"),
            "ascii_chart": node1_data.get("ascii_chart", ""),
            "twitter_sentiment": node1_data.get("twitter_sentiment", {}),
            "researcher_intel": node1_data.get("researcher_intel"),
            "scan_results": node1_data.get("scan_results"),
            "screener_result": node1_data.get("screener_result"),
            "scanner_candidates": node1_data.get("scanner_candidates", []),
        }


# Singleton Instance
trader_agent = TraderAgent()
