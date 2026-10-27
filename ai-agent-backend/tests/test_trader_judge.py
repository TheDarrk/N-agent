import pytest
import asyncio
import time
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from coin_scanner import scan_coin_universe
from trading_book_rag import trading_book_rag
from twitter_sentiment import search_twitter_sentiment
from autonomous_agents.trader_agent import TraderAgent
from database import init_db, upsert_user, create_agent_wallet, assign_agent_wallets


def setup_module(module):
    init_db()


def test_coin_scanner_auto_and_custom():
    # Test Auto Mode (20 coins from daily trending)
    auto_res = asyncio.run(scan_coin_universe(mode="auto", timeframe="1h"))
    assert auto_res["mode"] == "auto"
    assert auto_res["scanned_count"] >= 10
    assert auto_res["top_candidate"] is not None
    assert "symbol" in auto_res["top_candidate"]

    # Test Custom Watchlist Mode (capped at 20)
    custom_list = ["NEAR", "WETH", "PEPE", "SOL"]
    custom_res = asyncio.run(scan_coin_universe(mode="custom", custom_coins=custom_list, timeframe="1h"))
    assert custom_res["mode"] == "custom"
    assert 0 < custom_res["scanned_count"] <= 4
    assert custom_res["prescan_input_count"] == 4
    assert custom_res["prescan_eligible_count"] == custom_res["scanned_count"]
    assert custom_res["prescan_rejected_count"] + custom_res["scanned_count"] <= 4
    assert custom_res["top_candidate"] is not None


def test_trading_book_rag():
    indicators = {
        "symbol": "NEAR",
        "current_price": 5.4,
        "rsi": 52.0,
        "ema_trend": "BULLISH",
        "volume_surge": True,
        "atr": 0.25
    }
    chunks = trading_book_rag.retrieve(indicators, top_k=2)
    assert len(chunks) > 0
    xml_block = trading_book_rag.format_for_xml_prompt(chunks)
    assert "<retrieved_trading_book_knowledge>" in xml_block
    assert "</retrieved_trading_book_knowledge>" in xml_block


def test_twitter_sentiment():
    sentiment = asyncio.run(search_twitter_sentiment("NEAR"))
    assert sentiment["symbol"] == "NEAR"
    assert "sentiment" in sentiment
    assert "bullish_pct" in sentiment
    assert "viral_velocity_score" in sentiment
    assert isinstance(sentiment["sample_tweets"], list)


def test_trader_agent_pipeline():
    user_wallet = f"test_trader_{int(time.time())}.near"
    upsert_user(user_wallet, {
        "trader_min_confidence": 70,
        "trader_timeframe": "1h",
        "trader_risk_profile": "moderate",
        "trader_max_trades_per_day": 20,
        "trader_max_trades_per_week": 50,
        "trader_enable_researcher": 0,
        "kill_switch": 0,
        "max_tx_amount": 100.0
    })

    w = create_agent_wallet(user_wallet, label="Trader Execution Wallet")
    assign_agent_wallets(user_wallet, {"trader": str(w["id"])})

    trader = TraderAgent()
    result = asyncio.run(trader.run_pipeline(
        user_wallet=user_wallet,
        symbol="NEAR",
        coin_mode="custom",
        force_min_confidence=70
    ))

    assert "verdict" in result
    assert "confidence_score" in result
    assert "expected_roi_pct" in result
    assert "binary_evidence_checks" in result
    assert "cid" in result
    assert "chart_image" in result
    assert "ascii_chart" in result
    assert "twitter_sentiment" in result
