"""
Neptune AI v2   Market Data Service
Fetches live price data for strategy evaluation.
Separate module: does NOT touch existing chat/swap logic.
"""

import httpx
import os
from typing import Dict, Optional
from datetime import datetime, timedelta

# Simple in-memory price cache
_price_cache: Dict[str, Dict] = {}
_cache_timestamp: Optional[datetime] = None
CACHE_TTL = 300  # 5 minutes for free API

async def get_token_prices(tokens: list = None) -> Dict[str, float]:
    """
    Fetch current USD prices for tokens via CoinGecko free API.
    Returns {symbol: usd_price} dict. Uses memory cache with stale fallback.
    """
    global _price_cache, _cache_timestamp

    # 1. Check if cache is fresh
    if _cache_timestamp and (datetime.utcnow() - _cache_timestamp).seconds < CACHE_TTL:
        if tokens:
            return {t: _price_cache.get(t.lower(), 0) for t in tokens}
        return _price_cache

    # Default tokens to track
    coingecko_ids = {
        "near": "near", "eth": "ethereum", "btc": "bitcoin",
        "usdt": "tether", "usdc": "usd-coin", "sol": "solana",
        "bnb": "binancecoin", "arb": "arbitrum", "doge": "dogecoin",
        "xrp": "ripple", "flow": "flow",
    }
    ids_str = ",".join(coingecko_ids.values())

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(
                "https://api.coingecko.com/api/v3/simple/price",
                params={"ids": ids_str, "vs_currencies": "usd", "include_24hr_change": "true"}
            )
            resp.raise_for_status()
            data = resp.json()

        # Map back to symbols
        reverse_map = {v: k for k, v in coingecko_ids.items()}
        prices = {}
        changes = {}
        for cg_id, price_data in data.items():
            symbol = reverse_map.get(cg_id, cg_id)
            prices[symbol] = price_data.get("usd", 0)
            changes[symbol] = price_data.get("usd_24h_change", 0)

        _price_cache = prices
        _price_cache["_changes"] = changes
        _cache_timestamp = datetime.utcnow()

        print(f"[MARKET] Fetched prices for {len(prices)} tokens")
        return prices if not tokens else {t.lower(): prices.get(t.lower(), 0) for t in tokens}

    except Exception:
        # Fallback 1: CryptoCompare public endpoint (high throughput, no 429)
        try:
            async with httpx.AsyncClient(timeout=4) as client:
                cc_resp = await client.get(
                    "https://min-api.cryptocompare.com/data/pricemulti?fsyms=NEAR,BTC,ETH,SOL,BNB,ARB,DOGE,XRP,FLOW,USDT,USDC&tsyms=USD"
                )
                if cc_resp.status_code == 200:
                    cc_data = cc_resp.json()
                    fallback_prices = {"usdt": 1.0, "usdc": 1.0}
                    for sym, val in cc_data.items():
                        fallback_prices[sym.lower()] = float(val.get("USD", 0))
                    if len(fallback_prices) > 2:
                        _price_cache = fallback_prices
                        _price_cache["_changes"] = {}
                        _cache_timestamp = datetime.utcnow()
                        return fallback_prices if not tokens else {t.lower(): fallback_prices.get(t.lower(), 0) for t in tokens}
        except Exception:
            pass

        # Fallback 2: Binance API for major tokens
        try:
            async with httpx.AsyncClient(timeout=3) as client:
                resp = await client.get("https://api.binance.com/api/v3/ticker/price")
                if resp.status_code == 200:
                    data = resp.json()
                    binance_map = {
                        "BTCUSDT": "btc", "ETHUSDT": "eth", "NEARUSDT": "near",
                        "SOLUSDT": "sol", "BNBUSDT": "bnb", "ARBUSDT": "arb",
                        "DOGEUSDT": "doge", "XRPUSDT": "xrp"
                    }
                    fallback_prices = {"usdt": 1.0, "usdc": 1.0}
                    for item in data:
                        symbol = item.get("symbol")
                        if symbol in binance_map:
                            fallback_prices[binance_map[symbol]] = float(item.get("price", 0))
                    if len(fallback_prices) > 2:
                        _price_cache = fallback_prices
                        _price_cache["_changes"] = {}
                        _cache_timestamp = datetime.utcnow()
                        return fallback_prices if not tokens else {t.lower(): fallback_prices.get(t.lower(), 0) for t in tokens}
        except Exception:
            pass

        # Fallback 3: Stale memory cache or baseline prices
        if _price_cache:
            return _price_cache if not tokens else {t.lower(): _price_cache.get(t.lower(), 0) for t in tokens}

        baseline = {
            "near": 4.85, "eth": 2650.0, "btc": 68000.0, "sol": 172.0,
            "usdt": 1.0, "usdc": 1.0, "arb": 0.58, "bnb": 590.0
        }
        _price_cache = baseline
        return baseline if not tokens else {t.lower(): baseline.get(t.lower(), 0) for t in tokens}


async def get_price_change_24h(token: str) -> float:
    """Get 24h price change percentage for a token."""
    await get_token_prices()  # Ensure cache is fresh
    changes = _price_cache.get("_changes", {})
    return changes.get(token.lower(), 0.0)


async def check_price_alert(token: str, threshold_pct: float) -> Optional[Dict]:
    """
    Check if a token's 24h change exceeds the threshold.
    Returns alert dict if triggered, None otherwise.
    """
    change = await get_price_change_24h(token)
    if abs(change) >= abs(threshold_pct):
        direction = "dropped" if change < 0 else "surged"
        return {
            "token": token.upper(),
            "change_pct": round(change, 2),
            "direction": direction,
            "message": f"{token.upper()} has {direction} {abs(change):.1f}% in 24h"
        }
    return None
