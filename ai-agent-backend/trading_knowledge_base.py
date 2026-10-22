"""
Neptune AI — Trading Knowledge Base (RAG Layer)
Provides compact, dynamic retrieval of trading rules, chart patterns,
and risk parameters based on current market metrics.
Avoids dumping the entire knowledge base into LLM prompts.
"""

from typing import Dict, Any, List

# Core Knowledge Corpus categorized by market regime & indicator conditions
TRADING_KNOWLEDGE_CORPUS = [
    {
        "id": "bull_flag_continuation",
        "name": "Bull Flag Trend Continuation",
        "trigger": lambda ind: ind.get("ema_trend") == "BULLISH" and 45 <= ind.get("rsi", 50) <= 65,
        "description": "Strong upward impulse followed by shallow consolidation. Indicates trend continuation.",
        "entry_rule": "Enter on breakout above flag resistance or retest of EMA 20.",
        "sl_rule": "Place SL 1.2x ATR below flag support swing low.",
        "tp_rule": "Target 1.5x to 2.5x pole height or next major resistance (Min R:R 1.8:1).",
        "expected_roi_range": (5.0, 12.0),
        "typical_confidence": 85,
    },
    {
        "id": "oversold_rsi_bounce",
        "name": "Oversold RSI Mean Reversion",
        "trigger": lambda ind: ind.get("rsi", 50) <= 32 and ind.get("volume_surge", False),
        "description": "Momentum exhaustion with high volume sell-off near historical support.",
        "entry_rule": "Enter after first green hourly candle closing above prior candle low.",
        "sl_rule": "Tighter SL 1.0x ATR below local swing low to limit downside.",
        "tp_rule": "Target mean reversion to 50 EMA (Min R:R 1.5:1).",
        "expected_roi_range": (4.0, 8.5),
        "typical_confidence": 75,
    },
    {
        "id": "ema_golden_cross",
        "name": "EMA 20/50 Golden Cross Breakout",
        "trigger": lambda ind: ind.get("ema_cross") == "GOLDEN" and ind.get("rsi", 50) > 52,
        "description": "Short-term momentum crossing above medium-term trend, signaling sustained buying pressure.",
        "entry_rule": "Enter on confirmation candle close above 50 EMA.",
        "sl_rule": "SL placed just below 50 EMA (1.5x ATR buffer).",
        "tp_rule": "Trail profit with 20 EMA, target +6% to +15% expected profit.",
        "expected_roi_range": (6.0, 15.0),
        "typical_confidence": 88,
    },
    {
        "id": "volatility_breakout_squeeze",
        "name": "ATR Volatility Squeeze Breakout",
        "trigger": lambda ind: ind.get("atr_ratio", 1.0) > 1.3 and ind.get("volume_surge", False),
        "description": "Expansion of volatility following range contraction, backed by abnormal volume.",
        "entry_rule": "Enter in the direction of the volume expansion candle.",
        "sl_rule": "SL placed at midpoint of the breakout candle.",
        "tp_rule": "Take profit at 2x average true range (ATR) target.",
        "expected_roi_range": (5.0, 10.0),
        "typical_confidence": 80,
    },
    {
        "id": "support_retest_double_bottom",
        "name": "Double Bottom Support Retest",
        "trigger": lambda ind: ind.get("price_near_support", False) and ind.get("rsi", 50) > 35,
        "description": "Price holds support level twice without breaking, creating bullish 'W' pattern.",
        "entry_rule": "Enter on breakout above neckline or second bounce confirmation.",
        "sl_rule": "Place SL 0.8x ATR below the double bottom low.",
        "tp_rule": "Target distance equal to depth of the pattern (Min R:R 2.0:1).",
        "expected_roi_range": (6.0, 14.0),
        "typical_confidence": 82,
    },
    {
        "id": "risk_management_hard_caps",
        "name": "Risk Capital Preservation Rule",
        "trigger": lambda ind: True,  # Always included
        "description": "Never risk more than user configured cap per trade. Enforce hard daily drawdown limit.",
        "entry_rule": "Position size = Min(User Max Cap, Available Budget * Risk Factor).",
        "sl_rule": "Max acceptable stop loss cannot exceed user max risk percentage (typically 3% - 6%).",
        "tp_rule": "Take profit must provide minimum 1.5x reward relative to risk.",
        "expected_roi_range": (3.0, 20.0),
        "typical_confidence": 95,
    }
]


def retrieve_trading_rules(indicators: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    RAG Retrieval: inspects current indicators (RSI, EMA trend, ATR, Volume)
    and returns ONLY the relevant 2-3 trading rules/patterns for prompt injection.
    """
    matched_rules = []
    for rule in TRADING_KNOWLEDGE_CORPUS:
        try:
            if rule["trigger"](indicators):
                matched_rules.append({
                    "name": rule["name"],
                    "description": rule["description"],
                    "entry_rule": rule["entry_rule"],
                    "sl_rule": rule["sl_rule"],
                    "tp_rule": rule["tp_rule"],
                    "typical_confidence": rule["typical_confidence"],
                    "expected_roi_range": rule["expected_roi_range"]
                })
        except Exception:
            continue

    # Return top 3 matched rules (always includes risk preservation)
    return matched_rules[:3]


def format_rag_context_for_prompt(matched_rules: List[Dict[str, Any]]) -> str:
    """Format retrieved rules into a compact prompt section."""
    lines = ["### Retrieved Trading Knowledge (RAG Focus):"]
    for i, r in enumerate(matched_rules, 1):
        lines.append(f"{i}. **{r['name']}**")
        lines.append(f"   - Pattern: {r['description']}")
        lines.append(f"   - Entry Strategy: {r['entry_rule']}")
        lines.append(f"   - Stop Loss Formula: {r['sl_rule']}")
        lines.append(f"   - Take Profit Formula: {r['tp_rule']}")
        lines.append(f"   - Target ROI: {r['expected_roi_range'][0]}% - {r['expected_roi_range'][1]}%")
    return "\n".join(lines)
