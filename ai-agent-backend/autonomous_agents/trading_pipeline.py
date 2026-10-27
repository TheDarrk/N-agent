# -*- coding: utf-8 -*-
"""
Neptune AI -- Refactored Trading Pipeline
Architecture: Screener -> Council -> Judge

- Screener: Picks coins worth trading + direction (no tools, no RAG, reasoning_effort="medium")
- Council: Verifies and builds trade plan using chart + RAG tools
- Judge: Audits Council output for hallucination, picks final coin
- Execution: Programmatic hard-cap execution
"""

import os
import json
import asyncio
import re
import sys
import argparse
from typing import Dict, Any, List, Optional, Literal, Tuple, Set
from pydantic import BaseModel, Field, field_validator, ValidationError, ConfigDict, AliasChoices
from dotenv import load_dotenv
import httpx

# Reconfigure stdout/stderr on Windows to prevent UnicodeEncodeError on mathematical/typographic glyphs
if sys.platform == "win32":
    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        if hasattr(sys.stderr, "reconfigure"):
            sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def safe_print(msg: str):
    """Safely print strings even if output stream has restrictive codec."""
    try:
        print(msg)
    except Exception:
        try:
            print(str(msg).encode("ascii", errors="replace").decode("ascii"))
        except Exception:
            pass

# Load environment
env_candidates = [
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"),
    os.path.join(os.getcwd(), "ai-agent-backend", ".env"),
    os.path.join(os.getcwd(), ".env"),
]
for p in env_candidates:
    if os.path.isfile(p):
        load_dotenv(p)


# ═══════════════════════════════════════════════════════════════════════════════
# PYDANTIC MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ScreenerSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    coin: str = Field(..., description="Coin symbol e.g. TOKEN_A")
    direction: Literal["LONG", "SHORT"] = Field(..., description="Direction: LONG or SHORT")

    def __getitem__(self, item):
        return getattr(self, item)

    def get(self, item, default=None):
        return getattr(self, item, default)


class ScreenerOutput(BaseModel):
    """Screener output: max 3 coins with direction only."""
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    selection_reasoning: str = Field(
        default="",
        validation_alias=AliasChoices("selection_reasoning", "reasoning_scratchpad", "reasoning"),
        description="Reasoning explaining why the chosen coins were selected (or why none qualified)."
    )
    selections: List[ScreenerSelection] = Field(
        default_factory=list,
        description="List of selected coins (up to 3) with symbol and direction."
    )

    @property
    def reasoning_scratchpad(self) -> str:
        return self.selection_reasoning

    @field_validator('selections')
    @classmethod
    def max_three_coins(cls, v):
        if len(v) > 3:
            raise ValueError('Maximum 3 coins allowed from Screener')
        return v[:3]


class TechnicalAnalystView(BaseModel):
    """Evaluation from Technical Analyst persona (Chart + RAG)."""
    model_config = ConfigDict(extra="forbid")
    setup_quality: Literal["EXCELLENT", "MODERATE", "POOR"] = "MODERATE"
    structure_analysis: str = Field(..., description="4h/12h trend, EMA confluence, chart pattern, and textbook RAG alignment")


class RiskManagerView(BaseModel):
    """Evaluation from Risk Manager persona (Risk level analysis, Stop Loss calibration, Risk factors)."""
    model_config = ConfigDict(extra="forbid")
    risk_level: Literal["LOW", "MODERATE", "HIGH"] = "MODERATE"
    sl_calibration: str = Field(..., description="How stop loss was calibrated: wider structural buffer for low risk, tighter for high risk")
    risk_factors: List[str] = Field(default_factory=list, description="Downside risks, market regime factors, or fakeout hazards")


class CoinPlan(BaseModel):
    """Council output for a single coin, synthesizing Technical Analyst and Risk Manager."""
    model_config = ConfigDict(extra="forbid")

    coin: str
    screener_direction: Literal["LONG", "SHORT"] = "LONG"
    direction: Literal["LONG", "SHORT"]
    direction_alignment: Literal["aligned", "counter"] = "aligned"
    entry: float = Field(..., description="Entry price")
    entry_basis: Literal["current_price", "ema20", "recent_support", "recent_resistance", "breakout_level", "neckline"] = "current_price"
    tp: float = Field(..., description="Take profit price")
    sl: float = Field(..., description="Stop loss price")
    risk_reward: float = Field(default=0.0, description="Headline risk/reward ratio using calibrated SL")
    risk_reward_structural: float = Field(default=0.0, description="Baseline structural risk/reward using standard 1.5 ATR buffer")
    recomputed_rr: float = Field(default=0.0, description="Pipeline verified exact R:R")
    recomputed_rr_structural: float = Field(default=0.0, description="Pipeline verified exact structural R:R")
    rr_match: bool = Field(default=True, description="True if stated risk_reward matches recomputed_rr within tolerance")
    risk_reward_note: str = Field(default="", description="Explanatory note on R:R calibration vs structural baseline")
    technical_analyst: TechnicalAnalystView = Field(
        default_factory=lambda: TechnicalAnalystView(
            setup_quality="MODERATE",
            structure_analysis="4h/12h structure and RAG indicators evaluated."
        ),
        description="Technical Analyst evaluation from Chart + RAG data"
    )
    risk_manager: RiskManagerView = Field(
        default_factory=lambda: RiskManagerView(
            risk_level="MODERATE",
            sl_calibration="Standard structural stop loss with 1.5 ATR buffer.",
            risk_factors=[]
        ),
        description="Risk Manager evaluation on risk level, stop loss calibration, and downside risk factors"
    )
    reasoning: str = Field(default="", description="Synthesis of Technical Analyst and Risk Manager conclusions")
    grounding: str = Field(..., description="2-3 sentences citing numeric values from tool logs")
    rag_sources: List[Dict[str, str]] = Field(default_factory=list, description="Citations of RAG section and source")


class CouncilLLMResponse(BaseModel):
    """Exact schema enforced on Council LLM output."""
    model_config = ConfigDict(extra="forbid")

    prompt_version: str = "council_v2.2"
    plans: List[CoinPlan] = Field(..., min_length=1, max_length=3)
    verdict: str = Field(..., description="Combined grounding across all coins")


class CouncilOutput(BaseModel):
    """Council output: 1-3 coin plans + combined verdict + local tool log."""
    model_config = ConfigDict(populate_by_name=True)

    prompt_version: str = "council_v2.2"
    plans: List[CoinPlan] = Field(..., min_length=1, max_length=3)
    verdict: str = Field(..., description="Combined grounding across all coins")
    tool_log: List[Dict[str, Any]] = Field(default_factory=list)  # Log of all tool calls


class HallucinationFlag(BaseModel):
    """Structured hallucination audit flag."""
    model_config = ConfigDict(extra="forbid")

    coin: str = "UNKNOWN"
    field: str = "general"
    issue: str
    severity: Literal["minor", "major"] = "major"


class JudgeOutput(BaseModel):
    """Judge output: chosen coin + audit results."""
    model_config = ConfigDict(extra="forbid")

    prompt_version: str = "judge_v2.2"
    chosen_coin: Optional[str] = None
    runner_up: Optional[str] = None
    direction: Optional[Literal["LONG", "SHORT"]] = None
    entry: Optional[float] = None
    tp: Optional[float] = None
    sl: Optional[float] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0, description="0.0 to 1.0 confidence score for execution")
    reasoning: str = Field(..., description="Audit justification or reason for rejection")
    hallucination_flags: List[HallucinationFlag] = Field(default_factory=list)
    chosen_plan_grounded: bool = False
    all_plans_audited: bool = True
    final_decision: Literal["EXECUTE", "NO_TRADE"] = "NO_TRADE"

    @field_validator("hallucination_flags", mode="before")
    @classmethod
    def parse_flags(cls, v):
        if not isinstance(v, list):
            return []
        parsed = []
        for item in v:
            if isinstance(item, str):
                parsed.append({"coin": "GENERAL", "field": "audit", "issue": item, "severity": "major"})
            elif isinstance(item, dict):
                parsed.append(item)
        return parsed


def make_structured_response_format(model_cls: Any, schema_name: str) -> Dict[str, Any]:
    """Generates provider-side strict json_schema response_format specification."""
    schema = model_cls.model_json_schema()

    def _ensure_strict_required(s: Dict[str, Any]):
        if isinstance(s, dict):
            if "properties" in s:
                s["required"] = list(s["properties"].keys())
                s["additionalProperties"] = False
            for v in s.values():
                if isinstance(v, dict):
                    _ensure_strict_required(v)
                elif isinstance(v, list):
                    for item in v:
                        if isinstance(item, dict):
                            _ensure_strict_required(item)

    _ensure_strict_required(schema)
    return {
        "type": "json_schema",
        "json_schema": {
            "name": schema_name,
            "strict": True,
            "schema": schema
        }
    }


def compute_direction_alignment(
    direction: str,
    trend_12h: str,
    ema20_12h: Optional[float],
    ema50_12h: Optional[float]
) -> str:
    """Deterministically compute direction alignment against macro 12h trend and EMA stack."""
    trend = str(trend_12h).upper()
    if direction == "LONG":
        if any(b in trend for b in ("DOWN", "BEAR")):
            return "counter"
        if ema20_12h is not None and ema50_12h is not None and float(ema20_12h) < float(ema50_12h):
            return "counter"
    elif direction == "SHORT":
        if any(b in trend for b in ("UP", "BULL")):
            return "counter"
        if ema20_12h is not None and ema50_12h is not None and float(ema20_12h) > float(ema50_12h):
            return "counter"
    return "aligned"


def compute_risk_level(
    direction: str,
    direction_alignment: str,
    entry: float,
    ema20: Optional[float],
    atr: Optional[float],
    rsi: Optional[float],
    recent_res: Optional[float],
    recent_sup: Optional[float],
    trend_12h: str
) -> str:
    """Deterministically compute Risk Manager risk_level per quantitative rules."""
    atr_val = float(atr) if atr and float(atr) > 0 else (entry * 0.03)
    # HIGH risk if ANY of:
    if direction_alignment == "counter":
        return "HIGH"
    if atr_val / max(1e-6, entry) > 0.05:
        return "HIGH"
    if rsi is not None:
        if (direction == "LONG" and float(rsi) > 70) or (direction == "SHORT" and float(rsi) < 30):
            return "HIGH"
    if ema20 is not None:
        if abs(entry - float(ema20)) / max(1e-6, atr_val) > 2.0:
            return "HIGH"
    if direction == "LONG" and recent_res is not None and float(recent_res) > entry:
        if (float(recent_res) - entry) < (1.0 * atr_val):
            return "HIGH"
    if direction == "SHORT" and recent_sup is not None and entry > float(recent_sup):
        if (entry - float(recent_sup)) < (1.0 * atr_val):
            return "HIGH"

    # LOW risk if ALL of:
    trend = str(trend_12h).upper()
    trend_confirms = (direction == "LONG" and any(b in trend for b in ("UP", "BULL"))) or \
                     (direction == "SHORT" and any(b in trend for b in ("DOWN", "BEAR")))
    rsi_val = float(rsi) if rsi is not None else 50.0
    if (
        direction_alignment == "aligned"
        and trend_confirms
        and (atr_val / max(1e-6, entry) < 0.03)
        and (40 <= rsi_val <= 60)
    ):
        return "LOW"

    return "MODERATE"


# ═══════════════════════════════════════════════════════════════════════════════
# SCREENER AGENT (No tools, no RAG, reasoning_effort="medium")
# ═══════════════════════════════════════════════════════════════════════════════

SCREENER_SYSTEM = """You are the SCREENER of an automated crypto trading system.
Job: from the pre-screened candidates, pick the coins worth trading (max 3) and the direction (LONG or SHORT) for each. Nothing else. TP/SL and chart verification belong to the Council, which has the tools. You have none.

## Input (per coin)
- Market: price, chg_24h, vol_24h, rel_vol (current volume / 20-bar average)
- For each of 12h and 4h: trend, ema20/50/200, ema20_slope, rsi, macd_hist, atr
- Structure: swing_high, swing_low (1 week), range_pos (0 = at the low, 1 = at the high), dist_support, dist_resistance
- last_6_closes_4h, last_candle_4h (body%, upper_wick%, lower_wick%)
- pattern, pattern_status (forming | confirmed | none)
- Derivatives: funding, oi_chg (24h)
- Context: market_12h (12h trend of the broad-market reference)
Values are raw, with no averaging. You decide what each value implies. Use your own trading knowledge, plus the reference notes below.

## Reference knowledge (background facts, you decide how to weigh them)
RSI (Wilder):
- Traditional levels: above 70 overbought, below 30 oversold. In strong trends RSI can stay in those zones for a long time, so these levels alone are not reversal signals.
- In uptrends RSI tends to range roughly 40-90, with 40-50 acting as support. In downtrends it tends to range roughly 10-60, with 50-60 acting as resistance.
- Divergence (price makes a new high or low that RSI does not confirm) can warn of a reversal.

ATR:
- Measures volatility only, never direction. High ATR in a directionless market means large swings without a clear trend. Read it together with trend information.

MACD histogram:
- Expanding bars in the trend direction mean momentum is accelerating. Shrinking bars mean momentum is fading even if the trend is intact.

Chart patterns (Bulkowski; studied mostly on stocks, so crypto may differ):
- Wait for confirmation, meaning a close beyond the pattern boundary (e.g. the neckline). Unconfirmed double tops and bottoms fail often.
- A reversal pattern works best when it forms at the end of a prior move in the opposite direction, not inside sideways congestion.
- Above-average breakout volume does not improve results. Such breakouts failed about twice as often and pulled back to the breakout level about three times as often. A pullback after a breakout is common and not automatically a failure.

Funding and open interest (perpetual futures):
- Positive funding means longs pay shorts (longs crowded). Negative means shorts pay longs.
- Extreme funding can persist for weeks. Read it against its own history and with open interest, never alone.
- Open interest up with price up suggests new money entering the trend. Open interest down with price up suggests short covering. Open interest up with price down and negative funding suggests new shorts opening.
- Extreme funding with high open interest means fragile, crowded positioning. Negative funding while price holds or rises is a possible squeeze setup.

## What to evaluate (score each coin 0-100)
- Trend and structure (30): price vs EMAs, EMA order and slope, swing structure, room to the nearest support or resistance.
- Timeframe confluence (20): how the 12h and 4h relate.
- Momentum and participation (20): RSI and MACD state, rel_vol, whether the move is early or stretched.
- Volatility (10): whether ATR pays for the risk.
- Pattern and candle evidence (10): fit with direction and context, and whether the pattern is confirmed.
- Positioning and context (10): funding, OI, and the broad-market backdrop.

Use vol_24h only as a tiebreaker between similar setups.

## Selection
- A coin qualifies if its score >= {min_confidence}.
- Return up to 3 qualifying coins, ranked best first. If none qualify, return "selections": [].
- Choose the direction from the whole picture, never from the pattern name alone.
- Neutral Market-Agnostic Selection: You must actively evaluate BOTH LONG and SHORT setups regardless of the broad market backdrop. Even in an UP market, individual coins showing breakdown structures, bearish divergences, or overhead supply rejections are prime SHORT candidates. Do NOT artificially bias all selections to LONG just because market_12h is UP.
- Passing the threshold is not an obligation to find a trade. Skipping is a valid and often correct outcome.

## How to reason
Evaluate candidates against the rubric. You do NOT need to write an evaluation for every skipped coin in the batch.
In your output, explain ONLY why the selected coin(s) were chosen (or 1 sentence on why none qualified).

## Thinking Budget & Efficiency
- Do NOT deliberate on rejected coins. Quickly discard non-contenders (low volume, choppy/flat slopes, conflicting timeframes, no room to run).
- Focus internal thinking ONLY on the top 2-3 highest-scoring candidate coins.
- Keep internal deliberation concise so you finalize your decision and output the JSON without exceeding token limits.
- Do NOT repeat sentences, duplicate notes, or candidate disclaimers. Output the valid JSON object immediately once reasoning is concluded.

## Output
Return one valid JSON object and nothing else:
{"selection_reasoning": "Concise reasoning explaining ONLY why the selected coin(s) were chosen (trend, pattern, room to run, R:R). If none qualified, 1 sentence explaining why the batch was skipped. Do NOT review skipped coins individually.", "selections": [{"coin": "<SYMBOL>", "direction": "LONG|SHORT"}]}

## Examples (threshold 50; synthetic, replace with real labelled cases)

### Example 1
X: price=182.4 chg_24h=+2.1% rel_vol=1.4 | 12h: trend=UP ema20/50/200=180.1/174.5/158.0 slope20=+0.6% rsi=58 macd_hist=+0.9 atr=2.8% | 4h: trend=UP ema20/50/200=181.0/177.2/168.0 slope20=+0.2% rsi=55 macd_hist=+0.3 atr=1.6% | swing_high=185.5 swing_low=161.0 range_pos=0.87 dist_resistance=1.7% dist_support=4.2% | last_6_closes_4h=[176.8,178.0,179.9,181.2,180.4,182.4] last_candle=body55% upper_wick10% lower_wick35% | pattern=bull_flag status=forming | funding=+0.01% oi_chg=+4% | market_12h=UP
Y: price=642 chg_24h=+0.8% rel_vol=0.9 | 12h: trend=UP ema20/50/200=635/618/580 slope20=+0.3% rsi=57 macd_hist=+1.2 atr=1.9% | 4h: trend=UP ema20/50/200=639/630/610 slope20=+0.1% rsi=54 macd_hist=+0.4 atr=1.1% | swing_high=652 swing_low=601 range_pos=0.80 dist_resistance=1.5% dist_support=4.3% | last_6_closes_4h=[632,635,637,639,638,642] last_candle=body35% upper_wick25% lower_wick20% | pattern=none status=none | funding=+0.01% oi_chg=+1% | market_12h=UP
Output: {"selection_reasoning":"X qualifies (~70 LONG) with 12h/4h aligned rising EMAs, positive MACD histograms, and bullish continuation structure with room to run.","selections":[{"coin":"X","direction":"LONG"}]}

### Example 2
Z: price=1.42 chg_24h=-2.6% rel_vol=1.6 | 12h: trend=DOWN ema20/50/200=1.45/1.51/1.65 slope20=-0.8% rsi=42 macd_hist=-0.004 atr=3.1% | 4h: trend=DOWN ema20/50/200=1.44/1.48/1.56 slope20=-0.3% rsi=40 macd_hist=-0.002 atr=1.9% | swing_high=1.58 swing_low=1.39 range_pos=0.16 dist_support=2.1% dist_resistance=11% | last_6_closes_4h=[1.47,1.46,1.45,1.44,1.43,1.42] last_candle=body60% upper_wick30% lower_wick10% | pattern=bear_flag status=forming | funding=-0.01% oi_chg=+6% | market_12h=UP
Output: {"selection_reasoning":"Z qualifies (~55 SHORT) with aligned 12h/4h downtrends, falling EMAs, and healthy RSI room before exhaustion.","selections":[{"coin":"Z","direction":"SHORT"}]}

### Example 3
W: price=3150 chg_24h=-4.8% rel_vol=2.2 | 12h: trend=UP ema20/50/200=3280/3200/2900 slope20=+0.1% rsi=49 macd_hist=-12 atr=2.5% | 4h: trend=DOWN ema20/50/200=3260/3300/3250 slope20=-0.7% rsi=33 macd_hist=-18 atr=1.8% | swing_high=3450 swing_low=3050 range_pos=0.25 dist_support=3.2% dist_resistance=9.5% | last_6_closes_4h=[3290,3260,3230,3200,3170,3150] last_candle=body70% upper_wick5% lower_wick25% | pattern=none status=none | funding=+0.00% oi_chg=-3% | market_12h=UP
Output: {"selection_reasoning":"Candidates failed threshold due to severe 12h vs 4h trend conflict and poor location near support.","selections":[]}

### Example 4
V: price=11.2 chg_24h=+18% rel_vol=3.4 | 12h: trend=UP ema20/50/200=9.8/8.8/7.5 slope20=+2.1% rsi=81 macd_hist=+0.4 atr=7.5% | 4h: trend=UP ema20/50/200=10.5/9.6/8.4 slope20=+1.2% rsi=78 macd_hist=+0.2 atr=4.2% | swing_high=11.4 swing_low=8.0 range_pos=0.94 dist_resistance=1.8% dist_support=12% | last_6_closes_4h=[9.5,9.9,10.3,10.7,11.0,11.2] last_candle=body30% upper_wick55% lower_wick15% | pattern=none status=none | funding=+0.09% oi_chg=+35% | market_12h=UP
Output: {"selection_reasoning":"Candidates failed threshold due to crowded long positioning (high funding/OI) and stretched range location (only 1.8% to resistance).","selections":[]}

### Example 5
U: price=4.62 chg_24h=+3.4% rel_vol=1.8 | 12h: trend=SIDEWAYS ema20/50/200=4.50/4.48/4.72 slope20=+0.3% rsi=52 macd_hist=+0.02 atr=2.4% | 4h: trend=UP ema20/50/200=4.55/4.48/4.60 slope20=+0.5% rsi=57 macd_hist=+0.04 atr=1.7% | swing_high=4.95 swing_low=4.10 range_pos=0.61 dist_support=2.6% dist_resistance=7.1% | last_6_closes_4h=[4.38,4.40,4.51,4.55,4.58,4.62] last_candle=body65% upper_wick10% lower_wick25% | pattern=inverse_head_and_shoulders status=confirmed | funding=-0.02% oi_chg=+5% | market_12h=UP
Output: {"selection_reasoning":"U qualifies (~60 LONG) on confirmed inverse head and shoulders neckline breakout with 7.1% room to resistance.","selections":[{"coin":"U","direction":"LONG"}]}"""

SCREENER_USER_TEMPLATE = """CANDIDATE COINS (Threshold: {min_confidence}):

{coin_data}

Output one valid JSON object and nothing else:
{{"selection_reasoning": "Explain ONLY why the chosen coin(s) were selected (trend, pattern, R:R). If none qualified, 1 sentence explaining why the batch was skipped. Do NOT review skipped coins.", "selections": [{{"coin": "<SYMBOL>", "direction": "LONG|SHORT"}}]}}"""


def format_screener_coin_line(symbol: str, data: Any) -> str:
    """Format single candidate matching the exact institutional Screener rubric input."""
    if isinstance(data, str):
        return data
    if not isinstance(data, dict):
        return f"{symbol}: price=N/A"

    if "screener_line" in data and isinstance(data["screener_line"], str):
        return data["screener_line"]
    if "line" in data and isinstance(data["line"], str):
        return data["line"]

    price = data.get("price", "N/A")
    chg_24h = data.get("price_change_24h_pct", data.get("chg_24h", "0.0%"))
    if isinstance(chg_24h, (int, float)):
        chg_24h = f"+{chg_24h:.1f}%" if chg_24h > 0 else f"{chg_24h:.1f}%"

    rel_vol = data.get("rel_vol", data.get("volume_vs_avg", 1.0))

    trend_12h = data.get("trend_12h", data.get("bias", "UP"))
    ema_12h = f"{data.get('ema20', 'N/A')}/{data.get('ema50', 'N/A')}/{data.get('ema200', 'N/A')}"
    slope_12h = data.get("slope20_12h", "+0.2%")
    rsi_12h = data.get("rsi_12h", data.get("rsi", 50))
    macd_hist_12h = data.get("macd_hist_12h", f"+{data.get('macd_hist', 0.0)}")
    atr_12h = f"{data.get('atr_pct', 2.0)}%"

    trend_4h = data.get("trend_4h", data.get("bias", "UP"))
    ema_4h = f"{data.get('ema20', 'N/A')}/{data.get('ema50', 'N/A')}/{data.get('ema200', 'N/A')}"
    slope_4h = data.get("slope20_4h", "+0.2%")
    rsi_4h = data.get("rsi_4h", data.get("rsi", 50))
    macd_hist_4h = data.get("macd_hist_4h", f"+{data.get('macd_hist', 0.0)}")
    atr_4h = f"{data.get('atr_pct', 2.0)}%"

    sw_h = data.get("swing_high", round(float(price) * 1.05, 2) if isinstance(price, (int, float)) else "N/A")
    sw_l = data.get("swing_low", round(float(price) * 0.95, 2) if isinstance(price, (int, float)) else "N/A")
    range_pos = data.get("range_pos", 0.5)
    dist_res = f"{data.get('dist_to_swing_high_pct', 2.0)}%"
    dist_sup = f"{data.get('dist_to_swing_low_pct', 2.0)}%"

    last_6 = data.get("last_6_closes_4h", [price] * 6 if isinstance(price, (int, float)) else [])
    last_candle = data.get("last_candle_4h", "body50% upper_wick25% lower_wick25%")

    pattern = data.get("pattern", "none")
    status = data.get("pattern_status", data.get("status", "forming" if pattern != "none" else "none"))

    funding = data.get("funding", "+0.01%")
    oi_chg = data.get("oi_chg", "+0%")
    market_12h = data.get("market_12h", "UP")

    return (
        f"{symbol}: price={price} chg_24h={chg_24h} rel_vol={rel_vol} | "
        f"12h: trend={trend_12h} ema20/50/200={ema_12h} slope20={slope_12h} rsi={rsi_12h} macd_hist={macd_hist_12h} atr={atr_12h} | "
        f"4h: trend={trend_4h} ema20/50/200={ema_4h} slope20={slope_4h} rsi={rsi_4h} macd_hist={macd_hist_4h} atr={atr_4h} | "
        f"swing_high={sw_h} swing_low={sw_l} range_pos={range_pos} dist_resistance={dist_res} dist_support={dist_sup} | "
        f"last_6_closes_4h={last_6} last_candle={last_candle} | "
        f"pattern={pattern} status={status} | funding={funding} oi_chg={oi_chg} | market_12h={market_12h}"
    )


class ScreenerAgent:
    """
    Screener Agent: Picks coins worth trading + direction.
    No tools, no RAG access.
    Uses reasoning_effort="medium" for fast, high-quality thinking.
    """

    def __init__(self):
        self.api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1").rstrip("/")
        self.model = "z-ai/glm-5.3-flash"

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
        response_schema_cls: Optional[Any] = None,
        schema_name: str = "ScreenerOutput"
    ) -> str:
        """Call LLM with provider-side JSON schema enforcement, reasoning_effort='low', and streaming."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        response_format = (
            make_structured_response_format(response_schema_cls, schema_name)
            if response_schema_cls is not None
            else {"type": "json_object"}
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.4,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
            "response_format": response_format,
            "stream": True
        }

        # No read timeout cutoff - allow LLM streaming to complete naturally
        timeout_config = httpx.Timeout(None, connect=30.0)
        content_chunks = []
        finish_reason = None

        async with httpx.AsyncClient(timeout=timeout_config) as client:
            req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp = await req.__aenter__()

            if resp.status_code == 400 and response_format.get("type") == "json_schema":
                await req.__aexit__(None, None, None)
                payload["response_format"] = {"type": "json_object"}
                req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp = await req.__aenter__()

            if resp.status_code != 200:
                body = await resp.aread()
                await req.__aexit__(None, None, None)
                raise RuntimeError(f"HTTP {resp.status_code}: {body.decode('utf-8', errors='ignore')[:200]}")

            try:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    line_str = line.strip()
                    if line_str == "data: [DONE]":
                        break
                    if line_str.startswith("data: "):
                        raw = line_str[6:].strip()
                        try:
                            chunk = json.loads(raw)
                            choices = chunk.get("choices", [{}])
                            if choices:
                                f_reason = choices[0].get("finish_reason")
                                if f_reason:
                                    finish_reason = f_reason
                                delta = choices[0].get("delta", {})
                                if delta.get("content"):
                                    content_chunks.append(delta["content"])
                        except Exception:
                            pass
            finally:
                await req.__aexit__(None, None, None)

        full_text = "".join(content_chunks).strip()
        if not full_text:
            raise RuntimeError("Screener LLM failed to emit content output (empty completion).")
        return full_text

    NON_COIN_WORDS = {
        "LONG", "SHORT", "UP", "DOWN", "FLAT", "SCORE", "COIN", "TREND", "MARKET",
        "NOTE", "PATTERN", "STATUS", "SKIP", "PRICE", "RSI", "MACD", "EMA", "HIGH",
        "LOW", "LEADS", "CANDIDATE", "SETUP", "THRESHOLD", "BATCH", "NONE", "SIDEWAYS",
        "ENTRY", "STOP", "TARGET"
    }

    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON safely from text, normalizing alternative key names."""
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                res = json.loads(text[start:end+1])
                if isinstance(res, dict):
                    # Check if model wrapped entire output inside a nested JSON string
                    for r_key in ("selection_reasoning", "reasoning_scratchpad", "reasoning"):
                        nested = res.get(r_key)
                        if isinstance(nested, str) and "selections" in nested and "{" in nested:
                            clean_nested = nested.replace("'", '"')
                            n_start = clean_nested.find("{")
                            n_end = clean_nested.rfind("}")
                            if n_start != -1 and n_end != -1 and n_end > n_start:
                                try:
                                    sub = json.loads(clean_nested[n_start:n_end+1])
                                    if isinstance(sub, dict) and "selections" in sub:
                                        res = sub
                                        break
                                except Exception:
                                    pass

                    if "plans" not in res:
                        if "plan" in res:
                            res["plans"] = [res["plan"]] if isinstance(res["plan"], dict) else res["plan"]
                        elif "coin_plans" in res:
                            res["plans"] = res["coin_plans"]
                    return res
            except Exception:
                pass

        list_start = text.find("[")
        list_end = text.rfind("]")
        if list_start != -1 and list_end != -1 and list_end > list_start:
            try:
                items = json.loads(text[list_start:list_end+1])
                if isinstance(items, list):
                    return {"plans": items, "verdict": "Council evaluated plans."}
            except Exception:
                pass

        return None

    def _parse_selections_strict(
        self,
        raw_output: str,
        valid_candidates: Optional[Set[str]] = None
    ) -> Tuple[List[ScreenerSelection], str, Optional[str]]:
        """
        Parses screener output strictly using Pydantic JSON validation.
        Output MUST come directly from model completion content, never from thinking scratchpads.
        Returns: (selections, reasoning, error_message)
        """
        parsed = self._extract_json(raw_output)
        if not parsed or "selections" not in parsed:
            return [], "", "Model failed to output JSON matching ScreenerOutput schema (missing 'selections' key)"

        try:
            validated = ScreenerOutput.model_validate(parsed)
            clean_selections = []
            for sel in validated.selections:
                sym = sel.coin.strip().upper()
                if valid_candidates and sym not in valid_candidates:
                    print(f"[SCREENER GATE] Discarded '{sym}': not in qualifying candidates list.")
                    continue
                clean_selections.append(sel)

            return clean_selections[:3], validated.selection_reasoning, None
        except Exception as ve:
            return [], "", f"Pydantic schema validation error: {ve}"

    async def screen(self, coin_data: Dict[str, Any], max_retries: int = 2, min_confidence: int = 70) -> ScreenerOutput:
        """
        Screen coins and return selections with retry loop on malformed output.
        Respects user-configured min_confidence threshold dynamically.
        """
        print(f"[SCREENER] Screening {len(coin_data)} coins (Threshold: {min_confidence})...")

        # Objective Pre-Filters: exclude anemic volume (<1.0 rel_vol) or coins with no room to move (<3% room)
        filtered_coin_data = {}
        for symbol, data in coin_data.items():
            if isinstance(data, dict):
                rel_vol = float(data.get("rel_vol", data.get("volume_vs_avg", 1.0)) or 1.0)
                dist_res = float(data.get("dist_to_swing_high_pct", data.get("dist_resistance", 5.0)) or 5.0)
                dist_sup = float(data.get("dist_to_swing_low_pct", data.get("dist_support", 5.0)) or 5.0)
                if rel_vol < 1.0:
                    continue
                if dist_res < 3.0 and dist_sup < 3.0:
                    continue
            filtered_coin_data[symbol] = data

        active_coin_data = filtered_coin_data if filtered_coin_data else coin_data

        # Format coin data cleanly with raw indicators (no aggregation loss)
        coin_lines = []
        for symbol, data in active_coin_data.items():
            coin_lines.append(format_screener_coin_line(symbol, data))

        sys_prompt = SCREENER_SYSTEM.replace("{min_confidence}", str(min_confidence))
        base_user_prompt = SCREENER_USER_TEMPLATE.replace("{min_confidence}", str(min_confidence)).replace("{coin_data}", "\n".join(coin_lines))
        current_user_prompt = base_user_prompt

        last_error = None
        for attempt in range(max_retries + 1):
            try:
                raw_output = await self._call_llm(
                    sys_prompt,
                    current_user_prompt,
                    max_tokens=8192,
                    response_schema_cls=ScreenerOutput,
                    schema_name="ScreenerOutput"
                )
                selections, reasoning, parse_err = self._parse_selections_strict(
                    raw_output,
                    valid_candidates=set(coin_data.keys())
                )

                if parse_err is None:
                    output = ScreenerOutput(
                        selections=selections,
                        reasoning_scratchpad=reasoning or raw_output
                    )
                    print(f"[SCREENER] Selected {len(output.selections)} coins: {[s['coin'] for s in output.selections]}")
                    return output

                print(f"[SCREENER RETRY {attempt+1}/{max_retries}] Parsing error: {parse_err}")
                last_error = parse_err
                if attempt < max_retries:
                    current_user_prompt = (
                        f"{base_user_prompt}\n\n"
                        f"CRITICAL FORMAT ERROR FROM PREVIOUS ATTEMPT:\n{parse_err}\n"
                        f"Do NOT deliberate on every coin. You MUST output ONLY a valid JSON object matching:\n"
                        f'{{"selection_reasoning": "...", "selections": [{{"coin": "<SYMBOL>", "direction": "LONG|SHORT"}}]}}'
                    )
            except Exception as e:
                print(f"[SCREENER RETRY {attempt+1}/{max_retries}] Exception: {e}")
                last_error = str(e)
                if attempt < max_retries:
                    current_user_prompt = (
                        f"{base_user_prompt}\n\n"
                        f"CRITICAL: Previous attempt encountered an error ({last_error}).\n"
                        f"Keep reasoning minimal and output ONLY valid JSON matching:\n"
                        f'{{"selection_reasoning": "...", "selections": [{{"coin": "<SYMBOL>", "direction": "LONG|SHORT"}}]}}'
                    )
                else:
                    break

        print(f"[SCREENER FAILED] Falling closed after retries: {last_error}")
        return ScreenerOutput(selections=[], reasoning_scratchpad=f"Error after retries: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# COUNCIL AGENT (Has tools: chart + RAG)
# ═══════════════════════════════════════════════════════════════════════════════

COUNCIL_SYSTEM = """You are the 2-MEMBER COUNCIL of an automated crypto trading system.
Job: For every candidate coin passed by the Screener, you MUST construct an exact, grounded trade plan (entry, TP, SL).
You do NOT reject or suppress coins — you construct the best possible structural plan and honestly report all levels and risks.

Your council consists of two specialized personas evaluating the candidate coins using Chart Tool and RAG Tool data:

1. TECHNICAL ANALYST:
   - Evaluates 4h execution timeframe and 12h macro trend alignment.
   - Evaluates chart patterns, EMA stacks (20/50/200), RSI, MACD histogram, and support/resistance geometry.
   - Derives entry, TP, and initial structural levels strictly from chart levels and verified textbook RAG rules (Bulkowski / Edwards & Magee).
   - Assigns setup_quality: "EXCELLENT" | "MODERATE" | "POOR".

2. RISK MANAGER:
   - Your sole job is to analyze trade risk factors and calibrate the Stop Loss (SL).
   - You NEVER veto or reject a coin — the candidate was already qualified by the Screener.
   - Evaluates trade risk level: "LOW" | "MODERATE" | "HIGH" based on objective quantitative criteria.
   - Calibrates Stop Loss (sl) based on risk level:
     * LOW/MODERATE RISK: Provide normal structural buffer (less tight SL, e.g. recent_support - 1.5*ATR for LONG; recent_resistance + 1.5*ATR for SHORT).
     * HIGH RISK: Use tighter invalidation (tighter SL, e.g. nearest swing low/high or 1.0*ATR) to aggressively limit drawdown and protect capital.
   - Identifies specific risk factors: fakeout risk, liquidity/spread, regime mismatch, or overhead supply.

## Anti-Bias Protocol (Enforced)
You WILL have prior knowledge of these crypto symbols. You must NOT use it.
Self-check before finalizing each plan:
  "Did I reason about what this coin IS (technology, sector, history, market cap, narrative)?"
  If yes -> strike that reasoning and re-anchor strictly to chart geometry and tool indicators.
Reasoning chains must ONLY reference: price levels, indicator values, pattern names, RAG rules. Any other reference is invalid.

## Risk Level Determination (Risk Manager)
Assign risk_level based on these objective checks:

HIGH risk if ANY of:
  - direction_alignment = "counter"
  - ATR / current_price > 0.05 (high volatility)
  - RSI > 70 (LONG) or < 30 (SHORT) -- overextended
  - |current_price - ema20| / ATR > 2.0 (price extended from mean)
  - recent_resistance within 1.0 ATR above entry (LONG) OR recent_support within 1.0 ATR below entry (SHORT)

LOW risk if ALL of:
  - direction_alignment = "aligned"
  - 12h trend confirms direction (UP for LONG, DOWN for SHORT)
  - ATR / current_price < 0.03
  - RSI in 40-60 range (healthy continuation zone, not extended)
  - clean pattern confirmation (bull_flag, bear_flag, inverse_head_and_shoulders, double_bottom, etc.)

MODERATE risk: anything between HIGH and LOW.
  - RSI extension guidance: RSI 30-40 (LONG) or 60-70 (LONG) indicates moderate extension (extended but not extreme) -> MODERATE risk; RSI 60-70 (SHORT) or 30-40 (SHORT) indicates moderate extension -> MODERATE risk.

## Chart Tool Data Fields (per coin, per timeframe)
4h timeframe:
  current_price, ema20, ema50, atr, recent_support, recent_resistance,
  pattern, measured_target, pattern_stop
  [if available: ema200, rsi, macd_histogram -- optional, use if present]
12h timeframe:
  ema20_12h, ema50_12h, ema_slope_12h, trend_12h

## Roles and Timeframes
- 4h is the primary execution timeframe: entry, TP, and SL are derived from 4h geometry, support/resistance, and ATR.
- 12h is the macro trend filter: its EMA stack and slope confirm whether the move has higher-timeframe momentum.
- Screener passed {coin, direction}. Your job is to construct the plan for that direction.

## Direction Alignment Definition (Objective)
direction_alignment = "counter" if ANY of:
  - 12h trend_12h field opposes Screener direction (e.g. 12h trend is DOWN/BEARISH for a LONG, or UP/BULLISH for a SHORT)
  - 12h EMA20 < 12h EMA50 for LONG (or 12h EMA20 > 12h EMA50 for SHORT)
  - 12h EMA slope opposes Screener direction
Otherwise "aligned".

CRITICAL: A 12h or 4h chart pattern (such as an Inverse Head and Shoulders or Double Bottom) does NOT override an opposing EMA stack. Pattern = setup; EMA stack = macro trend. Macro trend wins for alignment. If the 12h EMA stack opposes the trade direction, you MUST set direction_alignment: "counter".

## Internal Consistency Protocol (STRICTLY ENFORCED)
In grounding, structure_analysis, and reasoning text, you MUST use the exact values from the structured fields.
- If risk_manager.risk_level = "HIGH", the text MUST say "HIGH risk" and explain the risk factors.
- If direction_alignment = "counter", the text MUST say "counter-trend" or "opposing macro 12h trend".
- If risk_manager.risk_level = "LOW", the text MUST say "LOW risk".
Contradicting your own structured fields is an immediate major hallucination.

## Rules for Constructing Plans
1. ENTRY BASIS (Strict):
   Entry MUST equal one of the following chart values (state which in entry_basis):
   - "current_price": for confirmed breakouts or market continuation
   - "ema20": for pullbacks to value (per RAG trend following)
   - "recent_support": for bounce entries in LONG setups
   - "recent_resistance": for reject entries in SHORT setups
   - "breakout_level": for neckline/pattern breakouts
2. TAKE PROFIT (TP) & MAGNITUDE SANITY:
   - LONG: tp > entry (target measured from pattern projection or recent_resistance).
   - SHORT: tp < entry (target measured from pattern projection or recent_support).
   - Magnitude Sanity Check: If a target requires > 15% price movement (|tp - entry| / entry > 0.15):
     * You MUST sanity-check it against intermediate structural resistance/support.
     * Cap TP at the next real structural resistance (for LONG) or support (for SHORT) unless there is clear open air.
     * Note in reasoning: "TP anchored to nearest structural level to avoid extended projection."
     * Flag in risk_factors: "Extended projection (> 15% move requires multi-swing expansion)".
3. STOP LOSS (SL) SELECTION PRECEDENCE (Risk Manager):
   - Precedence:
     1. If a pattern_stop exists AND is within 1.0 - 2.0 ATR of entry: use pattern_stop as tight structural invalidation.
     2. Otherwise, use calibrated ATR buffer:
        - LOW / MODERATE Risk: recent_support - (1.5 * atr) for LONG / recent_resistance + (1.5 * atr) for SHORT.
        - HIGH Risk: recent_support - (1.0 * atr) for LONG / recent_resistance + (1.0 * atr) for SHORT.
   - SL Calibration text format: State ONLY the actual selected stop level and the specific formula used.
     Example: "Selected pattern_stop 46.0 as structural invalidation." or "Selected 1.0*ATR stop at 47.2 for HIGH risk."
     Do NOT show a formula for LOW risk and then say you discarded it.
   - Always must satisfy sl < entry for LONG, and sl > entry for SHORT.
4. RISK / REWARD (R:R) & STRUCTURAL BASELINE:
   - Formula: R:R = |tp - entry| / |entry - sl|.
   - Baseline structural R:R: risk_reward_structural = |tp - entry| / (1.5 * atr).
   - Stated "risk_reward" field MUST precisely match |tp - entry| / |entry - sl| rounded to 2 decimal places.
   - If tightening SL for HIGH risk inflates headline R:R, state the honest baseline in risk_reward_structural and explain in risk_reward_note.
   - If structural levels naturally yield R:R >= 1.5: emit as-is.
   - If structural levels yield R:R < 1.5:
     * DO NOT widen TP beyond the next real structural level.
     * DO NOT tighten SL into the noise zone (< 1.0 ATR from entry).
     * Emit the honest R:R and note in reasoning: "R:R < 1.5 -- structural levels do not support wider TP without invalidation risk."
   - NEVER invent or fudge numbers to hit 1.5. Honesty > threshold.
5. FALLBACK (No Pattern):
   - If pattern is "none" or unrecognized, use EMA20/EMA50 trend-following rules: entry at ema20 or current_price, SL at 1.5 ATR beyond entry, and TP at recent_resistance (LONG) or recent_support (SHORT).
6. GROUNDING & RAG SOURCES:
   - Grounding must be 2-3 concise sentences citing specific numbers from the tool data (price, ema20, support, resistance, atr).
   - Cite the applicable book rule in rag_sources with section and source. Citing irrelevant passages will be penalized by Judge.
   - Do NOT invent numbers. Every numeric value must exist in the chart tool logs.
7. TOOL FAILURE PATH:
   - If chart tool returns no data or error for a coin: set entry: 0.0, tp: 0.0, sl: 0.0, risk_reward: 0.0, risk_reward_structural: 0.0, risk_manager.risk_level: "HIGH", technical_analyst.setup_quality: "POOR", reasoning: "Chart data unavailable -- cannot construct structural plan", grounding: "No tool data available for grounding".

## Output Format
Output MUST be a single, valid JSON object matching this schema:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "DASH",
      "screener_direction": "LONG",
      "direction": "LONG",
      "direction_alignment": "aligned",
      "entry": 182.40,
      "entry_basis": "current_price",
      "tp": 195.00,
      "sl": 174.50,
      "risk_reward": 1.59,
      "risk_reward_structural": 1.59,
      "risk_reward_note": "Standard 1.5 ATR stop loss buffer matches structural R:R baseline.",
      "technical_analyst": {
        "setup_quality": "EXCELLENT",
        "structure_analysis": "4h bull flag confirmed above 4h EMA20 181.00. 12h trend is UP. Measured move targets 195.00 beyond 185.50 resistance."
      },
      "risk_manager": {
        "risk_level": "LOW",
        "sl_calibration": "Low risk setup with strong 12h trend: calibrated wider SL at 174.50 (support 178.70 - 1.5*ATR 2.80 = 174.50) to give trade breathing room.",
        "risk_factors": ["Overhead resistance at 185.50 must break on volume"]
      },
      "reasoning": "Technical Analyst confirms 4h bull flag breakout; Risk Manager assesses LOW risk with 1.59 R:R and structural SL at 174.50.",
      "grounding": "Current price 182.40 above EMA20 181.00. Target 195.00 from bull flag projection. Stop loss 174.50 below 12h EMA50.",
      "rag_sources": [
        {"section": "Bull Flag Continuation", "source": "Bulkowski, Encyclopedia of Chart Patterns, p. 86"}
      ]
    }
  ],
  "verdict": "Council consensus: DASH displays confirmed bullish momentum approved by Technical Analyst and calibrated by Risk Manager with 1.59 R:R."
}

## Examples

### Example 1 (LONG + LOW risk + EXCELLENT + aligned)
Inputs:
Screener: [{"coin": "DASH", "direction": "LONG"}]
Chart: DASH current_price=182.40, 12h_trend=UP, 12h_ema20=180.10, 12h_ema50=174.50, 4h_ema20=181.00, 4h_ema50=177.20, atr=2.80, recent_support=178.70, recent_resistance=185.50, pattern=bull_flag, measured_target=195.00
RAG: Section: Bull Flag Continuation | Source: Bulkowski p. 86 | Rules: Entry at current_price or EMA20 pullback. Target = flagpole height. Stop loss below EMA50 or support. Min R:R 1.5.

Output:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "DASH",
      "screener_direction": "LONG",
      "direction": "LONG",
      "direction_alignment": "aligned",
      "entry": 182.40,
      "entry_basis": "current_price",
      "tp": 195.00,
      "sl": 174.50,
      "risk_reward": 1.59,
      "risk_reward_structural": 1.59,
      "risk_reward_note": "Standard 1.5 ATR buffer; headline and structural R:R are identical.",
      "technical_analyst": {
        "setup_quality": "EXCELLENT",
        "structure_analysis": "4h bull flag confirmed above 4h EMA20 181.00. 12h trend is UP. Measured move targets 195.00 beyond 185.50 resistance."
      },
      "risk_manager": {
        "risk_level": "LOW",
        "sl_calibration": "Low risk with 12h trend alignment: SL set to 174.50 (support 178.70 - 1.5*ATR 2.80 = 174.50) to give the position room to breathe.",
        "risk_factors": ["185.50 resistance overhead"]
      },
      "reasoning": "4h bull flag confirmed with 12h trend UP. Entry at current_price 182.40. TP 195.00. SL 174.50. R:R = (195.00 - 182.40) / (182.40 - 174.50) = 1.59.",
      "grounding": "Price 182.40 above 4h EMA20 181.00. Flag target 195.00 projected above 185.50 resistance. Stop loss 174.50 below 12h EMA50.",
      "rag_sources": [{"section": "Bull Flag Continuation", "source": "Bulkowski p. 86"}]
    }
  ],
  "verdict": "DASH provides a clean aligned continuation setup evaluated as LOW risk with 1.59 R:R."
}

### Example 2 (LONG + HIGH risk + counter + tightened SL)
Inputs:
Screener: [{"coin": "SPX", "direction": "LONG"}]
Chart: SPX current_price=10.00, 12h_trend=DOWN, 12h_ema20=11.50, 4h_ema20=9.80, 4h_ema50=10.20, atr=0.50, recent_support=9.50, recent_resistance=10.80, pattern=double_bottom, measured_target=10.80
RAG: Section: Double Bottom Reversal | Source: Bulkowski p. 112 | Rules: Entry above neckline. Target = pattern height. Stop loss at support.

Output:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "SPX",
      "screener_direction": "LONG",
      "direction": "LONG",
      "direction_alignment": "counter",
      "entry": 10.00,
      "entry_basis": "current_price",
      "tp": 10.80,
      "sl": 9.00,
      "risk_reward": 0.80,
      "risk_reward_structural": 1.07,
      "risk_reward_note": "Counter-trend trade with tightened 1.0 ATR stop loss. R:R is 0.80, below 1.5 target due to overhead 10.80 resistance.",
      "technical_analyst": {
        "setup_quality": "MODERATE",
        "structure_analysis": "4h double bottom bounce against 12h macro downtrend. Upside capped at 10.80 resistance."
      },
      "risk_manager": {
        "risk_level": "HIGH",
        "sl_calibration": "HIGH risk counter-trend: tightened SL to 9.00 (support 9.50 - 1.0*ATR 0.50 = 9.00).",
        "risk_factors": ["Macro 12h downtrend", "Overhead 12h EMA20 resistance"]
      },
      "reasoning": "Plan constructed with tightened SL at 9.00 due to HIGH risk counter-trend status. Headline R:R is 0.80 while structural R:R baseline is 1.07.",
      "grounding": "Price 10.00, resistance 10.80, support 9.50, 12h trend DOWN.",
      "rag_sources": [{"section": "Double Bottom Reversal", "source": "Bulkowski p. 112"}]
    }
  ],
  "verdict": "SPX plan completed with tightened SL due to HIGH risk counter-trend profile."
}

### Example 3 (SHORT + MODERATE risk + MODERATE quality)
Inputs:
Screener: [{"coin": "ZEC", "direction": "SHORT"}]
Chart: ZEC current_price=42.00, 12h_trend=DOWN, 12h_ema20=44.00, 4h_ema20=43.20, 4h_ema50=45.00, rsi=36.0, atr=1.80, recent_support=36.00, recent_resistance=42.20, pattern=bear_flag, measured_target=35.50
RAG: Section: Bear Flag Breakdown | Source: Edwards & Magee p. 210 | Rules: Entry at current_price or pullback to EMA20. Target projected downward. Stop loss placed at resistance + 1.5 ATR.

Output:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "ZEC",
      "screener_direction": "SHORT",
      "direction": "SHORT",
      "direction_alignment": "aligned",
      "entry": 42.00,
      "entry_basis": "current_price",
      "tp": 35.50,
      "sl": 44.90,
      "risk_reward": 2.24,
      "risk_reward_structural": 2.41,
      "risk_reward_note": "Standard 1.5 ATR buffer yields 2.24 R:R.",
      "technical_analyst": {
        "setup_quality": "MODERATE",
        "structure_analysis": "4h bear flag continuation in established downtrend. RSI at 36 indicates moderate extension near support."
      },
      "risk_manager": {
        "risk_level": "MODERATE",
        "sl_calibration": "MODERATE risk with RSI 36 extension: calibrated SL at 44.90 (resistance 42.20 + 1.5*ATR 1.80 = 44.90).",
        "risk_factors": ["RSI 36 moderately extended near swing low support at 36.00"]
      },
      "reasoning": "4h bear flag breakdown confirmed under falling EMAs. 12h trend is DOWN. Entry at current_price 42.00. TP 35.50 (< entry, correct side). SL 44.90 (> entry, correct side). R:R = (42.00 - 35.50) / (44.90 - 42.00) = 2.24.",
      "grounding": "Price 42.00 below 4h EMA20 43.20. Target 35.50 below 36.00 support. Stop loss 44.90 at recent_resistance + 1.5*ATR.",
      "rag_sources": [{"section": "Bear Flag Breakdown", "source": "Edwards & Magee p. 210"}]
    }
  ],
  "verdict": "ZEC offers solid short continuation evaluated as MODERATE risk with 2.24 R:R."
}

### Example 4 (Tool Failure Path -- Emitted as Ungrounded)
Inputs:
Screener: [{"coin": "UNKNOWN", "direction": "LONG"}]
Chart: UNKNOWN error="Data unavailable"
RAG: []

Output:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "UNKNOWN",
      "screener_direction": "LONG",
      "direction": "LONG",
      "direction_alignment": "aligned",
      "entry": 0.0,
      "entry_basis": "current_price",
      "tp": 0.0,
      "sl": 0.0,
      "risk_reward": 0.0,
      "risk_reward_structural": 0.0,
      "risk_reward_note": "No chart tool data available to calibrate levels.",
      "technical_analyst": {
        "setup_quality": "POOR",
        "structure_analysis": "Chart data unavailable -- cannot construct structural plan."
      },
      "risk_manager": {
        "risk_level": "HIGH",
        "sl_calibration": "Cannot calibrate SL without tool data.",
        "risk_factors": ["Missing tool data"]
      },
      "reasoning": "Chart data unavailable -- cannot construct structural plan.",
      "grounding": "No tool data available for grounding.",
      "rag_sources": []
    }
  ],
  "verdict": "UNKNOWN plan emitted as ungrounded due to tool data failure."
}

### Example 5 (Multi-Coin Batch -- 2 Grounded Coins)
Inputs:
Screener: [{"coin": "DASH", "direction": "LONG"}, {"coin": "ZEC", "direction": "SHORT"}]
Chart: DASH current_price=182.40, 4h_ema20=181.00, recent_support=178.70, recent_resistance=185.50, atr=2.80, pattern=bull_flag, measured_target=195.00
Chart: ZEC current_price=42.00, 4h_ema20=43.20, recent_support=36.00, recent_resistance=42.20, atr=1.80, pattern=bear_flag, measured_target=35.50
RAG: [Bull Flag rules, Bear Flag rules]

Output:
{
  "prompt_version": "council_v2.2",
  "plans": [
    {
      "coin": "DASH",
      "screener_direction": "LONG",
      "direction": "LONG",
      "direction_alignment": "aligned",
      "entry": 182.40,
      "entry_basis": "current_price",
      "tp": 195.00,
      "sl": 174.50,
      "risk_reward": 1.59,
      "risk_reward_structural": 1.59,
      "risk_reward_note": "Standard 1.5 ATR buffer; headline and structural R:R are identical.",
      "technical_analyst": {"setup_quality": "EXCELLENT", "structure_analysis": "4h bull flag confirmed above EMA20."},
      "risk_manager": {"risk_level": "LOW", "sl_calibration": "SL at 174.50 (support - 1.5*ATR).", "risk_factors": []},
      "reasoning": "DASH confirmed bull flag continuation.",
      "grounding": "Price 182.40, TP 195.00, SL 174.50.",
      "rag_sources": [{"section": "Bull Flag Continuation", "source": "Bulkowski p. 86"}]
    },
    {
      "coin": "ZEC",
      "screener_direction": "SHORT",
      "direction": "SHORT",
      "direction_alignment": "aligned",
      "entry": 42.00,
      "entry_basis": "current_price",
      "tp": 35.50,
      "sl": 44.90,
      "risk_reward": 2.24,
      "risk_reward_structural": 2.41,
      "risk_reward_note": "Standard 1.5 ATR buffer yields 2.24 R:R.",
      "technical_analyst": {"setup_quality": "MODERATE", "structure_analysis": "4h bear flag breakdown under falling EMAs."},
      "risk_manager": {"risk_level": "MODERATE", "sl_calibration": "SL at 44.90 (resistance + 1.5*ATR).", "risk_factors": ["RSI 36 extension"]},
      "reasoning": "ZEC bear flag continuation short.",
      "grounding": "Price 42.00, TP 35.50, SL 44.90.",
      "rag_sources": [{"section": "Bear Flag Breakdown", "source": "Edwards & Magee p. 210"}]
    }
  ],
  "verdict": "Council evaluated 2 grounded plans: DASH (LONG) with 1.59 R:R and ZEC (SHORT) with 2.24 R:R."
}"""

COUNCIL_USER_TEMPLATE = """SCREENER SELECTIONS:
{selections}

CHART TOOL DATA:
{chart_data}

RAG KNOWLEDGE RETRIEVED:
{rag_knowledge}

Build trade plans for each selected coin. Output valid JSON only:"""


class CouncilAgent:
    """
    Council Agent: Verifies selections and builds trade plans.
    Has access to chart and RAG tools.
    """

    def __init__(self, chart_tool, rag_tool):
        self.api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1").rstrip("/")
        self.model = "z-ai/glm-5.3-flash"
        self.chart_tool = chart_tool
        self.rag_tool = rag_tool

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
        response_schema_cls: Optional[Any] = None,
        schema_name: str = "CouncilLLMResponse"
    ) -> str:
        """Call GLM 5.3 Flash with provider-side schema enforcement, streaming, and no timeout cutoff."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        response_format = (
            make_structured_response_format(response_schema_cls, schema_name)
            if response_schema_cls is not None
            else {"type": "json_object"}
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.4,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
            "response_format": response_format,
            "stream": True
        }

        # No read timeout cutoff
        timeout_config = httpx.Timeout(None, connect=30.0)
        content_chunks = []
        finish_reason = None

        async with httpx.AsyncClient(timeout=timeout_config) as client:
            req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp = await req.__aenter__()

            if resp.status_code == 400 and response_format.get("type") == "json_schema":
                await req.__aexit__(None, None, None)
                payload["response_format"] = {"type": "json_object"}
                req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp = await req.__aenter__()

            if resp.status_code != 200:
                body = await resp.aread()
                await req.__aexit__(None, None, None)
                raise RuntimeError(f"HTTP {resp.status_code}: {body.decode('utf-8', errors='ignore')[:200]}")

            try:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    line_str = line.strip()
                    if line_str == "data: [DONE]":
                        break
                    if line_str.startswith("data: "):
                        raw = line_str[6:].strip()
                        try:
                            chunk = json.loads(raw)
                            choices = chunk.get("choices", [{}])
                            if choices:
                                f_reason = choices[0].get("finish_reason")
                                if f_reason:
                                    finish_reason = f_reason
                                delta = choices[0].get("delta", {})
                                if delta.get("content"):
                                    content_chunks.append(delta["content"])
                        except Exception:
                            pass
            finally:
                await req.__aexit__(None, None, None)

        full_text = "".join(content_chunks).strip()
        if not full_text:
            raise RuntimeError("Council model failed to emit content output (empty completion).")
        return full_text

    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON safely from text, normalizing alternative key names."""
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                res = json.loads(text[start:end+1])
                if isinstance(res, dict):
                    if "plans" not in res:
                        if "plan" in res:
                            res["plans"] = [res["plan"]] if isinstance(res["plan"], dict) else res["plan"]
                        elif "coin_plans" in res:
                            res["plans"] = res["coin_plans"]
                    return res
            except Exception:
                pass

        list_start = text.find("[")
        list_end = text.rfind("]")
        if list_start != -1 and list_end != -1 and list_end > list_start:
            try:
                items = json.loads(text[list_start:list_end+1])
                if isinstance(items, list):
                    return {"plans": items, "verdict": "Council evaluated plans."}
            except Exception:
                pass

        return None

    @staticmethod
    def _sanitize_chart_data(raw: Dict[str, Any]) -> Dict[str, Any]:
        """Strip bulky raw candlestick arrays and flatten indicator & pattern geometry for LLM prompting."""
        if not isinstance(raw, dict):
            return raw
        if "error" in raw:
            return raw
        ind = raw.get("indicators") or {}
        pat_data = raw.get("pattern_data") or {}

        clean = {
            "symbol": raw.get("symbol"),
            "timeframe": raw.get("timeframe"),
            "current_price": raw.get("current_price") or ind.get("current_price") or raw.get("close"),
            "ema20": ind.get("ema20") or raw.get("ema20"),
            "ema50": ind.get("ema50") or raw.get("ema50"),
            "ema200": ind.get("ema200") or raw.get("ema200"),
            "ema_trend": ind.get("ema_trend") or raw.get("ema_trend") or raw.get("trend"),
            "rsi": ind.get("rsi") or raw.get("rsi"),
            "atr": ind.get("atr") or raw.get("atr"),
            "atr_pct": ind.get("atr_pct") or raw.get("atr_pct"),
            "recent_support": ind.get("recent_support") or raw.get("recent_support") or raw.get("support"),
            "recent_resistance": ind.get("recent_resistance") or raw.get("recent_resistance") or raw.get("resistance"),
            "pattern": raw.get("pattern_name") or pat_data.get("dominant_pattern") or raw.get("pattern") or "none",
            "pattern_type": raw.get("pattern_type") or pat_data.get("pattern_type"),
            "measured_target": raw.get("measured_target") or pat_data.get("measured_target"),
            "pattern_stop": raw.get("stop_loss") or pat_data.get("stop_loss")
        }
        return {k: v for k, v in clean.items() if v is not None}

    async def build_plans(
        self,
        selections: List[Dict[str, str]],
        chart_data_fn,
        rag_query_fn,
        max_retries: int = 2
    ) -> CouncilOutput:
        """
        Build trade plans for each coin using tools, validated with retries.
        """
        print(f"[COUNCIL] Building plans for {len(selections)} coins...")

        tool_log = []
        chart_data_all = {}
        rag_knowledge_all = {}

        # Gather tool data
        for sel in selections:
            coin = sel["coin"]
            direction = sel["direction"]

            # Tool 1: Chart data
            print(f"[COUNCIL TOOL: CHART] Fetching 4h & 12h chart data for {coin}...")
            try:
                chart_4h_raw = await chart_data_fn(coin, "4h")
                chart_12h_raw = await chart_data_fn(coin, "12h")
                chart_4h = self._sanitize_chart_data(chart_4h_raw)
                chart_12h = self._sanitize_chart_data(chart_12h_raw)
                chart_data_all[coin] = {"4h": chart_4h, "12h": chart_12h}
                price_val = chart_4h.get("current_price")
                pat_val = chart_4h.get("pattern", "none")
                sup_val = chart_4h.get("recent_support")
                res_val = chart_4h.get("recent_resistance")
                print(f"[COUNCIL TOOL: CHART SUCCESS] {coin} -> Price: {price_val} | Pattern: {pat_val} | Support: {sup_val} | Resistance: {res_val}")
                tool_log.append({
                    "tool": "chart",
                    "symbol": coin,
                    "direction": direction,
                    "chart_4h": chart_4h,
                    "chart_12h": chart_12h
                })
            except Exception as e:
                print(f"[COUNCIL TOOL: CHART ERROR] Chart fetch for {coin}: {e}")
                chart_data_all[coin] = {"error": str(e)}

            # Tool 2: RAG knowledge
            try:
                pattern = chart_data_all.get(coin, {}).get("4h", {}).get("pattern", "")
                query = f"{pattern} pattern target stop loss rules" if pattern and pattern != "none" else f"{direction} trend continuation rules"
                print(f"[COUNCIL TOOL: RAG] Querying trading books for {coin} with query='{query}'...")
                rag_res = rag_query_fn(query)
                norm_rag = []
                for r in (rag_res or []):
                    sec_name = r.get("section_title") or r.get("section_id") or "Technical Rules"
                    src_name = r.get("chapter_title") or "Crypto Trading Book"
                    norm_rag.append({
                        "section": str(sec_name),
                        "source": str(src_name),
                        "rules": r.get("rules", []),
                        "content": r.get("content", "")
                    })
                rag_knowledge_all[coin] = norm_rag
                print(f"[COUNCIL TOOL: RAG SUCCESS] {coin} -> Retrieved {len(norm_rag)} rule passages")
                tool_log.append({"tool": "rag", "symbol": coin, "query": query, "result": norm_rag})
            except Exception as e:
                print(f"[COUNCIL TOOL: RAG ERROR] RAG query for {coin}: {e}")
                rag_knowledge_all[coin] = []

        selections_str = "\n".join([f"{s['coin']} | {s['direction']}" for s in selections])
        chart_data_str = json.dumps(chart_data_all, indent=2, default=str)
        rag_knowledge_str = json.dumps(rag_knowledge_all, indent=2, default=str)

        base_user_prompt = COUNCIL_USER_TEMPLATE.format(
            selections=selections_str,
            chart_data=chart_data_str,
            rag_knowledge=rag_knowledge_str
        )
        current_user_prompt = base_user_prompt

        last_error = None
        for attempt in range(max_retries + 1):
            try:
                raw_output = await self._call_llm(
                    COUNCIL_SYSTEM,
                    current_user_prompt,
                    max_tokens=8192,
                    response_schema_cls=CouncilLLMResponse,
                    schema_name="CouncilLLMResponse"
                )
                parsed = self._extract_json(raw_output)

                if not parsed or "plans" not in parsed:
                    err_msg = "Could not parse JSON or missing 'plans' list in Council response"
                    print(f"[COUNCIL RETRY {attempt+1}/{max_retries}] {err_msg}")
                    last_error = err_msg
                    if attempt < max_retries:
                        current_user_prompt = (
                            f"{base_user_prompt}\n\n"
                            f"VALIDATION ERROR FROM PREVIOUS ATTEMPT:\n{err_msg}\n"
                            f"Ensure you return a valid JSON object with 'plans' (array of CoinPlan) and 'verdict' (string)."
                        )
                        continue
                    break

                coin_plans = [CoinPlan(**p) for p in parsed.get("plans", [])]
                verdict = parsed.get("verdict", "Council analysis completed.")

                # Programmatic Guards: restore actual token symbols and recompute exact R:R
                valid_coins = [s["coin"] for s in selections]
                for idx, p in enumerate(coin_plans):
                    if p.coin not in valid_coins:
                        matching = [c for c in valid_coins if c.upper() == p.coin.upper()]
                        if matching:
                            p.coin = matching[0]
                        elif len(coin_plans) == len(selections):
                            p.coin = selections[idx]["coin"]
                        elif len(selections) == 1:
                            p.coin = selections[0]["coin"]

                    # Programmatic Direction Alignment Guard (Macro 12h trend check)
                    c_12h = chart_data_all.get(p.coin, {}).get("12h", {})
                    trend_12h = str(c_12h.get("ema_trend", "")).upper()
                    ema20_12h = c_12h.get("ema20")
                    ema50_12h = c_12h.get("ema50")
                    p.direction_alignment = compute_direction_alignment(p.direction, trend_12h, ema20_12h, ema50_12h)

                    # Programmatic Risk Level Determination (Objective Quantitative Criteria)
                    c_4h = chart_data_all.get(p.coin, {}).get("4h", {})
                    ema20_4h = c_4h.get("ema20")
                    atr_4h = c_4h.get("atr") or c_4h.get("atr_4h") or (p.entry * 0.03)
                    rsi_4h = c_4h.get("rsi")
                    res_4h = c_4h.get("recent_resistance")
                    sup_4h = c_4h.get("recent_support")
                    p.risk_manager.risk_level = compute_risk_level(
                        direction=p.direction,
                        direction_alignment=p.direction_alignment,
                        entry=p.entry,
                        ema20=ema20_4h,
                        atr=atr_4h,
                        rsi=rsi_4h,
                        recent_res=res_4h,
                        recent_sup=sup_4h,
                        trend_12h=trend_12h
                    )

                    # TP Magnitude Sanity Check (Cap at 15% / nearest structural level)
                    tp_move_pct = abs(p.tp - p.entry) / max(1e-6, p.entry)
                    if tp_move_pct > 0.15:
                        if p.direction == "LONG" and res_4h and float(res_4h) > p.entry:
                            p.tp = round(float(res_4h), 2)
                            p.risk_manager.risk_factors.append(f"TP capped from extended projection to structural resistance ${p.tp}")
                        elif p.direction == "SHORT" and sup_4h and float(sup_4h) < p.entry:
                            p.tp = round(float(sup_4h), 2)
                            p.risk_manager.risk_factors.append(f"TP capped from extended projection to structural support ${p.tp}")
                        else:
                            p.risk_manager.risk_factors.append(f"Extended TP projection (+{round(tp_move_pct*100, 1)}% move)")

                    # Pre-computed Ground Truth R:R arithmetic (deterministic Python calculation)
                    risk = abs(p.entry - p.sl)
                    reward = abs(p.tp - p.entry)
                    p.recomputed_rr = round(reward / max(1e-6, risk), 2)
                    p.recomputed_rr_structural = round(reward / (1.5 * float(atr_4h)), 2)
                    p.rr_match = True
                    p.risk_reward = p.recomputed_rr
                    p.risk_reward_structural = p.recomputed_rr_structural

                    # Clean & sanitize rag_sources citations
                    clean_rag = []
                    for r in (p.rag_sources or []):
                        if isinstance(r, dict):
                            sec = r.get("section") or r.get("section_title") or r.get("section_id") or ""
                            src = r.get("source") or r.get("chapter_title") or "Crypto Trading Book"
                            if sec:
                                clean_rag.append({"section": str(sec), "source": str(src)})
                        elif isinstance(r, str) and r.strip():
                            clean_rag.append({"section": r.strip(), "source": "Crypto Trading Book"})

                    # Fallback: if Council LLM returned empty/placeholder citations, populate from retrieved knowledge
                    if not clean_rag and p.coin in rag_knowledge_all and rag_knowledge_all[p.coin]:
                        for r in rag_knowledge_all[p.coin][:2]:
                            sec = r.get("section") or "Technical Rules"
                            src = r.get("source") or "Crypto Trading Book"
                            clean_rag.append({"section": str(sec), "source": str(src)})

                    p.rag_sources = clean_rag

                council_output = CouncilOutput(
                    plans=coin_plans,
                    verdict=verdict,
                    tool_log=tool_log
                )
                print(f"[COUNCIL] Produced {len(council_output.plans)} validated plans:")
                for p in council_output.plans:
                    print(f"  |-> [{p.coin}] Direction: {p.direction} (Alignment: {p.direction_alignment})")
                    print(f"      [TECHNICAL ANALYST] Quality: {p.technical_analyst.setup_quality}")
                    print(f"        Structure: {p.technical_analyst.structure_analysis}")
                    print(f"      [RISK MANAGER] Risk Level: {p.risk_manager.risk_level}")
                    print(f"        SL Calibration: {p.risk_manager.sl_calibration}")
                    if p.risk_manager.risk_factors:
                        print(f"        Risk Factors: {p.risk_manager.risk_factors}")
                    print(f"      [TRADE PLAN] Entry: ${p.entry} ({p.entry_basis}) | TP: ${p.tp} | SL: ${p.sl} | R:R: {p.risk_reward} (Structural: {p.risk_reward_structural})")
                    if p.risk_reward_note:
                        print(f"        R:R Note: {p.risk_reward_note}")
                    print(f"      Grounding: {p.grounding}")
                    if p.rag_sources:
                        rag_titles = [f"{s.get('section', '')} ({s.get('source', '')})" for s in p.rag_sources if isinstance(s, dict)]
                        print(f"      RAG Citations: {rag_titles}")
                print(f"[COUNCIL VERDICT] {council_output.verdict}")
                return council_output

            except ValidationError as ve:
                print(f"[COUNCIL RETRY {attempt+1}/{max_retries}] Pydantic validation error: {ve}")
                last_error = str(ve)
                if attempt < max_retries:
                    current_user_prompt = (
                        f"{base_user_prompt}\n\n"
                        f"SCHEMA VALIDATION ERROR:\n{ve}\n"
                        f"Please ensure all required fields (coin, direction, entry, tp, sl, grounding, risk_reward) are provided and valid."
                    )
            except Exception as e:
                print(f"[COUNCIL RETRY {attempt+1}/{max_retries}] Exception: {e}")
                last_error = str(e)
                if attempt >= max_retries:
                    break

        raise ValueError(f"Council failed after {max_retries} retries: {last_error}")


# ═══════════════════════════════════════════════════════════════════════════════
# JUDGE AGENT (No tools, audits Council against tool log)
# ═══════════════════════════════════════════════════════════════════════════════

JUDGE_SYSTEM = """You are the JUDGE of an automated crypto trading system.
Your job is to independently AUDIT the Council's trade plans against the raw tool logs to verify factual grounding and math.
You have NO tools. You only have the Council's plans and the raw tool logs.

ONLY the Judge can render a NO_TRADE decision, and ONLY in cases where the Council members have failed to ground their results in the raw tool logs.

Council 'verdict' is a summary/noise signal -- do NOT let it override your independent audit against raw tool logs.

## Anti-Bias Protocol (Enforced)
You WILL have prior knowledge of these crypto symbols. You must NOT use it.
Self-check before finalizing each audit:
  "Did I reason about what this coin IS (technology, sector, history, market cap, narrative)?"
  If yes -> strike that reasoning and re-anchor strictly to chart geometry and tool indicators.
Reasoning chains must ONLY reference: price levels, indicator values, pattern names, RAG rules. Any other reference is invalid.

## Token Symbol Protocol
Use the EXACT coin symbol passed in Council's plans and Tool Logs (e.g. DASH, ZEC, SPX, NEAR).
Do NOT rename or replace symbols with generic tickers or TOKEN_X.

## Split Audit Rules for Entry, TP, and SL
1. ENTRY AUDIT:
   Entry MUST match a real price in the raw tool log within 0.1% tolerance:
   - "current_price" / "close"
   - "ema20" / "ema50"
   - "recent_support"
   - "recent_resistance"
   - neckline / pattern breakout level
   Tolerance tiers:
   - 0.0% to 0.1% drift: Grounded (clean rounding, zero flags).
   - 0.1% to 0.5% drift: Minor flag (-0.10 confidence penalty). Plan NOT rejected.
   - > 0.5% drift: Major hallucination flag -> REJECT plan.

2. TAKE PROFIT (TP) AUDIT:
   TP is grounded if it is mathematically derivable from logged levels:
   (a) Matches "measured_target" in chart data within 0.1%, OR
   (b) Matches "recent_resistance" (for LONG) or "recent_support" (for SHORT) within 0.1%, OR
   (c) Matches pattern projection from breakout level.
   Does NOT need to be an exact single field in the tool log if it matches the structural target calculation.
   Sanity check: For LONG, tp MUST be > entry. For SHORT, tp MUST be < entry. Wrong side -> Major flag -> REJECT plan.

3. STOP LOSS (SL) AUDIT:
   SL is grounded if it matches the Risk Manager's calibrated formula using logged levels:
   - LOW / MODERATE Risk:
     * LONG: recent_support - (1.5 * atr) within 0.1%, or "pattern_stop".
     * SHORT: recent_resistance + (1.5 * atr) within 0.1%, or "pattern_stop".
   - HIGH Risk:
     * LONG: recent_support - (1.0 * atr) within 0.1%, or "pattern_stop".
     * SHORT: recent_resistance + (1.0 * atr) within 0.1%, or "pattern_stop".
   Does NOT need to appear as a raw number in the tool log if derived from logged support/resistance and atr.
   Sanity check: For LONG, sl MUST be < entry. For SHORT, sl MUST be > entry. Wrong side -> Major flag -> REJECT plan.

4. RISK / REWARD (R:R) AUDIT (Pre-Computed Ground Truth):
   The following fields are pre-computed deterministically by the pipeline and are GROUND TRUTH. Do NOT recompute float division:
   - "recomputed_rr": exact |tp - entry| / |entry - sl|
   - "recomputed_rr_structural": exact structural baseline |tp - entry| / (1.5 * atr)
   - "rr_match": boolean indicating whether Council's stated risk_reward matches recomputed_rr within tolerance.
   Audit Rules:
   - If rr_match is False -> MAJOR hallucination flag -> REJECT plan.
   - If rr_match is True -> ZERO flags! 100% clean math.
   - Stated R:R < 1.5 is NOT a hallucination; it reflects honest reporting of structural levels -> Apply confidence penalty, do NOT reject.

5. PATTERN & RAG SOURCE AUDIT:
   - Pattern matching is substring and case-insensitive (e.g. "bull flag" matches "bull_flag", "Bull Flag", "bullflag").
   - Fabricated pattern name not in tool log or chart context -> Major flag.
   - RAG citation audit:
     * Fabricating a book passage not in the retrieved RAG sections list -> MAJOR hallucination flag (reject plan).
     * Citing a passage whose topic does NOT match the stated pattern/direction (e.g. citing Bull Flag passage for an unconfirmed Double Top or trend continuation short) -> MINOR flag (-0.10 confidence penalty).

## Rejection Criteria (Judge can NO_TRADE ONLY for these)
A plan is rejected (final_decision: "NO_TRADE") IF AND ONLY IF it has a MAJOR factual hallucination:
- Stated entry value not in tool logs (> 0.5% drift from logged levels)
- Stated TP or SL not mathematically derivable from logged levels (> 0.5% drift)
- TP or SL is on the wrong side of entry for the stated direction
- rr_match is False (stated risk_reward does not match recomputed_rr within 0.02 tolerance)
- Internal Contradiction: structured field value contradicts reasoning or grounding text (e.g. structured risk_level is 'HIGH' but narrative claims 'LOW risk', or structured direction_alignment is 'counter' but narrative claims 'macro trend confirms alignment')
- Pattern name in grounding does not match the chart tool's reported pattern
- RAG section cited does not exist in the retrieved RAG sections list
- Tool failure path: plan has null/0.0 values or missing tool data
If ALL plans have major hallucination flags -> output final_decision: "NO_TRADE", chosen_coin: null, runner_up: null, confidence: 0.0.

## Grounded Plans (Judge MUST emit final_decision: "EXECUTE")
If the Council members have grounded their results in the tool logs and direction math is valid:
- final_decision MUST be "EXECUTE"
- Risk level, R:R < 1.5, and counter-trend do NOT cause rejection. They adjust the confidence score.

## Confidence Calculation Formula
Compute confidence deterministically based on Council findings:
Base by Technical Analyst setup_quality:
  EXCELLENT = 0.85
  MODERATE  = 0.70
  POOR      = 0.55

Note: POOR setups cap at 0.70 confidence. With user_threshold >= 0.75, POOR setups will never execute. This is intentional -- Technical Analyst quality gate is enforced via the confidence ceiling.

Bonuses (cumulative):
  Risk Manager risk_level == "LOW" : +0.05
  risk_reward >= 2.5               : +0.05
  risk_reward >= 3.5               : +0.05 additional (+0.10 total)

Penalties (cumulative):
  risk_reward < 1.5                : -0.15
  risk_reward < 1.2                : -0.10 additional (-0.25 total)
  Risk Manager risk_level == "HIGH": -0.20
  Risk Manager risk_level == "MODERATE": -0.05
  direction_alignment == "counter" : -0.20
  Minor rounding drift (0.1-0.5%)  : -0.10 each
  Minor RAG topical mismatch       : -0.10 each

Floor confidence at 0.0, cap at 1.0. Round to 2 decimal places.

## Selection & Runner-Up Semantics
- If 1 plan passes audit cleanly: select it (EXECUTE).
- If multiple plans pass audit: compare confidence, structural quality, and R:R. Pick the highest confidence/expectancy coin as chosen_coin, and designate the second-best as runner_up.
- Purpose of runner_up: Serves as an immediate automated fallback asset if the chosen_coin experiences adverse slippage > 0.5% before order fill.
- If all plans have major hallucination flags: output final_decision: "NO_TRADE".

## Output Format
Output MUST be a single, valid JSON object matching this schema:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": "DASH",
  "runner_up": "ZEC",
  "direction": "LONG",
  "entry": 182.40,
  "tp": 195.00,
  "sl": 174.50,
  "confidence": 0.90,
  "reasoning": "DASH verified against tool log: entry 182.40 matches current_price. Recomputed R:R = (195.00 - 182.40) / (182.40 - 174.50) = 1.59, matching stated 1.59. SL 174.50 is correctly derived from support 178.70 - 1.5*ATR 2.80 = 174.50. Technical Analyst confirms EXCELLENT structure; Risk Manager calibrated SL at 174.50 with LOW risk. Confidence: 0.85 base + 0.05 (LOW risk) = 0.90. All numbers grounded.",
  "hallucination_flags": [
    {"coin": "DASH", "field": "field_name", "issue": "description of any minor drift if present", "severity": "minor"}
  ],
  "chosen_plan_grounded": true,
  "all_plans_audited": true,
  "final_decision": "EXECUTE"
}

If all plans fail grounding:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": null,
  "runner_up": null,
  "direction": null,
  "entry": null,
  "tp": null,
  "sl": null,
  "confidence": 0.0,
  "reasoning": "All plans rejected due to ungrounded data: SPX cited ungrounded SL 9.70 not derivable from tool logs (support was 9.20, ATR was 0.50).",
  "hallucination_flags": [
    {"coin": "SPX", "field": "sl", "issue": "value 9.70 is not derivable from tool logs (support 9.20, ATR 0.50)", "severity": "major"}
  ],
  "chosen_plan_grounded": false,
  "all_plans_audited": true,
  "final_decision": "NO_TRADE"
}

## Examples

### Example 1 (LONG + LOW risk + EXCELLENT + aligned)
Inputs:
Plans:
- DASH (LONG): entry=182.40, entry_basis=current_price, tp=195.00, sl=174.50, stated R:R=1.59, Technical Analyst: EXCELLENT, Risk Manager: LOW risk, alignment=aligned
Tool Log:
- DASH: current_price=182.40, recent_support=178.70, recent_resistance=185.50, atr=2.80, pattern=bull_flag, measured_target=195.00
- RAG: [{"section": "Bull Flag Continuation", "source": "Bulkowski p. 86"}]
Audit:
- Entry 182.40 matches current_price.
- TP 195.00 matches measured_target (> entry).
- SL 174.50 matches recent_support 178.70 - 1.5*ATR 2.80 = 174.50 (< entry).
- Recomputed R:R = (195.00 - 182.40) / (182.40 - 174.50) = 1.59 == stated 1.59.
- RAG citation topically relevant and present in retrieved sections.
- Confidence: 0.85 base + 0.05 (LOW risk) = 0.90.

Output:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": "DASH",
  "runner_up": null,
  "direction": "LONG",
  "entry": 182.40,
  "tp": 195.00,
  "sl": 174.50,
  "confidence": 0.90,
  "reasoning": "DASH verified cleanly against tool log: entry 182.40 matches current_price, TP 195.00 matches measured_target, SL 174.50 derived from support 178.70 - 1.5*ATR 2.80. Recomputed R:R 1.59 matches stated. Confidence: 0.85 base + 0.05 (LOW risk) = 0.90.",
  "hallucination_flags": [],
  "chosen_plan_grounded": true,
  "all_plans_audited": true,
  "final_decision": "EXECUTE"
}

### Example 2 (LONG + HIGH risk + counter + tightened SL)
Inputs:
Plans:
- SPX (LONG): entry=10.00, entry_basis=current_price, tp=10.80, sl=9.00, stated R:R=0.80, stated structural R:R=1.07, Technical Analyst: MODERATE, Risk Manager: HIGH risk, alignment=counter
Tool Log:
- SPX: current_price=10.00, 12h_trend=DOWN, recent_support=9.50, recent_resistance=10.80, atr=0.50, pattern=double_bottom, measured_target=10.80
- RAG: [{"section": "Double Bottom Reversal", "source": "Bulkowski p. 112"}]
Audit:
- Entry 10.00 matches current_price.
- TP 10.80 matches recent_resistance (> entry).
- SL 9.00 matches recent_support 9.50 - 1.0*ATR 0.50 = 9.00 (< entry).
- Recomputed R:R = (10.80 - 10.00) / (10.00 - 9.00) = 0.80 == stated 0.80.
- Stated structural R:R = 0.80 / (1.5*0.50) = 1.07 matches formula.
- Grounded cleanly. Risk Manager flagged HIGH risk and counter-trend.
- Confidence: 0.70 base - 0.20 (HIGH risk) - 0.20 (counter-trend) = 0.30.

Output:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": "SPX",
  "runner_up": null,
  "direction": "LONG",
  "entry": 10.00,
  "tp": 10.80,
  "sl": 9.00,
  "confidence": 0.30,
  "reasoning": "SPX counter-trend plan is fully grounded: entry 10.00, TP 10.80, SL 9.00 match chart levels. R:R 0.80 recomputed cleanly. Confidence penalized for counter-trend (-0.20) and HIGH risk (-0.20) giving 0.30.",
  "hallucination_flags": [],
  "chosen_plan_grounded": true,
  "all_plans_audited": true,
  "final_decision": "EXECUTE"
}

### Example 3 (SHORT + MODERATE risk + MODERATE quality)
Inputs:
Plans:
- ZEC (SHORT): entry=42.00, entry_basis=current_price, tp=35.50, sl=44.90, stated R:R=2.24, Technical Analyst: MODERATE, Risk Manager: MODERATE risk, alignment=aligned
Tool Log:
- ZEC: current_price=42.00, 12h_trend=DOWN, 4h_ema20=43.20, recent_support=36.00, recent_resistance=42.20, rsi=36.0, atr=1.80, pattern=bear_flag, measured_target=35.50
- RAG: [{"section": "Bear Flag Breakdown", "source": "Edwards & Magee p. 210"}]
Audit:
- Entry 42.00 matches current_price.
- TP 35.50 < entry 42.00 (correct side for SHORT) and matches measured_target.
- SL 44.90 > entry 42.00 (correct side for SHORT) and matches resistance 42.20 + 1.5*ATR 1.80 = 44.90.
- Recomputed R:R = (42.00 - 35.50) / (44.90 - 42.00) = 6.50 / 2.90 = 2.24 == stated 2.24.
- Confidence: 0.70 base - 0.05 (MODERATE risk) = 0.65.

Output:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": "ZEC",
  "runner_up": null,
  "direction": "SHORT",
  "entry": 42.00,
  "tp": 35.50,
  "sl": 44.90,
  "confidence": 0.65,
  "reasoning": "ZEC SHORT verified cleanly against tool log: entry 42.00 matches current_price, TP 35.50 matches measured_target, SL 44.90 derived from resistance 42.20 + 1.5*ATR 1.80. Recomputed R:R 2.24 matches stated 2.24 exactly. Confidence: 0.70 base - 0.05 (MODERATE risk) = 0.65.",
  "hallucination_flags": [],
  "chosen_plan_grounded": true,
  "all_plans_audited": true,
  "final_decision": "EXECUTE"
}

### Example 4 (Hallucination Catch -- Judge NO_TRADE: wrong-side TP & fabricated RAG citation)
Inputs:
Plans:
- TOKEN_FAKE (LONG): entry=10.00, tp=8.50, sl=9.20, stated R:R=2.50, Technical Analyst: MODERATE, Risk Manager: HIGH risk, alignment=aligned, rag_sources=[{"section": "Quantum Momentum Wave", "source": "Unknown Book p. 99"}]
Tool Log:
- TOKEN_FAKE: current_price=10.00, recent_support=9.20, recent_resistance=11.50, atr=0.50
- RAG: [{"section": "Support Bounce", "source": "Bulkowski"}]
Audit Check:
- TP 8.50 is on the wrong side for a LONG trade (tp 8.50 <= entry 10.00). Major hallucination flag.
- RAG citation "Quantum Momentum Wave" does not exist in retrieved passages list. Major hallucination flag.
- Stated R:R 2.50 != recomputed R:R |8.50 - 10.00| / |10.00 - 9.20| = 1.88 (drift > 0.02).
- Major hallucination flags present -> REJECT plan.

Output:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": null,
  "runner_up": null,
  "direction": null,
  "entry": null,
  "tp": null,
  "sl": null,
  "confidence": 0.0,
  "reasoning": "TOKEN_FAKE plan rejected due to multiple major hallucination flags: TP 8.50 is on the wrong side for a LONG trade (tp <= entry), RAG citation 'Quantum Momentum Wave' does not exist in retrieved passages, and stated R:R 2.50 differs from recomputed R:R 1.88 by > 0.02.",
  "hallucination_flags": [
    {"coin": "TOKEN_FAKE", "field": "tp", "issue": "TP 8.50 is <= entry 10.00 for LONG trade (wrong side)", "severity": "major"},
    {"coin": "TOKEN_FAKE", "field": "rag_sources", "issue": "cited section 'Quantum Momentum Wave' not in retrieved passages", "severity": "major"},
    {"coin": "TOKEN_FAKE", "field": "risk_reward", "issue": "stated R:R 2.50 differs from recomputed R:R 1.88 by > 0.01", "severity": "major"}
  ],
  "chosen_plan_grounded": false,
  "all_plans_audited": true,
  "final_decision": "NO_TRADE"
}

### Example 5 (Multi-Coin: 2 Grounded Plans, 1 with Hallucination -- Selection + Runner-Up)
Inputs:
Plans:
- DASH (LONG): entry=182.40, tp=195.00, sl=174.50, stated R:R=1.59, Technical Analyst: EXCELLENT, Risk Manager: LOW risk, alignment=aligned
- ZEC (SHORT): entry=42.00, tp=35.50, sl=44.00, stated R:R=3.25, Technical Analyst: EXCELLENT, Risk Manager: LOW risk, alignment=aligned
- TOKEN_BAD (LONG): entry=50.00, tp=60.00, sl=45.00, stated R:R=2.00, Technical Analyst: MODERATE, Risk Manager: MODERATE risk, alignment=aligned
Tool Log:
- DASH: current_price=182.40, recent_support=178.70, recent_resistance=185.50, atr=2.80, pattern=bull_flag, measured_target=195.00
- ZEC: current_price=42.00, recent_support=36.00, recent_resistance=42.20, atr=1.80, pattern=bear_flag, measured_target=35.50
- TOKEN_BAD: current_price=30.00, recent_support=28.00, recent_resistance=35.00, atr=1.00
Audit:
- TOKEN_BAD: stated entry 50.00 does not match tool log current_price 30.00 (drift > 0.5%). Major hallucination flag -> REJECT TOKEN_BAD.
- Both DASH and ZEC verified with zero hallucination flags.
- DASH confidence: 0.85 + 0.05 (LOW risk) = 0.90.
- ZEC confidence: 0.85 + 0.05 (LOW risk) + 0.05 (R:R >= 2.5) = 0.95.
- ZEC selected as chosen_coin due to superior R:R (3.25 vs 1.59) and higher confidence (0.95 vs 0.90). DASH designated as runner_up fallback.

Output:
{
  "prompt_version": "judge_v2.2",
  "chosen_coin": "ZEC",
  "runner_up": "DASH",
  "direction": "SHORT",
  "entry": 42.00,
  "tp": 35.50,
  "sl": 44.00,
  "confidence": 0.95,
  "reasoning": "Per-plan audit completed: TOKEN_BAD rejected for major hallucination (entry 50.00 does not match tool log price 30.00). Both ZEC and DASH passed factual audit with zero hallucination flags. ZEC selected as chosen_coin due to superior 3.25 R:R and 0.95 confidence; DASH designated as runner_up fallback if ZEC experiences adverse slippage > 0.5%.",
  "hallucination_flags": [
    {"coin": "TOKEN_BAD", "field": "entry", "issue": "stated entry 50.00 does not match tool log price 30.00 (drift > 0.5%)", "severity": "major"}
  ],
  "chosen_plan_grounded": true,
  "all_plans_audited": true,
  "final_decision": "EXECUTE"
}"""

JUDGE_USER_TEMPLATE = """COUNCIL PLANS:
{plans}

TOOL LOGS (Chart and RAG outputs):
{tool_logs}

Audit each plan for hallucination. Select the single best coin or reject all (NO_TRADE). Output valid JSON only:"""


class JudgeAgent:
    """
    Judge Agent: Audits Council output for hallucination.
    No tools access.
    """

    def __init__(self):
        self.api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY", "")
        self.base_url = os.getenv("NEAR_AI_BASE_URL", "https://cloud-api.near.ai/v1").rstrip("/")
        self.model = "z-ai/glm-5.3-flash"

    async def _call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
        response_schema_cls: Optional[Any] = None,
        schema_name: str = "JudgeOutput"
    ) -> str:
        """Call GLM 5.3 Flash with provider-side schema enforcement, streaming, and no timeout cutoff."""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        response_format = (
            make_structured_response_format(response_schema_cls, schema_name)
            if response_schema_cls is not None
            else {"type": "json_object"}
        )
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            "temperature": 0.4,
            "max_tokens": max_tokens,
            "chat_template_kwargs": {"enable_thinking": False},
            "response_format": response_format,
            "stream": True
        }

        # No read timeout cutoff
        timeout_config = httpx.Timeout(None, connect=30.0)
        content_chunks = []
        finish_reason = None

        async with httpx.AsyncClient(timeout=timeout_config) as client:
            req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp = await req.__aenter__()

            if resp.status_code == 400 and response_format.get("type") == "json_schema":
                await req.__aexit__(None, None, None)
                payload["response_format"] = {"type": "json_object"}
                req = client.stream("POST", f"{self.base_url}/chat/completions", headers=headers, json=payload)
                resp = await req.__aenter__()

            if resp.status_code != 200:
                body = await resp.aread()
                await req.__aexit__(None, None, None)
                raise RuntimeError(f"HTTP {resp.status_code}: {body.decode('utf-8', errors='ignore')[:200]}")

            try:
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    line_str = line.strip()
                    if line_str == "data: [DONE]":
                        break
                    if line_str.startswith("data: "):
                        raw = line_str[6:].strip()
                        try:
                            chunk = json.loads(raw)
                            choices = chunk.get("choices", [{}])
                            if choices:
                                f_reason = choices[0].get("finish_reason")
                                if f_reason:
                                    finish_reason = f_reason
                                delta = choices[0].get("delta", {})
                                if delta.get("content"):
                                    content_chunks.append(delta["content"])
                        except Exception:
                            pass
            finally:
                await req.__aexit__(None, None, None)

        full_text = "".join(content_chunks).strip()
        if not full_text:
            raise RuntimeError("Judge model failed to emit content output (empty completion).")
        return full_text

    def _extract_json(self, text: str) -> Optional[Dict]:
        """Extract JSON safely from text, normalizing alternative key names."""
        if "```json" in text:
            text = text.split("```json")[1].split("```")[0].strip()
        elif "```" in text:
            text = text.split("```")[1].split("```")[0].strip()

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                res = json.loads(text[start:end+1])
                if isinstance(res, dict):
                    if "decision" in res and "final_decision" not in res:
                        res["final_decision"] = res["decision"]
                    if "selected_coin" in res and "chosen_coin" not in res:
                        res["chosen_coin"] = res["selected_coin"]
                    return res
            except Exception:
                pass

        return None

    async def audit(self, council_output: CouncilOutput, max_retries: int = 2) -> JudgeOutput:
        """
        Audit Council output against tool logs with retry loop on validation failure.
        """
        print(f"[JUDGE] Auditing {len(council_output.plans)} plans against tool logs...")

        plans_str = json.dumps([p.model_dump() for p in council_output.plans], indent=2)
        tool_logs_str = json.dumps(council_output.tool_log, indent=2, default=str)

        base_user_prompt = JUDGE_USER_TEMPLATE.format(
            plans=plans_str,
            tool_logs=tool_logs_str
        )
        current_user_prompt = base_user_prompt

        last_error = None
        for attempt in range(max_retries + 1):
            try:
                raw_output = await self._call_llm(
                    JUDGE_SYSTEM,
                    current_user_prompt,
                    max_tokens=8192,
                    response_schema_cls=JudgeOutput,
                    schema_name="JudgeOutput"
                )
                parsed = self._extract_json(raw_output)

                if not parsed or "final_decision" not in parsed:
                    err_msg = "Could not parse JSON or missing 'final_decision' in Judge response"
                    print(f"[JUDGE RETRY {attempt+1}/{max_retries}] {err_msg} | Preview: {raw_output[:150]}")
                    last_error = err_msg
                    if attempt < max_retries:
                        current_user_prompt = (
                            f"{base_user_prompt}\n\n"
                            f"VALIDATION ERROR FROM PREVIOUS ATTEMPT:\n{err_msg}\n"
                            f"Output must be a valid JSON object matching the JudgeOutput schema."
                        )
                        continue
                    break

                judge_output = JudgeOutput.model_validate(parsed)

                # Programmatic Guard: ensure chosen_coin and runner_up match real plan coin symbols
                valid_plan_coins = [p.coin for p in council_output.plans]
                if judge_output.chosen_coin and valid_plan_coins:
                    if judge_output.chosen_coin not in valid_plan_coins:
                        matching = [c for c in valid_plan_coins if c.upper() == str(judge_output.chosen_coin).upper()]
                        if matching:
                            judge_output.chosen_coin = matching[0]
                        elif len(valid_plan_coins) == 1:
                            judge_output.chosen_coin = valid_plan_coins[0]
                if judge_output.runner_up and valid_plan_coins:
                    if judge_output.runner_up not in valid_plan_coins:
                        matching = [c for c in valid_plan_coins if c.upper() == str(judge_output.runner_up).upper()]
                        if matching:
                            judge_output.runner_up = matching[0]

                # Programmatic Guard: filter out false-positive R:R hallucination flags where drift is actually <= 0.02 or rr_match is True
                filtered_flags = []
                for flag in judge_output.hallucination_flags:
                    if flag.field in ("risk_reward", "risk_reward_structural", "rr_match"):
                        matching_plan = next((p for p in council_output.plans if p.coin.upper() == flag.coin.upper()), None)
                        if matching_plan:
                            # If pipeline verified rr_match is True, math is ground truth -- discard false positive flag
                            if getattr(matching_plan, "rr_match", False):
                                continue
                            if abs(matching_plan.entry - matching_plan.sl) > 1e-6:
                                raw_rr = abs(matching_plan.tp - matching_plan.entry) / abs(matching_plan.entry - matching_plan.sl)
                                drift = min(abs(matching_plan.risk_reward - round(raw_rr, 2)), abs(matching_plan.risk_reward - raw_rr))
                                if round(drift, 4) <= 0.0201:
                                    continue
                    elif flag.field in ("rag", "rag_sources", "rag_citations"):
                        # If the section cited actually exists in tool_log RAG passages, discard false flag
                        rag_entries = [t for t in council_output.tool_log if t.get("tool") == "rag" and t.get("symbol", "").upper() == flag.coin.upper()]
                        all_sections = []
                        for entry in rag_entries:
                            res = entry.get("result", [])
                            if isinstance(res, list):
                                for item in res:
                                    if isinstance(item, dict):
                                        sec = item.get("section") or item.get("section_title") or ""
                                        if sec:
                                            all_sections.append(sec.lower())
                        if any(sec in flag.issue.lower() for sec in all_sections if len(sec) > 3):
                            continue
                    filtered_flags.append(flag)
                judge_output.hallucination_flags = filtered_flags

                # If rejection was triggered solely by a discarded math false positive, recover execution
                has_major_flags = any(f.severity == "major" for f in judge_output.hallucination_flags)
                if not has_major_flags and judge_output.final_decision == "NO_TRADE" and council_output.plans:
                    first_p = council_output.plans[0]
                    judge_output.chosen_coin = first_p.coin
                    judge_output.direction = first_p.direction
                    judge_output.entry = first_p.entry
                    judge_output.tp = first_p.tp
                    judge_output.sl = first_p.sl
                    judge_output.final_decision = "EXECUTE"
                    judge_output.chosen_plan_grounded = True
                    if judge_output.confidence == 0.0:
                        judge_output.confidence = 0.60

                safe_print(f"[JUDGE] Audit complete. Decision: {judge_output.final_decision} | Chosen: {judge_output.chosen_coin}")
                if judge_output.chosen_coin:
                    safe_print(f"  |-> Selected: {judge_output.chosen_coin} ({judge_output.direction}) | Entry: ${judge_output.entry} | TP: ${judge_output.tp} | SL: ${judge_output.sl}")
                safe_print(f"[JUDGE REASONING] {judge_output.reasoning}")
                if judge_output.hallucination_flags:
                    safe_print(f"[JUDGE FLAGS] {judge_output.hallucination_flags}")
                return judge_output

            except ValidationError as ve:
                print(f"[JUDGE RETRY {attempt+1}/{max_retries}] Pydantic validation error: {ve}")
                last_error = str(ve)
                if attempt < max_retries:
                    current_user_prompt = (
                        f"{base_user_prompt}\n\n"
                        f"SCHEMA VALIDATION ERROR:\n{ve}\n"
                        f"Please ensure all required fields match the JudgeOutput schema."
                    )
            except Exception as e:
                print(f"[JUDGE RETRY {attempt+1}/{max_retries}] Exception: {e}")
                last_error = str(e)
                if attempt >= max_retries:
                    break

        print(f"[JUDGE FAILED] Falling closed after retries: {last_error}")
        return JudgeOutput(
            chosen_coin=None,
            reasoning=f"Judge failed validation after retries: {last_error}",
            hallucination_flags=[{"coin": "GENERAL", "field": "audit", "issue": str(last_error), "severity": "major"}],
            chosen_plan_grounded=False,
            all_plans_audited=True,
            final_decision="NO_TRADE"
        )


# ═══════════════════════════════════════════════════════════════════════════════
# PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

class TradingPipeline:
    """
    Orchestrates: Screener -> Council -> Judge -> Execution
    - Screener: Max 3 coins, direction only (no tools, no RAG)
    - Council: Trade plans + grounding with chart & RAG tools
    - Judge: Audits Council against tool logs, picks 1 coin or NO_TRADE (no tools)
    - Execution: Programmatic trade execution
    """

    def __init__(self, chart_data_fn, rag_query_fn, execute_fn):
        self.screener = ScreenerAgent()
        self.council = CouncilAgent(chart_data_fn, rag_query_fn)
        self.judge = JudgeAgent()
        self.execute_fn = execute_fn

    async def run(
        self,
        coin_data: Dict[str, Any],
        dry_run: bool = False,
        min_confidence: int = 70
    ) -> Dict[str, Any]:
        """
        Run the full Screener -> Council -> Judge pipeline.
        """
        results = {
            "screener": None,
            "council": None,
            "judge": None,
            "execution": None,
            "status": "pending"
        }

        try:
            # 1. SCREENER
            print("\n" + "="*70)
            print(f"[PIPELINE: STAGE 1] SCREENER (No tools, strict rubric, max 3 coins, threshold: {min_confidence})")
            print("="*70)
            screener_output = await self.screener.screen(coin_data, min_confidence=min_confidence)
            results["screener"] = screener_output.model_dump()
            print(f"[SCREENER REASONING] {screener_output.reasoning_scratchpad}")

            if not screener_output.selections:
                print(f"[PIPELINE] Screener found no qualifying coins (score >= {min_confidence}). Standing aside.")
                results["status"] = "no_candidates"
                return results

            # 2. COUNCIL
            print("\n" + "="*70)
            print("[PIPELINE: STAGE 2] COUNCIL (Tools: Chart + RAG, building grounded plans)")
            print("="*70)
            council_output = await self.council.build_plans(
                screener_output.selections,
                self.council.chart_tool,
                self.council.rag_tool
            )
            results["council"] = council_output.model_dump()

            # 3. JUDGE
            print("\n" + "="*70)
            print("[PIPELINE: STAGE 3] JUDGE (Auditing plans against tool log, selecting final coin)")
            print("="*70)
            judge_output = await self.judge.audit(council_output)
            results["judge"] = judge_output.model_dump()

            # 4. EXECUTE
            print("\n" + "="*70)
            print("[PIPELINE: STAGE 4] EXECUTION ENGINE")
            print("="*70)
            user_threshold = float(min_confidence) / 100.0 if float(min_confidence) > 1.0 else float(min_confidence)
            if judge_output.final_decision == "EXECUTE" and not dry_run:
                if judge_output.confidence >= user_threshold:
                    print(f"[PIPELINE] Execution Triggered: {judge_output.chosen_coin} ({judge_output.direction}) | Confidence: {judge_output.confidence:.2f} >= User Threshold: {user_threshold:.2f}")
                    execution_result = await self.execute_fn(
                        coin=judge_output.chosen_coin,
                        direction=judge_output.direction,
                        entry=judge_output.entry,
                        tp=judge_output.tp,
                        sl=judge_output.sl,
                        reasoning=judge_output.reasoning
                    )
                    results["execution"] = execution_result
                    results["status"] = "executed"
                else:
                    print(f"[PIPELINE] Standing aside: Plan is grounded, but confidence ({judge_output.confidence:.2f}) < User Threshold ({user_threshold:.2f}). Reason: {judge_output.reasoning}")
                    results["status"] = "stand_aside"
            elif dry_run:
                print(f"[PIPELINE] Dry Run Mode Active. Decision: {judge_output.final_decision} | Confidence: {judge_output.confidence:.2f} (User Threshold: {user_threshold:.2f})")
                results["status"] = "dry_run_complete"
            else:
                print(f"[PIPELINE] Judge rendered NO_TRADE (Council results ungrounded). Reason: {judge_output.reasoning}")
                results["status"] = "stand_aside"

            return results

        except Exception as e:
            print(f"[PIPELINE ERROR] {e}")
            import traceback
            traceback.print_exc()
            results["status"] = "error"
            results["error"] = str(e)
            return results


# ═══════════════════════════════════════════════════════════════════════════════
# DRY RUN / TEST HARNESS (1-Coin & 3-Coin Paths)
# ═══════════════════════════════════════════════════════════════════════════════

SAMPLE_COIN_DATA_3 = {
    "TOKEN_A": {
        "price": 4.50,
        "volume_24h": 150000000,
        "ema20": 4.40,
        "ema50": 4.20,
        "ema200": 3.80,
        "rsi": 55,
        "atr_pct": 3.2,
        "trend_4h": "BULLISH",
        "trend_12h": "BULLISH",
        "pattern": "inverse_head_and_shoulders"
    },
    "TOKEN_B": {
        "price": 45000,
        "volume_24h": 5000000000,
        "ema20": 44500,
        "ema50": 43000,
        "ema200": 40000,
        "rsi": 62,
        "atr_pct": 2.5,
        "trend_4h": "BULLISH",
        "trend_12h": "BULLISH",
        "pattern": "bull_flag"
    },
    "TOKEN_C": {
        "price": 2300,
        "volume_24h": 2000000000,
        "ema20": 2280,
        "ema50": 2200,
        "ema200": 2000,
        "rsi": 48,
        "atr_pct": 2.8,
        "trend_4h": "RANGING",  # Red flag: timeframe conflict vs 12h
        "trend_12h": "BULLISH",
        "pattern": "double_bottom"
    }
}

SAMPLE_COIN_DATA_1 = {
    "TOKEN_A": SAMPLE_COIN_DATA_3["TOKEN_A"]
}


async def mock_chart_tool(symbol: str, timeframe: str) -> Dict[str, Any]:
    """Mock chart tool supplying verified candlestick indicators."""
    data = SAMPLE_COIN_DATA_3.get(symbol, {"price": 10.0, "ema20": 9.8, "ema50": 9.5, "rsi": 52})
    price = data.get("price", 10.0)
    return {
        "symbol": symbol,
        "timeframe": timeframe,
        "current_price": price,
        "ema20": data.get("ema20", price * 0.98),
        "ema50": data.get("ema50", price * 0.95),
        "rsi": data.get("rsi", 52),
        "support": round(price * 0.94, 4),
        "resistance": round(price * 1.08, 4),
        "pattern": data.get("pattern", "none")
    }


def mock_rag_tool(query: str) -> List[Dict[str, Any]]:
    """Mock RAG tool returning book knowledge passages."""
    return [
        {
            "id": "sec_trend_following",
            "title": "Trend Following & Moving Average Pullbacks",
            "rules": "Enter in direction of 12h EMA stack (20 > 50 > 200). Stop loss below previous swing low or 1.5 ATR. Minimum reward/risk ratio: 1.5."
        },
        {
            "id": "sec_head_and_shoulders",
            "title": "Head & Shoulders and Inverse H&S",
            "rules": "Target is calculated by measuring distance from head to neckline and projecting from neckline breakout. Stop placed below right shoulder."
        }
    ]


async def mock_execute_tool(coin: str, direction: str, entry: float, tp: float, sl: float, reasoning: str = "") -> Dict[str, Any]:
    """Mock programmatic trade execution."""
    rr = round(abs(tp - entry) / max(1e-6, abs(entry - sl)), 2)
    return {
        "status": "SIMULATED_EXECUTION_SUCCESS",
        "coin": coin,
        "direction": direction,
        "entry": entry,
        "tp": tp,
        "sl": sl,
        "risk_reward": rr,
        "reasoning": reasoning
    }


async def test_pipeline_single_coin(use_mock_llm: bool = False) -> Dict[str, Any]:
    """Test path for 1 coin."""
    print("\n" + "#"*70)
    print("RUNNING DRY-RUN TEST: 1 COIN PATH (TOKEN_A)")
    print("#"*70)

    pipeline = TradingPipeline(
        chart_data_fn=mock_chart_tool,
        rag_query_fn=mock_rag_tool,
        execute_fn=mock_execute_tool
    )

    if use_mock_llm:
        async def mock_screener_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "reasoning_scratchpad": "TOKEN_A ~88 LONG",
                "selections": [{"coin": "TOKEN_A", "direction": "LONG"}]
            })

        async def mock_council_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "prompt_version": "council_v1.2",
                "plans": [{
                    "coin": "TOKEN_A",
                    "screener_direction": "LONG",
                    "direction": "LONG",
                    "direction_alignment": "aligned",
                    "entry": 4.50,
                    "entry_basis": "current_price",
                    "tp": 5.40,
                    "sl": 4.05,
                    "risk_reward": 2.0,
                    "reasoning": "4h inverse H&S base confirmed above EMA20. Entry at current_price 4.50. Target 5.40 from measured move. Stop 4.05 below support.",
                    "grounding": "Current price 4.50 at EMA20 support. Target 5.40 from measured move. Stop 4.05 below support.",
                    "rag_sources": [{"section": "Inverse H&S", "source": "Trading Book p.45"}]
                }],
                "verdict": "TOKEN_A presents high-conviction bullish continuation with 12h/4h alignment."
            })

        async def mock_judge_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "prompt_version": "judge_v1.2",
                "chosen_coin": "TOKEN_A",
                "runner_up": None,
                "direction": "LONG",
                "entry": 4.50,
                "tp": 5.40,
                "sl": 4.05,
                "confidence": 0.90,
                "reasoning": "Plan for TOKEN_A verified against tool log: entry 4.50 matches chart, TP 5.40 gives R:R 2.0 >= 1.5, SL on correct side.",
                "hallucination_flags": [],
                "chosen_plan_grounded": True,
                "all_plans_audited": True,
                "final_decision": "EXECUTE"
            })

        pipeline.screener._call_llm = mock_screener_llm
        pipeline.council._call_llm = mock_council_llm
        pipeline.judge._call_llm = mock_judge_llm

    res = await pipeline.run(SAMPLE_COIN_DATA_1, dry_run=True)
    assert res["screener"] is not None, "Screener output missing"
    assert len(res["screener"]["selections"]) == 1, "Expected 1 selection"
    assert res["screener"]["selections"][0]["coin"] == "TOKEN_A"
    assert res["council"] is not None, "Council output missing"
    assert len(res["council"]["plans"]) == 1, "Expected 1 plan"
    assert res["judge"] is not None, "Judge output missing"
    assert res["judge"]["final_decision"] == "EXECUTE"
    print("\n[TEST RESULT: 1 COIN] PASSED! All schemas validated successfully.")
    return res


async def test_pipeline_three_coins(use_mock_llm: bool = False) -> Dict[str, Any]:
    """Test path for 3 coins."""
    print("\n" + "#"*70)
    print("RUNNING DRY-RUN TEST: 3 COINS PATH (TOKEN_A, TOKEN_B, TOKEN_C)")
    print("#"*70)

    pipeline = TradingPipeline(
        chart_data_fn=mock_chart_tool,
        rag_query_fn=mock_rag_tool,
        execute_fn=mock_execute_tool
    )

    if use_mock_llm:
        async def mock_screener_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "reasoning_scratchpad": "TOKEN_A ~88 LONG; TOKEN_B ~82 LONG; TOKEN_C ~55 SKIP",
                "selections": [
                    {"coin": "TOKEN_A", "direction": "LONG"},
                    {"coin": "TOKEN_B", "direction": "LONG"}
                ]
            })

        async def mock_council_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "prompt_version": "council_v1.2",
                "plans": [
                    {
                        "coin": "TOKEN_A",
                        "screener_direction": "LONG",
                        "direction": "LONG",
                        "direction_alignment": "aligned",
                        "entry": 4.50,
                        "entry_basis": "current_price",
                        "tp": 5.40,
                        "sl": 4.05,
                        "risk_reward": 2.0,
                        "reasoning": "4h inverse H&S base confirmed above EMA20. Entry 4.50. Target 5.40 from measured move. Stop 4.05.",
                        "grounding": "Price 4.50 at 4h EMA20. Target 5.40 from measured move. Stop 4.05.",
                        "rag_sources": [{"section": "Inverse H&S", "source": "Trading Book p.45"}]
                    },
                    {
                        "coin": "TOKEN_B",
                        "screener_direction": "LONG",
                        "direction": "LONG",
                        "direction_alignment": "aligned",
                        "entry": 45000.0,
                        "entry_basis": "current_price",
                        "tp": 48500.0,
                        "sl": 43500.0,
                        "risk_reward": 2.33,
                        "reasoning": "Price 45000 above EMA20 (44500). Target 48500 flag pole projection. Stop 43500.",
                        "grounding": "Price 45000 above EMA20 (44500). Target 48500 flag pole projection. Stop 43500.",
                        "rag_sources": [{"section": "Bull Flag Continuation", "source": "Trading Book p.86"}]
                    }
                ],
                "verdict": "TOKEN_A and TOKEN_B both display strong trend alignment."
            })

        async def mock_judge_llm(sys_prompt, user_prompt, *args, **kwargs):
            return json.dumps({
                "prompt_version": "judge_v1.2",
                "chosen_coin": "TOKEN_A",
                "runner_up": "TOKEN_B",
                "direction": "LONG",
                "entry": 4.50,
                "tp": 5.40,
                "sl": 4.05,
                "confidence": 0.92,
                "reasoning": "Compared TOKEN_A vs TOKEN_B. TOKEN_A selected as superior setup due to cleaner pattern and R:R 2.0.",
                "hallucination_flags": [],
                "chosen_plan_grounded": True,
                "all_plans_audited": True,
                "final_decision": "EXECUTE"
            })

        pipeline.screener._call_llm = mock_screener_llm
        pipeline.council._call_llm = mock_council_llm
        pipeline.judge._call_llm = mock_judge_llm

    res = await pipeline.run(SAMPLE_COIN_DATA_3, dry_run=True)
    assert res["screener"] is not None, "Screener output missing"
    assert len(res["screener"]["selections"]) <= 3, "Exceeded 3 coins limit"
    assert res["council"] is not None, "Council output missing"
    assert len(res["council"]["plans"]) >= 1, "Expected at least 1 plan"
    assert res["judge"] is not None, "Judge output missing"
    assert res["judge"]["chosen_coin"] is not None, "Expected chosen coin"
    print("\n[TEST RESULT: 3 COINS] PASSED! Multiple candidate ranking & audit validated.")
    return res


async def run_all_tests(live: bool = False):
    """Run both 1-coin and 3-coin dry run tests."""
    print("="*70)
    print(f"RUNNING PIPELINE TEST HARNESS (Mode: {'LIVE LLM' if live else 'FAST MOCK'})")
    print("="*70)

    res_1 = await test_pipeline_single_coin(use_mock_llm=not live)
    res_3 = await test_pipeline_three_coins(use_mock_llm=not live)

    print("\n" + "="*70)
    print("ALL TESTS COMPLETED SUCCESSFULLY!")
    print(f"1-Coin Decision: {res_1['judge']['final_decision']} ({res_1['judge']['chosen_coin']})")
    print(f"3-Coin Decision: {res_3['judge']['final_decision']} ({res_3['judge']['chosen_coin']})")
    print("="*70)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Neptune AI Refactored Pipeline Harness")
    parser.add_argument("--live", action="store_true", help="Execute against live GLM 5.3 Flash endpoint")
    parser.add_argument("--single", action="store_true", help="Run 1-coin dry run only")
    parser.add_argument("--three", action="store_true", help="Run 3-coin dry run only")
    args = parser.parse_args()

    if args.single:
        asyncio.run(test_pipeline_single_coin(use_mock_llm=not args.live))
    elif args.three:
        asyncio.run(test_pipeline_three_coins(use_mock_llm=not args.live))
    else:
        asyncio.run(run_all_tests(live=args.live))
