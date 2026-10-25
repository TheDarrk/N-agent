"""
Neptune AI — Multi-Asset Universe Scanner
Supports:
  1. Auto Mode: Full 1-Click / NEAR Intents Token Universe (~130-205 tokens)
     with institutional filters (excludes stablecoins, test tokens, dead markets).
  2. Custom Mode: User-Configured Watchlist (Up to 20 Coins).
Scans candles, indicators, chart patterns, and volume surges concurrently using asyncio.gather.
Pre-evaluates trading book characteristics & mathematical expectancy (R:R >= 1.5) before ranking.
"""

import asyncio
from typing import List, Dict, Any, Optional
from market_intelligence import analyze_token_indicators
from pattern_recognition import analyze_chart_patterns
from knowledge_base import get_available_tokens_from_api
from trending_coins import get_daily_trending_coins

STABLECOIN_SYMBOLS = {
    "USDC", "USDT", "DAI", "USDE", "FRAX", "FDUSD", "TUSD", "NRUSDT", "USDD", "BUSD", "PYUSD"
}


async def get_1click_filtered_universe() -> List[str]:
    """
    Fetches all tokens supported by Defuse 1-Click / NEAR Intents API,
    applies institutional sanity filters (deduplication, non-stablecoins,
    valid symbol syntax, active market), and returns clean list for evaluation.
    """
    try:
        tokens = await get_available_tokens_from_api()
        seen = set()
        clean_symbols = []
        for t in tokens:
            sym = str(t.get("symbol", "")).strip().upper()
            price = float(t.get("price", 0.0) or 0.0)
            if not sym or sym in seen or price <= 0:
                continue
            # Basic Filter 1: Exclude USD/EUR stablecoins (no long speculative trade on $1 pegs)
            if sym in STABLECOIN_SYMBOLS or "USD" in sym or sym.endswith("USD"):
                continue
            # Basic Filter 2: Exclude test / dummy symbols
            if "TEST" in sym or "DUMMY" in sym or not sym.isalnum():
                continue
            # Basic Filter 3: Sensible length
            if len(sym) < 2 or len(sym) > 12:
                continue
            seen.add(sym)
            clean_symbols.append(sym)
        if clean_symbols:
            return clean_symbols
    except Exception as e:
        print(f"[SCANNER] Notice fetching 1-Click tokens: {e}")

    trending_data = await get_daily_trending_coins()
    return trending_data.get("coins", ["NEAR", "WETH", "WBTC", "SOL", "SWEAT", "REF", "AURORA", "PEPE"])


async def _evaluate_single_coin(coin: str, timeframe: str) -> Optional[Dict[str, Any]]:
    """Analyzes a single coin and computes its institutional opportunity score."""
    try:
        indicators = await analyze_token_indicators(symbol=coin, timeframe=timeframe)
        current_price = indicators.get("current_price", 0.0)
        candles = indicators.get("candles") or []

        # Filter out dead / illiquid pairs with 0 price or insufficient candle history
        if current_price <= 0 or len(candles) < 10:
            return None

        atr = indicators.get("atr", current_price * 0.03)

        # 1. Pattern Recognition & Measured Targets
        pattern_data = analyze_chart_patterns(candles=candles, current_price=current_price, atr=atr)

        target = pattern_data.get("measured_target", current_price * 1.04)
        sl = pattern_data.get("stop_loss", current_price * 0.97)
        risk = max(current_price * 0.005, current_price - sl)
        reward = max(0.0, target - current_price)
        calc_rr = round(reward / risk, 2)
        rr = pattern_data.get("risk_reward_ratio", calc_rr)

        # 2. Institutional Expectancy & Opportunity Scoring
        opp_score = 30

        # Trend Regime & Structure
        if indicators["ema_trend"] == "BULLISH":
            opp_score += 25
            if indicators.get("ema_cross") == "GOLDEN":
                opp_score += 10
        else:
            opp_score -= 30  # Heavy penalty for bearish regime
            if indicators.get("ema_cross") == "DEATH":
                opp_score -= 15

        # Volume Expansion & Surge
        vol_ratio = indicators.get("volume_ratio", 1.0)
        if indicators.get("volume_surge"):
            opp_score += 20
        elif vol_ratio >= 1.25:
            opp_score += 10
        elif vol_ratio < 0.6:
            opp_score -= 20  # Anemic volume penalty

        # RSI Momentum / Continuation Band
        rsi = indicators.get("rsi", 50.0)
        if 45 <= rsi <= 62:
            opp_score += 15  # Prime continuation zone
        elif 40 <= rsi <= 68:
            opp_score += 5   # Acceptable
        elif rsi > 70:
            opp_score -= 35  # Overbought exhaustion penalty
        elif rsi < 32:
            opp_score += 5   # Oversold reversal candidate

        # Chart Pattern Geometry
        pattern_type = pattern_data.get("pattern_type", "")
        is_bullish_pattern = "BULLISH" in pattern_type or pattern_data.get("confidence_score", 0) >= 80
        if is_bullish_pattern:
            opp_score += 20

        # Mathematical Expectancy (Risk-to-Reward Ratio)
        if rr >= 2.0:
            opp_score += 30  # High-conviction institutional payoff
        elif rr >= 1.5:
            opp_score += 15  # Solid positive expectancy
        elif rr < 1.2:
            opp_score -= 40  # Heavily penalize poor R:R (< 1.2) e.g. WETH 0.96

        return {
            "symbol": coin,
            "opportunity_score": min(98, max(5, opp_score)),
            "indicators": indicators,
            "pattern_data": pattern_data,
            "risk_reward_ratio": rr
        }
    except Exception as e:
        return None


async def scan_coin_universe(
    mode: str = "auto",
    custom_coins: Optional[List[str]] = None,
    timeframe: str = "1h"
) -> Dict[str, Any]:
    """
    Scans the token universe concurrently and ranks opportunities.
    In Auto Mode, evaluates all filtered tokens fetched from 1-Click / NEAR Intents API.
    """
    source_info = "User Configured Watchlist"
    if mode == "custom" and custom_coins and len(custom_coins) > 0:
        coins_to_scan = [c.strip().upper() for c in custom_coins if c.strip()][:20]
    else:
        # Full 1-Click Defuse / NEAR Intents Token Universe (~90-130 tokens)
        coins_to_scan = await get_1click_filtered_universe()
        source_info = f"1-Click / NEAR Intents Universe ({len(coins_to_scan)} Tokens)"

    # Semaphore to evaluate concurrently without hitting endpoint rate limits
    sem = asyncio.Semaphore(15)

    async def _sem_eval(coin_sym: str):
        async with sem:
            return await _evaluate_single_coin(coin_sym, timeframe)

    tasks = [_sem_eval(coin) for coin in coins_to_scan]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    scanned_results = [r for r in raw_results if isinstance(r, dict) and r is not None]

    # Sort descending by opportunity score, then risk-reward ratio, then volume ratio
    scanned_results.sort(
        key=lambda x: (
            x["opportunity_score"],
            x.get("risk_reward_ratio", 1.0),
            x["indicators"].get("volume_ratio", 1.0)
        ),
        reverse=True
    )
    best_candidate = scanned_results[0] if scanned_results else None

    return {
        "mode": mode,
        "source": source_info,
        "scanned_count": len(scanned_results),
        "coins_scanned": coins_to_scan,
        "ranked_coins": scanned_results,
        "top_candidate": best_candidate
    }
