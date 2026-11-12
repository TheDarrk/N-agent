"""
Neptune AI — Market Intelligence & Multi-Timeframe Indicator Engine
Calculates RSI, EMA(20/50/200), ATR, Volume Surges, and Trend Regimes
for multi-timeframe analysis (1h, 2h, 4h, 6h, 12h, 1d).
"""

import asyncio
import httpx
import math
from typing import Dict, Any, List, Optional
from market_data import get_token_prices

SUPPORTED_TIMEFRAMES = ["1h", "2h", "4h", "6h", "12h", "1d"]

# Cached GeckoTerminal pool IDs for high-speed DEX candle resolution
_GECKO_POOL_CACHE: Dict[str, str] = {
    "CASHCAT": "robinhood_0xd42a491087a15e5afd51feb3606066cc152d2b09",
    "BLACKDRAGON": "near_nep141:blackdragon.tkn.near___nep141:wrap.near",
    "LONK": "near_nep141:token.lonkingnearbackto2024.near___nep141:wrap.near",
    "REF": "near_nep141:rft.token.near___nep141:wrap.near",
    "SWEAT": "near_nep141:token.sweat___nep141:wrap.near",
    "AURORA": "near_nep141:aaaaaa20d9e0e2461697782ee93754d45318355f.factory.bridge.near___nep141:wrap.near",
    "SHITZU": "near_nep141:token.0xshitzu.near___nep141:wrap.near",
}


def _calc_ema(prices: List[float], period: int) -> Optional[float]:
    """
    Calculate Exponential Moving Average for a series of prices.
    Returns None if there are fewer closed candles than the requested period,
    preventing fabricated / misleading moving averages on short windows.
    """
    if not prices or len(prices) < period:
        return None
    k = 2 / (period + 1)
    ema = sum(prices[:period]) / period
    for price in prices[period:]:
        ema = (price * k) + (ema * (1 - k))
    return round(ema, 4)


def _calc_rsi(prices: List[float], period: int = 14) -> float:
    """Calculate Relative Strength Index (RSI)."""
    if len(prices) < period + 1:
        return 50.0  # Neutral default

    gains, losses = [], []
    for i in range(1, len(prices)):
        delta = prices[i] - prices[i - 1]
        if delta >= 0:
            gains.append(delta)
            losses.append(0.0)
        else:
            gains.append(0.0)
            losses.append(abs(delta))

    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period

    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return round(rsi, 2)


def _calc_atr(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> float:
    """Calculate Average True Range (ATR) for dynamic SL/TP setting."""
    if len(closes) < 2:
        return closes[0] * 0.03 if closes else 0.1

    tr_list = []
    for i in range(1, len(closes)):
        h = highs[i] if i < len(highs) else closes[i]
        l = lows[i] if i < len(lows) else closes[i]
        c_prev = closes[i - 1]
        tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
        tr_list.append(tr)

    if not tr_list:
        return closes[-1] * 0.03

    atr = sum(tr_list[-period:]) / min(len(tr_list), period)
    return round(atr, 4)


def _calc_macd(closes: List[float]) -> Dict[str, float]:
    """Calculate MACD Line (12, 26), Signal Line (9), and Histogram."""
    if len(closes) < 26:
        return {"line": 0.0, "signal": 0.0, "hist": 0.0}

    k12 = 2 / 13
    k26 = 2 / 27
    cur_12 = sum(closes[:12]) / 12
    series_12 = [cur_12]
    for p in closes[12:]:
        cur_12 = (p * k12) + (cur_12 * (1 - k12))
        series_12.append(cur_12)

    cur_26 = sum(closes[:26]) / 26
    series_26 = [cur_26]
    for p in closes[26:]:
        cur_26 = (p * k26) + (cur_26 * (1 - k26))
        series_26.append(cur_26)

    offset = len(series_12) - len(series_26)
    macd_series = [series_12[offset + i] - series_26[i] for i in range(len(series_26))]

    if len(macd_series) < 9:
        line = macd_series[-1] if macd_series else 0.0
        return {"line": round(line, 4), "signal": round(line, 4), "hist": 0.0}

    k9 = 2 / 10
    signal = sum(macd_series[:9]) / 9
    for m in macd_series[9:]:
        signal = (m * k9) + (signal * (1 - k9))

    line = macd_series[-1]
    hist = line - signal
    return {"line": round(line, 4), "signal": round(signal, 4), "hist": round(hist, 4)}


def _calc_adx(highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> Dict[str, Any]:
    """Calculate Wilder's Average Directional Index (ADX) and +DI/-DI."""
    n = len(closes)
    if n < period * 2:
        return {"adx": 20.0, "plus_di": 20.0, "minus_di": 20.0, "trend_strength": "MODERATE"}

    tr_list, dm_plus, dm_minus = [], [], []
    for i in range(1, n):
        h, l, c_prev = highs[i], lows[i], closes[i - 1]
        tr = max(h - l, abs(h - c_prev), abs(l - c_prev))
        tr_list.append(tr)

        up_move = highs[i] - highs[i - 1]
        down_move = lows[i - 1] - lows[i]

        dm_plus.append(up_move if (up_move > down_move and up_move > 0) else 0.0)
        dm_minus.append(down_move if (down_move > up_move and down_move > 0) else 0.0)

    tr_smooth = sum(tr_list[:period])
    plus_smooth = sum(dm_plus[:period])
    minus_smooth = sum(dm_minus[:period])

    dx_list = []
    for i in range(period, len(tr_list)):
        tr_smooth = tr_smooth - (tr_smooth / period) + tr_list[i]
        plus_smooth = plus_smooth - (plus_smooth / period) + dm_plus[i]
        minus_smooth = minus_smooth - (minus_smooth / period) + dm_minus[i]

        plus_di = (plus_smooth / max(1e-6, tr_smooth)) * 100
        minus_di = (minus_smooth / max(1e-6, tr_smooth)) * 100

        di_sum = plus_di + minus_di
        dx = (abs(plus_di - minus_di) / max(1e-6, di_sum)) * 100
        dx_list.append(dx)

    if not dx_list:
        return {"adx": 20.0, "plus_di": 20.0, "minus_di": 20.0, "trend_strength": "MODERATE"}

    adx = sum(dx_list[-period:]) / min(len(dx_list), period)
    last_plus_di = round((plus_smooth / max(1e-6, tr_smooth)) * 100, 1)
    last_minus_di = round((minus_smooth / max(1e-6, tr_smooth)) * 100, 1)

    strength = "STRONG_TREND" if adx >= 25 else ("WEAK_CHOP" if adx < 20 else "DEVELOPING")
    return {
        "adx": round(adx, 1),
        "plus_di": last_plus_di,
        "minus_di": last_minus_di,
        "trend_strength": strength
    }


def _calc_bollinger_bands(closes: List[float], period: int = 20, num_std: float = 2.0) -> Dict[str, float]:
    """Calculate Bollinger Bands (Upper, Lower, Middle, %B, Bandwidth%)."""
    if len(closes) < period:
        cp = closes[-1] if closes else 1.0
        return {"upper": round(cp * 1.05, 4), "lower": round(cp * 0.95, 4), "mid": round(cp, 4), "percent_b": 0.5, "bandwidth_pct": 10.0}

    window = closes[-period:]
    sma = sum(window) / period
    variance = sum((p - sma) ** 2 for p in window) / period
    std = variance ** 0.5

    upper = sma + (num_std * std)
    lower = sma - (num_std * std)
    cp = closes[-1]

    band_range = max(1e-6, upper - lower)
    percent_b = (cp - lower) / band_range
    bandwidth_pct = (band_range / max(1e-6, sma)) * 100

    return {
        "upper": round(upper, 4),
        "lower": round(lower, 4),
        "mid": round(sma, 4),
        "percent_b": round(percent_b, 2),
        "bandwidth_pct": round(bandwidth_pct, 1)
    }


def _determine_structure_hint(
    current_price: float,
    ema20: Optional[float],
    ema50: Optional[float],
    ema200: Optional[float],
    slope20: float,
    rsi: float,
    adx_info: Dict[str, Any]
) -> str:
    """
    Deterministic rule-based classification hint for LLM context.
    Evaluates stacked EMAs, slopes, RSI momentum, and ADX strength.
    """
    if ema20 is None or ema50 is None:
        return "INSUFFICIENT_HISTORY"

    adx_val = adx_info.get("adx", 20.0)

    # Full Bullish expansion
    if current_price > ema20 and ema20 > ema50 and slope20 > 0.05:
        if ema200 and ema50 > ema200:
            return "FULL_BULLISH_EXPANSION"
        return "BULLISH_TREND"

    # Full Bearish expansion
    if current_price < ema20 and ema20 < ema50 and slope20 < -0.05:
        if ema200 and ema50 < ema200:
            return "FULL_BEARISH_EXPANSION"
        return "BEARISH_TREND"

    # Pullback states
    if ema20 > ema50 and slope20 >= 0 and current_price <= ema20:
        return "BULLISH_PULLBACK_SUPPORT"

    if ema20 < ema50 and slope20 <= 0 and current_price >= ema20:
        return "BEARISH_PULLBACK_RESISTANCE"

    if adx_val < 20 or abs(slope20) < 0.05:
        return "SIDEWAYS_CONSOLIDATION"

    return "MIXED_TRANSITION"


SYMBOL_ALIASES = {
    "WBTC": "BTC",
    "WETH": "ETH",
    "WNEAR": "NEAR",
    "CBBTC": "BTC",
    "HEMIBTC": "BTC",
    "WSTETH": "ETH",
    "XBTC": "BTC",
    "STNEAR": "NEAR",
    "CNEAR": "NEAR",
    "WNEARKAT": "NEAR",
}

_SHARED_HTTP_CLIENT: Optional[httpx.AsyncClient] = None


def get_market_http_client() -> httpx.AsyncClient:
    """Returns a shared, connection-pooled AsyncClient to prevent handshake latency & timeouts."""
    global _SHARED_HTTP_CLIENT
    if _SHARED_HTTP_CLIENT is None or _SHARED_HTTP_CLIENT.is_closed:
        _SHARED_HTTP_CLIENT = httpx.AsyncClient(
            limits=httpx.Limits(max_connections=80, max_keepalive_connections=30),
            timeout=httpx.Timeout(connect=2.5, read=3.5, write=2.5, pool=5.0)
        )
    return _SHARED_HTTP_CLIENT


async def fetch_klines(symbol: str, timeframe: str = "1h", limit: int = 50) -> List[Dict[str, Any]]:
    """
    Fetches real candlestick Kline data with multi-endpoint load balancing and failover:
    1. Bybit Public Spot (Rotates between api.bytick.com and api.bybit.com).
    2. Gate.io Public Spot.
    3. Binance Public Spot (failover with fast timeout).
    4. GeckoTerminal DEX OHLCV (On-chain candles).
    Returns empty list if no real exchange data is available (never fabricates synthetic candles).
    """
    clean_sym = symbol.strip().upper()
    lookup_sym = SYMBOL_ALIASES.get(clean_sym, clean_sym)

    bybit_interval = "60" if timeframe == "1h" else ("120" if timeframe == "2h" else ("240" if timeframe == "4h" else ("720" if timeframe == "12h" else ("D" if timeframe == "1d" else ("W" if timeframe in ["1w", "weekly"] else "60")))))
    pair = f"{lookup_sym}USDT"
    client = get_market_http_client()

    # 1. Primary: Bybit Public Spot Klines with Dual Domain Load Balancing (bytick CDN + bybit primary)
    for bybit_host in ("https://api.bytick.com", "https://api.bybit.com"):
        try:
            bybit_url = f"{bybit_host}/v5/market/kline?category=spot&symbol={pair}&interval={bybit_interval}&limit={limit}"
            resp = await client.get(bybit_url)
            if resp.status_code == 200:
                raw = resp.json().get("result", {}).get("list", [])
                if raw and len(raw) >= 10:
                    candles = []
                    for k in reversed(raw):
                        candles.append({
                            "open_time": int(k[0]),
                            "open": float(k[1]),
                            "high": float(k[2]),
                            "low": float(k[3]),
                            "close": float(k[4]),
                            "volume": float(k[5]),
                        })
                    return candles
        except Exception:
            pass

    # 2. Secondary: Gate.io Public Spot Klines
    try:
        gate_tf = "1h" if timeframe == "1h" else ("2h" if timeframe == "2h" else ("4h" if timeframe == "4h" else ("12h" if timeframe == "12h" else ("1d" if timeframe == "1d" else ("7d" if timeframe in ["1w", "weekly"] else "1h")))))
        gate_url = f"https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair={lookup_sym}_USDT&interval={gate_tf}&limit={limit}"
        resp = await client.get(gate_url)
        if resp.status_code == 200:
            raw = resp.json()
            if isinstance(raw, list) and len(raw) >= 10:
                candles = []
                for k in raw:
                    candles.append({
                        "open_time": int(k[0]) * 1000,
                        "open": float(k[5]),
                        "high": float(k[3]),
                        "low": float(k[4]),
                        "close": float(k[2]),
                        "volume": float(k[1]),
                    })
                return candles
    except Exception:
        pass

    # 3. Tertiary: Binance Public API (Fast fail-safe timeout)
    try:
        interval = timeframe if timeframe in ["1h", "2h", "4h", "6h", "12h", "1d", "1w"] else "1h"
        binance_url = f"https://api.binance.com/api/v3/klines?symbol={pair}&interval={interval}&limit={limit}"
        resp = await client.get(binance_url)
        if resp.status_code == 200:
            raw = resp.json()
            if isinstance(raw, list) and len(raw) >= 10:
                candles = []
                for k in raw:
                    candles.append({
                        "open_time": k[0],
                        "open": float(k[1]),
                        "high": float(k[2]),
                        "low": float(k[3]),
                        "close": float(k[4]),
                        "volume": float(k[5]),
                    })
                return candles
    except Exception:
        pass

    # 4. Quaternary: GeckoTerminal DEX OHLCV (Real on-chain candles for all NEAR & cross-chain tokens)
    try:
        gt_tf = "hour"
        gt_agg = 1
        if timeframe == "2h":
            gt_tf, gt_agg = "hour", 2
        elif timeframe == "4h":
            gt_tf, gt_agg = "hour", 4
        elif timeframe in ["1d", "24h"]:
            gt_tf, gt_agg = "day", 1
        elif timeframe in ["1w", "weekly"]:
            gt_tf, gt_agg = "day", 7

        pool_id = _GECKO_POOL_CACHE.get(lookup_sym)
        headers = {"Accept": "application/json;version=20230302"}
        if not pool_id:
            sr = await client.get(f"https://api.geckoterminal.com/api/v2/search/pools?query={lookup_sym}", headers=headers)
            if sr.status_code == 200:
                pools = sr.json().get("data", [])
                if pools:
                    best_pool = pools[0]
                    for p in pools:
                        p_name = p.get("attributes", {}).get("name", "").upper()
                        if lookup_sym in p_name:
                            best_pool = p
                            break
                    cand_id = best_pool.get("id")
                    if cand_id and "_" in cand_id:
                        pool_id = cand_id
                        _GECKO_POOL_CACHE[lookup_sym] = pool_id

        if pool_id and "_" in pool_id:
            network, pool_addr = pool_id.split("_", 1)
            ohlcv_url = f"https://api.geckoterminal.com/api/v2/networks/{network}/pools/{pool_addr}/ohlcv/{gt_tf}?aggregate={gt_agg}&limit={limit}"
            or_resp = await client.get(ohlcv_url, headers=headers)
            if or_resp.status_code == 200:
                raw_list = or_resp.json().get("data", {}).get("attributes", {}).get("ohlcv_list", [])
                if raw_list and len(raw_list) >= 5:
                    candles = []
                    for k in reversed(raw_list):
                        candles.append({
                            "open_time": int(k[0]) * 1000,
                            "open": float(k[1]),
                            "high": float(k[2]),
                            "low": float(k[3]),
                            "close": float(k[4]),
                            "volume": float(k[5]),
                        })
                    return candles
    except Exception:
        pass

    # Real Data Integrity Guard: Never generate synthetic, fabricated, or cloned candles.
    # If exchanges and DEXes do not have real candles, return empty list to drop the asset.
    return []

def summarize_lookback(candles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Summarize raw candles from the requested lookback without aggregation loss."""
    if not candles:
        return {
            "candles_count": 0,
            "open": 0.0,
            "close": 0.0,
            "high": 0.0,
            "low": 0.0,
            "average_open": 0.0,
            "average_close": 0.0,
            "average_high": 0.0,
            "average_low": 0.0,
            "average_volume": 0.0,
            "total_volume": 0.0,
            "range_pct": 0.0,
            "average_candle_range_pct": 0.0,
            "average_body_pct": 0.0,
            "ema20": 0.0,
            "ema50": 0.0,
            "ema200": 0.0,
            "ema_trend": "NEUTRAL",
            "ema_spread_pct": 0.0,
        }

    opens = [float(c.get("open") or 0.0) for c in candles]
    closes = [float(c.get("close") or 0.0) for c in candles]
    highs = [float(c.get("high") or 0.0) for c in candles]
    lows = [float(c.get("low") or 0.0) for c in candles]
    volumes = [float(c.get("volume") or 0.0) for c in candles]
    valid_opens = [value for value in opens if value > 0]
    first_open = valid_opens[0] if valid_opens else 0.0
    last_close = closes[-1] if closes else 0.0
    avg_close = sum(closes) / len(closes) if closes else 0.0
    candle_ranges = [
        (high - low) / open_price * 100.0
        for open_price, high, low in zip(opens, highs, lows)
        if open_price > 0
    ]
    body_ranges = [
        abs(close - open_price) / open_price * 100.0
        for open_price, close in zip(opens, closes)
        if open_price > 0
    ]
    closes_for_ema = closes
    ema20 = _calc_ema(closes_for_ema, 20) if closes_for_ema else 0.0
    ema50 = _calc_ema(closes_for_ema, 50) if closes_for_ema else 0.0
    ema200 = _calc_ema(closes_for_ema, 200) if closes_for_ema else 0.0
    return {
        "candles_count": len(candles),
        "open": first_open,
        "close": last_close,
        "high": max(highs) if highs else 0.0,
        "low": min(lows) if lows else 0.0,
        "average_open": sum(opens) / len(opens) if opens else 0.0,
        "average_close": avg_close,
        "average_high": sum(highs) / len(highs) if highs else 0.0,
        "average_low": sum(lows) / len(lows) if lows else 0.0,
        "average_volume": sum(volumes) / len(volumes) if volumes else 0.0,
        "total_volume": sum(volumes),
        "range_pct": ((max(highs) - min(lows)) / first_open * 100.0) if first_open > 0 else 0.0,
        "move_pct": ((last_close - first_open) / first_open * 100.0) if first_open > 0 else 0.0,
        "average_candle_range_pct": sum(candle_ranges) / len(candle_ranges) if candle_ranges else 0.0,
        "average_body_pct": sum(body_ranges) / len(body_ranges) if body_ranges else 0.0,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "ema_trend": "BULLISH" if ema20 > ema50 else "BEARISH" if ema20 < ema50 else "NEUTRAL",
        "ema_spread_pct": abs(ema20 - ema50) / ema50 * 100.0 if ema50 > 0 else 0.0,
    }


async def analyze_token_indicators(
    symbol: str = "NEAR",
    timeframe: str = "1h",
    limit: int = 250,
    include_lookback_summary: bool = False,
    period_fast: int = 20,
    period_slow: int = 50,
    period_macro: int = 200,
    days: int = 14,
    pro_settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Computes a full technical indicator snapshot for a token:
    RSI, configurable EMAs (fast, slow, macro), ATR, volume delta, trend regime.
    Uses closed candles only (drops currently forming candle to prevent look-ahead bias).
    Returns None for EMA macro when fewer candles than macro period are available.
    """
    cfg = pro_settings or {}
    fast_p = int(cfg.get("ema_fast") or cfg.get("trader_ema_fast") or period_fast or 20)
    slow_p = int(cfg.get("ema_slow") or cfg.get("trader_ema_slow") or period_slow or 50)
    macro_p = int(cfg.get("ema_macro") or cfg.get("trader_ema_macro") or period_macro or 200)
    days_p = int(cfg.get("ema_days") or cfg.get("trader_ema_days") or days or 14)

    fetch_limit = max(limit, macro_p + 20)
    raw_candles = await fetch_klines(symbol=symbol, timeframe=timeframe, limit=fetch_limit)
    # Exclude the still-forming candle to avoid look-ahead noise and mid-bar signal flip
    candles = raw_candles[:-1] if len(raw_candles) > 1 else raw_candles

    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c["volume"] for c in candles]

    current_price = closes[-1] if closes else 0.0
    rsi = _calc_rsi(closes, period=14)
    ema_fast = _calc_ema(closes, period=fast_p)
    ema_slow = _calc_ema(closes, period=slow_p)
    ema_macro = _calc_ema(closes, period=macro_p)  # None if len(closes) < macro_p
    atr = _calc_atr(highs, lows, closes, period=14)

    # Slope of Fast EMA
    if len(closes) >= 3 and ema_fast is not None:
        prev_ema_fast = _calc_ema(closes[:-1], min(len(closes) - 1, fast_p))
        slope_fast = round(((ema_fast - prev_ema_fast) / max(1e-6, prev_ema_fast)) * 100, 2) if prev_ema_fast else 0.0
    else:
        slope_fast = 0.0

    # Institutional indicators & structure hint
    macd_data = _calc_macd(closes)
    adx_data = _calc_adx(highs, lows, closes, period=14)
    bb_data = _calc_bollinger_bands(closes, period=20, num_std=2.0)
    structure_hint = _determine_structure_hint(
        current_price=current_price,
        ema20=ema_fast,
        ema50=ema_slow,
        ema200=ema_macro,
        slope20=slope_fast,
        rsi=rsi,
        adx_info=adx_data
    )

    # Determine trend & signals (safe when EMAs are None)
    if ema_fast is not None and ema_slow is not None:
        if ema_fast > ema_slow and slope_fast > 0:
            ema_trend = "BULLISH"
        elif ema_fast < ema_slow and slope_fast < 0:
            ema_trend = "BEARISH"
        else:
            ema_trend = "SIDEWAYS"
        ema_cross = "GOLDEN" if (ema_fast >= ema_slow and len(closes) > 2 and closes[-2] <= ema_slow) else ("DEATH" if ema_fast < ema_slow else "NEUTRAL")
    else:
        ema_trend = "INSUFFICIENT_HISTORY"
        ema_cross = "NEUTRAL"
    
    # Check volume presence
    has_valid_volume = any(v > 0 for v in volumes[-10:]) if volumes else False
    if has_valid_volume:
        avg_volume = sum(volumes[-10:]) / 10
        current_volume = volumes[-1] if volumes else 0.0
        volume_surge = current_volume > (avg_volume * 1.35)
        volume_ratio = round(current_volume / avg_volume, 2) if avg_volume > 0 else None
    else:
        avg_volume = None
        volume_surge = False
        volume_ratio = None

    recent_support = min(lows[-10:]) if lows else current_price * 0.95
    recent_resistance = max(highs[-10:]) if highs else current_price * 1.05
    price_near_support = (abs(current_price - recent_support) / current_price < 0.02) if current_price > 0 else False

    atr_pct = (atr / current_price) * 100 if current_price > 0 else 2.5

    result = {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "current_price": current_price,
        "rsi": rsi,
        "ema20": ema_fast,
        "ema50": ema_slow,
        "ema200": ema_macro,
        "ema_fast": ema_fast,
        "ema_slow": ema_slow,
        "ema_macro": ema_macro,
        "ema_periods": {"fast": fast_p, "slow": slow_p, "macro": macro_p, "days": days_p},
        "slope20": slope_fast,
        "slope_fast": slope_fast,
        "ema_trend": ema_trend,
        "ema_cross": ema_cross,
        "structure_hint": structure_hint,
        "structure_hint_note": "Mathematically calculated reference hint; LLM evaluates all raw levels independently.",
        "macd": macd_data,
        "adx": adx_data,
        "bollinger_bands": bb_data,
        "atr": atr,
        "atr_pct": round(atr_pct, 2),
        "volume_surge": volume_surge,
        "volume_ratio": volume_ratio,
        "recent_support": recent_support,
        "recent_resistance": recent_resistance,
        "price_near_support": price_near_support,
        "candles_count": len(candles),
        "candles": candles
    }
    if include_lookback_summary:
        result["lookback_summary"] = summarize_lookback(candles)
        if timeframe == "1h":
            result["one_week_1h"] = result["lookback_summary"]
    return result


async def fetch_chart_tool(symbol: str, timeframe: str = "1h", limit: int = 50) -> Dict[str, Any]:
    """
    Dedicated Chart & Pattern Analysis Tool.
    Can be called by Node 1 or LLM Council for any symbol & timeframe (1h, 2h, 4h, 1d, 1w).
    Returns candlesticks, technical indicators, geometric patterns, measured move targets, and invalidation stops.
    """
    from pattern_recognition import analyze_chart_patterns
    indicators = await analyze_token_indicators(symbol=symbol, timeframe=timeframe)
    candles = indicators.get("candles") or []
    current_price = indicators.get("current_price", 1.0)
    atr = indicators.get("atr", current_price * 0.03)
    pattern_data = analyze_chart_patterns(candles=candles, current_price=current_price, atr=atr)

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "current_price": current_price,
        "indicators": indicators,
        "candles": candles,
        "pattern_data": pattern_data,
        "pattern_name": pattern_data.get("dominant_pattern"),
        "pattern_type": pattern_data.get("pattern_type"),
        "measured_target": pattern_data.get("measured_target"),
        "stop_loss": pattern_data.get("stop_loss"),
        "risk_reward_ratio": pattern_data.get("risk_reward_ratio", 2.0),
        "patterns_found": [p.get("name") for p in pattern_data.get("patterns_found", [])],
        "candles_count": len(candles)
    }


async def get_chart_data_bundle(
    symbol: str = "NEAR",
    timeframes: Optional[List[str]] = None,
    prefetched: Optional[Dict[str, Any]] = None,
    days: int = 1,
) -> Dict[str, Any]:
    """Return one complete, de-duplicated chart data bundle for an asset.

    The functional scanner can pass its already computed timeframe snapshot as
    ``prefetched``. The council then receives the same candles, indicators, and
    patterns instead of fetching the selected asset a second time.
    """
    if timeframes is None:
        timeframes = ["1h", "2h", "4h", "1d", "1w"]

    ordered_timeframes = []
    for tf in timeframes:
        clean_tf = str(tf).strip().lower()
        if clean_tf and clean_tf not in ordered_timeframes:
            ordered_timeframes.append(clean_tf)

    async def _prefetched_or_fetch(tf: str) -> Dict[str, Any]:
        if prefetched and str(prefetched.get("timeframe", "")).lower() == tf:
            indicators = prefetched.get("indicators", prefetched)
            pattern = prefetched.get("pattern_data", {})
            return {
                "symbol": symbol.upper(),
                "timeframe": tf,
                "current_price": indicators.get("current_price"),
                "indicators": indicators,
                "candles": indicators.get("candles", []),
                "pattern_data": pattern,
                "pattern_name": pattern.get("dominant_pattern"),
                "pattern_type": pattern.get("pattern_type"),
                "measured_target": pattern.get("measured_target"),
                "stop_loss": pattern.get("stop_loss"),
                "risk_reward_ratio": pattern.get("risk_reward_ratio", 2.0),
                "candles_count": len(indicators.get("candles", [])),
            }
        hours = {"1h": 1, "2h": 2, "4h": 4, "12h": 12, "1d": 24}.get(tf, 24)
        limit = max(50, min(500, int((max(1, days) * 24) / hours) + 10))
        return await fetch_chart_tool(symbol=symbol, timeframe=tf, limit=limit)

    results = await asyncio.gather(
        *[_prefetched_or_fetch(tf) for tf in ordered_timeframes],
        return_exceptions=True,
    )

    timeframe_details: Dict[str, Dict[str, Any]] = {}
    full_data: Dict[str, Dict[str, Any]] = {}
    bullish_count = 0
    total_valid = 0
    for tf, res in zip(ordered_timeframes, results):
        if not isinstance(res, dict):
            continue
        ind = res.get("indicators", {})
        pattern = res.get("pattern_data", {})
        timeframe_details[tf] = {
            "current_price": ind.get("current_price"),
            "rsi": ind.get("rsi"),
            "ema20": ind.get("ema20"),
            "ema50": ind.get("ema50"),
            "ema200": ind.get("ema200"),
            "trend": ind.get("ema_trend"),
            "cross": ind.get("ema_cross"),
            "atr": ind.get("atr"),
            "recent_support": ind.get("recent_support"),
            "recent_resistance": ind.get("recent_resistance"),
            "volume_surge": ind.get("volume_surge"),
            "volume_ratio": ind.get("volume_ratio"),
            "pattern": res.get("pattern_name") or pattern.get("dominant_pattern"),
            "target": res.get("measured_target") or pattern.get("measured_target"),
            "stop_loss": res.get("stop_loss") or pattern.get("stop_loss"),
            "risk_reward": res.get("risk_reward_ratio") or pattern.get("risk_reward_ratio"),
        }
        indicator_context = {
            key: value for key, value in ind.items()
            if key != "candles"
        }
        full_data[tf] = {
            "timeframe": tf,
            "indicators": indicator_context,
            "pattern_data": pattern,
            "candles": res.get("candles") or ind.get("candles", []),
        }
        if ind.get("ema_trend") == "BULLISH":
            bullish_count += 1
        total_valid += 1

    macro_alignment = (
        "STRONG_BULLISH" if bullish_count >= 4
        else ("MODERATE_BULLISH" if bullish_count >= 3
        else ("MIXED" if bullish_count == 2 else "BEARISH"))
    )
    return {
        "symbol": symbol.upper(),
        "timeframes_analyzed": ordered_timeframes,
        "macro_alignment": macro_alignment,
        "bullish_timeframes_count": f"{bullish_count}/{total_valid}",
        "timeframe_details": timeframe_details,
        "full_data": full_data,
        "requested_days": days,
    }


async def analyze_multiframe_market_tool(symbol: str, timeframes: Optional[List[str]] = None) -> Dict[str, Any]:
    """
    Multi-timeframe Candlestick & Pattern Confluence Analysis Tool.
    Evaluates market structure across 1h, 2h, 4h, 1d, 1w for Node 1 and LLM Council.
    """
    return await get_chart_data_bundle(symbol=symbol, timeframes=timeframes)


async def compute_btc_beta_and_correlations(symbols: List[str]) -> Dict[str, Any]:
    """
    Computes 30-day closed daily returns, Beta to BTC, correlation to BTC,
    and a pairwise correlation matrix for all candidate tokens.
    Provides portfolio volatility estimate so risk parity accounts for cross-asset co-movement.
    """
    clean_syms = list(set(s.upper() for s in symbols if s.upper() not in ["USDT", "USDC", "DAI", "USN"]))
    
    # Fetch 30-day closed daily candles for BTC
    raw_btc = await fetch_klines(symbol="BTC", timeframe="1d", limit=35)
    btc_candles = raw_btc[:-1] if len(raw_btc) > 1 else raw_btc
    btc_closes = [c["close"] for c in btc_candles]
    
    def _pct_returns(closes: List[float]) -> List[float]:
        return [(closes[i] - closes[i-1]) / closes[i-1] for i in range(1, len(closes)) if closes[i-1] > 0]
    
    btc_returns = _pct_returns(btc_closes)
    n_days = len(btc_returns)
    if n_days < 5:
        return {"btc_beta": {}, "btc_correlation": {}, "correlation_matrix": {}, "portfolio_volatility_pct": 3.0}

    # Fetch daily closes for each candidate token
    token_returns: Dict[str, List[float]] = {}
    for sym in clean_syms:
        try:
            raw_k = await fetch_klines(symbol=sym, timeframe="1d", limit=35)
            k_candles = raw_k[:-1] if len(raw_k) > 1 else raw_k
            closes = [c["close"] for c in k_candles]
            rets = _pct_returns(closes)
            if len(rets) >= 5:
                # Align to min length
                token_returns[sym] = rets[-n_days:]
        except Exception:
            pass

    def _cov(x: List[float], y: List[float]) -> float:
        n = min(len(x), len(y))
        if n < 2: return 0.0
        mx = sum(x[:n]) / n
        my = sum(y[:n]) / n
        return sum((x[i] - mx) * (y[i] - my) for i in range(n)) / (n - 1)

    def _std(x: List[float]) -> float:
        n = len(x)
        if n < 2: return 0.0
        mx = sum(x) / n
        return math.sqrt(sum((xi - mx) ** 2 for xi in x) / (n - 1))

    btc_std = _std(btc_returns)
    btc_var = btc_std ** 2 if btc_std > 0 else 0.0001

    btc_beta: Dict[str, float] = {}
    btc_corr: Dict[str, float] = {}
    for sym, rets in token_returns.items():
        cov = _cov(rets, btc_returns)
        s = _std(rets)
        btc_beta[sym] = round(cov / btc_var, 3)
        btc_corr[sym] = round(cov / (s * btc_std), 3) if (s > 0 and btc_std > 0) else 0.0

    # Pairwise correlation matrix
    all_keys = list(token_returns.keys())
    matrix: Dict[str, Dict[str, float]] = {}
    for s1 in all_keys:
        matrix[s1] = {}
        for s2 in all_keys:
            if s1 == s2:
                matrix[s1][s2] = 1.0
            else:
                c = _cov(token_returns[s1], token_returns[s2])
                s1_sd = _std(token_returns[s1])
                s2_sd = _std(token_returns[s2])
                matrix[s1][s2] = round(c / (s1_sd * s2_sd), 3) if (s1_sd > 0 and s2_sd > 0) else 0.0

    # Aggregate average volatility across candidate tokens (annualized approx)
    avg_daily_vol = (sum(_std(r) for r in token_returns.values()) / len(token_returns)) if token_returns else 0.03
    est_annual_vol_pct = round(avg_daily_vol * math.sqrt(365) * 100.0, 1)

    return {
        "btc_beta": btc_beta,
        "btc_correlation": btc_corr,
        "correlation_matrix": matrix,
        "avg_daily_volatility_pct": round(avg_daily_vol * 100.0, 2),
        "est_annualized_volatility_pct": est_annual_vol_pct
    }
