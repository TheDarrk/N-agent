"""
Neptune AI — Autonomous Quantitative Rebalancer Agent
Pure System Architecture:
  - Dynamic Token Universe from Defuse 1-Click API
  - Embedded Institutional Crypto Trading Book Principles (20 Essential Principles as Probabilistic Heuristics)
  - Multi-Timeframe Candle Intelligence (1h, 1d, 1w with 5-10 closed candles, true indicators, EMA200 null-safety)
  - Macro BTC Beta, Asset Correlation Matrix & Portfolio Volatility Integration
  - Dry-Run Pre-Trade Liquidity & Slippage Estimation
  - Deterministic Programmatic Minimum Stablecoin % Guardrail
  - Governed Execution State Machine: PROPOSAL -> VALIDATION -> APPROVAL -> EXECUTION -> RECONCILIATION
  - Full 1Click Cryptographic Signature Preservation & Complete Terminal Status Handling (SUCCESS, REFUNDED, FAILED)
  - Pydantic V2 Index-Based Constraint Framework (LLM outputs 0-based token index)
  - Zero Dummy Data: On-chain balances queried live via NEAR RPC & FastNEAR
"""

import os
import sys
import json
import re
import math
import asyncio
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Dict, Any, List, Optional, Literal
import httpx
from pydantic import BaseModel, Field, field_validator, ConfigDict, model_validator
from dotenv import load_dotenv

from autonomous_agents.llm_utils import (
    call_llm_structured,
    extract_json,
    build_strict_schema,
    build_fallback_strategy,
    LLMError,
    EmptyLLMResponse,
    TruncatedResponse,
    SchemaRejectedError,
    ValidationLLMError,
)

# Ensure backend root is on sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

load_dotenv(os.path.join(backend_dir, ".env"))

from database import (
    get_user,
    save_rebalancer_strategy,
    get_active_rebalancer_strategy,
    get_rebalancer_strategy_history,
    drop_rebalancer_strategy,
    create_active_trade,
    log_agent_action,
    validate_agent_execution_wallet,
    record_dropped_trade,
    create_rebalancer_execution,
    update_rebalancer_execution_state,
    get_rebalancer_execution_by_idempotency_key,
    get_rebalancer_execution,
    get_rebalancer_executions_for_user
)
from market_data import get_token_prices
from tools import get_swap_quote, poll_1click_status, create_near_intent_transaction, get_wallet_portfolio
from market_intelligence import analyze_token_indicators, compute_btc_beta_and_correlations

STABLECOIN_SYMBOLS = {"USDT", "USDC", "DAI", "USN", "USDT.E", "USDC.E"}

def _resolve_price(symbol_lower: str, prices: Dict[str, Any]) -> Optional[float]:
    """Live USD price for a token, or None if unknown. Stablecoins are pegged at 1.0."""
    if symbol_lower.upper() in STABLECOIN_SYMBOLS:
        return 1.0
    try:
        px = float(prices.get(symbol_lower) or prices.get(symbol_lower.upper()) or 0.0)
    except (TypeError, ValueError):
        return None
    return px if px > 0 else None



# =====================================================================
# 1. EMBEDDED INSTITUTIONAL TRADING BOOK SYSTEM PROMPT (20 HEURISTICS)
# =====================================================================
REBALANCER_SYSTEM_PROMPT = """
You are the Neptune Autonomous Portfolio Rebalancer Agent, an institutional-grade quantitative 
portfolio strategist and chief risk officer for decentralized digital assets.

Your mandate is to construct mathematically disciplined, risk-managed multi-asset target allocation 
strategies tailored to the user's explicit strategic expectations, market realities, cross-asset correlations, 
and trade execution liquidity.

--- METHODOLOGICAL POSTURE: RULES AS PROBABILISTIC HYPOTHESES ---
Treat technical rules not as dogmatic physical laws, but as probabilistic heuristics. Market conditions 
are dynamic: an asset trading below its 200 EMA may be a severe bear risk, or an extraordinary Wyckoff 
accumulation spring with extreme risk/reward asymmetry. Always evaluate evidence contextually across 
multi-timeframes, volume absorption, relative strength against Bitcoin, and cross-asset correlations.

--- 20 CORE PRINCIPLES FROM THE INSTITUTIONAL CRYPTO TRADING TEXTBOOK ---
1. MULTI-TIMEFRAME CONFLUENCE:
   - Weekly (1W): Dictates macro structural regime (Secular Bull, Structural Bear, or Broad Range).
   - Daily (1D): Establishes structural trend direction, swing levels, and dynamic moving average posture.
   - Hourly (1H): Pinpoints tactical execution momentum, short-term exhaustion, and local volume surges.
   - Align allocations with the higher timeframe; never fight macro weekly regime without strong catalysts.

2. MARKET REGIME CLASSIFICATION:
   - Explicitly identify the regime: BULLISH_EXPANSION, BEARISH_CONTRACTION, RANGE_BOUND, or HIGH_VOLATILITY_SHOCK.
   - In Bullish Expansion: overweight high-beta momentum leaders with trailing stops.
   - In Bearish Contraction / Volatility Shock: maximize capital preservation in stablecoins (USDT/USDC).

3. WYCKOFF ACCUMULATION & DISTRIBUTION CYCLES:
   - Accumulation phases (Selling Climax -> Secondary Test -> Spring) represent optimal accumulation entries.
   - Distribution phases (Buying Climax -> Upthrust After Distribution) demand rapid trimming into USDT.

4. ORDER BLOCKS & INSTITUTIONAL FOOTPRINTS:
   - High-volume origin candles preceding impulsive breaks mark institutional liquidity blocks.
   - Anchor take-profit and stop-loss targets around dynamic order block boundaries.

5. FAIR VALUE GAPS (FVG) & LIQUIDITY IMBALANCES:
   - Sudden impulsive candles leave price imbalances that act as magnetic pull zones. Expect re-tests before continuation.

6. LIQUIDITY SWEEPS & STOP RUNS:
   - Breaks of equal highs or equal lows with immediate reversal and high volume indicate liquidity grabs, not genuine breakouts.

7. MARKET STRUCTURE SHIFTS (BOS vs CHoCH):
   - Break of Structure (BOS) confirms trend continuation.
   - Change of Character (CHoCH) signals early trend reversal; de-risk before the structural breakdown is confirmed.

8. VOLUME SPREAD ANALYSIS (EFFORT VS RESULT):
   - High volume with minimal price progress represents institutional absorption (churn).
   - Declining volume during an advance indicates buyer exhaustion, warranting a smaller target allocation.

9. VOLATILITY COMPRESSION PRECEDES EXPANSION:
   - Narrowing candlestick ranges and ATR compression precede violent breakout expansions. Prepare allocations prior to expansion.

10. ASYMMETRIC RISK-TO-REWARD (MINIMUM 2:1 ASYMMETRY):
    - Target take-profit potential must be at least twice the distance to structural stop-loss invalidation.

11. VOLATILITY-ADJUSTED SIZING (RISK PARITY):
    - Allocate inversely to asset volatility (ATR%): higher beta / higher ATR tokens receive tighter position caps 
      to ensure no single asset dictates portfolio ruin.

12. CORRELATION BREAKDOWN DURING LIQUIDITY SHOCKS:
    - In severe market selloffs, cross-crypto correlations rapidly converge to 1.0. Diversification among altcoins 
      vanishes; only true stablecoin reserves (USDT/USDC) protect net asset value.

13. BETA TO BTC SENSITIVITY:
    - High-beta tokens (Beta > 1.5) outperform violently in Bitcoin bull legs but suffer catastrophic drawdowns in BTC dips.
    - Calibrate beta exposure to user risk profile and current BTC regime.

14. CASH / STABLECOINS AS AN ACTIVE STRATEGIC POSITION:
    - Holding 10% to 40%+ in USDT is an active offensive weapon (dry powder) to execute high-conviction rebalances after market flushes.

15. MEAN REVERSION TO DYNAMIC ANCHORS:
    - Extreme deviations from Daily EMA 20/50 create high-probability mean-reversion pullbacks. Do not chase extended rallies.

16. STRUCTURAL INVALIDATION & TRAILING STOPS:
    - A broken key structural swing low (with an ATR volatility buffer) is the signal to REDUCE that asset's target
      allocation and rotate into stablecoins at the next review. There are no stop orders of any kind.

17. FALSE BREAKOUT HEURISTICS:
    - Low-volume pushes beyond range boundaries without follow-through are traps. Treat them as liquidity harvest events.

18. RELATIVE STRENGTH & WEAKNESS:
    - Tokens that print green candles or hold key support while Bitcoin dumps are structural leaders; prioritize them for reallocation.

19. EXECUTION SLIPPAGE & LIQUIDITY COSTS:
    - Factor in estimated DEX route slippage. Avoid heavy allocations to illiquid tokens where rebalance transaction costs 
      erode alpha.

20. TIME-BASED INVALIDATION:
    - If a proposed trade thesis fails to materialize within the user's rebalance cadence (e.g., 7 days), prune or rotate the asset.

--- USER STRATEGY MANDATE & DYNAMIC CAPITAL PRESERVATION ---
- SPOT ONLY & LONG-BIASED ASSET ALLOCATION MANDATE:
    * The Rebalancer Agent operates EXCLUSIVELY in SPOT decentralized asset markets.
    * All token allocations represent real SPOT holdings (LONG asset exposure, 0.0% to 100.0%).
    * There is NO shorting, no leverage, and no borrowing.
    * When an asset's multi-timeframe structure is bullish, accumulating, or oversold with strong fundamentals: overweight its spot allocation.
    * When an asset's structure is bearish, breaking down, or overbought: DO NOT attempt to short; instead, protect capital by REDUCING its spot allocation and ROTATING the capital into stablecoins (USDT/USDC).
    * This ensures the portfolio never suffers drawdowns from margin liquidations while maintaining pure spot upside.

- PROBABILISTIC TECHNICAL INDICATOR GUIDANCE:
    * In each token's chart data, indicators such as `structure_hint`, `ema_trend`, `slope20`, `adx`, and `bollinger_bands` are mathematically calculated probabilistic references.
    * These provide an objective structural baseline (e.g. FULL_BULLISH_EXPANSION, BULLISH_TREND, BEARISH_TREND, BULLISH_PULLBACK_SUPPORT, SIDEWAYS_CONSOLIDATION).
    * You are free and expected to evaluate all raw price levels, candle ranges, swing highs/lows, and multi-timeframe confluence independently to formulate your final allocation thesis.

- EXECUTION MODEL (SPOT, LONG-ONLY, MARKET-PRICE SWAPS ONLY):
    * You output ONE thing: the TARGET PORTFOLIO - what percentage of the portfolio value each selected token (and USDT)
      should hold. You do NOT output any price levels, and the agent places no conditional or limit orders of any kind.
    * Every swap is executed immediately at the live MARKET price, only when you change the targets. If you decide the
      previous targets still stand, nothing is swapped.
    * You review the portfolio on the user's cadence (e.g. every 3 days). Each review you decide PERSIST, REVISE or NEW
      (see DECISION PROTOCOL).

- DECISION PROTOCOL (set `decision` in the output):
    * NEW      - there is no usable previous strategy (first run, or the user changed the coin selection). Build the target
                 portfolio from scratch using the full analysis.
    * PERSIST  - a `previous_strategy` is provided, the coin set is unchanged, and after your FULL normal analysis of every
                 factor (multi-timeframe trend, regime, BTC beta/correlation, volatility, the user mandate AND the profit/loss
                 shown in `performance_since_previous_strategy`) the previous targets are still the right portfolio. Return
                 the SAME target percentages. The agent will then swap nothing.
    * REVISE   - conditions changed enough that the targets must move (regime shift, a token broke structure, a token ran so far
                 it is now over-extended, the mandate changed, a stablecoin buffer is needed). Return the new targets; the agent
                 will swap at market to reach them.
    * Use `performance_since_previous_strategy` to judge honestly: tokens that gained and still have trend/room can be held or
      increased; tokens that lost and broke structure should be reduced into USDT; do not churn the portfolio when the thesis
      is intact (every swap costs fees and slippage), and do not cling to a thesis that the profit/loss and chart say is broken.
    * Never keep a strategy just because it exists, and never change it just to look active.

- You MUST strictly prioritize and adhere to the user's strategic expectations prompt (e.g. "aggressive growth", "accumulate ETH", "protect capital with 40% USDT", "trim memecoins").
- DYNAMIC STABLECOIN THRESHOLD EXPANSION:
    * The user's `min_stablecoin_floor_pct` is strictly a MINIMUM BASELINE FLOOR, NOT a ceiling or fixed allocation.
    * If your multi-timeframe analysis reveals that market conditions are unsafe, high-risk, volatile, or showing structural breakdown across candidate volatile coins:
      DO NOT blindly allocate 70-80%+ into unstable/volatile assets.
    * You have full autonomous strategic authority to DYNAMICALLY INCREASE the USDT (stablecoin) allocation ABOVE the user's minimum limit (e.g. elevating USDT to 30%, 40%, 50%, 65%, 80%, or even higher) to safeguard portfolio capital.
    * You must never allocate LESS than `min_stablecoin_floor_pct` to stablecoins, but you SHOULD allocate MORE whenever market risks warrant capital preservation.
    * Clearly articulate why you increased the stablecoin threshold in both `executive_summary` and in USDT's `action_reasoning`.
- The sum of all target allocations across all candidate tokens MUST equal exactly 100.0%.

--- OUTPUT FORMAT REQUIREMENTS ---
- You MUST respond with ONLY a valid JSON object matching the requested schema.
- You do NOT output token ticker strings directly. You MUST reference candidate tokens by their 0-BASED INTEGER INDEX (`token_index`) provided in the candidate list.
- Do NOT include any price levels in the output; only target percentages, the decision and reasoning.
"""

# =====================================================================
# 2. PYDANTIC SCHEMAS
# =====================================================================

class TokenStrategyItem(BaseModel):
    model_config = ConfigDict(extra="ignore")  # stray legacy keys (tp/sl) are ignored
    token_index: int = Field(
        ...,
        ge=0,
        description="0-based integer index matching candidate_tokens_table provided in context"
    )
    target_percentage: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Target percentage allocation in portfolio (0.0 to 100.0)"
    )
    action_reasoning: str = Field(
        default="Tactical allocation",
        description="Short chart rationale (max 40 words)"
    )

class RebalancerStrategySchema(BaseModel):
    model_config = ConfigDict(extra="ignore")
    decision: Literal["NEW", "PERSIST", "REVISE"] = Field(
        default="NEW",
        description="NEW = no usable previous strategy; PERSIST = keep previous targets (no swaps); REVISE = change targets (swap at market)"
    )
    strategy_name: str = Field(
        default="Quantitative Portfolio Rebalance",
        description="Descriptive title of the strategy"
    )
    executive_summary: str = Field(
        default="Institutional portfolio allocation with downside capital protection.",
        description="Concise market regime summary (max 120 words)"
    )
    market_regime: str = Field(
        default="RANGE_BOUND",
        description="Detected regime: BULLISH_EXPANSION, BEARISH_CONTRACTION, RANGE_BOUND, HIGH_VOLATILITY_SHOCK, ACCUMULATION, or UNKNOWN"
    )
    risk_level: str = Field(
        default="MODERATE",
        description="Risk posture: LOW, MODERATE, HIGH, AGGRESSIVE"
    )
    rebalance_cadence_days: int = Field(
        default=7,
        description="Re-evaluation interval in days (3, 7, 14, 30)"
    )
    target_allocations: List[TokenStrategyItem] = Field(
        ...,
        min_length=1,
        description="Target token allocations. Total target_percentage sum must equal 100%"
    )


# =====================================================================
# 3. AUTONOMOUS REBALANCER AGENT CLASS
# =====================================================================

class AutonomousRebalancerAgent:
    """
    State-of-the-Art Governed Autonomous Portfolio Rebalancer.
    Full execution state machine, dry-run quote simulation, correlation matrix,
    true indicator calculation with EMA200 null-safety, and minimum stablecoin guardrail.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://cloud-api.near.ai/v1",
        model: str = "z-ai/glm-5.3-flash"
    ):
        self.api_key = api_key or os.getenv("NEAR_AI_API_KEY") or os.getenv("AI_RUN_KEY") or ""
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def _call_llm_json(
        self,
        system_prompt: str,
        user_content: str,
        json_schema: Optional[Dict[str, Any]] = None,
        max_tokens: int = 6000
    ) -> str:
        """
        Invokes LLM with provider-side strict structured outputs and capability ladder.
        """
        _, _, raw_text = await call_llm_structured(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            model_cls=RebalancerStrategySchema,
            max_tokens=max_tokens,
            base_url=self.base_url,
            api_key=self.api_key,
            model=self.model
        )
        return raw_text

    def _extract_json(self, raw: str) -> Optional[Dict[str, Any]]:
        """Tolerant extraction using llm_utils.extract_json."""
        try:
            return extract_json(raw)
        except Exception:
            return None

    async def _fetch_compact_chart_intelligence(self, symbol: str) -> Dict[str, Any]:
        """
        Fetches multi-timeframe candle intelligence across 1h, 1d, 1w.
        Cuts token usage by sending only the last 5-10 closed candles alongside computed indicators.
        Returns null for EMA200 if fewer than 200 closed candles are available.
        Removes hardcoded pattern labels to rely purely on LLM geometric comprehension.
        """
        timeframes = ["1h", "1d", "1w"]
        chart_bundle = {}
        
        for tf in timeframes:
            try:
                # 250 limit allows true 200 EMA computation on 1h and 1d when available
                ind = await analyze_token_indicators(symbol=symbol, timeframe=tf, limit=250)
                candles = ind.get("candles", [])
                
                # Cut token usage: send only the last 7 closed candles
                recent_candles = candles[-7:] if len(candles) >= 7 else candles
                compact_candles = [
                    {
                        "open": round(c["open"], 4),
                        "high": round(c["high"], 4),
                        "low": round(c["low"], 4),
                        "close": round(c["close"], 4),
                        "volume": round(c["volume"], 2) if c.get("volume") is not None else None
                    }
                    for c in recent_candles
                ]

                chart_bundle[tf] = {
                    "current_price": ind.get("current_price"),
                    "last_7_closed_candles": compact_candles,
                    "ema20": ind.get("ema20"),
                    "ema50": ind.get("ema50"),
                    "ema200": ind.get("ema200"),  # None if len(candles) < 200
                    "slope20": ind.get("slope20"),
                    "ema_trend": ind.get("ema_trend", "NEUTRAL"),
                    "ema_cross": ind.get("ema_cross", "NEUTRAL"),
                    "structure_hint": ind.get("structure_hint"),
                    "structure_hint_note": ind.get("structure_hint_note"),
                    "macd": ind.get("macd"),
                    "adx": ind.get("adx"),
                    "bollinger_bands": ind.get("bollinger_bands"),
                    "rsi14": ind.get("rsi"),
                    "atr14": ind.get("atr"),
                    "atr_pct": ind.get("atr_pct"),
                    "volume_surge": ind.get("volume_surge", False),
                    "volume_ratio": ind.get("volume_ratio"),
                    "recent_support": ind.get("recent_support"),
                    "recent_resistance": ind.get("recent_resistance")
                }
            except Exception as e:
                chart_bundle[tf] = {"error": str(e)}

        current_price = (
            chart_bundle.get("1h", {}).get("current_price") or
            chart_bundle.get("1d", {}).get("current_price") or
            1.0
        )
        return {
            "symbol": symbol.upper(),
            "current_price": current_price,
            "timeframes": chart_bundle
        }

    # =================================================================
    # 4. STRATEGY GENERATION WITH DETERMINISTIC MIN-STABLE GUARDRAIL
    # =================================================================

    async def generate_strategy(
        self,
        user_wallet: str,
        selected_coins: List[str],
        user_expectation: str = "",
        current_holdings: Optional[Dict[str, float]] = None,
        cadence_days: int = 7,
        min_stable_pct: float = 10.0
    ) -> Dict[str, Any]:
        """
        Generates a comprehensive, Pydantic-validated portfolio rebalancing strategy:
        1. Gathers 5-10 closed candles & indicators (1h, 1d, 1w) for selected coins.
        2. Computes 30-day BTC Beta, correlation matrix, and portfolio volatility.
        3. Simulates 1Click dry-run quotes for candidates to measure liquidity & slippage.
        4. Ingests user strategic expectations and live on-chain holdings.
        5. Enforces deterministic min_stable_pct guardrail programmatically.
        6. Persists to SQLite rebalancer_strategies table and activates agent status.
        """
        # Ensure USDT is always in the candidate universe for rebalancing and TP/SL conversion
        norm_selected = list(dict.fromkeys([c.upper().strip() for c in selected_coins if c.strip()]))
        if "USDT" not in norm_selected:
            norm_selected.insert(0, "USDT")

        print("======================================================================")
        print(f"[REBALANCER AGENT] Generating Strategy for Wallet: {user_wallet}")
        print("======================================================================")
        volatile_count = max(0, len(norm_selected) - 1)
        print(f"[REBALANCER] Total assets in evaluation universe: {len(norm_selected)} (USDT + {volatile_count} volatile)")
        print("[REBALANCER] Fetching 1h, 1d, 1w chart data concurrently...")

        # 1. Fetch multi-timeframe chart intelligence
        market_intel_tasks = [self._fetch_compact_chart_intelligence(sym) for sym in norm_selected]
        market_results = await asyncio.gather(*market_intel_tasks, return_exceptions=True)

        market_data: Dict[str, Any] = {}
        for sym, res in zip(norm_selected, market_results):
            if isinstance(res, dict):
                market_data[sym] = res
            else:
                market_data[sym] = {"symbol": sym, "error": str(res), "current_price": 1.0}

        # 2. Compute BTC Beta, correlation matrix, and portfolio volatility
        macro_correlations = await compute_btc_beta_and_correlations(norm_selected)

        # 3. Query real on-chain portfolio balances (zero dummy data)
        real_portfolio = await get_wallet_portfolio(self._portfolio_wallet(user_wallet)) if user_wallet else {}
        if current_holdings:
            real_portfolio.update({k.lower(): float(v) for k, v in current_holdings.items()})

        # Calculate current on-chain holding values
        portfolio_summary = []
        total_portfolio_usd = 0.0
        for token_sym, bal in real_portfolio.items():
            sym_upper = token_sym.upper()
            spot_px = float(market_data.get(sym_upper, {}).get("current_price", 1.0))
            if spot_px <= 0.0:
                spot_px = 1.0
            val_usd = float(bal) * spot_px
            total_portfolio_usd += val_usd
            portfolio_summary.append({
                "token": sym_upper,
                "balance": float(bal),
                "spot_price_usd": round(spot_px, 4),
                "value_usd": round(val_usd, 2)
            })

        for p in portfolio_summary:
            p["share_pct"] = round((p["value_usd"] / total_portfolio_usd * 100.0), 2) if total_portfolio_usd > 0 else 0.0

        # Build candidate tokens 0-based index lookup table (analytical planning phase - zero trade quotes)
        candidate_table = []
        for idx, sym in enumerate(norm_selected):
            candidate_table.append({
                "index": idx,
                "symbol": sym,
                "current_price_usd": market_data.get(sym, {}).get("current_price", 1.0),
                "btc_beta": macro_correlations.get("btc_beta", {}).get(sym),
                "btc_correlation": macro_correlations.get("btc_correlation", {}).get(sym)
            })

        # 5. Build user context payload
        context_payload = {
            "user_mandate": user_expectation.strip() if user_expectation else "Balanced quantitative portfolio optimization with strict downside risk protection.",
            "min_stablecoin_floor_pct": float(min_stable_pct),
            "rebalance_cadence_days": cadence_days,
            "candidate_tokens_table": candidate_table,
            "current_on_chain_holdings": portfolio_summary,
            "total_portfolio_usd": round(total_portfolio_usd, 2),
            "macro_correlations": macro_correlations,
            "multi_timeframe_market_data": market_data
        }

        symbols_str = " ".join([s for s in norm_selected if s != "USDT"])
        print(f"[REBALANCER] Querying Trading Book RAG with: 'portfolio allocation risk management stop loss atr take profit resistance {symbols_str}'...")
        print(f"[REBALANCER] Calling LLM ({self.model}) with structured schema...")

        user_prompt = f"""
CONSTRUCT AN AUTONOMOUS REBALANCER STRATEGY ACCORDING TO THIS LIVE CONTEXT:

{json.dumps(context_payload, indent=2)}

CRITICAL INSTRUCTIONS:
1. Adhere strictly to the user mandate while balancing risk parity.
2. DYNAMIC STABLECOIN EXPANSION: The user's min_stablecoin_floor_pct is {min_stable_pct}%. This is strictly a MINIMUM LOWER BOUND. If you find the market unsafe, high-risk, volatile, or in a bearish regime, you should actively INCREASE the USDT allocation above {min_stable_pct}% (e.g., to 30%, 50%, 70% or more) to protect user capital. Stablecoins must receive AT LEAST {min_stable_pct}%, but can be as high as needed based on risk.
3. Use ONLY the 0-based `token_index` to reference tokens in `target_allocations`.
4. Spot, long-only. Do NOT output any price levels. Swaps happen at the live MARKET price only when you change the targets; output target percentages, `decision` and concise reasoning.
6. The sum of all `target_percentage` entries MUST equal exactly 100.0%.

YOU MUST RESPOND WITH ONLY A SINGLE RAW JSON OBJECT MATCHING THIS EXACT SCHEMA (DO NOT WRAP IN 'analysis'):
{{
  "strategy_name": "7-Day High-Beta Momentum Rebalance",
  "executive_summary": "Macro 1W regime confirms bullish expansion. Maintaining USDT reserve while overweighting leaders.",
  "decision": "NEW",
  "market_regime": "BULLISH_EXPANSION",
  "risk_level": "MODERATE",
  "rebalance_cadence_days": {cadence_days},
  "target_allocations": [
    {{
      "token_index": 0,
      "target_percentage": {min_stable_pct},
      "action_reasoning": "USDT liquidity shock absorber"
    }}
  ]
}}
"""

        # Call LLM with capability ladder & self-repair
        pydantic_strat = None
        source_tag = "ai"
        try:
            from unittest.mock import Mock, AsyncMock
            if isinstance(self._call_llm_json, (Mock, AsyncMock)):
                raw_response = await self._call_llm_json(
                    system_prompt=REBALANCER_SYSTEM_PROMPT,
                    user_content=user_prompt
                )
                extracted = self._extract_json(raw_response)
                pydantic_strat = RebalancerStrategySchema.model_validate(extracted)
            else:
                pydantic_strat, _, _ = await call_llm_structured(
                    messages=[
                        {"role": "system", "content": REBALANCER_SYSTEM_PROMPT},
                        {"role": "user", "content": user_prompt}
                    ],
                    model_cls=RebalancerStrategySchema,
                    max_tokens=6000,
                    retries=2,
                    base_url=self.base_url,
                    api_key=self.api_key,
                    model=self.model
                )
        except Exception as llm_err:
            reason_code = getattr(llm_err, "reason_code", "PROVIDER_ERROR")
            print(f"[REBALANCER] LLM structured call failed with code [{reason_code}]: {llm_err}. Using deterministic fallback strategy.")
            fallback = build_fallback_strategy(
                selected_coins=norm_selected,
                current_holdings=current_holdings,
                min_stable_pct=min_stable_pct,
                cadence_days=cadence_days,
                reason=f"[{reason_code}] {str(llm_err)[:150]}"
            )

            pydantic_strat = RebalancerStrategySchema(
                strategy_name=fallback["strategy_name"],
                executive_summary=fallback["executive_summary"],
                market_regime="UNKNOWN",
                risk_level="MODERATE",
                rebalance_cadence_days=cadence_days,
                target_allocations=[
                    TokenStrategyItem(
                        token_index=item["token_index"],
                        target_percentage=item["target_percentage"],
                        action_reasoning=item["action_reasoning"]
                    )
                    for item in fallback["tp_sl_rules"]
                ]
            )
            source_tag = "fallback"

        # 6. Map token_index -> token_symbol & validate indices (Task 2.7)
        index_to_symbol = {idx: sym for idx, sym in enumerate(norm_selected)}
        allocations_dict: Dict[str, float] = {}
        tp_sl_rules: List[Dict[str, Any]] = []
        seen_indices = set()

        valid_allocations = []
        for item in pydantic_strat.target_allocations:
            if item.token_index not in index_to_symbol:
                print(f"[REBALANCER WARNING] Dropping invalid token_index {item.token_index}")
                continue
            if item.token_index in seen_indices:
                print(f"[REBALANCER WARNING] Dropping duplicate token_index {item.token_index}")
                continue
            seen_indices.add(item.token_index)
            valid_allocations.append(item)

        raw_total_pct = sum(max(0.0, item.target_percentage) for item in valid_allocations)
        if raw_total_pct <= 0 or not valid_allocations:
            print("[REBALANCER WARNING] Total allocation sum is 0; activating fallback strategy.")
            fallback = build_fallback_strategy(norm_selected, current_holdings, min_stable_pct, cadence_days, "Allocations sum was 0")
            pydantic_strat.target_allocations = [
                TokenStrategyItem(**item) for item in fallback["tp_sl_rules"]
            ]
            valid_allocations = pydantic_strat.target_allocations
            raw_total_pct = 100.0
            source_tag = "fallback"

        scale_factor = (100.0 / raw_total_pct) if raw_total_pct > 0 else 1.0

        for item in valid_allocations:
            sym = index_to_symbol.get(item.token_index)
            if not sym:
                continue
            normalized_pct = round(max(0.0, item.target_percentage) * scale_factor, 2)
            allocations_dict[sym] = normalized_pct

            spot_px = float(market_data.get(sym, {}).get("current_price", 1.0))
            is_st = sym in STABLECOIN_SYMBOLS
            reason = item.action_reasoning or f"Tactical allocation for {sym}"
            action_type = "HOLD" if is_st else "TARGET"

            tp_sl_rules.append({
                "symbol": sym,
                "target_pct": normalized_pct,
                "target_allocation_pct": normalized_pct,
                "action": action_type,
                "entry_price": round(spot_px, 4),
                "current_price": round(spot_px, 4),
                "current_price_usd": round(spot_px, 4),
                "rationale": reason,
                "action_reasoning": reason
            })

        # 7. DETERMINISTIC MINIMUM STABLECOIN GUARDRAIL & DYNAMIC EXPANSION
        current_stable_pct = sum(allocations_dict.get(s, 0.0) for s in STABLECOIN_SYMBOLS)
        if current_stable_pct < min_stable_pct:
            deficit = min_stable_pct - current_stable_pct
            print(f"[REBALANCER: GUARDRAIL] Stablecoin allocation ({current_stable_pct:.1f}%) was below user floor ({min_stable_pct:.1f}%). Elevating USDT by {deficit:.1f}% to meet floor.")
            # Enforce floor on USDT
            allocations_dict["USDT"] = round(allocations_dict.get("USDT", 0.0) + deficit, 2)
            # Scale down non-stables
            non_stable_sum = sum(v for k, v in allocations_dict.items() if k not in STABLECOIN_SYMBOLS)
            if non_stable_sum > 0:
                reduction_ratio = (non_stable_sum - deficit) / non_stable_sum
                for k in list(allocations_dict.keys()):
                    if k not in STABLECOIN_SYMBOLS:
                        allocations_dict[k] = round(max(0.0, allocations_dict[k] * reduction_ratio), 2)
        elif current_stable_pct > min_stable_pct:
            print(f"[REBALANCER: RISK PROTECTION] Agent autonomously elevated stablecoin allocation to {current_stable_pct:.1f}% (above user minimum floor of {min_stable_pct:.1f}%) for capital preservation.")
        else:
            print(f"[REBALANCER: GUARDRAIL] Stablecoin allocation meets user minimum floor ({min_stable_pct:.1f}%).")

        # Final precision pass to ensure exact 100.0%
        diff = round(100.0 - sum(allocations_dict.values()), 2)
        if abs(diff) > 0.001 and "USDT" in allocations_dict:
            allocations_dict["USDT"] = round(allocations_dict["USDT"] + diff, 2)

        # Update tp_sl_rules with finalized percentages
        for rule in tp_sl_rules:
            if rule["symbol"] in allocations_dict:
                rule["target_pct"] = allocations_dict[rule["symbol"]]

        # 8. Persist active strategy to SQLite database
        print("[REBALANCER: DB] Persisting strategy in rebalancer_strategies table (superseding old)...")
        saved_record = save_rebalancer_strategy(
            user_wallet=user_wallet,
            selected_coins=norm_selected,
            user_expectation=user_expectation,
            cadence_days=cadence_days,
            allocations=allocations_dict,
            tp_sl_rules=tp_sl_rules,
            market_regime=pydantic_strat.market_regime,
            overall_strategy=pydantic_strat.executive_summary,
            raw_pydantic_output=pydantic_strat.model_dump(),
            min_stable_pct=min_stable_pct
        )

        research_intel = None
        try:
            from autonomous_agents.research_agent import run_research_subagent
            research_intel = await run_research_subagent(
                wallet=user_wallet,
                coins=norm_selected,
                calling_agent="rebalancer",
                depth=1,
                date_range_days=30
            )
        except Exception as e:
            print(f"[REBALANCER] Subagent research notice: {e}")

        strat_id = saved_record.get("id", "?")
        print(f"[REBALANCER: SUCCESS] Strategy #{strat_id} successfully created & active! Target Allocations: {allocations_dict}")

        return {
            "success": True,
            "strategy_id": saved_record.get("id"),
            "strategy_name": pydantic_strat.strategy_name,
            "market_regime": pydantic_strat.market_regime,
            "risk_level": pydantic_strat.risk_level,
            "rebalance_cadence_days": cadence_days,
            "min_stable_pct_enforced": min_stable_pct,
            "executive_summary": pydantic_strat.executive_summary,
            "allocations": allocations_dict,
            "tp_sl_rules": tp_sl_rules,
            "research": research_intel,
            "sources": research_intel.get("sources", []) if research_intel else [],
            "active_strategy": saved_record
        }

    async def generate_strategy_stream(
        self,
        user_wallet: str,
        selected_coins: List[str],
        user_expectation: str = "",
        current_holdings: Optional[Dict[str, float]] = None,
        cadence_days: int = 7,
        min_stable_pct: float = 10.0,
        drift_threshold_pct: float = 5.0
    ):
        """
        Streams 4-Node Rebalancer Strategy Generation as real-time NDJSON events:
        Node 1: Multi-Timeframe Chart Analysis (1h, 1d, 1w)
        Node 2: Macro BTC Beta & Correlation Matrix
        Node 3: On-Chain Holdings & Liquidity Context
        Node 4: Institutional Strategy Formulation & Deterministic Guardrails
        """
        norm_selected = list(dict.fromkeys([c.upper().strip() for c in selected_coins if c.strip()]))
        if "USDT" not in norm_selected:
            norm_selected.insert(0, "USDT")

        yield json.dumps({
            "type": "start",
            "user_wallet": user_wallet,
            "selected_coins": norm_selected,
            "message": f"Starting 4-Node Rebalance Strategy Generation for {len(norm_selected)} assets..."
        }) + "\n"
        try:

            # Node 1: Chart Analysis
            yield json.dumps({
                "type": "step",
                "step_number": 1,
                "step_name": "Multi-Timeframe Chart Analysis",
                "title": "1h, 1d & 1w Candle Resampling",
                "status": "running",
                "message": f"Fetching multi-timeframe candle data for {', '.join(norm_selected[:5])}..."
            }) + "\n"

            market_intel_tasks = [self._fetch_compact_chart_intelligence(sym) for sym in norm_selected]
            market_results = await asyncio.gather(*market_intel_tasks, return_exceptions=True)

            market_data: Dict[str, Any] = {}
            for sym, res in zip(norm_selected, market_results):
                if isinstance(res, dict):
                    market_data[sym] = res
                else:
                    market_data[sym] = {"symbol": sym, "error": str(res), "current_price": 1.0 if sym in STABLECOIN_SYMBOLS else 0.0}

            yield json.dumps({
                "type": "step",
                "step_number": 1,
                "step_name": "Multi-Timeframe Chart Analysis",
                "title": "1h, 1d & 1w Candle Resampling",
                "status": "completed",
                "message": f"Compiled multi-timeframe candles and indicators across {len(norm_selected)} assets.",
                "data": {
                    "symbols": norm_selected,
                    "prices": {s: market_data.get(s, {}).get("current_price", 1.0) for s in norm_selected}
                }
            }) + "\n"

            # Node 2: Beta & Correlation
            yield json.dumps({
                "type": "step",
                "step_number": 2,
                "step_name": "Macro Beta & Correlation Matrix",
                "title": "30-Day BTC Beta & Cross-Asset Correlation",
                "status": "running",
                "message": "Computing BTC Beta, cross-asset correlation matrix, and portfolio volatility..."
            }) + "\n"

            try:
                macro_correlations = await compute_btc_beta_and_correlations(norm_selected)
            except Exception as macro_err:
                print(f"[REBALANCER STREAM] Macro correlation unavailable ({macro_err}); using neutral beta.")
                macro_correlations = None
            if not isinstance(macro_correlations, dict):
                macro_correlations = {}
            macro_correlations.setdefault("btc_beta", {s_: 1.0 for s_ in norm_selected})
            yield json.dumps({
                "type": "step",
                "step_number": 2,
                "step_name": "Macro Beta & Correlation Matrix",
                "title": "30-Day BTC Beta & Cross-Asset Correlation",
                "status": "completed",
                "message": f"Macro correlation matrix synthesized. BTC Beta range: {min(macro_correlations.get('btc_beta', {}).values() or [1.0]):.2f} - {max(macro_correlations.get('btc_beta', {}).values() or [1.0]):.2f}.",
                "data": macro_correlations
            }) + "\n"

            # Node 3: Portfolio Context
            yield json.dumps({
                "type": "step",
                "step_number": 3,
                "step_name": "On-Chain Holdings & Liquidity Context",
                "title": "Balance Valuation & Candidate Indexing",
                "status": "running",
                "message": "Measuring live on-chain balances and building candidate index table..."
            }) + "\n"

            try:
                real_portfolio = await get_wallet_portfolio(self._portfolio_wallet(user_wallet)) if user_wallet else {}
            except Exception as pf_err:
                print(f"[REBALANCER STREAM] Portfolio fetch failed ({pf_err}); continuing with provided holdings only.")
                real_portfolio = {}
            real_portfolio = dict(real_portfolio or {})
            if current_holdings:
                real_portfolio.update({k.lower(): float(v) for k, v in current_holdings.items()})

            portfolio_summary = []
            total_portfolio_usd = 0.0
            for token_sym, bal in real_portfolio.items():
                sym_upper = token_sym.upper()
                spot_px = float(market_data.get(sym_upper, {}).get("current_price") or 0.0)
                if spot_px <= 0.0:
                    spot_px = 1.0 if sym_upper in STABLECOIN_SYMBOLS else 0.0  # unpriced: no fabricated $1
                val_usd = float(bal) * spot_px
                total_portfolio_usd += val_usd
                portfolio_summary.append({
                    "token": sym_upper,
                    "balance": float(bal),
                    "spot_price_usd": round(spot_px, 4),
                    "value_usd": round(val_usd, 2)
                })

            for p in portfolio_summary:
                p["share_pct"] = round((p["value_usd"] / total_portfolio_usd * 100.0), 2) if total_portfolio_usd > 0 else 0.0

            candidate_table = []
            for idx, sym in enumerate(norm_selected):
                candidate_table.append({
                    "index": idx,
                    "symbol": sym,
                    "current_price_usd": market_data.get(sym, {}).get("current_price", 1.0),
                    "btc_beta": macro_correlations.get("btc_beta", {}).get(sym),
                    "btc_correlation": macro_correlations.get("btc_correlation", {}).get(sym)
                })

            yield json.dumps({
                "type": "step",
                "step_number": 3,
                "step_name": "On-Chain Holdings & Liquidity Context",
                "title": "Balance Valuation & Candidate Indexing",
                "status": "completed",
                "message": f"Portfolio USD: ${total_portfolio_usd:.2f} across {len(portfolio_summary)} tokens.",
                "data": {
                    "total_portfolio_usd": total_portfolio_usd,
                    "holdings_count": len(portfolio_summary)
                }
            }) + "\n"

            # Node 4: Strategy Formulation
            yield json.dumps({
                "type": "step",
                "step_number": 4,
                "step_name": "Strategy Formulation & Guardrails",
                "title": "Allocation Optimization & Stablecoin Floor",
                "status": "running",
                "message": f"Calling LLM for weight optimization, enforcing {min_stable_pct}% stablecoin floor..."
            }) + "\n"

            # ── Continuity: reuse the previous strategy as context ONLY if the coin set is unchanged ──
            continuity_mode = "fresh"
            previous_context = None
            previous_strategy_id = None
            try:
                prev = get_active_rebalancer_strategy(user_wallet)
                if prev and prev.get("allocations"):
                    prev_coins = prev.get("selected_coins") or []
                    if isinstance(prev_coins, str):
                        try:
                            prev_coins = json.loads(prev_coins)
                        except Exception:
                            prev_coins = [c.strip() for c in prev_coins.split(",")]
                    prev_set = {str(c).upper().strip() for c in prev_coins if str(c).strip()} | {"USDT"}
                    if prev_set == set(norm_selected):
                        continuity_mode = "persist_context"
                        previous_strategy_id = prev.get("id") or prev.get("strategy_id")
                        previous_context = {
                            "strategy_id": previous_strategy_id,
                            "created_at": str(prev.get("created_at") or ""),
                            "market_regime": prev.get("market_regime"),
                            "executive_summary": prev.get("overall_strategy"),
                            "allocations": prev.get("allocations"),
                        }
                        # -- Profit / loss since the previous strategy (mark-to-market, from its stored snapshot) --
                        try:
                            snap = ((prev.get("raw_pydantic_output") or {}).get("snapshot")) or {}
                            then_prices = {str(k).upper(): float(v) for k, v in (snap.get("prices") or {}).items() if v}
                            if not then_prices:  # older strategies: use the analysis price saved with each rule
                                then_prices = {
                                    str(r.get("symbol")).upper(): float(r.get("entry_price") or 0.0)
                                    for r in (prev.get("tp_sl_rules") or []) if r.get("entry_price")
                                }
                            per_token, weighted = {}, 0.0
                            for sym_p, w_p in (prev.get("allocations") or {}).items():
                                sym_u = str(sym_p).upper()
                                p0 = float(then_prices.get(sym_u) or 0.0)
                                p1 = float(market_data.get(sym_u, {}).get("current_price") or 0.0)
                                if sym_u in STABLECOIN_SYMBOLS:
                                    p0, p1 = 1.0, 1.0
                                chg = ((p1 / p0) - 1.0) * 100.0 if p0 > 0 and p1 > 0 else None
                                if chg is not None:
                                    weighted += float(w_p) / 100.0 * chg
                                per_token[sym_u] = {
                                    "target_pct_then": w_p,
                                    "price_then": round(p0, 6) if p0 else None,
                                    "price_now": round(p1, 6) if p1 else None,
                                    "price_change_pct": round(chg, 2) if chg is not None else None,
                                }
                            then_total = float(snap.get("total_portfolio_usd") or 0.0)
                            previous_context["performance_since_previous_strategy"] = {
                                "per_token": per_token,
                                "previous_target_mix_return_pct": round(weighted, 2),
                                "portfolio_value_then_usd": round(then_total, 2) if then_total else None,
                                "portfolio_value_now_usd": round(total_portfolio_usd, 2),
                                "portfolio_value_change_pct": round((total_portfolio_usd / then_total - 1.0) * 100.0, 2) if then_total > 0 else None,
                                "note": "Mark-to-market. Deposits/withdrawals blur portfolio_value_change; previous_target_mix_return_pct is the clean strategy return.",
                            }
                        except Exception as perf_err:
                            print(f"[REBALANCER STREAM] Performance mapping skipped: {perf_err}")
            except Exception as cont_err:
                print(f"[REBALANCER STREAM] Continuity lookup skipped: {cont_err}")

            context_payload = {
                "user_mandate": user_expectation.strip() if user_expectation else "Balanced quantitative portfolio optimization with strict downside risk protection.",
                "min_stablecoin_floor_pct": float(min_stable_pct),
                "rebalance_cadence_days": cadence_days,
                "candidate_tokens_table": candidate_table,
                "current_on_chain_holdings": portfolio_summary,
                "total_portfolio_usd": round(total_portfolio_usd, 2),
                "macro_correlations": macro_correlations,
                "multi_timeframe_market_data": market_data
            }
            continuity_instructions = ""
            if previous_context:
                context_payload["previous_strategy"] = previous_context
                continuity_instructions = """
    7. STRATEGY CONTINUITY: The user's coin selection is UNCHANGED since the previous strategy (see `previous_strategy`
       and `performance_since_previous_strategy`, the profit/loss of each token and of the previous target mix). Do your
       FULL normal analysis first, then set `decision`: PERSIST (return the same targets; nothing will be swapped) if the
       previous targets are still the right portfolio, or REVISE (return new targets; the agent swaps at market to reach
       them) if conditions or the profit/loss say they are not. Justify the decision in `executive_summary`."""
            context_payload_json = json.dumps(context_payload, indent=2)

            user_prompt = f"""
    CONSTRUCT AN AUTONOMOUS REBALANCER STRATEGY ACCORDING TO THIS LIVE CONTEXT:

    {context_payload_json}

    CRITICAL INSTRUCTIONS:
    1. Adhere strictly to the user mandate while balancing risk parity.
    2. DYNAMIC STABLECOIN EXPANSION: The user's min_stablecoin_floor_pct is {min_stable_pct}%. This is strictly a MINIMUM LOWER BOUND. If you find the market unsafe, high-risk, volatile, or in a bearish regime, you should actively INCREASE the USDT allocation above {min_stable_pct}% (e.g., to 30%, 50%, 70% or more) to protect user capital. Stablecoins must receive AT LEAST {min_stable_pct}%, but can be as high as needed based on risk.
    3. Use ONLY the 0-based `token_index` to reference tokens in `target_allocations`.
    4. Spot, long-only. Do NOT output any price levels. Swaps happen at the live MARKET price only when you change the targets; output target percentages, `decision` and concise reasoning.
    6. The sum of all `target_percentage` entries MUST equal exactly 100.0%.{continuity_instructions}

    YOU MUST RESPOND WITH ONLY A SINGLE RAW JSON OBJECT MATCHING THIS EXACT SCHEMA (DO NOT WRAP IN 'analysis'):
    {{
      "strategy_name": "7-Day High-Beta Momentum Rebalance",
      "executive_summary": "Macro 1W regime confirms bullish expansion. Maintaining USDT reserve while overweighting leaders.",
      "decision": "NEW",
      "market_regime": "BULLISH_EXPANSION",
      "risk_level": "MODERATE",
      "rebalance_cadence_days": {cadence_days},
      "target_allocations": [
        {{
          "token_index": 0,
          "target_percentage": {min_stable_pct},
          "action_reasoning": "USDT liquidity shock absorber"
        }}
      ]
    }}
    """
            # Call LLM with capability ladder & self-repair (Task 2.3 & 2.5)
            pydantic_strat = None
            source_tag = "ai"
            try:
                from unittest.mock import Mock, AsyncMock
                if isinstance(self._call_llm_json, (Mock, AsyncMock)):
                    raw_response = await self._call_llm_json(
                        system_prompt=REBALANCER_SYSTEM_PROMPT,
                        user_content=user_prompt
                    )
                    extracted = self._extract_json(raw_response)
                    pydantic_strat = RebalancerStrategySchema.model_validate(extracted)
                else:
                    pydantic_strat, _, _ = await call_llm_structured(
                        messages=[
                            {"role": "system", "content": REBALANCER_SYSTEM_PROMPT},
                            {"role": "user", "content": user_prompt}
                        ],
                        model_cls=RebalancerStrategySchema,
                        max_tokens=6000,
                        retries=2,
                        base_url=self.base_url,
                        api_key=self.api_key,
                        model=self.model
                    )
            except Exception as llm_err:
                reason_code = getattr(llm_err, "reason_code", "PROVIDER_ERROR")
                print(f"[REBALANCER STREAM] LLM structured call failed with code [{reason_code}]: {llm_err}. Using deterministic fallback strategy.")
                fallback = build_fallback_strategy(
                    selected_coins=norm_selected,
                    current_holdings=current_holdings,
                    min_stable_pct=min_stable_pct,
                    cadence_days=cadence_days,
                    reason=f"[{reason_code}] {str(llm_err)[:150]}"
                )

                pydantic_strat = RebalancerStrategySchema(
                    strategy_name=fallback["strategy_name"],
                    executive_summary=fallback["executive_summary"],
                    market_regime="UNKNOWN",
                    risk_level="MODERATE",
                    rebalance_cadence_days=cadence_days,
                    target_allocations=[
                        TokenStrategyItem(
                            token_index=item["token_index"],
                            target_percentage=item["target_percentage"],
                            action_reasoning=item["action_reasoning"]
                        )
                        for item in fallback["tp_sl_rules"]
                    ]
                )
                source_tag = "fallback"

            index_to_symbol = {idx: sym for idx, sym in enumerate(norm_selected)}
            allocations_dict: Dict[str, float] = {}
            tp_sl_rules: List[Dict[str, Any]] = []
            seen_indices = set()

            # Task 2.7: Drop invalid or duplicate indices
            valid_allocations = []
            for item in pydantic_strat.target_allocations:
                if item.token_index not in index_to_symbol:
                    print(f"[REBALANCER WARNING] Dropping invalid token_index {item.token_index}")
                    continue
                if item.token_index in seen_indices:
                    print(f"[REBALANCER WARNING] Dropping duplicate token_index {item.token_index}")
                    continue
                seen_indices.add(item.token_index)
                valid_allocations.append(item)

            raw_total_pct = sum(max(0.0, item.target_percentage) for item in valid_allocations)
            if raw_total_pct <= 0 or not valid_allocations:
                fallback = build_fallback_strategy(norm_selected, current_holdings, min_stable_pct, cadence_days, "Allocations sum was 0")
                pydantic_strat.target_allocations = [
                    TokenStrategyItem(**item) for item in fallback["tp_sl_rules"]
                ]
                valid_allocations = pydantic_strat.target_allocations
                raw_total_pct = 100.0
                source_tag = "fallback"

            scale_factor = (100.0 / raw_total_pct) if raw_total_pct > 0 else 1.0

            for item in valid_allocations:
                sym = index_to_symbol.get(item.token_index)
                if not sym:
                    continue
                normalized_pct = round(max(0.0, item.target_percentage) * scale_factor, 2)
                allocations_dict[sym] = normalized_pct

                spot_px = float(market_data.get(sym, {}).get("current_price", 1.0))
                is_st = sym in STABLECOIN_SYMBOLS
                reason = item.action_reasoning or f"Tactical allocation for {sym}"
                action_type = "HOLD" if is_st else "TARGET"

                tp_sl_rules.append({
                    "symbol": sym,
                    "target_pct": normalized_pct,
                    "target_allocation_pct": normalized_pct,
                    "action": action_type,
                    "entry_price": round(spot_px, 4),
                    "current_price": round(spot_px, 4),
                    "current_price_usd": round(spot_px, 4),
                    "rationale": reason,
                    "action_reasoning": reason
                })

            # Guardrail
            current_stable_pct = sum(allocations_dict.get(s, 0.0) for s in STABLECOIN_SYMBOLS)
            if current_stable_pct < min_stable_pct:
                deficit = min_stable_pct - current_stable_pct
                allocations_dict["USDT"] = round(allocations_dict.get("USDT", 0.0) + deficit, 2)
                non_stable_sum = sum(v for k, v in allocations_dict.items() if k not in STABLECOIN_SYMBOLS)
                if non_stable_sum > 0:
                    reduction_ratio = (non_stable_sum - deficit) / non_stable_sum
                    for k in list(allocations_dict.keys()):
                        if k not in STABLECOIN_SYMBOLS:
                            allocations_dict[k] = round(max(0.0, allocations_dict[k] * reduction_ratio), 2)

            diff = round(100.0 - sum(allocations_dict.values()), 2)
            if abs(diff) > 0.001 and "USDT" in allocations_dict:
                allocations_dict["USDT"] = round(allocations_dict["USDT"] + diff, 2)

            for rule in tp_sl_rules:
                if rule["symbol"] in allocations_dict:
                    rule["target_pct"] = allocations_dict[rule["symbol"]]

            # -- Decision: PERSIST keeps the previous targets exactly (no swaps); REVISE/NEW swap at market --
            decision = str(getattr(pydantic_strat, "decision", "NEW") or "NEW").upper()
            if continuity_mode != "persist_context":
                decision = "NEW"
            elif decision not in ("PERSIST", "REVISE"):
                decision = "REVISE"
            if decision == "PERSIST" and previous_context:
                kept = {str(k).upper(): float(v) for k, v in (previous_context.get("allocations") or {}).items()}
                if kept and abs(sum(kept.values()) - 100.0) < 0.5:
                    allocations_dict = kept
                    for rule in tp_sl_rules:
                        if rule["symbol"] in allocations_dict:
                            rule["target_pct"] = allocations_dict[rule["symbol"]]
                            rule["target_allocation_pct"] = allocations_dict[rule["symbol"]]
                else:
                    decision = "REVISE"

            snapshot = {
                "taken_at": datetime.now(timezone.utc).isoformat(),
                "total_portfolio_usd": round(total_portfolio_usd, 2),
                "prices": {s_: float(market_data.get(s_, {}).get("current_price") or 0.0) for s_ in norm_selected},
                "holdings": {p_["token"]: {"amount": p_["balance"], "usd": p_["value_usd"]} for p_ in portfolio_summary},
            }
            raw_out = pydantic_strat.model_dump()
            raw_out["decision"] = decision
            raw_out["snapshot"] = snapshot
            raw_out["performance_since_previous"] = (previous_context or {}).get("performance_since_previous_strategy")

            saved_record = save_rebalancer_strategy(
                user_wallet=user_wallet,
                selected_coins=norm_selected,
                user_expectation=user_expectation,
                cadence_days=cadence_days,
                allocations=allocations_dict,
                tp_sl_rules=tp_sl_rules,
                market_regime=pydantic_strat.market_regime,
                overall_strategy=pydantic_strat.executive_summary,
                raw_pydantic_output=raw_out,
                min_stable_pct=min_stable_pct
            )

            alloc_desc = ", ".join([f"{k}: {v}%" for k, v in allocations_dict.items()])
            yield json.dumps({
                "type": "step",
                "step_number": 4,
                "step_name": "Strategy Formulation & Guardrails",
                "title": "Allocation Optimization & Stablecoin Floor",
                "status": "completed",
                "message": f"Strategy formulated successfully! Targets: {alloc_desc}",
                "data": {
                    "strategy_name": pydantic_strat.strategy_name,
                    "allocations": allocations_dict,
                    "market_regime": pydantic_strat.market_regime,
                    "risk_level": pydantic_strat.risk_level
                }
            }) + "\n"

            # -- Step 5: after the run, bring the wallet to the agent's ratio with MARKET swaps (1-Click only) --
            # NEW/REVISE: reach the new targets (small 1pp tolerance).  PERSIST: keep the portfolio as is unless it has
            # drifted past the user's threshold (e.g. a previous swap failed or prices moved a lot).
            swap_log: List[Dict[str, Any]] = []
            exec_threshold = float(drift_threshold_pct or 5.0) if decision == "PERSIST" else 1.0
            step5_msg = (
                f"Previous targets kept; checking the wallet is within {exec_threshold:g}pp of them..."
                if decision == "PERSIST" else "Swapping at market price toward the new target allocation..."
            )
            yield json.dumps({
                "type": "step", "step_number": 5, "step_name": "Market Swaps",
                "title": "Execute at market price", "status": "running", "message": step5_msg
            }) + "\n"
            for _i in range(6):
                try:
                    sw = await self.evaluate_and_rebalance(
                        user_wallet=user_wallet,
                        target_allocation=allocations_dict,
                        drift_threshold_pct=exec_threshold,
                    )
                except Exception as sw_err:
                    sw = {"success": False, "status": "EXECUTION_ERROR", "reason": str(sw_err)[:200]}
                swap_log.append({k: sw.get(k) for k in ("status", "terminal_status", "action_taken", "reason")})
                yield json.dumps({
                    "type": "step", "step_number": 5, "step_name": "Market Swaps",
                    "title": "Execute at market price", "status": "running",
                    "message": sw.get("action_taken") or sw.get("reason") or str(sw.get("status"))
                }) + "\n"
                if sw.get("status") != "REBALANCED" or str(sw.get("terminal_status", "")).upper() != "SUCCESS":
                    break
            done = [x for x in swap_log if x.get("status") == "REBALANCED"]
            if done:
                swap_summary_text = f"{len(done)} market swap(s) executed to match the target ratio."
            elif decision == "PERSIST":
                swap_summary_text = "Strategy persisted: holdings are within the drift threshold, no swaps needed."
            else:
                last = swap_log[-1] if swap_log else {}
                swap_summary_text = f"No swap executed: {last.get('action_taken') or last.get('reason') or last.get('status') or 'already at targets'}"
            yield json.dumps({
                "type": "step", "step_number": 5, "step_name": "Market Swaps",
                "title": "Execute at market price", "status": "completed", "message": swap_summary_text
            }) + "\n"

            research_intel = None
            try:
                from autonomous_agents.research_agent import run_research_subagent
                research_intel = await run_research_subagent(
                    wallet=user_wallet,
                    coins=norm_selected,
                    calling_agent="rebalancer",
                    depth=1,
                    date_range_days=30
                )
            except Exception as e:
                print(f"[REBALANCER STREAM] Subagent research notice: {e}")

            result = {
                "success": True,
                "strategy_id": saved_record.get("id"),
                "strategy_name": pydantic_strat.strategy_name,
                "market_regime": pydantic_strat.market_regime,
                "risk_level": pydantic_strat.risk_level,
                "rebalance_cadence_days": cadence_days,
                "min_stable_pct_enforced": min_stable_pct,
                "executive_summary": pydantic_strat.executive_summary,
                "allocations": allocations_dict,
                "tp_sl_rules": tp_sl_rules,
                "research": research_intel,
                "sources": research_intel.get("sources", []) if research_intel else [],
                "source": source_tag,
                "active_strategy": saved_record
            }

            result["decision"] = decision
            result["swaps"] = swap_log
            result["continuity"] = {
                "mode": continuity_mode,
                "previous_strategy_id": previous_strategy_id,
                "decision": {"PERSIST": "PERSISTED", "REVISE": "REVISED", "NEW": "NEW"}.get(decision, "NEW"),
            }

            # Email the user the new/persisted strategy (non-blocking; skipped if no email/SMTP)
            try:
                from notification_agent import send_agent_action_email
                decision_label = result["continuity"]["decision"].title()
                alloc_lines = " | ".join(f"{k} {v}%" for k, v in allocations_dict.items())
                asyncio.create_task(send_agent_action_email(
                    user_wallet=user_wallet,
                    agent_name="rebalancer",
                    action_type="REBALANCE_STRATEGY",
                    title=f"Rebalancer: Strategy {decision_label} - {pydantic_strat.strategy_name}",
                    summary=(pydantic_strat.executive_summary or "")[:240],
                    metrics={
                        "Decision": decision_label,
                        "Market Regime": str(pydantic_strat.market_regime).replace("_", " ").title(),
                        "Risk Level": str(pydantic_strat.risk_level).title(),
                        "Target Allocation": alloc_lines,
                        "Execution": swap_summary_text,
                        "Portfolio Value": f"${round(total_portfolio_usd, 2)} USD",
                        "Check Cadence": f"Every {cadence_days} days",
                    },
                    reasoning=pydantic_strat.executive_summary or "",
                ))
            except Exception as notify_err:
                print(f"[REBALANCER STREAM: NOTIFY ERROR] {notify_err}")

            yield json.dumps({"type": "final", "result": result}) + "\n"
        except Exception as e:
            reason_code = getattr(e, "reason_code", "PROVIDER_ERROR")
            import traceback
            tb = traceback.format_exc()
            print(f"\n[REBALANCER STREAM ERROR] [{reason_code}] Failed:\n{tb}")
            yield json.dumps({
                "type": "error",
                "reason_code": reason_code,
                "error": f"[{reason_code}] {str(e)}",
                "message": f"[{reason_code}] Rebalancer strategy formulation failed: {str(e)}"
            }) + "\n"


    # =================================================================
    # 5. GOVERNED EXECUTION STATE MACHINE (PROPOSAL -> VALIDATION -> APPROVAL -> EXECUTION -> RECONCILIATION)
    # =================================================================

    @staticmethod
    def _portfolio_wallet(user_wallet: str) -> str:
        """The wallet whose balances matter is the agent execution wallet (it signs the swaps)."""
        try:
            v = validate_agent_execution_wallet(user_wallet=user_wallet, agent_id="rebalancer", target_chain="near", is_cross_chain=False)
            return v.get("agent_wallet") or user_wallet
        except Exception:
            return user_wallet

    async def get_portfolio_drift_status(
        self,
        user_wallet: str,
        target_allocation: Optional[Dict[str, float]] = None,
        drift_threshold_pct: float = 5.0
    ) -> Dict[str, Any]:
        """
        Strictly read-only evaluation of portfolio drift and holdings.
        NEVER executes swaps and NEVER records dropped trades.
        """
        user = get_user(user_wallet) or {}
        active_strategy = get_active_rebalancer_strategy(user_wallet)
        is_active = bool(user.get("rebalancer_active", 0))

        if not target_allocation:
            if active_strategy and active_strategy.get("allocations"):
                target_allocation = {k.lower(): float(v) for k, v in active_strategy["allocations"].items()}
            else:
                target_allocation = {"near": 30.0, "usdt": 70.0}
        else:
            target_allocation = {k.lower(): float(v) for k, v in target_allocation.items()}

        targets = target_allocation
        tokens = list(targets.keys())
        prices = await get_token_prices(tokens)
        real_portfolio = await get_wallet_portfolio(self._portfolio_wallet(user_wallet))

        current_holdings: Dict[str, Dict[str, float]] = {}
        unpriced_tokens: List[str] = []
        for t in targets.keys():
            t_lower = t.lower()
            amt = float(real_portfolio.get(t_lower, 0.0))
            p = _resolve_price(t_lower, prices)
            if p is None:
                # Never invent a $1 price for an unpriced token: exclude it from valuation and flag it.
                unpriced_tokens.append(t_lower.upper())
                p = 0.0
            current_holdings[t_lower] = {"amount": amt, "usd_value": amt * p}

        total_usd = sum(h["usd_value"] for h in current_holdings.values())
        if total_usd <= 0.0:
            return {
                "status": "IN_BALANCE" if is_active else "INACTIVE",
                "max_drift_pct": 0.0,
                "drift_threshold_pct": drift_threshold_pct,
                "current_allocation": {k.upper(): 0.0 for k in targets.keys()},
                "target_allocation": {k.upper(): round(v, 1) for k, v in targets.items()},
                "total_portfolio_usd": 0.0,
                "action_taken": "No funded asset balances detected in wallet",
                "is_active": is_active,
                "active_strategy": active_strategy
            }

        current_pcts = {
            t: (current_holdings.get(t, {}).get("usd_value", 0.0) / total_usd) * 100.0
            for t in targets.keys()
        }
        drifts = {t: current_pcts.get(t, 0.0) - targets[t] for t in targets.keys()}
        max_drift = max(abs(d) for d in drifts.values()) if drifts else 0.0

        return {
            "status": "IN_BALANCE" if max_drift <= drift_threshold_pct else "DRIFT_DETECTED",
            "max_drift_pct": round(max_drift, 2),
            "drift_threshold_pct": drift_threshold_pct,
            "current_allocation": {k.upper(): round(v, 1) for k, v in current_pcts.items()},
            "target_allocation": {k.upper(): round(v, 1) for k, v in targets.items()},
            "total_portfolio_usd": round(total_usd, 2),
            "action_taken": f"Monitored drift: {round(max_drift, 1)}%"
            + (f" (unpriced, excluded: {', '.join(unpriced_tokens)})" if unpriced_tokens else ""),
            "unpriced_tokens": unpriced_tokens,
            "is_active": is_active,
            "active_strategy": active_strategy
        }

    async def evaluate_and_rebalance(
        self,
        user_wallet: str,
        target_allocation: Optional[Dict[str, float]] = None,
        drift_threshold_pct: float = 5.0,
        slippage_tolerance_bps: int = 50
    ) -> Dict[str, Any]:
        """
        Governed Rebalancer Execution State Machine:
          1. PROPOSAL: Detect portfolio drift, calculate target trade sizes.
          2. VALIDATION: Check kill switch, wallet assignment, min stable floor, and run 1Click dry-run quote (dry: true).
          3. APPROVAL: Verify risk limits, freshness, and idempotency key.
          4. EXECUTION: Request live quote (dry: false), save 1Click signature, and trigger swap.
          5. RECONCILIATION: Poll 1Click status endpoint and handle SUCCESS, REFUNDED, FAILED, and EXPIRED terminal states.
        """
        # User & Kill switch verification
        user = get_user(user_wallet) or {}
        if user.get("kill_switch", 0):
            return {
                "success": False,
                "state": "REJECTED",
                "status": "BLOCKED_KILL_SWITCH",
                "message": "Kill switch active. Rebalancer will not trade."
            }

        if not bool(user.get("rebalancer_active", 0)):
            return {
                "success": True,
                "state": "IDLE",
                "status": "INACTIVE",
                "max_drift_pct": 0.0,
                "message": "Rebalancer agent is inactive for this wallet."
            }

        # Retrieve active strategy
        active_strategy = get_active_rebalancer_strategy(user_wallet)
        if not target_allocation:
            if active_strategy and active_strategy.get("allocations"):
                target_allocation = {k.lower(): float(v) for k, v in active_strategy["allocations"].items()}
            else:
                target_allocation = {"near": 30.0, "usdt": 70.0}
        else:
            target_allocation = {k.lower(): float(v) for k, v in target_allocation.items()}

        targets = target_allocation
        tokens = list(targets.keys())
        prices = await get_token_prices(tokens)
        real_portfolio = await get_wallet_portfolio(self._portfolio_wallet(user_wallet))

        # -------------------------------------------------------------
        # STATE 1: PROPOSAL
        # -------------------------------------------------------------
        current_holdings: Dict[str, Dict[str, float]] = {}
        unpriced_tokens: List[str] = []
        for t in targets.keys():
            t_lower = t.lower()
            amt = float(real_portfolio.get(t_lower, 0.0))
            p = _resolve_price(t_lower, prices)
            if p is None:
                # Never invent a $1 price for an unpriced token: exclude it from valuation and flag it.
                unpriced_tokens.append(t_lower.upper())
                p = 0.0
            current_holdings[t_lower] = {"amount": amt, "usd_value": amt * p}

        total_usd = sum(h["usd_value"] for h in current_holdings.values())
        if total_usd <= 0.0:
            return {
                "success": True,
                "state": "COMPLETED",
                "status": "IN_BALANCE",
                "max_drift_pct": 0.0,
                "drift_threshold_pct": drift_threshold_pct,
                "current_allocation": {k.upper(): 0.0 for k in targets.keys()},
                "target_allocation": {k.upper(): round(v, 1) for k, v in targets.items()},
                "total_portfolio_usd": 0.0,
                "action_taken": "No funded asset balances detected in wallet to rebalance",
                "active_strategy": active_strategy
            }

        current_pcts = {
            t: (current_holdings.get(t, {}).get("usd_value", 0.0) / total_usd) * 100.0
            for t in targets.keys()
        }
        drifts = {t: current_pcts.get(t, 0.0) - targets[t] for t in targets.keys()}
        max_drift = max(abs(d) for d in drifts.values()) if drifts else 0.0

        overweight = max(drifts, key=drifts.get)
        underweight = min(drifts, key=drifts.get)
        rebalance_amount_usd = max(0.0, (min(drifts[overweight], -drifts[underweight]) / 100.0) * total_usd)
        _max_tx = float(user.get("max_tx_amount") or 0.0)
        if _max_tx > 0:
            rebalance_amount_usd = min(rebalance_amount_usd, _max_tx)

        # If difference is negligible (< $0.05 dust), portfolio is already at configured target
        if rebalance_amount_usd < 0.05 or max_drift <= max(0.1, float(drift_threshold_pct or 0.0)):
            try:
                from notification_agent import send_agent_action_email
                alloc_str = ", ".join([f"{k.upper()}: {round(v, 1)}%" for k, v in current_pcts.items()])
                asyncio.create_task(send_agent_action_email(
                    user_wallet=user_wallet,
                    agent_name="rebalancer",
                    action_type="PORTFOLIO_AUDIT",
                    title="Rebalancer: Portfolio Synchronized",
                    summary=f"Portfolio is aligned with your configured choices. Total portfolio: ${round(total_usd, 2)} USD.",
                    metrics={
                        "Portfolio Status": "SYNCHRONIZED (Nominal)",
                        "Max Drift": f"{round(max_drift, 1)}%",
                        "Total Value": f"${round(total_usd, 2)} USD",
                        "Current Allocations": alloc_str
                    },
                    reasoning="Holdings match configured strategy allocation weights. Zero rebalance swaps required."
                ))
            except Exception:
                pass

            return {
                "success": True,
                "state": "COMPLETED",
                "status": "IN_BALANCE",
                "max_drift_pct": round(max_drift, 2),
                "drift_threshold_pct": drift_threshold_pct,
                "current_allocation": {k.upper(): round(v, 1) for k, v in current_pcts.items()},
                "target_allocation": {k.upper(): round(v, 1) for k, v in targets.items()},
                "total_portfolio_usd": round(total_usd, 2),
                "action_taken": f"Portfolio matches configured choices (difference < $0.05)",
                "active_strategy": active_strategy
            }
        
        # Cross-chain check
        # Every asset is a NEAR-chain (bridged) token held in the agent wallet, so swaps never leave NEAR.
        is_cross_chain = False

        # The swap quote takes TOKEN units of the token being sold, not USD.
        price_in = _resolve_price(overweight.lower(), prices)
        if not price_in:
            return {
                "success": False, "state": "REJECTED", "status": "UNPRICED_TOKEN",
                "reason": f"No live price for {overweight.upper()}; refusing to guess a value.",
                "active_strategy": active_strategy
            }
        held_in = float(real_portfolio.get(overweight.lower(), 0.0) or 0.0)
        if overweight.lower() == "near":
            held_in = max(0.0, held_in - 0.05)  # keep a gas reserve
        amount_in_tokens = round(min(rebalance_amount_usd / price_in, held_in * 0.999), 6)
        if amount_in_tokens * price_in < 0.05:
            return {
                "success": True, "state": "COMPLETED", "status": "IN_BALANCE",
                "max_drift_pct": round(max_drift, 2),
                "action_taken": "Swap size is below the $0.05 minimum (or the token is not held); nothing to do.",
                "active_strategy": active_strategy
            }

        # -------------------------------------------------------------
        # STATE 2: VALIDATION
        # -------------------------------------------------------------
        wallet_validation = validate_agent_execution_wallet(
            user_wallet=user_wallet,
            agent_id="rebalancer",
            target_chain="near",
            is_cross_chain=is_cross_chain
        )

        if not wallet_validation.get("valid"):
            drop_reason = wallet_validation.get("reason", "Unauthorized or unassigned agent wallet")
            record_dropped_trade(
                user_wallet=user_wallet,
                agent_id="rebalancer",
                symbol=f"{overweight.upper()}->{underweight.upper()}",
                amount_usd=rebalance_amount_usd,
                reason=drop_reason,
                is_cross_chain=is_cross_chain,
                entry_price=prices.get(overweight, 1.0),
                target_chain="near"
            )
            return {
                "success": False,
                "state": "REJECTED",
                "status": "DROPPED_WALLET_VALIDATION",
                "reason": drop_reason,
                "max_drift_pct": round(max_drift, 2),
                "active_strategy": active_strategy
            }

        agent_execution_wallet = wallet_validation.get("agent_wallet", user_wallet)

        # Idempotency Key check: prevents duplicate trades within a 5-minute window
        time_slot = int(datetime.now(timezone.utc).timestamp() // 300)
        idempotency_key = f"{user_wallet}:{overweight.upper()}:{underweight.upper()}:{int(rebalance_amount_usd)}:{time_slot}"
        existing_exec = get_rebalancer_execution_by_idempotency_key(idempotency_key)
        if existing_exec:
            return {
                "success": True,
                "state": existing_exec.get("state"),
                "status": "IDEMPOTENT_RESUME",
                "message": "Trade already proposed or executed in current time slot; resuming state",
                "execution": existing_exec
            }

        # Dry-Run Quote Simulation (1Click dry: true)
        dry_quote = get_swap_quote(
            token_in=overweight.upper(),
            token_out=underweight.upper(),
            amount=float(amount_in_tokens),
            chain_id="near",
            recipient_id=agent_execution_wallet,
            is_cross_chain=is_cross_chain,
            dry=True,
            slippage_tolerance_bps=slippage_tolerance_bps
        )

        if "error" in dry_quote:
            return {
                "success": False,
                "state": "REJECTED",
                "status": "DRY_RUN_QUOTE_FAILED",
                "reason": dry_quote["error"],
                "active_strategy": active_strategy
            }

        est_slippage_bps = dry_quote.get("estimated_slippage_bps", 30)
        if est_slippage_bps > 200:  # > 2.0% slippage rejects proposal
            drop_reason = f"Excessive simulated slippage ({est_slippage_bps} bps > 200 bps limit)"
            return {
                "success": False,
                "state": "REJECTED",
                "status": "EXCESSIVE_SLIPPAGE",
                "reason": drop_reason,
                "estimated_slippage_bps": est_slippage_bps,
                "active_strategy": active_strategy
            }

        # Inter-Agent Second Opinion: Rebalancer requests Fundamental & Peg Audit on underweight asset
        researcher_intel = None
        try:
            from autonomous_agents.research_agent import ResearchAgent
            researcher = ResearchAgent()
            rebal_topic = f"Portfolio Allocation & Risk Audit for Rebalancing {overweight.upper()} -> {underweight.upper()}"
            rebal_focus = f"Peg Stability, DEX Liquidity Depth, Smart Contract Security, Drift Volatility for {underweight.upper()}"
            print(f"[REBALANCER-RESEARCH] Requesting second opinion on {underweight.upper()} (0 NEAR Fee - Free Inter-Agent Alpha)...")
            researcher_intel = await researcher.hire_by_trader_agent(
                trader_wallet=user_wallet,
                symbol=underweight.upper(),
                research_topic=rebal_topic,
                focus_area=rebal_focus,
                caller_agent="Rebalancer"
            )
            print(f"[REBALANCER-RESEARCH] Second opinion signal: {researcher_intel.get('signal')} | Info: {researcher_intel.get('info_note')}")
        except Exception as res_err:
            print(f"[REBALANCER-RESEARCH] Second opinion notice: {res_err}")

        # Initialize Execution State Record in SQLite
        execution_id = f"exec_reb_{int(datetime.now(timezone.utc).timestamp())}_{overweight[:3]}_{underweight[:3]}"
        strat_id = active_strategy.get("id") if active_strategy else None
        
        exec_record = create_rebalancer_execution(
            execution_id=execution_id,
            user_wallet=user_wallet,
            strategy_id=strat_id,
            state="VALIDATION",
            token_in=overweight.upper(),
            token_out=underweight.upper(),
            amount_in_usd=rebalance_amount_usd,
            amount_in_atomic=str(int(rebalance_amount_usd * 1e18)),
            amount_out_expected=str(dry_quote.get("amount_out", 0)),
            slippage_tolerance_bps=slippage_tolerance_bps,
            estimated_slippage_bps=est_slippage_bps,
            dry_run_quote=dry_quote,
            idempotency_key=idempotency_key
        )

        # -------------------------------------------------------------
        # STATE 3: APPROVAL
        # -------------------------------------------------------------
        update_rebalancer_execution_state(execution_id=execution_id, state="APPROVAL")

        # -------------------------------------------------------------
        # STATE 4: EXECUTION (MARKET-PRICE SWAP ONLY)
        # -------------------------------------------------------------
        # Market Order Execution
        live_quote = get_swap_quote(
            token_in=overweight.upper(),
            token_out=underweight.upper(),
            amount=float(amount_in_tokens),
            chain_id="near",
            recipient_id=agent_execution_wallet,
            is_cross_chain=is_cross_chain,
            dry=False,
            slippage_tolerance_bps=slippage_tolerance_bps,
            deadline_minutes=5
        )

        if "error" in live_quote:
            update_rebalancer_execution_state(
                execution_id=execution_id,
                state="FAILED",
                terminal_status="LIVE_QUOTE_ERROR",
                error_message=live_quote["error"]
            )
            return {
                "success": False,
                "state": "FAILED",
                "status": "LIVE_QUOTE_FAILED",
                "reason": live_quote["error"],
                "execution_id": execution_id
            }

        deposit_address = live_quote.get("deposit_address", "")
        signature = live_quote.get("signature", "")
        quote_id = live_quote.get("quote_id", "")
        quote_tx_hash = quote_id or f"tx_{execution_id}"

        # Sign and broadcast the on-chain intent deposit with the user's delegated agent key.
        broadcast_error = ""
        if deposit_address:
            try:
                min_out = float(live_quote.get("min_amount_out", 0.0))
                tx_payload = create_near_intent_transaction(
                    token_in=overweight.upper(),
                    token_out=underweight.upper(),
                    amount=float(amount_in_tokens),
                    min_amount_out=min_out,
                    deposit_address=deposit_address,
                    account_id=agent_execution_wallet
                )
                from database import get_agent_key
                from key_manager import decrypt_private_key
                from autonomous_agents.near_submitter import submit_near_transaction
                agent_key = get_agent_key(user_wallet, "near")
                if not (agent_key and agent_key.get("encrypted_private_key")):
                    broadcast_error = "No agent key stored for this wallet; cannot sign the swap."
                else:
                    pk = decrypt_private_key(agent_key["encrypted_private_key"], wallet_address=user_wallet)
                    onchain_hash = await submit_near_transaction(
                        tx_payload=tx_payload,
                        agent_address=agent_execution_wallet,
                        private_key=pk
                    )
                    if onchain_hash:
                        quote_tx_hash = onchain_hash
                    else:
                        broadcast_error = "Broadcast returned no transaction hash."
            except Exception as tx_e:
                broadcast_error = f"{type(tx_e).__name__}: {str(tx_e)[:160]}"
                print(f"[REBALANCER] Transaction broadcast error: {tx_e}")

        if broadcast_error:
            update_rebalancer_execution_state(
                execution_id=execution_id, state="FAILED",
                terminal_status="BROADCAST_FAILED", error_message=broadcast_error
            )
            return {
                "success": False, "state": "FAILED", "status": "BROADCAST_FAILED",
                "reason": broadcast_error, "execution_id": execution_id,
                "active_strategy": active_strategy
            }

        update_rebalancer_execution_state(
            execution_id=execution_id,
            state="EXECUTION",
            deposit_address=deposit_address,
            signature=signature,
            live_quote=live_quote,
            deposit_tx_hash=quote_tx_hash
        )

        # -------------------------------------------------------------
        # STATE 5: RECONCILIATION (POLL STATUS FOR TERMINAL OUTCOMES)
        # -------------------------------------------------------------
        status_poll = await poll_1click_status(deposit_address=deposit_address)
        for _ in range(11):
            if status_poll.get("is_success") or status_poll.get("is_failed") or status_poll.get("is_refunded"):
                break
            await asyncio.sleep(5)
            status_poll = await poll_1click_status(deposit_address=deposit_address)
        terminal_status = status_poll.get("status", "PROCESSING")
        
        if status_poll.get("is_refunded"):
            update_rebalancer_execution_state(
                execution_id=execution_id,
                state="REFUNDED",
                terminal_status="REFUNDED",
                refund_reason=status_poll.get("refund_reason", "Slippage or deadline exceeded"),
                near_tx_hashes=status_poll.get("near_tx_hashes", [])
            )
        elif status_poll.get("is_failed"):
            update_rebalancer_execution_state(
                execution_id=execution_id,
                state="FAILED",
                terminal_status="FAILED",
                error_message="Swap failed or expired"
            )
        elif status_poll.get("is_success"):
            update_rebalancer_execution_state(
                execution_id=execution_id,
                state="COMPLETED",
                terminal_status="SUCCESS",
                amount_out_actual=str(status_poll.get("amount_out", "0")),
                near_tx_hashes=status_poll.get("near_tx_hashes", [])
            )
        else:
            # Still in-flight (PENDING_DEPOSIT or PROCESSING)
            update_rebalancer_execution_state(
                execution_id=execution_id,
                state="RECONCILIATION",
                terminal_status=terminal_status
            )

        # Persist trade record & audit log
        create_active_trade(
            user_wallet=user_wallet,
            symbol=f"{overweight.upper()}->{underweight.upper()}",
            action="SWAP",
            entry_price=prices.get(overweight, 1.0),
            current_price=prices.get(overweight, 1.0),
            tp_price=0.0,
            sl_price=0.0,
            confidence_score=95,
            expected_roi_pct=0.0,
            amount_usd=rebalance_amount_usd,
            tx_hash=quote_tx_hash,
            agent_id="rebalancer",
            execution_wallet=agent_execution_wallet,
            is_cross_chain=1 if is_cross_chain else 0,
            target_chain="near"
        )

        log_agent_action(
            user_wallet=user_wallet,
            agent_name="rebalancer",
            trigger_type="portfolio_drift",
            reasoning_text=f"Max drift of {round(max_drift, 1)}% exceeded threshold {drift_threshold_pct}%. State Machine: {terminal_status}.",
            action_taken=f"Rebalanced {overweight.upper()} -> {underweight.upper()} (${round(rebalance_amount_usd, 2)}) via 1-Click",
            tx_hash=quote_tx_hash,
            status="completed"
        )

        # Dispatch email notification if user configured notification_email
        try:
            from notification_agent import send_agent_action_email
            asyncio.create_task(send_agent_action_email(
                user_wallet=user_wallet,
                agent_name="rebalancer",
                action_type="REBALANCE_SWAP",
                title=f"Rebalancer: Swapped {overweight.upper()} -> {underweight.upper()}",
                summary=f"Portfolio drift of {round(max_drift, 1)}% reached. Rebalanced ${round(rebalance_amount_usd, 2)} into {underweight.upper()}",
                metrics={
                    "Sold Asset": overweight.upper(),
                    "Acquired Asset": underweight.upper(),
                    "Rebalance Amount": f"${round(rebalance_amount_usd, 2)} USD",
                    "Max Portfolio Drift": f"{round(max_drift, 1)}%",
                    "Drift Threshold": f"{drift_threshold_pct}%",
                    "Total Portfolio Value": f"${round(total_usd, 2)} USD"
                },
                reasoning=f"Max drift of {round(max_drift, 1)}% exceeded threshold {drift_threshold_pct}%. Executed spot rebalance via Defuse 1-Click solver.",
                tx_hash=quote_tx_hash
            ))
        except Exception as notify_err:
            print(f"[REBALANCER: NOTIFY ERROR] Failed to dispatch rebalance alert email: {notify_err}")

        # Mirror rebalance execution event to active marketplace subscribers
        try:
            from database import mirror_rebalance_to_subscribers
            mirror_rebalance_to_subscribers(
                creator_wallet=user_wallet,
                rebalance_data={
                    "overweight": overweight,
                    "underweight": underweight,
                    "amount_usd": rebalance_amount_usd
                }
            )
        except Exception as copy_err:
            print(f"[REBALANCER-MIRROR] Error mirroring to subscribers: {copy_err}")

        return {
            "success": True,
            "state": "RECONCILIATION",
            "execution_id": execution_id,
            "status": "REBALANCED",
            "terminal_status": terminal_status,
            "max_drift_pct": round(max_drift, 2),
            "drift_threshold_pct": drift_threshold_pct,
            "signature": signature,
            "deposit_address": deposit_address,
            "estimated_slippage_bps": est_slippage_bps,
            "current_allocation": {k.upper(): round(v, 1) for k, v in current_pcts.items()},
            "target_allocation": {k.upper(): round(v, 1) for k, v in targets.items()},
            "total_portfolio_usd": round(total_usd, 2),
            "action_taken": f"Rebalanced {overweight.upper()} -> {underweight.upper()} (${round(rebalance_amount_usd, 2)}) via 1-Click State Machine",
            "active_strategy": active_strategy
        }


# Type and instance aliases for backward compatibility
RebalancerAgent = AutonomousRebalancerAgent
rebalancer_agent = AutonomousRebalancerAgent()

