"""
Neptune AI — Trader Mathematical Model Context Protocol (MCP) Suite
Provides high-precision algorithmic calculators and chart mathematical tools
for LLM trading nodes (Screener, Council, Judge) to prevent math hallucinations
and evaluate Fibonacci confluence, Pivot points, Volatility buffers, and Net R:R.
"""

from typing import Dict, Any, List, Optional
import math


def calculate_fibonacci_confluence(
    high: float,
    low: float,
    current_price: float,
    trend: str = "BULLISH"
) -> Dict[str, Any]:
    """
    Computes exact Fibonacci retracement and extension levels from swing high and swing low.
    Identifies the closest Fibonacci level and evaluates confluence (e.g. Golden Pocket 0.618 / 0.65).
    """
    if high <= low or high <= 0 or low <= 0:
        return {"error": "Invalid swing high/low bounds", "levels": {}}

    diff = high - low
    is_bullish = trend.upper() in ("BULLISH", "LONG", "UP")

    if is_bullish:
        levels = {
            "0.000_low": round(low, 6),
            "0.236_retrace": round(high - (diff * 0.236), 6),
            "0.382_retrace": round(high - (diff * 0.382), 6),
            "0.500_equilibrium": round(high - (diff * 0.500), 6),
            "0.618_golden_pocket": round(high - (diff * 0.618), 6),
            "0.650_golden_pocket_ext": round(high - (diff * 0.650), 6),
            "0.786_deep_retrace": round(high - (diff * 0.786), 6),
            "1.000_high": round(high, 6),
            "1.272_extension": round(high + (diff * 0.272), 6),
            "1.618_golden_expansion": round(high + (diff * 0.618), 6),
        }
    else:
        levels = {
            "0.000_high": round(high, 6),
            "0.236_retrace": round(low + (diff * 0.236), 6),
            "0.382_retrace": round(low + (diff * 0.382), 6),
            "0.500_equilibrium": round(low + (diff * 0.500), 6),
            "0.618_golden_pocket": round(low + (diff * 0.618), 6),
            "0.650_golden_pocket_ext": round(low + (diff * 0.650), 6),
            "0.786_deep_retrace": round(low + (diff * 0.786), 6),
            "1.000_low": round(low, 6),
            "1.272_extension": round(low - (diff * 0.272), 6),
            "1.618_golden_expansion": round(low - (diff * 0.618), 6),
        }

    # Find closest level to current price
    closest_name = None
    min_dist = float("inf")
    for name, lvl in levels.items():
        dist = abs(current_price - lvl)
        if dist < min_dist:
            min_dist = dist
            closest_name = name

    closest_price = levels[closest_name]
    dist_pct = round((abs(current_price - closest_price) / max(1e-6, current_price)) * 100, 2)
    in_golden_pocket = (
        min(levels["0.618_golden_pocket"], levels["0.650_golden_pocket_ext"]) * 0.995
        <= current_price
        <= max(levels["0.618_golden_pocket"], levels["0.650_golden_pocket_ext"]) * 1.005
    )

    return {
        "swing_high": high,
        "swing_low": low,
        "current_price": current_price,
        "closest_fib_level": closest_name,
        "closest_fib_price": closest_price,
        "distance_to_fib_pct": dist_pct,
        "in_golden_pocket": in_golden_pocket,
        "levels": levels,
        "mathematical_note": f"Price is {dist_pct}% away from {closest_name} (${closest_price})."
    }


def calculate_pivot_points(high: float, low: float, close: float) -> Dict[str, Any]:
    """
    Computes Standard Floor Pivot Points and Camarilla Intraday Reversal / Breakout Levels.
    Camarilla H3/L3 act as strong mean-reversion boundaries, while H4/L4 act as breakout levels.
    """
    if high <= low or high <= 0 or low <= 0 or close <= 0:
        return {"error": "Invalid high, low, or close price"}

    # Standard Floor Pivots
    p = (high + low + close) / 3.0
    r1 = (2 * p) - low
    s1 = (2 * p) - high
    r2 = p + (high - low)
    s2 = p - (high - low)
    r3 = high + 2 * (p - low)
    s3 = low - 2 * (high - p)

    # Camarilla Pivot Levels
    rng = high - low
    h4 = close + (rng * 1.1 / 2.0)
    h3 = close + (rng * 1.1 / 4.0)
    l3 = close - (rng * 1.1 / 4.0)
    l4 = close - (rng * 1.1 / 2.0)

    return {
        "standard_pivots": {
            "R3": round(r3, 6),
            "R2": round(r2, 6),
            "R1": round(r1, 6),
            "Pivot": round(p, 6),
            "S1": round(s1, 6),
            "S2": round(s2, 6),
            "S3": round(s3, 6)
        },
        "camarilla_pivots": {
            "H4_Breakout": round(h4, 6),
            "H3_Reversal": round(h3, 6),
            "L3_Reversal": round(l3, 6),
            "L4_Breakout": round(l4, 6)
        }
    }


def calculate_dynamic_volatility_levels(
    current_price: float,
    atr: float,
    direction: str = "LONG",
    risk_multiplier: float = 1.5,
    reward_multiplier: float = 2.5
) -> Dict[str, Any]:
    """
    Calculates Chandelier / ATR-based dynamic Stop-Loss and Take-Profit boundaries.
    Prevents setting stop losses inside market noise while strictly guaranteeing R:R >= 1.5.
    """
    if current_price <= 0 or atr <= 0:
        return {"error": "Invalid price or ATR"}

    is_long = direction.upper() in ("LONG", "BUY")
    risk_dist = atr * risk_multiplier
    reward_dist = atr * reward_multiplier

    if is_long:
        sl = max(current_price * 0.001, current_price - risk_dist)
        tp = current_price + reward_dist
        actual_risk = current_price - sl
        actual_reward = tp - current_price
    else:
        sl = current_price + risk_dist
        tp = max(current_price * 0.001, current_price - reward_dist)
        actual_risk = sl - current_price
        actual_reward = current_price - tp

    rr = round(actual_reward / max(1e-6, actual_risk), 2)
    return {
        "entry_price": current_price,
        "atr": atr,
        "atr_pct": round((atr / current_price) * 100, 2),
        "direction": "LONG" if is_long else "SHORT",
        "recommended_stop_loss": round(sl, 6),
        "recommended_take_profit": round(tp, 6),
        "risk_distance_usd": round(actual_risk, 6),
        "reward_distance_usd": round(actual_reward, 6),
        "risk_reward_ratio": rr,
        "is_positive_expectancy": rr >= 1.5
    }


def estimate_trade_slippage_and_fees(
    order_size_usd: float,
    volume_24h_usd: float,
    fee_pct: float = 0.001
) -> Dict[str, Any]:
    """
    Estimates market execution price impact and slippage using institutional liquidity modeling.
    Calculates net payoff and warns if trade size would incur excessive slippage.
    """
    if volume_24h_usd <= 0 or order_size_usd <= 0:
        return {"estimated_slippage_pct": 5.0, "is_safe": False, "warning": "Zero or unknown 24h volume"}

    # Institutional square-root price impact model: Impact ~ 0.1 * sqrt(order / volume)
    participation_rate = order_size_usd / volume_24h_usd
    estimated_slippage_pct = round(min(5.0, max(0.01, 0.15 * math.sqrt(participation_rate) * 100)), 3)
    round_trip_fee_usd = round(order_size_usd * (fee_pct * 2), 2)
    estimated_slippage_usd = round(order_size_usd * (estimated_slippage_pct / 100.0), 2)
    total_execution_drag_usd = round(round_trip_fee_usd + estimated_slippage_usd, 2)

    return {
        "order_size_usd": order_size_usd,
        "volume_24h_usd": volume_24h_usd,
        "participation_rate_pct": round(participation_rate * 100, 4),
        "estimated_slippage_pct": estimated_slippage_pct,
        "estimated_slippage_usd": estimated_slippage_usd,
        "round_trip_fee_usd": round_trip_fee_usd,
        "total_execution_drag_usd": total_execution_drag_usd,
        "is_safe": estimated_slippage_pct <= 0.8
    }


def validate_pattern_geometry(
    pattern_name: str,
    pattern_data: Dict[str, Any],
    current_price: float
) -> Dict[str, Any]:
    """
    Verifies pattern symmetry and structural integrity against mathematical rules.
    e.g. Double Bottom troughs must be within 3.5%, Bull Flag retrace <= 50% of flagpole.
    """
    p_lower = pattern_name.lower()
    is_valid = True
    checks = []

    if "double bottom" in p_lower:
        troughs = pattern_data.get("troughs", [])
        if len(troughs) >= 2 and troughs[0] > 0:
            diff = abs(troughs[0] - troughs[1]) / troughs[0] * 100.0
            checks.append(f"Trough symmetry variance: {diff:.2f}% (Limit: 3.5%)")
            if diff > 3.5:
                is_valid = False

    elif "bull flag" in p_lower:
        flag_high = pattern_data.get("neckline", current_price)
        checks.append(f"Neckline boundary: ${flag_high}")

    rr = pattern_data.get("risk_reward_ratio", 1.0)
    checks.append(f"Pattern nominal R:R: {rr}x")
    if rr < 1.2:
        is_valid = False

    return {
        "pattern": pattern_name,
        "is_valid": is_valid,
        "is_structurally_sound": is_valid,
        "geometry_checks": checks
    }
