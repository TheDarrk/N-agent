"""
Neptune AI — Live Twitter / X Social Sentiment Engine
Searches crypto hashtags (#NEAR, #BTC, #ETH, #SOL, etc.) using Twitter API v2.
If no TWITTER_BEARER_TOKEN is configured, returns clean disabled state with zero dummy tweets.
"""

import os
import httpx
from typing import Dict, Any, List

TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN") or os.getenv("X_BEARER_TOKEN", "")


async def search_twitter_sentiment(symbol: str = "NEAR") -> Dict[str, Any]:
    """
    Search Twitter/X for hashtag mentions of the asset (#NEAR, #BTC, etc.)
    and return structured social sentiment metrics if real API is configured.
    Zero dummy tweets generated.
    """
    hashtag = f"#{symbol.upper()}"
    query = f"{hashtag} (crypto OR trading OR defi OR price OR buy) -is:retweet lang:en"

    if TWITTER_BEARER_TOKEN:
        try:
            url = "https://api.twitter.com/2/tweets/search/recent"
            headers = {"Authorization": f"Bearer {TWITTER_BEARER_TOKEN}"}
            params = {
                "query": query,
                "max_results": 20,
                "tweet.fields": "created_at,public_metrics,text"
            }
            async with httpx.AsyncClient(timeout=6.0) as client:
                res = await client.get(url, headers=headers, params=params)
                if res.status_code == 200:
                    data = res.json()
                    tweets = data.get("data", [])
                    return _analyze_tweet_list(symbol, hashtag, tweets)
        except Exception as e:
            print(f"[TWITTER] Twitter API v2 notice: {e}")

    # No dummy data: return real disabled state
    return {
        "symbol": symbol.upper(),
        "hashtag": hashtag,
        "sentiment": "NEUTRAL",
        "bullish_pct": 50.0,
        "bearish_pct": 50.0,
        "viral_velocity_score": 0,
        "sample_tweets": [],
        "source": "None",
        "enabled": False
    }


def _analyze_tweet_list(symbol: str, hashtag: str, tweets: List[Dict]) -> Dict[str, Any]:
    """Analyze text of real tweets for positive/negative keywords."""
    bullish_keywords = {"bullish", "moon", "buy", "breakout", "accumulate", "pump", "ath", "long", "gem", "lfg", "crypto", "web3"}
    bearish_keywords = {"bearish", "dump", "sell", "scam", "drop", "crash", "short", "fud", "rekt"}

    bull_count = 0
    bear_count = 0
    sample_texts = []

    for t in tweets:
        text = t.get("text", "")
        sample_texts.append(text[:120])
        words = set(text.lower().split())
        if words.intersection(bullish_keywords):
            bull_count += 1
        if words.intersection(bearish_keywords):
            bear_count += 1

    total = max(1, bull_count + bear_count)
    bull_pct = round((bull_count / total) * 100, 1) if (bull_count + bear_count) > 0 else 50.0
    bear_pct = round(100.0 - bull_pct, 1)
    sentiment = "BULLISH" if bull_pct >= 60 else "BEARISH" if bear_pct >= 60 else "NEUTRAL"
    velocity = min(95, max(10, len(tweets) * 5))

    return {
        "symbol": symbol.upper(),
        "hashtag": hashtag,
        "sentiment": sentiment,
        "bullish_pct": bull_pct,
        "bearish_pct": bear_pct,
        "viral_velocity_score": velocity,
        "sample_tweets": sample_texts[:3],
        "source": "Twitter API v2 Live Feed",
        "enabled": True
    }
