"""
Neptune AI — Dynamic Daily Trending Coins Engine
Gathers top trending assets strictly filtered to NEAR 1-Click / Intents supported tokens.
Guarantees zero untradeable/random meme coins (e.g. UHI).
"""

import os
import json
import httpx
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

CACHE_FILE = os.path.join(os.path.dirname(__file__), "knowledge_base", "daily_trending_cache.json")
CACHE_TTL_SECONDS = 86400  # 24 Hours

# Strictly supported tokens on NEAR Intents / 1-Click protocol
SUPPORTED_1CLICK_TOKENS = {
    "NEAR", "WNEAR", "USDC", "USDT", "ETH", "WETH", "BTC", "WBTC",
    "SOL", "ARB", "OP", "AVAX", "BNB", "REF", "SWEAT", "AURORA", "PEPE", "DOGE", "TON"
}

FALLBACK_TRENDING_COINS = [
    "ETH", "SOL", "BTC", "NEAR", "ARB",
    "PEPE", "REF", "SWEAT", "AURORA", "OP",
    "AVAX", "BNB", "TON"
]


def _read_cache() -> Optional[Dict[str, Any]]:
    """Reads trending coin list from disk if fresh (< 24 hours old)."""
    if not os.path.exists(CACHE_FILE):
        return None
    try:
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cached_time = datetime.fromisoformat(data.get("timestamp"))
        now = datetime.now(timezone.utc)
        age_seconds = (now - cached_time).total_seconds()
        raw_coins = data.get("coins", [])
        # Ensure only supported tokens
        valid_coins = [c for c in raw_coins if c in SUPPORTED_1CLICK_TOKENS]
        if age_seconds < CACHE_TTL_SECONDS and len(valid_coins) >= 6:
            data["is_cached"] = True
            data["age_hours"] = round(age_seconds / 3600, 1)
            data["coins"] = valid_coins
            return data
    except Exception as e:
        print(f"[TRENDING] Cache read error: {e}")
    return None


def _write_cache(coins: List[str], source: str) -> Dict[str, Any]:
    """Writes updated trending coin list to disk."""
    now = datetime.now(timezone.utc)
    filtered = [c for c in coins if c in SUPPORTED_1CLICK_TOKENS]
    if not filtered:
        filtered = FALLBACK_TRENDING_COINS
    payload = {
        "timestamp": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "source": source,
        "count": len(filtered),
        "coins": filtered
    }
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
    except Exception as e:
        print(f"[TRENDING] Cache write error: {e}")
    return payload


async def get_daily_trending_coins(force_refresh: bool = False) -> Dict[str, Any]:
    """
    Returns top trending coins, strictly filtered to verified 1-Click supported tokens.
    """
    if not force_refresh:
        cached = _read_cache()
        if cached:
            return cached

    discovered_coins: List[str] = []
    source = "Core 1-Click Liquid Cryptocurrencies"

    # Attempt CoinGecko Free Trending Search API
    try:
        url = "https://api.coingecko.com/api/v3/search/trending"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(url, headers={"User-Agent": "NeptuneAI/2.0"})
            if res.status_code == 200:
                data = res.json()
                items = data.get("coins", [])
                for it in items:
                    sym = it.get("item", {}).get("symbol", "").strip().upper()
                    # CRITICAL: Only include tokens verified on NEAR Intents / 1-Click
                    if sym in SUPPORTED_1CLICK_TOKENS and sym not in discovered_coins:
                        discovered_coins.append(sym)
                if discovered_coins:
                    source = "CoinGecko Verified Trending (1-Click Supported)"
    except Exception as e:
        pass

    # Fill remaining slots with fallback supported assets
    for fb in FALLBACK_TRENDING_COINS:
        if fb not in discovered_coins:
            discovered_coins.append(fb)

    return _write_cache(discovered_coins[:20], source)
