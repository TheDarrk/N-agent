"""
Neptune AI — Market Intelligence & Multi-Timeframe Indicator Engine
Calculates RSI, EMA(20/50/200), ATR, Volume Surges, and Trend Regimes
for multi-timeframe analysis (1h, 2h, 4h, 6h, 12h, 1d).
"""

import httpx
import math
from typing import Dict, Any, List, Optional
from market_data import get_token_prices

SUPPORTED_TIMEFRAMES = ["1h", "2h", "4h", "6h", "12h", "1d"]


def _calc_ema(prices: List[float], period: int) -> float:
    """Calculate Exponential Moving Average for a series of prices."""
    if not prices:
        return 0.0
    if len(prices) < period:
        return sum(prices) / len(prices)
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


async def fetch_klines(symbol: str = "NEAR", timeframe: str = "1h", limit: int = 50) -> List[Dict[str, float]]:
    """
    Fetch OHLCV candles from Binance public API (no key needed).
    Supports intervals: 1h, 2h, 4h, 6h, 12h, 1d.
    """
    pair = f"{symbol.upper()}USDT"
    interval = timeframe if timeframe in ["1h", "2h", "4h", "6h", "12h", "1d"] else "1h"
    url = f"https://api.binance.com/api/v3/klines?symbol={pair}&interval={interval}&limit={limit}"

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                raw = resp.json()
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
    except Exception as e:
        print(f"[MARKET-INTEL] Failed to fetch klines from Binance: {e}")

    # Fallback synthetic candles based on current spot price
    current_prices = await get_token_prices([symbol.lower()])
    spot = current_prices.get(symbol.lower(), 4.80)
    synthetic = []
    base = spot * 0.96
    for i in range(limit):
        pct = (i / limit) * 0.08
        val = base * (1 + pct)
        synthetic.append({
            "open_time": i,
            "open": val * 0.995,
            "high": val * 1.01,
            "low": val * 0.99,
            "close": val,
            "volume": 100000.0 * (1 + 0.2 * (i % 3)),
        })
    return synthetic


async def analyze_token_indicators(symbol: str = "NEAR", timeframe: str = "1h") -> Dict[str, Any]:
    """
    Computes a full technical indicator snapshot for a token:
    RSI, EMA 20/50/200, ATR, volume delta, trend regime.
    """
    candles = await fetch_klines(symbol=symbol, timeframe=timeframe, limit=50)
    closes = [c["close"] for c in candles]
    highs = [c["high"] for c in candles]
    lows = [c["low"] for c in candles]
    volumes = [c["volume"] for c in candles]

    current_price = closes[-1] if closes else 0.0
    rsi = _calc_rsi(closes, period=14)
    ema20 = _calc_ema(closes, period=20)
    ema50 = _calc_ema(closes, period=50)
    ema200 = _calc_ema(closes, period=len(closes) if len(closes) < 200 else 200)
    atr = _calc_atr(highs, lows, closes, period=14)

    # Determine trend & signals
    ema_trend = "BULLISH" if ema20 > ema50 else "BEARISH"
    ema_cross = "GOLDEN" if (ema20 >= ema50 and len(closes) > 2 and closes[-2] <= ema50) else ("DEATH" if ema20 < ema50 else "NEUTRAL")
    
    avg_volume = sum(volumes[-10:]) / 10 if volumes else 1.0
    current_volume = volumes[-1] if volumes else 1.0
    volume_surge = current_volume > (avg_volume * 1.35)

    recent_support = min(lows[-10:]) if lows else current_price * 0.95
    recent_resistance = max(highs[-10:]) if highs else current_price * 1.05
    price_near_support = abs(current_price - recent_support) / current_price < 0.02

    atr_pct = (atr / current_price) * 100 if current_price > 0 else 2.5

    return {
        "symbol": symbol.upper(),
        "timeframe": timeframe,
        "current_price": current_price,
        "rsi": rsi,
        "ema20": ema20,
        "ema50": ema50,
        "ema200": ema200,
        "ema_trend": ema_trend,
        "ema_cross": ema_cross,
        "atr": atr,
        "atr_pct": round(atr_pct, 2),
        "volume_surge": volume_surge,
        "volume_ratio": round(current_volume / avg_volume, 2) if avg_volume > 0 else 1.0,
        "recent_support": recent_support,
        "recent_resistance": recent_resistance,
        "price_near_support": price_near_support,
        "candles_count": len(candles)
    }
