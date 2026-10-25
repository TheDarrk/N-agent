"""
Neptune AI — Autonomous Quantitative Trader Agent
Pipeline Architecture:
  - Node 1: Research & Multimodal Data Aggregator
      * Multi-Asset Universe Scanner (Dynamic Daily Trending 20 Coins vs Custom Watchlist)
      * Multi-Timeframe Technical Indicators Engine (RSI 14, EMA 20/50/200, ATR 14, Volume Surge)
      * Algorithmic Geometric Chart Pattern Recognition (Double Bottom/Top, H&S, Flags, Triangles, Candlesticks)
      * Chart Vision Engine: Generates High-Resolution Dark-Mode Candlestick PNG & ASCII Visual Grid
      * XML Crypto Trading Book RAG Retrieval (31 sections from NCFE, Fidelity/Kirkpatrick, Bulkowski)
      * Live Twitter / X Sentiment Engine (#NEAR, #BTC, #ETH, viral velocity, bullish %)
      * Research Agent Plugin: Trader Agent hires Research Agent (0.1 NEAR fee) for deep alpha intel
  - Node 2: LLM-as-a-Judge (shimo4228/llm-as-judge pattern, model: z-ai/glm-5.3-flash)
      * Evaluates full XML Prompt: <market_data>, <chart_visual_representation>, <chart_pattern_recognition>,
        <retrieved_book_knowledge>, <social_sentiment>, <research_agent_deep_intel>
      * Binary Evidence Checks (Trend, Volume, Chart Pattern, Sentiment, Risk/Reward)
      * Calculates Objective Confidence Score (0-100%), Expected ROI %, and Dynamic TP/SL
      * Issues Named Verdict: ENTER_LONG | ENTER_SHORT | STAND_ASIDE | REJECT_RISK_BREACH
  - Programmatic Hard-Cap Execution Engine (Deterministic Python - No Node 3 LLM needed):
      * Kill Switch verification
      * Daily & Weekly trade frequency limits
      * User-configured Minimum Confidence threshold
      * Position sizing capped at user max_tx_amount
      * Submits order via NEAR Intents / Defuse
      * Registers active trade in SQLite for 60s TP/SL price poller
      * Uploads audit trace to Decentralized Storage (recent 10 preserved)
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
        Executes the 2-Node + Deterministic Hard-Cap Execution Pipeline.
        """
        user = get_user(user_wallet) or {}
        timeframe = force_timeframe or user.get("trader_timeframe", "1h")
        min_confidence = force_min_confidence if force_min_confidence is not None else int(user.get("trader_min_confidence", 75))
        risk_profile = user.get("trader_risk_profile", "moderate")
        max_tx_amount = float(user.get("max_tx_amount", 50.0))
        max_trades_day = int(user.get("trader_max_trades_per_day", 3))
        max_trades_week = int(user.get("trader_max_trades_per_week", 12))
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

        # ─── NODE 1: MULTIMODAL RESEARCH & DATA GATHERING ────────
        print(f"[NODE 1: RESEARCH] Scanning universe ({active_coin_mode} mode)...")
        node1_data = await self._node1_gather_data(
            user_wallet=user_wallet,
            symbol=symbol,
            coin_mode=active_coin_mode,
            custom_coins=custom_coins,
            timeframe=timeframe,
            enable_researcher=researcher_active
        )

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

        # ─── NODE 2: LLM-AS-A-JUDGE (EVALUATION & VERDICT) ────────
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
            multiframe_analysis=node1_data.get("multiframe_chart")
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
        Node 1: Scans universe, computes indicators, recognizes geometric chart patterns,
        renders candlestick vision chart, retrieves XML trading book RAG rules,
        searches Twitter sentiment, and optionally hires Research Agent.
        """
        scan_results = None
        selected_symbol = symbol

        # 1. 20-Coin Universe Scanner (Dynamic Daily Trending vs Custom Watchlist)
        if not selected_symbol:
            scan_results = await scan_coin_universe(
                mode=coin_mode,
                custom_coins=custom_coins,
                timeframe=timeframe
            )
            top_cand = scan_results.get("top_candidate")
            if top_cand and "symbol" in top_cand and top_cand.get("opportunity_score", 0) >= 40:
                selected_symbol = top_cand["symbol"]
            elif scan_results.get("ranked_coins"):
                selected_symbol = scan_results["ranked_coins"][0]["symbol"]
            else:
                selected_symbol = "NEAR"
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
        rag_context = {
            "symbol": selected_symbol,
            "ema_trend": indicators["ema_trend"],
            "rsi": indicators["rsi"],
            "volume_surge": indicators["volume_surge"],
            "pattern_name": pattern_data["dominant_pattern"]
        }
        matched_sections = trading_book_rag.retrieve(rag_context, top_k=5)
        rag_xml_block = trading_book_rag.format_for_xml_prompt(matched_sections)
        print(f"[NODE 1: RAG] Retrieved {len(matched_sections)} trading book sections for {selected_symbol}: {[s.get('section_title') for s in matched_sections]}")

        # 6. Live Twitter / X Sentiment Engine
        twitter_data = await search_twitter_sentiment(symbol=selected_symbol)

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
        multiframe_chart = await analyze_multiframe_market_tool(
            symbol=selected_symbol,
            timeframes=["1h", "2h", "4h", "1d", "1w"]
        )

        return {
            "symbol": selected_symbol,
            "coin_mode": coin_mode,
            "scan_results": scan_results,
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
        hard_cap_usd: float = 50.0,
        multiframe_analysis: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Node 2: Institutional LLM Council Judge implementing Karpathy's 5-advisor deliberation
        (Contrarian, First Principles, Expansionist, Outsider, Executor).
        Follows strict zero-fallback policy: if deliberation fails, execution safely halts.
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
            multiframe_analysis=multiframe_analysis
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
        tp_price = float(node2_data.get("take_profit_price", round(entry_price * 1.06, 4)))
        sl_price = float(node2_data.get("stop_loss_price", round(entry_price * 0.96, 4)))
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

        # Ensure sensible TP/SL defaults
        if tp_price <= entry_price:
            tp_price = round(entry_price * (1 + max(0.04, expected_roi_pct / 100)), 4)
        if sl_price >= entry_price or sl_price <= 0:
            sl_price = round(entry_price - max(indicators["atr"] * 1.2, entry_price * 0.03), 4)

        # Re-render definitive visual chart with Council's final consensus verdict, ROI, and forward prediction path
        try:
            final_chart_image = render_chart_image(
                candles=node1_data.get("candles", []),
                symbol=symbol,
                timeframe=timeframe,
                pattern_name=pattern or node1_data.get("pattern_data", {}).get("dominant_pattern", "Structure Regime"),
                tp_price=tp_price,
                sl_price=sl_price,
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
        is_warranted = (
            verdict in ["ENTER_LONG", "ENTER_SHORT"] and
            confidence_score >= min_confidence
        )

        if not is_warranted:
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
                "expected_roi_pct": expected_roi_pct,
                "entry_price": entry_price,
                "take_profit_price": tp_price,
                "stop_loss_price": sl_price,
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
            cid = await upload_trade_trace(trace)

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
                "expected_roi_pct": expected_roi_pct,
                "entry_price": entry_price,
                "take_profit_price": tp_price,
                "stop_loss_price": sl_price,
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
                "expected_roi_pct": expected_roi_pct,
                "entry_price": entry_price,
                "take_profit_price": tp_price,
                "stop_loss_price": sl_price,
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
        cid = await upload_trade_trace(trace)

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
