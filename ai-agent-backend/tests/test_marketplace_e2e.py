import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import (
    init_db,
    publish_marketplace_agent,
    get_marketplace_agents,
    hire_marketplace_agent,
    get_user_hires,
    cancel_marketplace_hire,
    mirror_trade_to_subscribers,
    get_subscribers_for_creator_agent,
    get_open_trades
)

def setup_module(module):
    init_db()

def test_marketplace_sharing_and_validation():
    # 1. Publish Trader agent with 15% profit share
    res_trader = publish_marketplace_agent(
        creator_wallet="trader_pro.testnet",
        agent_type="trader",
        name="Titan Trend Trader",
        description="Scalps NEAR/USDT breakouts using Book RAG & EMA indicators",
        pricing_type="profit_share",
        pricing_value=15.0,
        config_snapshot={"max_capital_usd": 150.0, "timeframe": "1h", "rsi_oversold": 30}
    )
    assert "listing_id" in res_trader
    assert res_trader["name"] == "Titan Trend Trader"
    assert res_trader["pricing_value"] == 15.0
    listing_id = res_trader["listing_id"]

    # 2. Publish Rebalancer agent with 0.05 NEAR per trade
    res_rebalancer = publish_marketplace_agent(
        creator_wallet="rebalance_master.testnet",
        agent_type="rebalancer",
        name="Portfolio Drift Guard",
        description="Auto rebalances portfolio to 70/30 NEAR/USDT when drift > 5%",
        pricing_type="fee_per_trade",
        pricing_value=0.05,
        config_snapshot={"drift_threshold_pct": 5.0, "rebalance_target": {"NEAR": 70, "USDT": 30}}
    )
    assert "listing_id" in res_rebalancer
    assert res_rebalancer["pricing_value"] == 0.05

    # 3. Publish Research agent with 0.1 NEAR per report
    res_research = publish_marketplace_agent(
        creator_wallet="deep_analyst.testnet",
        agent_type="research",
        name="Crypto RAG Intelligence",
        description="On-demand fundamental & technical synthesis",
        pricing_type="fee_per_report",
        pricing_value=0.1,
        config_snapshot={"depth": "comprehensive"}
    )
    assert "listing_id" in res_research
    assert res_research["pricing_value"] == 0.1

    # 4. Prohibit Moderator/Watchdog sharing
    with pytest.raises(ValueError, match="prohibited from marketplace sharing"):
        publish_marketplace_agent(
            creator_wallet="admin.testnet",
            agent_type="moderator",
            name="Platform Watchdog",
            description="Moderator should not be shareable",
            pricing_type="profit_share",
            pricing_value=10.0
        )

    # 5. Fetch marketplace listings and verify format
    listings = get_marketplace_agents()
    assert len(listings) >= 3
    trader_listing = next((x for x in listings if x["listing_id"] == listing_id), None)
    assert trader_listing is not None
    assert trader_listing["creator_wallet"] == "trader_pro.testnet"
    assert trader_listing["fee_display"] == "15% Profit Share"

def test_marketplace_hiring_and_trade_mirroring():
    # Publish an agent to hire
    pub = publish_marketplace_agent(
        creator_wallet="alpha_trader.testnet",
        agent_type="trader",
        name="Alpha Scalper",
        description="High Sharpe momentum scalper",
        pricing_type="profit_share",
        pricing_value=12.5,
        config_snapshot={"max_capital_usd": 100.0}
    )
    listing_id = pub["listing_id"]

    subscriber_wallet = "copier_user.testnet"

    # Hire the agent
    hire_res = hire_marketplace_agent(subscriber_wallet=subscriber_wallet, listing_id=listing_id)
    assert hire_res["success"] is True

    # Check active hires for user
    user_hires_data = get_user_hires(subscriber_wallet)
    my_hires = user_hires_data["my_hires"]
    assert len(my_hires) >= 1
    assert any(h["listing_id"] == listing_id and h["status"] == "active" for h in my_hires)

    # Check subscriber lookup for creator's trader agent
    subscribers = get_subscribers_for_creator_agent(creator_wallet="alpha_trader.testnet", agent_type="trader")
    sub_wallets = [s["subscriber_wallet"] for s in subscribers]
    assert subscriber_wallet in sub_wallets

    # Creator takes a trade
    creator_trade_data = {
        "symbol": "NEAR",
        "action": "BUY",
        "entry_price": 4.50,
        "amount_usd": 100.0,
        "tp_price": 4.95,
        "sl_price": 4.35,
        "confidence_score": 85,
        "expected_roi_pct": 10.0,
        "tx_hash": "tx_creator_12345"
    }

    # Mirror trade to subscribers
    mirrored_ids = mirror_trade_to_subscribers(
        creator_wallet="alpha_trader.testnet",
        trade_data=creator_trade_data,
        cid_ref="bafy_test_cid"
    )
    assert len(mirrored_ids) >= 1

    # Verify subscriber has mirrored trade in open trades
    sub_trades = get_open_trades(subscriber_wallet)
    assert len(sub_trades) >= 1
    mirrored_trade = next((t for t in sub_trades if t["id"] in mirrored_ids), None)
    assert mirrored_trade is not None
    assert mirrored_trade["symbol"] == "NEAR"
    assert mirrored_trade["action"] == "BUY"
    assert mirrored_trade["entry_price"] == 4.50

    # Cancel hire
    cancel_res = cancel_marketplace_hire(subscriber_wallet, listing_id)
    assert cancel_res is True

    # Verify subscriber is no longer active
    subscribers_after = get_subscribers_for_creator_agent(creator_wallet="alpha_trader.testnet", agent_type="trader")
    sub_wallets_after = [s["subscriber_wallet"] for s in subscribers_after]
    assert subscriber_wallet not in sub_wallets_after
