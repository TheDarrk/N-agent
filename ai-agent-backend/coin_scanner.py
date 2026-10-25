"""
Neptune AI — Multi-Asset Universe Pre-Scanner
Supports:
  1. Auto Mode: Full 1-Click / NEAR Intents Token Universe (~130-205 tokens)
     with institutional filters (excludes stablecoins, test tokens, dead markets).
  2. Custom Mode: User-Configured Watchlist (Up to 20 Coins).
Scans candles, indicators, chart patterns, and volume surges concurrently using asyncio.gather.
Pre-evaluates trading book characteristics & mathematical expectancy (R:R >= 1.5) before ranking.
Builds the standardized COIN TABLE for Node 1 LLM Screener with explicit step-by-step logging.
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
    Logs each filtering stage in detail.
    """
    try:
        tokens = await get_available_tokens_from_api()
        total_raw = len(tokens)
        seen = set()
        clean_symbols = []
        filtered_stablecoins = []
        filtered_test_tokens = []
        filtered_invalid = []

        for t in tokens:
            sym = str(t.get("symbol", "")).strip().upper()
            price = float(t.get("price", 0.0) or 0.0)
            if not sym or sym in seen:
                continue
            if price <= 0:
                filtered_invalid.append(sym or "UNKNOWN")
                continue

            # Basic Filter 1: Exclude USD/EUR stablecoins (no speculative long breakout on $1 pegs)
            if sym in STABLECOIN_SYMBOLS or "USD" in sym or sym.endswith("USD"):
                filtered_stablecoins.append(sym)
                continue

            # Basic Filter 2: Exclude test / dummy symbols
            if "TEST" in sym or "DUMMY" in sym or not sym.isalnum():
                filtered_test_tokens.append(sym)
                continue

            # Basic Filter 3: Sensible symbol length
            if len(sym) < 2 or len(sym) > 12:
                filtered_invalid.append(sym)
                continue

            seen.add(sym)
            clean_symbols.append(sym)

        # Ensure benchmark assets are anchored at the front
        for anchor in reversed(["BTC", "WBTC", "NEAR", "SOL", "WETH"]):
            if anchor in clean_symbols:
                clean_symbols.remove(anchor)
                clean_symbols.insert(0, anchor)

        print(f"[PRE-SCANNER: DISCOVERY] Fetched {total_raw} raw tokens from 1-Click / DEX Universe API.")
        if filtered_stablecoins:
            print(f"[PRE-SCANNER: FILTERED] Excluded {len(filtered_stablecoins)} stablecoins: {filtered_stablecoins[:8]}{'...' if len(filtered_stablecoins) > 8 else ''} (zero speculative upside)")
        if filtered_test_tokens:
            print(f"[PRE-SCANNER: FILTERED] Excluded {len(filtered_test_tokens)} test/dummy tokens: {filtered_test_tokens[:6]}")
        if filtered_invalid:
            print(f"[PRE-SCANNER: FILTERED] Excluded {len(filtered_invalid)} dead/zero-price/invalid entries")
        print(f"[PRE-SCANNER: QUALIFIED FOR SCAN] {len(clean_symbols)} active tradeable assets passed to multi-timeframe candle engine.")

        if clean_symbols:
            return clean_symbols
    except Exception as e:
        print(f"[PRE-SCANNER: NOTICE] Exception fetching 1-Click tokens ({e}). Falling back to trending universe.")

    trending_data = await get_daily_trending_coins()
    fallback_coins = trending_data.get("coins", ["BTC", "WBTC", "NEAR", "WETH", "SOL", "SWEAT", "REF", "AURORA", "PEPE"])
    print(f"[PRE-SCANNER: FALLBACK] Using {len(fallback_coins)} trending universe tokens: {fallback_coins}")
    return fallback_coins


async def _evaluate_single_coin(coin: str, timeframe: str) -> Optional[Dict[str, Any]]:
    """Analyzes a single coin and computes its institutional opportunity score."""
    try:
        indicators = await analyze_token_indicators(symbol=coin, timeframe=timeframe)
        current_price = indicators.get("current_price", 0.0)
        candles = indicators.get("candles") or []

        # Filter out dead / illiquid pairs with 0 price or insufficient candle history
        if current_price <= 0 or len(candles) < 10:
            return None

        # Filter out completely dead / zero volume pairs (< $500 24h vol) where slippage prevents trading
        vols = [c.get("volume", 0.0) for c in candles[-24:]] if candles else [1.0]
        vol_24h = sum(vols) * current_price
        if vol_24h < 500 and coin.upper() not in ["BTC", "WBTC", "NEAR", "SOL", "ETH", "WETH"]:
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
    except Exception:
        return None


async def scan_coin_universe(
    mode: str = "auto",
    custom_coins: Optional[List[str]] = None,
    timeframe: str = "1h"
) -> Dict[str, Any]:
    """
    Scans the token universe concurrently and ranks opportunities.
    In Auto Mode, evaluates all filtered tokens fetched from 1-Click / NEAR Intents API.
    Logs pre-scanner filtering decisions, dead pair removals, and final table compilation.
    """
    source_info = "User Configured Watchlist"
    if mode == "custom" and custom_coins and len(custom_coins) > 0:
        coins_to_scan = [c.strip().upper() for c in custom_coins if c.strip()][:20]
        print(f"[PRE-SCANNER] Custom Watchlist Mode: {len(coins_to_scan)} coins: {coins_to_scan}")
    else:
        # Full 1-Click Defuse / NEAR Intents Token Universe (~90-130 tokens)
        coins_to_scan = await get_1click_filtered_universe()
        source_info = f"1-Click / NEAR Intents Universe ({len(coins_to_scan)} Tokens)"

    # Semaphore to evaluate concurrently without hitting endpoint rate limits
    sem = asyncio.Semaphore(15)

    async def _sem_eval(coin_sym: str):
        async with sem:
            return await _evaluate_single_coin(coin_sym, timeframe)

    print(f"[PRE-SCANNER: CANDLE EVAL] Concurrently evaluating {len(coins_to_scan)} coins on {timeframe} timeframe...")
    tasks = [_sem_eval(coin) for coin in coins_to_scan]
    raw_results = await asyncio.gather(*tasks, return_exceptions=True)

    scanned_results = [r for r in raw_results if isinstance(r, dict) and r is not None]
    dead_count = len(coins_to_scan) - len(scanned_results)
    if dead_count > 0:
        print(f"[PRE-SCANNER: FILTERED DEAD] Excluded {dead_count} coins with zero price, dead volume, or <10 candles.")

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

    # Build structured COIN TABLE for the Node 1 Screener
    coin_table = build_coin_table_for_screener(scanned_results, max_coins=None)
    coin_table_markdown = format_coin_table_markdown(coin_table)

    btc_present = any(c.get("is_btc_backdrop") for c in coin_table)
    print(f"[PRE-SCANNER: TABLE COMPILED] Standardized COIN TABLE assembled with {len(coin_table)} qualifying tokens.")
    if btc_present:
        print(f"[PRE-SCANNER: BACKDROP] BTC/WBTC explicitly placed at Row 1 as the Market Backdrop.")
    print(f"[PRE-SCANNER -> NODE 1] Transmitting complete COIN TABLE: all {len(coin_table)} qualifying tokens (14 indicators each) delivered to LLM Screener with zero pre-selection.")

    return {
        "mode": mode,
        "source": source_info,
        "scanned_count": len(scanned_results),
        "coins_scanned": coins_to_scan,
        "ranked_coins": scanned_results,
        "top_candidate": best_candidate,
        "coin_table": coin_table,
        "coin_table_markdown": coin_table_markdown
    }


def build_coin_table_for_screener(scanned_results: List[Dict[str, Any]], max_coins: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Builds the standardized COIN TABLE required by the Node 1 LLM Screener:
    price, 24h volume, price changes, and indicators per timeframe (EMA20/50/200,
    RSI14, MACD histogram, ATR%, volume vs average, distance from EMAs, distance to swing high/low),
    with BTC/WBTC explicitly included and positioned as the market backdrop.
    All valid tradeable coins are passed without hardcoded selection.
    """
    table = []
    btc_entry = None

    for r in scanned_results:
        ind = r.get("indicators", {})
        cp = ind.get("current_price", 0.0)
        if cp <= 0:
            continue
        candles = ind.get("candles", [])
        p_24h_pct = 0.0
        if len(candles) >= 24:
            c_open = candles[-24]["open"]
            if c_open > 0:
                p_24h_pct = round(((cp - c_open) / c_open) * 100, 2)
        elif len(candles) >= 2:
            c_open = candles[0]["open"]
            if c_open > 0:
                p_24h_pct = round(((cp - c_open) / c_open) * 100, 2)

        ema20 = ind.get("ema20", cp)
        ema50 = ind.get("ema50", cp)
        ema200 = ind.get("ema200", cp)
        sup = ind.get("recent_support", cp * 0.95)
        res = ind.get("recent_resistance", cp * 1.05)

        dist_ema20 = round(((cp - ema20) / max(0.0001, ema20)) * 100, 2)
        dist_ema50 = round(((cp - ema50) / max(0.0001, ema50)) * 100, 2)
        dist_swing_high = round(((res - cp) / max(0.0001, cp)) * 100, 2)
        dist_swing_low = round(((cp - sup) / max(0.0001, cp)) * 100, 2)

        # Estimate 24h volume from available candles
        vols = [c.get("volume", 0.0) for c in candles[-24:]] if candles else [1.0]
        vol_24h = round(sum(vols) * cp, 2)

        # Compute MACD approximation (EMA12 - EMA26)
        closes = [c.get("close", cp) for c in candles]
        from market_intelligence import _calc_ema
        ema12 = _calc_ema(closes, 12) if len(closes) >= 12 else cp
        ema26 = _calc_ema(closes, 26) if len(closes) >= 26 else cp
        macd_line = ema12 - ema26
        macd_hist = round(macd_line, 4)

        sym = r["symbol"].upper()
        is_btc = sym in ["BTC", "WBTC"]

        entry = {
            "symbol": sym,
            "is_btc_backdrop": is_btc,
            "price": cp,
            "24h_volume_usd": vol_24h,
            "price_change_24h_pct": p_24h_pct,
            "ema20": ema20,
            "ema50": ema50,
            "ema200": ema200,
            "rsi14": round(ind.get("rsi", 50.0), 1),
            "macd_hist": macd_hist,
            "atr_pct": round(ind.get("atr_pct", 3.0), 2),
            "volume_vs_avg": ind.get("volume_ratio", 1.0),
            "dist_from_ema20_pct": dist_ema20,
            "dist_from_ema50_pct": dist_ema50,
            "dist_to_swing_high_pct": dist_swing_high,
            "dist_to_swing_low_pct": dist_swing_low
        }

        if is_btc and not btc_entry:
            btc_entry = entry
        else:
            table.append(entry)

    # Sort candidates by volume / liquidity (highest liquidity first)
    table.sort(key=lambda x: -x["24h_volume_usd"])
    selected = table[:max_coins] if max_coins else table

    # Prepend BTC as the first entry for market backdrop regime analysis
    if btc_entry:
        return [btc_entry] + selected
    return selected


def format_coin_table_markdown(coin_table: List[Dict[str, Any]]) -> str:
    """Formats the COIN TABLE into a clean, compact markdown table for LLM Screener consumption."""
    headers = [
        "Symbol", "Role", "Price ($)", "24h Vol ($)", "24h %", "EMA20", "EMA50", "EMA200",
        "RSI14", "MACD Hist", "ATR %", "Vol Ratio", "Dist EMA20 %", "Dist EMA50 %", "Dist High %", "Dist Low %"
    ]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |"
    ]
    for c in coin_table:
        role = "BTC Backdrop" if c.get("is_btc_backdrop") else "Candidate"
        p_chg = f"+{c['price_change_24h_pct']}" if c['price_change_24h_pct'] > 0 else str(c['price_change_24h_pct'])
        row = [
            c["symbol"],
            role,
            str(c["price"]),
            f"{c['24h_volume_usd']:,.0f}",
            p_chg + "%",
            str(c["ema20"]),
            str(c["ema50"]),
            str(c["ema200"]),
            str(c["rsi14"]),
            str(c["macd_hist"]),
            f"{c['atr_pct']}%",
            f"{c['volume_vs_avg']}x",
            f"{c['dist_from_ema20_pct']}%",
            f"{c['dist_from_ema50_pct']}%",
            f"{c['dist_to_swing_high_pct']}%",
            f"{c['dist_to_swing_low_pct']}%"
        ]
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)
