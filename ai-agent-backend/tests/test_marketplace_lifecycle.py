"""
End-to-end marketplace lifecycle for EVERY sellable agent (trader, rebalancer, research):
  seller configures -> lists -> a different user sees it -> duplicate listing is blocked ->
  buyer orders + pays (mocked on-chain tx) -> configuration is pasted into the buyer's agent ->
  seller deletes (always allowed) -> agent slot is freed -> can list again.
Also: edit lock (24h), moderator is never listable, no profit-share fields on USDT listings.
"""
import os
import sys
import uuid

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
sys.path.append(os.path.dirname(__file__))

from test_marketplace_usdt import _make_mock_rpc_tx, make_valid_base58  # noqa: E402
from database import (  # noqa: E402
    init_db, upsert_user, get_user, save_rebalancer_strategy, get_active_rebalancer_strategy,
    save_agent_ui_config, get_agent_ui_config,
)
from marketplace_service import (  # noqa: E402
    create_marketplace_listing, get_marketplace_listings, create_marketplace_order,
    update_marketplace_listing, delete_marketplace_listing, EDIT_LOCK_HOURS,
)
from marketplace_verify import verify_usdt_payment  # noqa: E402
from database.connection import get_connection  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def _db():
    init_db()


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:6]}.near"


def _seed_seller(agent: str, wallet: str):
    if agent == "trader":
        upsert_user(wallet, {"trader_active": 1, "trader_timeframe": "4h", "trader_min_confidence": 82, "trader_ema_fast": 18.0})
    elif agent == "rebalancer":
        save_rebalancer_strategy(
            user_wallet=wallet, selected_coins=["USDT", "NEAR", "ETH"], user_expectation="steady growth",
            cadence_days=5, allocations={"USDT": 30.0, "NEAR": 40.0, "ETH": 30.0}, tp_sl_rules=[],
            market_regime="BULLISH", overall_strategy="Alpha summary", min_stable_pct=25.0,
        )
    elif agent == "research":
        save_agent_ui_config(wallet, "research", {
            "topic": "NEAR liquid staking yields", "userExpectations": "Compare stNEAR vs LiNEAR",
            "linksInput": "https://docs.near.org", "dateRange": "3_months",
        })


def _buy(listing_id: str, seller: str, buyer: str):
    order = create_marketplace_order(listing_id, buyer)
    mock = _make_mock_rpc_tx(
        signer_id=buyer, receiver_id=order["token_contract"], payout_recipient=seller,
        amount_base_units=int(order["amount_base_units"]),
    )
    res = verify_usdt_payment(order, make_valid_base58(), mock_rpc_result=mock)
    assert res["status"] == "completed", res
    return order


@pytest.mark.parametrize("agent", ["trader", "rebalancer", "research"])
def test_full_lifecycle_per_agent(agent):
    seller, buyer, other = _uid(f"s_{agent}"), _uid(f"b_{agent}"), _uid(f"o_{agent}")
    for w in (seller, buyer, other):
        upsert_user(w, {})
    _seed_seller(agent, seller)

    # --- list ---
    listing = create_marketplace_listing(seller, agent, f"{agent.title()} Pro", "desc", "12.00")
    lid = listing["listing_id"]
    assert "config_json" not in listing
    assert not any("profit" in k.lower() for k in listing), "USDT listings must not carry profit-share fields"

    # --- a DIFFERENT user sees it in the global list ---
    seen = [l for l in get_marketplace_listings(limit=100) if l["listing_id"] == lid]
    assert len(seen) == 1 and seen[0]["agent_type"] == agent
    assert [l for l in get_marketplace_listings(agent_type=agent, seller=seller)][0]["listing_id"] == lid

    # --- one active listing per agent until deleted ---
    with pytest.raises(ValueError, match="already have an active"):
        create_marketplace_listing(seller, agent, "Second try", "desc", "9.00")

    # --- edit is locked for 24h, delete is not ---
    with pytest.raises(ValueError, match="locked"):
        update_marketplace_listing(lid, seller, {"price_usdt": "20"})
    assert listing["can_edit"] is False and listing["edit_lock_seconds_remaining"] > (EDIT_LOCK_HOURS - 1) * 3600

    # --- buyer pays; configuration is pasted ---
    _buy(lid, seller, buyer)
    if agent == "trader":
        u = get_user(buyer)
        assert u["trader_active"] == 1 and u["trader_timeframe"] == "4h"
        assert u["trader_min_confidence"] == 82 and u["trader_ema_fast"] == 18.0
    elif agent == "rebalancer":
        strat = get_active_rebalancer_strategy(buyer)
        assert strat and strat["allocations"]["NEAR"] == 40.0
        ui = get_agent_ui_config(buyer, "rebalancer")
        assert ui["cadenceDays"] == 5 and "ETH" in ui["selectedCoins"]
    else:
        ui = get_agent_ui_config(buyer, "research")
        assert ui["topic"] == "NEAR liquid staking yields"
        assert ui["dateRange"] == "3_months" and ui["linksInput"] == "https://docs.near.org"

    # the buyer cannot buy twice, the seller cannot buy own listing
    with pytest.raises(ValueError):
        create_marketplace_order(lid, buyer)
    with pytest.raises(ValueError):
        create_marketplace_order(lid, seller)

    # --- delete frees the slot; listing disappears for everyone ---
    assert delete_marketplace_listing(lid, seller) is True
    assert not [l for l in get_marketplace_listings(limit=100) if l["listing_id"] == lid]
    again = create_marketplace_listing(seller, agent, f"{agent.title()} v2", "desc", "14.00")
    assert again["listing_id"] != lid


def test_only_seller_can_delete_and_moderator_is_reserved():
    seller, intruder = _uid("sel"), _uid("int")
    upsert_user(seller, {"trader_active": 1})
    upsert_user(intruder, {})
    listing = create_marketplace_listing(seller, "trader", "Guarded", "d", "5.00")
    with pytest.raises(PermissionError):
        delete_marketplace_listing(listing["listing_id"], intruder)
    with pytest.raises(ValueError, match="platform-reserved"):
        create_marketplace_listing(seller, "moderator", "Nope", "d", "5.00")


def test_edit_allowed_after_lock_expires():
    seller = _uid("lock")
    upsert_user(seller, {"trader_active": 1})
    listing = create_marketplace_listing(seller, "trader", "Lock Test", "d", "5.00")
    conn = get_connection()
    conn.execute("UPDATE marketplace_listings SET created_at = datetime('now','-30 hours'), updated_at = datetime('now','-30 hours') WHERE listing_id = ?", (listing["listing_id"],))
    conn.commit()
    conn.close()
    updated = update_marketplace_listing(listing["listing_id"], seller, {"price_usdt": "7.50"})
    assert updated["price_usdt"] == "7.50"


def test_api_other_user_sees_listing_and_delete_endpoint():
    from main import app
    seller = _uid("api_sel")
    upsert_user(seller, {"trader_active": 1})
    with TestClient(app) as c:
        r = c.post("/api/marketplace/listings", json={"wallet": seller, "agent_type": "trader", "title": "API Trader", "price_usdt": "8"})
        assert r.status_code == 200, r.text
        lid = r.json()["listing"]["listing_id"]
        # duplicate -> 400 with a clear message
        dup = c.post("/api/marketplace/listings", json={"wallet": seller, "agent_type": "trader", "title": "API Trader 2", "price_usdt": "8"})
        assert dup.status_code == 400 and "already have an active" in dup.json()["detail"]
        # anyone can read it
        assert lid in [l["listing_id"] for l in c.get("/api/marketplace/listings").json()["listings"]]
        mine = c.get("/api/marketplace/listings", params={"seller": seller}).json()["listings"]
        assert [l["listing_id"] for l in mine] == [lid]
        # delete via API
        d = c.delete(f"/api/marketplace/listings/{lid}", params={"wallet": seller})
        assert d.status_code == 200
        assert lid not in [l["listing_id"] for l in c.get("/api/marketplace/listings").json()["listings"]]
