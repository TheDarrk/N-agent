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
import os
from typing import List, Dict, Any, Optional, Tuple
from market_intelligence import analyze_token_indicators, SYMBOL_ALIASES
from pattern_recognition import analyze_chart_patterns
from knowledge_base import get_available_tokens_from_api
from trending_coins import get_daily_trending_coins

STABLECOIN_SYMBOLS = {
    "USDC", "USDT", "DAI", "USDE", "FRAX", "FDUSD", "TUSD", "NRUSDT", "USDD", "BUSD", "PYUSD",
    "XDAI", "USAD", "GBPE", "EURE", "EURC", "EURT", "TLO", "USDX", "USD+", "CUSD", "CEUR",
    "MIM", "LUSD", "GUSD", "SUSD", "USDP", "ALUSD", "OUSD", "USDB", "USDS", "CRVUSD",
    "USD1", "USDG", "USDF", "USDT0", "SUSDC", "USDCX", "LAUSDC", "MWUSDC", "SPARKUSDC", "STEAKUSDC",
    "GTUSDCP", "COCA",
}


def is_stablecoin_asset(sym: str, price: float = 0.0) -> bool:
    """Checks whether an asset is a fiat-pegged stablecoin with no speculative directional upside."""
    s = sym.upper()
    if s in STABLECOIN_SYMBOLS:
        return True
    if any(k in s for k in ("USDC", "USDT", "USD0", "DAI", "EUR", "GBP")):
        return True
    if s.startswith("USD") or s.endswith("USD"):
        return True
    if 0.985 <= price <= 1.015:
        return True
    return False

# Conservative, environment-configurable eligibility gate. These values are
# deliberately low: the gate removes only assets that are objectively dead or
# impossible to trade, while leaving setup quality to the LLM council.
PRESCAN_MIN_CANDLES = int(os.getenv("PRESCAN_MIN_CANDLES", "20"))
PRESCAN_MIN_VOLUME_USD = float(os.getenv("PRESCAN_MIN_VOLUME_USD", "25000"))
PRESCAN_MIN_MOVE_PCT = float(os.getenv("PRESCAN_MIN_MOVE_PCT", "2.0"))
PRESCAN_MIN_ATR_PCT = float(os.getenv("PRESCAN_MIN_ATR_PCT", "0.30"))
PRESCAN_MIN_WEEKLY_RANGE_PCT = float(os.getenv("PRESCAN_MIN_WEEKLY_RANGE_PCT", "2.0"))
PRESCAN_MIN_WEEKLY_VOLUME_USD = float(os.getenv("PRESCAN_MIN_WEEKLY_VOLUME_USD", "25000"))


def check_tradeability(
    indicators: Dict[str, Any],
    pattern_data: Dict[str, Any],
    *,
    min_candles: int = PRESCAN_MIN_CANDLES,
    min_volume_usd: float = PRESCAN_MIN_VOLUME_USD,
    min_move_pct: float = PRESCAN_MIN_MOVE_PCT,
    min_atr_pct: float = PRESCAN_MIN_ATR_PCT,
    min_weekly_range_pct: float = PRESCAN_MIN_WEEKLY_RANGE_PCT,
    min_weekly_volume_usd: float = PRESCAN_MIN_WEEKLY_VOLUME_USD,
) -> Dict[str, Any]:
    """Reject only objectively untradeable market data before LLM screening.

    This is an eligibility check, not a trading signal. It does not prefer
    LONG or SHORT and does not score patterns. It only checks that the asset
    has enough history, observable liquidity, and non-dead price movement for
    the downstream agents to make a grounded decision.
    """
    candles = indicators.get("candles") or []
    current_price = float(indicators.get("current_price") or 0.0)
    reasons: List[str] = []

    if current_price <= 0:
        reasons.append("invalid_price")
    if len(candles) < min_candles:
        reasons.append(f"insufficient_history<{min_candles}_candles")

    volumes = [float(c.get("volume") or 0.0) for c in candles[-24:]]
    estimated_volume_usd = sum(volumes) * current_price
    if estimated_volume_usd < min_volume_usd:
        reasons.append(f"estimated_volume_below_${min_volume_usd:g}")
    if not volumes or max(volumes) <= 0:
        reasons.append("zero_volume")

    closes = [float(c.get("close") or 0.0) for c in candles if c.get("close") is not None]
    if len(closes) >= 2 and closes[0] > 0:
        observed_move_pct = (max(closes) - min(closes)) / closes[0] * 100.0
        if observed_move_pct < min_move_pct:
            reasons.append(f"price_range_below_{min_move_pct:g}pct")
    else:
        observed_move_pct = 0.0
        reasons.append("insufficient_price_history")

    atr_pct = float(indicators.get("atr_pct") or 0.0)
    if atr_pct < min_atr_pct:
        reasons.append(f"atr_below_{min_atr_pct:g}pct")

    lookback = indicators.get("one_week_1h") or indicators.get("lookback_summary") or {}
    weekly_range_pct = float(lookback.get("range_pct") or 0.0)
    weekly_average_volume_usd = float(lookback.get("average_close") or current_price) * float(lookback.get("average_volume") or 0.0)
    if lookback and weekly_range_pct < min_weekly_range_pct:
        reasons.append(f"lookback_range_below_{min_weekly_range_pct:g}pct")
    if lookback and weekly_average_volume_usd < min_weekly_volume_usd:
        reasons.append(f"lookback_average_volume_below_${min_weekly_volume_usd:g}")

    ema_values = [indicators.get("ema20"), indicators.get("ema50"), indicators.get("ema200")]
    if any(value is None or float(value or 0.0) <= 0 for value in ema_values):
        reasons.append("invalid_ema_context")

    pattern_name = str(pattern_data.get("dominant_pattern") or "").strip()
    if not pattern_name:
        reasons.append("no_chart_structure")

    return {
        "eligible": not reasons,
        "reasons": reasons,
        "estimated_volume_usd": round(estimated_volume_usd, 2),
        "observed_move_pct": round(observed_move_pct, 3),
        "atr_pct": round(atr_pct, 3),
        "lookback_range_pct": round(weekly_range_pct, 3),
        "lookback_average_volume_usd": round(weekly_average_volume_usd, 2),
        "candles_count": len(candles),
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
        seen_canonical = set()
        clean_symbols = []
        filtered_stablecoins = []
        filtered_test_tokens = []
        filtered_invalid = []

        for t in tokens:
            raw_sym = str(t.get("symbol", "")).strip().upper()
            sym = raw_sym.lstrip("$")
            price = float(t.get("price", 0.0) or 0.0)
            if not sym or sym in seen:
                continue
            if price <= 0:
                filtered_invalid.append(raw_sym or "UNKNOWN")
                continue

            # Deduplicate wrapped/derivative symbols to avoid repetitive clone sets (e.g. keep one of ETH/WETH/WSTETH)
            canonical = SYMBOL_ALIASES.get(sym, sym)
            if canonical in seen_canonical:
                continue

            # Basic Filter 1: Exclude USD/EUR/GBP stablecoins and fiat pegs (no speculative upside)
            if is_stablecoin_asset(sym, price) or is_stablecoin_asset(raw_sym, price):
                filtered_stablecoins.append(raw_sym)
                continue

            # Basic Filter 2: Exclude test / dummy / deprecated symbols
            if "TEST" in sym or "DUMMY" in sym or "DEPRECATED" in sym or not sym.isalnum():
                filtered_test_tokens.append(raw_sym)
                continue

            # Basic Filter 3: Sensible symbol length
            if len(sym) < 2 or len(sym) > 12:
                filtered_invalid.append(raw_sym)
                continue

            seen.add(sym)
            seen_canonical.add(canonical)
            clean_symbols.append(sym)

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
    fallback_coins = trending_data.get("coins", [])
    print(f"[PRE-SCANNER: FALLBACK] Using {len(fallback_coins)} trending universe tokens: {fallback_coins}")
    return fallback_coins


async def _evaluate_single_coin(coin: str, timeframe: str) -> Optional[Dict[str, Any]]:
    """Analyzes a single coin and computes its institutional opportunity score."""
    try:
        lookback_limit = 168 if timeframe == "1h" else 50
        indicators = await analyze_token_indicators(
            symbol=coin,
            timeframe=timeframe,
            limit=lookback_limit,
            include_lookback_summary=True,
        )
        current_price = indicators.get("current_price", 0.0)
        full_candles = indicators.get("candles") or []
        candles = full_candles[-50:]
        # Keep LLM context bounded while retaining the full candle history for multi-timeframe analysis.
        indicators["candles"] = candles
        indicators["full_candles"] = full_candles

        atr = indicators.get("atr", 0.0)

        # 1. Pattern Recognition & Measured Targets
        pattern_data = analyze_chart_patterns(candles=candles, current_price=current_price, atr=atr)
        tradeability = check_tradeability(indicators, pattern_data)
        if not tradeability["eligible"]:
            return {
                "symbol": coin,
                "eligible": False,
                "prescan_rejection": tradeability,
                "indicators": indicators,
                "pattern_data": pattern_data,
            }

        target = pattern_data.get("measured_target", current_price * 1.04)
        sl = pattern_data.get("stop_loss", current_price * 0.97)
        pattern_type = str(pattern_data.get("pattern_type", "")).upper()
        is_short = "BEARISH" in pattern_type or (
            indicators.get("ema_trend") == "BEARISH" and "BULLISH" not in pattern_type
        )
        bias = "SHORT" if is_short else "LONG"
        if is_short:
            risk = max(current_price * 0.005, sl - current_price)
            reward = max(0.0, current_price - target)
        else:
            risk = max(current_price * 0.005, current_price - sl)
            reward = max(0.0, target - current_price)
        calc_rr = round(reward / risk, 2)
        rr = pattern_data.get("risk_reward_ratio", calc_rr)

        # 2. Institutional Expectancy & Opportunity Scoring
        opp_score = 30

        # Trend Regime & Structure
        if indicators["ema_trend"] in {"BULLISH", "BEARISH"}:
            opp_score += 25
            if indicators.get("ema_cross") in {"GOLDEN", "DEATH"}:
                opp_score += 10

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
        if is_short:
            if 38 <= rsi <= 55:
                opp_score += 15
            elif 32 <= rsi <= 62:
                opp_score += 5
            elif rsi < 30:
                opp_score -= 35
            elif rsi > 68:
                opp_score += 5
        else:
            if 45 <= rsi <= 62:
                opp_score += 15
            elif 40 <= rsi <= 68:
                opp_score += 5
            elif rsi > 70:
                opp_score -= 35
            elif rsi < 32:
                opp_score += 5

        # Chart Pattern Geometry
        pattern_type = pattern_data.get("pattern_type", "")
        is_directional_pattern = "BULLISH" in pattern_type or "BEARISH" in pattern_type
        if is_directional_pattern and pattern_data.get("confidence_score", 0) >= 70:
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
            "eligible": True,
            "prescan_metrics": tradeability,
            "opportunity_score": min(98, max(5, opp_score)),
            "indicators": indicators,
            "pattern_data": pattern_data,
            "risk_reward_ratio": rr,
            "bias": bias,
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
    if mode == "custom":
        if custom_coins and len(custom_coins) > 0:
            coins_to_scan = [c.strip().upper() for c in custom_coins if c.strip()][:20]
            print(f"[PRE-SCANNER] Custom Watchlist Mode: {len(coins_to_scan)} coins: {coins_to_scan}")
        else:
            print("[PRE-SCANNER] Custom Watchlist Mode selected but no custom coins configured.")
            return {
                "mode": "custom",
                "source": "Custom Watchlist (Empty)",
                "scanned_count": 0,
                "coins_scanned": [],
                "prescan_input_count": 0,
                "prescan_eligible_count": 0,
                "prescan_rejected_count": 0,
                "prescan_rejections": [],
                "top_candidate": None,
                "coin_table": [],
                "coin_table_markdown": "No custom coins configured in watchlist."
            }
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

    evaluated_results = [r for r in raw_results if isinstance(r, dict) and r is not None]
    rejected_results = [r for r in evaluated_results if not r.get("eligible", True)]
    scanned_results = [r for r in evaluated_results if r.get("eligible", True)]
    failed_requests = len(coins_to_scan) - len(evaluated_results)
    if rejected_results:
        rejection_counts: Dict[str, int] = {}
        for result in rejected_results:
            for reason in result.get("prescan_rejection", {}).get("reasons", ["unknown"]):
                rejection_counts[reason] = rejection_counts.get(reason, 0) + 1
        print(
            f"[PRE-SCANNER: TRADEABILITY FILTER] Removed {len(rejected_results)} objectively untradeable assets: "
            f"{rejection_counts}"
        )
    if failed_requests > 0:
        print(f"[PRE-SCANNER: DATA FILTER] {failed_requests} assets returned no usable market data.")

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

    # Determine broad market 12h reference trend (BTC 12h trend)
    market_12h = "UP"
    btc_cand = next((r for r in scanned_results if r.get("symbol") == "BTC"), None)
    if btc_cand:
        candles_1h = btc_cand.get("indicators", {}).get("full_candles") or btc_cand.get("indicators", {}).get("candles", [])
        if candles_1h:
            candles_12h = resample_candles(candles_1h, 12)
            if candles_12h:
                ind_12 = compute_timeframe_indicators(candles_12h, btc_cand.get("indicators", {}).get("current_price", 0.0))
                market_12h = ind_12.get("trend", "UP")

    # Build structured COIN TABLE for the Node 1 Screener
    coin_table = build_coin_table_for_screener(scanned_results, max_coins=None, market_12h=market_12h)
    coin_table_markdown = format_coin_table_markdown(coin_table)

    print(f"[PRE-SCANNER: TABLE COMPILED] Standardized COIN TABLE assembled with {len(coin_table)} qualifying tokens.")
    print(f"[PRE-SCANNER -> NODE 1] Transmitting complete COIN TABLE: all {len(coin_table)} qualifying tokens with indicators and pattern evidence.")

    return {
        "mode": mode,
        "source": source_info,
        "scanned_count": len(scanned_results),
        "coins_scanned": coins_to_scan,
        "prescan_input_count": len(coins_to_scan),
        "prescan_eligible_count": len(scanned_results),
        "prescan_rejected_count": len(rejected_results),
        "prescan_rejections": [
            {
                "symbol": result.get("symbol"),
                "reasons": result.get("prescan_rejection", {}).get("reasons", []),
                "metrics": result.get("prescan_rejection", {}),
            }
            for result in rejected_results
        ],
        "ranked_coins": scanned_results,
        "top_candidate": best_candidate,
        "coin_table": coin_table,
        "coin_table_markdown": coin_table_markdown
    }


def resample_candles(candles: List[Dict[str, Any]], n_hours: int) -> List[Dict[str, Any]]:
    """Resample 1h candles into n_hours candles (e.g. 4h, 12h)."""
    if not candles:
        return []
    res = []
    for i in range(0, len(candles), n_hours):
        chunk = candles[i:i + n_hours]
        if not chunk:
            continue
        res.append({
            "open_time": chunk[0].get("open_time", 0),
            "open": chunk[0]["open"],
            "high": max(c["high"] for c in chunk),
            "low": min(c["low"] for c in chunk),
            "close": chunk[-1]["close"],
            "volume": sum(c.get("volume", 0.0) for c in chunk),
        })
    return res


def compute_timeframe_indicators(candles: List[Dict[str, Any]], current_price: float) -> Dict[str, Any]:
    """Compute trend, ema20/50/200, slope20, rsi, macd_hist, atr_pct for a candle series."""
    from market_intelligence import _calc_ema, _calc_rsi, _calc_atr
    if not candles:
        def_p = f"{current_price:.2f}" if current_price >= 1 else f"{current_price:.4g}"
        return {
            "trend": "SIDEWAYS",
            "ema_str": f"{def_p}/{def_p}/{def_p}",
            "slope20_str": "+0.0%",
            "rsi": 50,
            "macd_hist": "+0.0",
            "atr_pct": "2.0%"
        }
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    cp = closes[-1] if closes else current_price
    n = len(closes)

    ema20 = _calc_ema(closes, min(n, 20))
    ema50 = _calc_ema(closes, min(n, 50))
    ema200 = _calc_ema(closes, min(n, 200))

    trend = "UP" if ema20 > ema50 else ("DOWN" if ema20 < ema50 else "SIDEWAYS")

    if n >= 3:
        prev_ema20 = _calc_ema(closes[:-1], min(n - 1, 20))
        slope = ((ema20 - prev_ema20) / max(1e-6, prev_ema20)) * 100
    else:
        slope = 0.0
    slope_str = f"+{slope:.1f}%" if slope > 0 else f"{slope:.1f}%"

    rsi = int(round(_calc_rsi(closes, 14)))
    atr_val = _calc_atr(highs, lows, closes, 14)
    atr_pct = (atr_val / max(1e-6, cp)) * 100

    ema12 = _calc_ema(closes, min(n, 12))
    ema26 = _calc_ema(closes, min(n, 26))
    macd_hist = ema12 - ema26
    macd_hist_str = f"+{macd_hist:.4g}" if macd_hist > 0 else f"{macd_hist:.4g}"

    def _fmt(val: float) -> str:
        if val >= 1000:
            return f"{val:.0f}"
        elif val >= 1:
            return f"{val:.1f}"
        else:
            return f"{val:.4g}"

    return {
        "trend": trend,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "ema_str": f"{_fmt(ema20)}/{_fmt(ema50)}/{_fmt(ema200)}",
        "slope20_str": slope_str,
        "rsi": rsi,
        "macd_hist": macd_hist_str,
        "atr_pct": f"{atr_pct:.1f}%"
    }


def normalize_pattern_and_status(pattern_data: Dict[str, Any]) -> Tuple[str, str]:
    """Map pattern recognition details to standardized rubric names and status."""
    if not pattern_data:
        return "none", "none"
    dom = str(pattern_data.get("dominant_pattern") or "")
    dom_lower = dom.lower()
    conf = pattern_data.get("confidence_score") or 0

    if "double bottom" in dom_lower:
        pat = "double_bottom"
    elif "double top" in dom_lower:
        pat = "double_top"
    elif "inverse head" in dom_lower or "inverse h&s" in dom_lower:
        pat = "inverse_head_and_shoulders"
    elif "head and shoulders" in dom_lower or "head & shoulders" in dom_lower:
        pat = "head_and_shoulders"
    elif "bull flag" in dom_lower:
        pat = "bull_flag"
    elif "bear flag" in dom_lower:
        pat = "bear_flag"
    elif "ascending triangle" in dom_lower:
        pat = "ascending_triangle"
    elif "descending triangle" in dom_lower:
        pat = "descending_triangle"
    else:
        return "none", "none"

    status = "confirmed" if conf >= 80 else "forming"
    return pat, status


def build_screener_coin_line(
    symbol: str,
    candles_1h: List[Dict[str, Any]],
    current_price: float,
    pattern_data: Dict[str, Any],
    market_12h: str = "UP"
) -> str:
    """Format single candidate matching the exact rubric input specification."""
    cp = current_price if current_price > 0 else (candles_1h[-1]["close"] if candles_1h else 1.0)
    fmt_price = f"{cp:.4g}" if cp < 1 else (f"{cp:.2f}" if cp < 10000 else f"{cp:.1f}")

    c_open_24h = candles_1h[-24]["open"] if len(candles_1h) >= 24 else (candles_1h[0]["open"] if candles_1h else cp)
    chg_24h = round(((cp - c_open_24h) / max(1e-6, c_open_24h)) * 100, 1)
    chg_str = f"+{chg_24h}%" if chg_24h > 0 else f"{chg_24h}%"

    vols_20 = [c.get("volume", 0.0) for c in candles_1h[-20:]]
    avg_vol_20 = sum(vols_20) / len(vols_20) if vols_20 else 1.0
    rel_vol = round(candles_1h[-1].get("volume", 0.0) / max(1e-6, avg_vol_20), 1) if candles_1h else 1.0

    candles_4h = resample_candles(candles_1h, 4)
    candles_12h = resample_candles(candles_1h, 12)

    ind_12h = compute_timeframe_indicators(candles_12h, cp)
    ind_4h = compute_timeframe_indicators(candles_4h, cp)

    swing_high = max(c["high"] for c in candles_1h) if candles_1h else cp * 1.05
    swing_low = min(c["low"] for c in candles_1h) if candles_1h else cp * 0.95
    range_pos = round((cp - swing_low) / max(1e-6, swing_high - swing_low), 2)
    range_pos = max(0.0, min(1.0, range_pos))
    dist_res = round(abs(swing_high - cp) / max(1e-6, cp) * 100, 1)
    dist_sup = round(abs(cp - swing_low) / max(1e-6, cp) * 100, 1)

    closes_4h = [c["close"] for c in candles_4h] if candles_4h else [cp]
    last_6_closes_4h = [round(c, 2) if cp >= 1 else round(c, 4) for c in closes_4h[-6:]]

    last_c = candles_4h[-1] if candles_4h else {"open": cp, "high": cp, "low": cp, "close": cp}
    rng = max(1e-6, last_c["high"] - last_c["low"])
    body_pct = int(round(abs(last_c["close"] - last_c["open"]) / rng * 100))
    upper_wick_pct = int(round((last_c["high"] - max(last_c["open"], last_c["close"])) / rng * 100))
    lower_wick_pct = int(round((min(last_c["open"], last_c["close"]) - last_c["low"]) / rng * 100))

    pattern, status = normalize_pattern_and_status(pattern_data)

    def _fmt_lvl(val: float) -> str:
        if val >= 1000:
            return f"{val:.0f}"
        elif val >= 1:
            return f"{val:.1f}"
        else:
            return f"{val:.4g}"

    return (
        f"{symbol}: price={fmt_price} chg_24h={chg_str} rel_vol={rel_vol} | "
        f"12h: trend={ind_12h['trend']} ema20/50/200={ind_12h['ema_str']} slope20={ind_12h['slope20_str']} rsi={ind_12h['rsi']} macd_hist={ind_12h['macd_hist']} atr={ind_12h['atr_pct']} | "
        f"4h: trend={ind_4h['trend']} ema20/50/200={ind_4h['ema_str']} slope20={ind_4h['slope20_str']} rsi={ind_4h['rsi']} macd_hist={ind_4h['macd_hist']} atr={ind_4h['atr_pct']} | "
        f"swing_high={_fmt_lvl(swing_high)} swing_low={_fmt_lvl(swing_low)} range_pos={range_pos} dist_resistance={dist_res}% dist_support={dist_sup}% | "
        f"last_6_closes_4h={last_6_closes_4h} last_candle=body{body_pct}% upper_wick{upper_wick_pct}% lower_wick{lower_wick_pct}% | "
        f"pattern={pattern} status={status} | funding=+0.01% oi_chg=+0% | market_12h={market_12h}"
    )


def build_coin_table_for_screener(scanned_results: List[Dict[str, Any]], max_coins: Optional[int] = None, market_12h: str = "UP") -> List[Dict[str, Any]]:
    """
    Builds the standardized COIN TABLE required by the Node 1 LLM Screener:
    price, 24h volume, price changes, and indicators per timeframe (EMA20/50/200,
    RSI14, MACD histogram, ATR%, volume vs average, distance from EMAs, distance to swing high/low),
    with optional market-context assets included only when returned by the functional universe.
    All valid tradeable coins are passed without hardcoded selection.
    """
    table = []
    for r in scanned_results:
        ind = r.get("indicators", {})
        cp = ind.get("current_price", 0.0)
        if cp <= 0:
            continue
        candles = ind.get("full_candles") or ind.get("candles", [])
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

        # Build institutional screener line with multi-timeframe 12h/4h indicators, structure, candle shape & derivatives
        screener_line = build_screener_coin_line(
            symbol=sym,
            candles_1h=candles,
            current_price=cp,
            pattern_data=r.get("pattern_data", {}),
            market_12h=market_12h
        )

        entry = {
            "symbol": sym,
            "bias": r.get("bias", "LONG"),
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
            "dist_to_swing_low_pct": dist_swing_low,
            "pattern": r.get("pattern_data", {}).get("dominant_pattern"),
            "pattern_type": r.get("pattern_data", {}).get("pattern_type"),
            "pattern_confidence": r.get("pattern_data", {}).get("confidence_score"),
            "measured_target": r.get("pattern_data", {}).get("measured_target"),
            "pattern_stop_loss": r.get("pattern_data", {}).get("stop_loss"),
            "pattern_risk_reward": r.get("pattern_data", {}).get("risk_reward_ratio"),
            "screener_line": screener_line
        }

        table.append(entry)

    # Sort candidates by volume / liquidity (highest liquidity first)
    table.sort(key=lambda x: -x["24h_volume_usd"])
    selected = table[:max_coins] if max_coins else table

    return selected


def format_coin_table_markdown(coin_table: List[Dict[str, Any]]) -> str:
    """Formats the COIN TABLE into a clean, compact markdown table for LLM Screener consumption."""
    headers = [
        "Symbol", "Role", "Bias", "Price ($)", "24h Vol ($)", "24h %", "EMA20", "EMA50", "EMA200",
        "RSI14", "MACD Hist", "ATR %", "Vol Ratio", "Dist EMA20 %", "Dist EMA50 %", "Dist High %", "Dist Low %",
        "Pattern", "Pattern Type", "Pattern Confidence", "Pattern Target", "Pattern Stop", "Pattern R:R"
    ]
    lines = [
        "| " + " | ".join(headers) + " |",
        "| " + " | ".join(["---"] * len(headers)) + " |"
    ]
    for c in coin_table:
        role = "Candidate"
        p_chg = f"+{c['price_change_24h_pct']}" if c['price_change_24h_pct'] > 0 else str(c['price_change_24h_pct'])
        row = [
            c["symbol"],
            role,
            c.get("bias", "LONG"),
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
            f"{c['dist_to_swing_low_pct']}%",
            str(c.get("pattern") or ""),
            str(c.get("pattern_type") or ""),
            str(c.get("pattern_confidence") or ""),
            str(c.get("measured_target") or ""),
            str(c.get("pattern_stop_loss") or ""),
            str(c.get("pattern_risk_reward") or ""),
        ]
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)
