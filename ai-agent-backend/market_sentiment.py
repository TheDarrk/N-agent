"""
Neptune AI — Live Institutional Market Sentiment & Multi-Source Index Engine
Fetches, crawls, and aggregates real-time sentiment from:
  1. CFGI.io: Per-Coin Live Fear & Greed Index (e.g. https://cfgi.io/near-fear-greed-index/)
  2. CoinCodex: Per-Coin Price Prediction, Technical Indicator Bull/Bear Counts & 5-Day Forecasts
  3. Alternative.me: Global Macroeconomic Crypto Fear & Greed Index
  4. CoinGecko: Aggregated Community Bullish/Bearish sentiment votes
Provides structured sentiment context and scoring to Screener, Council, and Judge nodes.
"""

import urllib.request
import json
import time
import re
from typing import Dict, Any, Optional

_SENTIMENT_CACHE: Dict[str, Any] = {
    "last_macro_fetch": 0,
    "fear_and_greed": None,
    "token_sentiment": {}
}

TOKEN_SLUG_MAP = {
    "NEAR": {"cfgi": "near", "coincodex": "near-protocol", "name": "NEAR Protocol"},
    "BTC": {"cfgi": "bitcoin", "coincodex": "bitcoin", "name": "Bitcoin"},
    "ETH": {"cfgi": "ethereum", "coincodex": "ethereum", "name": "Ethereum"},
    "SOL": {"cfgi": "solana", "coincodex": "solana", "name": "Solana"},
    "DOGE": {"cfgi": "doge", "coincodex": "dogecoin", "name": "Dogecoin"},
    "XRP": {"cfgi": "ripple", "coincodex": "xrp", "name": "XRP"},
    "ADA": {"cfgi": "cardano", "coincodex": "cardano", "name": "Cardano"},
    "AVAX": {"cfgi": "avalanche", "coincodex": "avalanche", "name": "Avalanche"},
    "LINK": {"cfgi": "chainlink", "coincodex": "chainlink", "name": "Chainlink"},
    "DOT": {"cfgi": "polkadot", "coincodex": "polkadot", "name": "Polkadot"},
    "MATIC": {"cfgi": "polygon", "coincodex": "polygon", "name": "Polygon"},
    "POL": {"cfgi": "polygon", "coincodex": "polygon", "name": "Polygon"},
    "SHIB": {"cfgi": "shiba-inu", "coincodex": "shiba-inu", "name": "Shiba Inu"},
    "LTC": {"cfgi": "litecoin", "coincodex": "litecoin", "name": "Litecoin"},
    "UNI": {"cfgi": "uniswap", "coincodex": "uniswap", "name": "Uniswap"},
    "ATOM": {"cfgi": "cosmos", "coincodex": "cosmos", "name": "Cosmos"},
    "PEPE": {"cfgi": "pepe", "coincodex": "pepe", "name": "Pepe"},
    "SUI": {"cfgi": "sui", "coincodex": "sui", "name": "Sui"},
    "APT": {"cfgi": "aptos", "coincodex": "aptos", "name": "Aptos"},
    "OP": {"cfgi": "optimism", "coincodex": "optimism", "name": "Optimism"},
    "ARB": {"cfgi": "arbitrum", "coincodex": "arbitrum", "name": "Arbitrum"},
    "TRX": {"cfgi": "tron", "coincodex": "tron", "name": "TRON"},
    "BNB": {"cfgi": "binance-coin", "coincodex": "binance-coin", "name": "BNB"},
    "ZEC": {"cfgi": "zcash", "coincodex": "zcash", "name": "Zcash"},
    "DASH": {"cfgi": "dash", "coincodex": "dash", "name": "Dash"},
    "XLM": {"cfgi": "stellar", "coincodex": "stellar", "name": "Stellar"},
    "BCH": {"cfgi": "bitcoin-cash", "coincodex": "bitcoin-cash", "name": "Bitcoin Cash"},
    "FIL": {"cfgi": "filecoin", "coincodex": "filecoin", "name": "Filecoin"},
    "ICP": {"cfgi": "internet-computer", "coincodex": "internet-computer", "name": "Internet Computer"},
    "NEAR.TESTNET": {"cfgi": "near", "coincodex": "near-protocol", "name": "NEAR Protocol"}
}

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8'
}


def resolve_slugs(symbol: str) -> Dict[str, str]:
    """Resolves symbol to CFGI and CoinCodex URL slugs."""
    clean = symbol.upper().strip().lstrip("$")
    if clean in TOKEN_SLUG_MAP:
        return TOKEN_SLUG_MAP[clean]
    base = clean.split(".")[0].replace("W", "").lower()
    return {
        "cfgi": base,
        "coincodex": base,
        "name": clean
    }


def get_crypto_fear_and_greed_index() -> Dict[str, Any]:
    """
    Fetches real-time Macroeconomic Crypto Fear & Greed Index from alternative.me.
    Cached for 10 minutes to respect API rate limits.
    """
    now = time.time()
    if _SENTIMENT_CACHE["fear_and_greed"] and (now - _SENTIMENT_CACHE["last_macro_fetch"]) < 600:
        return _SENTIMENT_CACHE["fear_and_greed"]

    try:
        req = urllib.request.Request(
            "https://api.alternative.me/fng/?limit=1",
            headers={"User-Agent": "NeptuneAI/2.1 (Decentralized Autonomous Trading)"}
        )
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and "data" in data and len(data["data"]) > 0:
                item = data["data"][0]
                val = int(item.get("value", 50))
                classification = item.get("value_classification", "Neutral")

                # Institutional Trading Guidance
                if val >= 75:
                    regime = "EXTREME_GREED"
                    guidance = "Market is in Extreme Greed. Extended FOMO risk; demand higher R:R and beware of liquidation flushes on longs."
                elif val >= 55:
                    regime = "GREED"
                    guidance = "Market is in Greed. Momentum breakouts have favorable follow-through; favor trend-continuation setups."
                elif val <= 25:
                    regime = "EXTREME_FEAR"
                    guidance = "Market is in Extreme Fear. High capitulation; watch for sharp short-squeezes and high-volume double bottoms."
                elif val <= 45:
                    regime = "FEAR"
                    guidance = "Market is cautious. Be defensive on breakout trades; confirm with volume surges and structural support."
                else:
                    regime = "NEUTRAL"
                    guidance = "Market sentiment is balanced. Technical chart structure and moving averages take precedence."

                result = {
                    "index_value": val,
                    "value": val,
                    "classification": classification,
                    "value_classification": classification,
                    "regime": regime,
                    "guidance": guidance,
                    "timestamp": item.get("timestamp")
                }
                _SENTIMENT_CACHE["fear_and_greed"] = result
                _SENTIMENT_CACHE["last_macro_fetch"] = now
                return result
    except Exception:
        pass

    fallback = {
        "index_value": 50,
        "value": 50,
        "classification": "Neutral",
        "value_classification": "Neutral",
        "regime": "NEUTRAL",
        "guidance": "Neutral market baseline. Technical chart levels and moving averages drive trade decisions.",
        "timestamp": str(int(now))
    }
    return fallback


def get_per_coin_fear_and_greed(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Crawls CFGI.io per-coin Fear & Greed Index (https://cfgi.io/{slug}-fear-greed-index/).
    Extracts live individual asset fear/greed score and classification.
    """
    slug_info = resolve_slugs(symbol)
    slug = slug_info["cfgi"]
    url = f"https://cfgi.io/{slug}-fear-greed-index/"

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=4.0) as resp:
            html = resp.read().decode('utf-8', errors='ignore')

            val = None
            sentiment = None

            # Pattern 1: Title tag "<title>Near Protocol Fear and Greed Index Today: 35 (Fear)</title>"
            title_m = re.search(r'<title>([^<]+)</title>', html, re.I)
            if title_m:
                t = title_m.group(1)
                m = re.search(r'Index Today:\s*(\d{1,3})\s*(?:\(([^)]+)\))?', t, re.I)
                if m:
                    val = int(m.group(1))
                    if m.group(2):
                        sentiment = m.group(2).strip()

            # Pattern 2: Meta description "NEAR is Fear at 35"
            if val is None:
                desc_m = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']', html, re.I)
                if desc_m:
                    d = desc_m.group(1)
                    m = re.search(r'is\s+([A-Za-z\s]+?)\s+at\s+(\d{1,3})', d, re.I)
                    if m:
                        sentiment = m.group(1).strip()
                        val = int(m.group(2))

            if val is not None:
                if sentiment is None:
                    sentiment = "Greed" if val >= 55 else ("Fear" if val <= 45 else "Neutral")
                return {
                    "source": "CFGI.io",
                    "score": val,
                    "classification": sentiment,
                    "url": url
                }
    except Exception:
        pass
    return None


def get_coincodex_coin_sentiment(symbol: str) -> Optional[Dict[str, Any]]:
    """
    Crawls CoinCodex price prediction analysis (https://coincodex.com/crypto/{slug}/price-prediction/).
    Extracts prediction sentiment, technical indicators bull/bear count, 5-day price forecast, and F&G.
    """
    slug_info = resolve_slugs(symbol)
    slug = slug_info["coincodex"]
    url = f"https://coincodex.com/crypto/{slug}/price-prediction/"

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=5.0) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            clean = re.sub(r'<[^>]+>', ' ', html)
            clean = ' '.join(clean.split())

            # Sentiment (e.g. "price prediction sentiment is bearish", or "Sentiment Bearish")
            sent_m = re.search(r'price prediction sentiment is\s*([A-Za-z]+)', clean, re.I)
            if not sent_m:
                sent_m = re.search(r'Sentiment\s+([A-Za-z]+)', clean, re.I)

            # Indicator breakdown (e.g. "15 technical analysis indicators signaling bullish signals, and 17 signaling bearish")
            sig_m = re.search(
                r'(\d+)\s*technical analysis indicators signaling bullish signals,\s*and\s*(\d+)\s*signaling bearish',
                clean,
                re.I
            )

            # 5-day prediction target
            pred_m = re.search(r'5-Day Prediction\s*\$?\s*([\d,\.]+)', clean, re.I)

            # Fear & Greed index in CoinCodex
            fng_m = re.search(r'Fear\s*&\s*Greed Index\s*(\d{1,3})\s*(?:\(([^)]+)\))?', clean, re.I)

            return {
                "source": "CoinCodex",
                "sentiment": sent_m.group(1).capitalize() if sent_m else "Neutral",
                "bullish_signals": int(sig_m.group(1)) if sig_m else None,
                "bearish_signals": int(sig_m.group(2)) if sig_m else None,
                "five_day_prediction": f"${pred_m.group(1)}" if pred_m else None,
                "fng": int(fng_m.group(1)) if fng_m else None,
                "url": url
            }
    except Exception:
        pass
    return None


def get_token_market_sentiment(symbol: str) -> Dict[str, Any]:
    """
    Computes unified per-token sentiment by aggregating:
      1. CFGI.io per-coin Fear & Greed index
      2. CoinCodex price prediction & technical indicator breakdown
      3. CoinGecko community vote ratio
    Cached in memory for 10 minutes to prevent redundant network crawling.
    """
    sym = symbol.upper().strip().lstrip("$")
    now = time.time()

    cached = _SENTIMENT_CACHE["token_sentiment"].get(sym)
    if cached and (now - cached.get("fetched_at", 0)) < 600:
        return cached

    cfgi_data = get_per_coin_fear_and_greed(sym)
    codex_data = get_coincodex_coin_sentiment(sym)

    # Optional CoinGecko community fallback
    cg_up = 55.0
    cg_down = 45.0
    try:
        url = f"https://api.coingecko.com/api/v3/coins/{sym.lower()}"
        req = urllib.request.Request(url, headers={"User-Agent": "NeptuneAI/2.1"})
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            cg_up = float(data.get("sentiment_votes_up_percentage", 55.0) or 55.0)
            cg_down = float(data.get("sentiment_votes_down_percentage", 45.0) or 45.0)
    except Exception:
        pass

    # Synthesize composite score (0-100)
    scores = []
    if cfgi_data and cfgi_data.get("score") is not None:
        scores.append(float(cfgi_data["score"]))
    if codex_data and codex_data.get("fng") is not None:
        scores.append(float(codex_data["fng"]))

    # Factor CoinCodex bullish vs bearish signals ratio into score
    if codex_data and codex_data.get("bullish_signals") is not None and codex_data.get("bearish_signals") is not None:
        total_sig = max(1, codex_data["bullish_signals"] + codex_data["bearish_signals"])
        sig_score = (codex_data["bullish_signals"] / total_sig) * 100.0
        scores.append(sig_score)

    if not scores:
        # Fallback to community or neutral 50
        scores.append(cg_up)

    composite_score = round(sum(scores) / len(scores), 1)

    if composite_score >= 75:
        composite_label = "EXTREME_GREED"
        sentiment_bias = "BULLISH"
    elif composite_score >= 55:
        composite_label = "GREED"
        sentiment_bias = "BULLISH"
    elif composite_score <= 25:
        composite_label = "EXTREME_FEAR"
        sentiment_bias = "BEARISH_CAPITULATION"
    elif composite_score <= 45:
        composite_label = "FEAR"
        sentiment_bias = "BEARISH"
    else:
        composite_label = "NEUTRAL"
        sentiment_bias = "NEUTRAL"

    # Format human-readable summary for Screener and Council prompt insertion
    parts = []
    if cfgi_data and cfgi_data.get("score") is not None:
        parts.append(f"cfgi_fng={cfgi_data['score']}/100 ({cfgi_data['classification']})")
    if codex_data and codex_data.get("sentiment"):
        sig_str = f" ({codex_data['bullish_signals']}B/{codex_data['bearish_signals']}S)" if codex_data.get("bullish_signals") is not None else ""
        pred_str = f" 5d_forecast={codex_data['five_day_prediction']}" if codex_data.get("five_day_prediction") else ""
        parts.append(f"coincodex={codex_data['sentiment']}{sig_str}{pred_str}")
    if not parts:
        parts.append(f"community_bullish={cg_up:.0f}%")

    screener_summary = " | ".join(parts)

    res = {
        "symbol": sym,
        "composite_score": composite_score,
        "composite_label": composite_label,
        "sentiment_bias": sentiment_bias,
        "cfgi": cfgi_data,
        "coincodex": codex_data,
        "community_sentiment": {
            "up_pct": cg_up,
            "down_pct": cg_down
        },
        "screener_summary": screener_summary,
        "fetched_at": now
    }

    _SENTIMENT_CACHE["token_sentiment"][sym] = res
    return res


def get_token_sentiment_screener_line(symbol: str) -> str:
    """Returns concise 1-line per-coin sentiment for Screener prompt candidate formatting."""
    sent = get_token_market_sentiment(symbol)
    return sent.get("screener_summary", f"cfgi_fng=50/100 (Neutral)")


def get_aggregate_market_sentiment(symbol: Optional[str] = None) -> Dict[str, Any]:
    """
    Combines macroeconomic Crypto Fear & Greed Index with per-coin sentiment.
    Callable by LLM trading agents (Screener, Council, Judge).
    """
    macro_fng = get_crypto_fear_and_greed_index()
    res = {
        "fear_and_greed": macro_fng,
        "macro_regime": macro_fng["regime"],
        "macro_guidance": macro_fng["guidance"]
    }
    if symbol:
        res["token_sentiment"] = get_token_market_sentiment(symbol)
    return res
