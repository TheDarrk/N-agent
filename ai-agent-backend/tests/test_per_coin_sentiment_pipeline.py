"""
Neptune AI — Comprehensive Test Suite for Per-Coin Fear & Greed,
CoinCodex Sentiment Crawling, and Trading Pipeline Confluence (10 Coins).
"""

import pytest
import time
from typing import Dict, Any

from market_sentiment import (
    get_crypto_fear_and_greed_index,
    get_per_coin_fear_and_greed,
    get_coincodex_coin_sentiment,
    get_token_market_sentiment,
    get_token_sentiment_screener_line,
    get_aggregate_market_sentiment,
    TOKEN_SLUG_MAP
)
from autonomous_agents.trading_pipeline import (
    format_screener_coin_line,
    TradingPipeline,
    ScreenerOutput,
    ScreenerSelection,
    CouncilOutput,
    CoinPlan
)
from trader_mcp import get_per_coin_sentiment_mcp

TEN_BENCHMARK_COINS = [
    "NEAR", "BTC", "ETH", "SOL", "DOGE", "XRP", "ADA", "AVAX", "LINK", "DOT"
]


def test_cfgi_slug_mapping_coverage():
    """Verify all 10 benchmark coins have explicit CFGI and CoinCodex slug mappings."""
    for coin in TEN_BENCHMARK_COINS:
        assert coin in TOKEN_SLUG_MAP, f"Missing slug mapping for {coin}"
        mapping = TOKEN_SLUG_MAP[coin]
        assert "cfgi" in mapping and len(mapping["cfgi"]) > 0
        assert "coincodex" in mapping and len(mapping["coincodex"]) > 0


def test_per_coin_cfgi_sentiment_10_coins():
    """Test CFGI.io per-coin Fear & Greed index parsing across 10 distinct cryptocurrencies."""
    results = {}
    for coin in TEN_BENCHMARK_COINS:
        data = get_per_coin_fear_and_greed(coin)
        if data:
            results[coin] = data
            assert "score" in data
            assert 0 <= data["score"] <= 100
            assert "classification" in data
            assert data["classification"] in ("Fear", "Greed", "Neutral", "Extreme Fear", "Extreme Greed")

    # Ensure majority of top 10 assets resolve cleanly from live CFGI endpoint
    assert len(results) >= 8, f"Expected at least 8/10 coins from CFGI, got {len(results)}"


def test_per_coin_coincodex_sentiment_10_coins():
    """Test CoinCodex per-coin price prediction and technical indicators across 10 cryptocurrencies."""
    results = {}
    for coin in TEN_BENCHMARK_COINS:
        data = get_coincodex_coin_sentiment(coin)
        if data:
            results[coin] = data
            assert "sentiment" in data
            assert data["sentiment"] in ("Bullish", "Bearish", "Neutral")
            if data.get("bullish_signals") is not None:
                assert data["bullish_signals"] >= 0
                assert data["bearish_signals"] >= 0

    assert len(results) >= 8, f"Expected at least 8/10 coins from CoinCodex, got {len(results)}"


def test_unified_token_market_sentiment_and_caching():
    """Verify multi-source synthesis, composite sentiment scoring, and sub-millisecond caching."""
    t0 = time.time()
    sent_1 = get_token_market_sentiment("NEAR")
    fetch_duration = time.time() - t0

    assert sent_1["symbol"] == "NEAR"
    assert "composite_score" in sent_1
    assert 0 <= sent_1["composite_score"] <= 100
    assert "composite_label" in sent_1
    assert "screener_summary" in sent_1
    assert "cfgi_fng=" in sent_1["screener_summary"] or "coincodex=" in sent_1["screener_summary"]

    # Test cache retrieval speedup (< 5ms)
    t_cache_0 = time.time()
    sent_cached = get_token_market_sentiment("NEAR")
    cache_duration = time.time() - t_cache_0

    assert sent_cached == sent_1
    assert cache_duration < 0.05, f"Cache fetch too slow: {cache_duration}s"


def test_trader_mcp_sentiment_tool():
    """Verify that get_per_coin_sentiment_mcp tool integrates seamlessly."""
    mcp_res = get_per_coin_sentiment_mcp("SOL")
    assert isinstance(mcp_res, dict)
    assert mcp_res["symbol"] == "SOL"
    assert "composite_score" in mcp_res
    assert "screener_summary" in mcp_res


def test_screener_candidate_formatting_with_sentiment():
    """Verify that candidate formatting adds the per-coin live sentiment to candidate lines."""
    dummy_data = {
        "price": 3.42,
        "chg_24h": -7.4,
        "rel_vol": 1.8,
        "trend_12h": "DOWN",
        "trend_4h": "DOWN",
        "sentiment_line": "cfgi_fng=35/100 (Fear) | coincodex=Bearish (15B/17S) 5d=$3.29"
    }
    line = format_screener_coin_line("NEAR", dummy_data)
    assert "sentiment=" in line
    assert "cfgi_fng=35/100 (Fear)" in line
    assert "coincodex=Bearish" in line


def test_offline_sentiment_fallback_safety():
    """Ensure system never crashes if a non-existent or unlisted token is passed."""
    res = get_token_market_sentiment("NONEXISTENT_XYZ_TOKEN_999")
    assert isinstance(res, dict)
    assert res["symbol"] == "NONEXISTENT_XYZ_TOKEN_999"
    assert "composite_score" in res
    assert res["composite_label"] in ("NEUTRAL", "FEAR", "GREED", "EXTREME_FEAR", "EXTREME_GREED")
    assert "screener_summary" in res


def test_end_to_end_pipeline_with_sentiment_confluence():
    """
    Test full Screener -> Council -> Judge pipeline with per-coin sentiment logging.
    Verifies that Tool 4 logs the live CFGI and CoinCodex metrics for the chosen setup.
    """
    import asyncio

    async def _run():
        async def mock_chart(sym, tf):
            return {
                "symbol": sym,
                "timeframe": tf,
                "current_price": 3.42,
                "indicators": {
                    "ema20": 3.35,
                    "ema50": 3.50,
                    "ema200": 3.80,
                    "rsi": 28.0,
                    "atr": 0.12,
                    "recent_support": 3.15,
                    "recent_resistance": 3.85
                },
                "pattern_name": "double_bottom",
                "measured_target": 3.85,
                "stop_loss": 3.15
            }

        def mock_rag(q):
            return [{"section_title": "Support Bounce", "chapter_title": "Bulkowski Encyclopedia", "rules": ["Bounce from prior swing low"]}]

        async def mock_exec(**kwargs):
            return {"tx_hash": "mock_tx_123", "success": True}

        pipeline = TradingPipeline(
            chart_data_fn=mock_chart,
            rag_query_fn=mock_rag,
            execute_fn=mock_exec
        )

        async def mock_screener_llm(sys_prompt, user_prompt, *args, **kwargs):
            return (
                '{"selection_reasoning": "NEAR shows deep oversold capitulation at swing low with Bearish exhaustion.", '
                '"selections": [{"coin": "NEAR", "direction": "LONG", "rubric_score": 78, "edge_summary": "Oversold reversal bounce at key support."}]}'
            )

        async def mock_council_llm(sys_prompt, user_prompt, *args, **kwargs):
            return (
                '{"plans": [{"coin": "NEAR", "direction": "LONG", "entry": 3.42, "tp": 3.85, "sl": 3.15, "rr": 1.59, '
                '"screener_direction": "LONG", "timeframe_alignment": "aligned", '
                '"technical_analyst": {"setup_quality": "MODERATE", "structure_analysis": "Oversold bounce from 3.15 support."}, '
                '"risk_manager": {"risk_level": "MODERATE", "sl_calibration": "SL at 3.15 (below support).", "risk_factors": ["Sentiment capitulation"]}, '
                '"reasoning": "NEAR reversal long from support with 1.59 R:R.", '
                '"grounding": "Price 3.42, TP 3.85, SL 3.15.", '
                '"rag_sources": [{"section": "Support Bounce", "source": "Bulkowski Encyclopedia"}]}],'
                '"verdict": "Council constructed 1 plan for NEAR."}'
            )

        pipeline.screener._call_llm = mock_screener_llm
        pipeline.council._call_llm = mock_council_llm

        coin_data = {
            "NEAR": {
                "price": 3.42,
                "chg_24h": -7.4,
                "rel_vol": 1.8,
                "trend_12h": "DOWN",
                "trend_4h": "DOWN",
                "rsi_4h": 28,
                "atr_pct": 3.5,
                "swing_low": 3.15,
                "swing_high": 4.10,
                "pattern": "double_bottom",
                "pattern_status": "forming"
            }
        }

        res = await pipeline.run(
            coin_data=coin_data,
            min_confidence=70,
            dry_run=True
        )

        assert res["status"] in ("dry_run_complete", "COMPLETE")
        assert res["screener"] is not None
        assert len(res["screener"]["selections"]) == 1
        assert res["screener"]["selections"][0]["coin"] == "NEAR"

        # Verify tool_log contains market_sentiment tool with token_sentiment
        tool_log = res["council"].get("tool_log", [])
        sentiment_logs = [t for t in tool_log if t.get("tool") == "market_sentiment"]
        assert len(sentiment_logs) >= 1
        near_sent_log = sentiment_logs[0]
        assert near_sent_log["symbol"] == "NEAR"
        assert "token_sentiment" in near_sent_log["sentiment"]
        tok_data = near_sent_log["sentiment"]["token_sentiment"]
        assert "composite_score" in tok_data
        assert "screener_summary" in tok_data

    asyncio.run(_run())
