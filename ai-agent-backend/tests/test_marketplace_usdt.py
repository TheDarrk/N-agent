"""
Neptune AI — Unit & Integration Tests for Global Marketplace with USDT On-Chain Verification
Tests:
- build_listing_snapshot with strict allow-list (security: private keys/secrets stripped)
- verify_usdt_payment on-chain checks (success, wrong token, wrong recipient, underpayment,
  wrong signer, failed tx receipt, outside window, reused hash, invalid base58 hash)
- Order creation, price locking, and 24h expiration
- Configuration mirroring (trader with capital protection hard caps, rebalancer strategy replacement)
"""

import os
import sys
import json
import base64
import uuid
import random
import pytest
from datetime import datetime, timezone, timedelta

# Ensure backend root is on sys.path
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def make_valid_base58() -> str:
    """Generate guaranteed valid 44-character base58 NEAR transaction hash."""
    return "".join(random.choice(BASE58_ALPHABET) for _ in range(44))

from database import (
    init_db,
    get_connection,
    upsert_user,
    update_user_settings,
    get_user,
    save_rebalancer_strategy,
    get_active_rebalancer_strategy
)
from marketplace_service import (
    build_listing_snapshot,
    create_marketplace_listing,
    get_marketplace_listings,
    get_marketplace_listing_by_id,
    create_marketplace_order,
    get_marketplace_order,
    list_buyer_orders,
    list_seller_sales,
    expire_stale_orders,
    apply_purchased_config,
    usdt_to_base_units
)
from marketplace_verify import (
    verify_usdt_payment,
    REASON_WRONG_TOKEN,
    REASON_WRONG_RECIPIENT,
    REASON_AMOUNT_TOO_LOW,
    REASON_WRONG_SIGNER,
    REASON_OUTSIDE_WINDOW,
    REASON_TX_FAILED,
    REASON_ALREADY_USED,
    REASON_INVALID_HASH
)


@pytest.fixture(autouse=True)
def setup_test_db():
    init_db()


def test_usdt_to_base_units():
    """Verify exact integer base units conversion (6 decimals) with no float loss."""
    assert usdt_to_base_units("25.00") == "25000000"
    assert usdt_to_base_units("10") == "10000000"
    assert usdt_to_base_units("0.5") == "500000"
    assert usdt_to_base_units("12.345678") == "12345678"


def test_build_listing_snapshot_trader_security():
    """Verify that seller's trader config snapshot contains only allow-listed keys and NO private keys."""
    seller = f"seller_trader_{uuid.uuid4().hex[:6]}.near"
    upsert_user(seller, {
        "trader_active": 1,
        "trader_timeframe": "4h",
        "trader_min_confidence": 80,
        "trader_ema_fast": 21.0,
        "trader_ema_slow": 55.0,
        "notification_email": "seller_secret@example.com",
        "daily_limit": 5000.0,
        "max_tx_amount": 1000.0
    })

    snapshot = build_listing_snapshot(seller, "trader")
    assert snapshot["snapshot_version"] == 1
    assert snapshot["agent_type"] == "trader"
    assert snapshot["timeframe"] == "4h"
    assert snapshot["confidence_threshold"] == 80
    assert snapshot["ema_fast"] == 21.0
    assert snapshot["ema_slow"] == 55.0

    # Strict security assertions: NO private data
    assert "notification_email" not in snapshot
    assert "daily_limit" not in snapshot
    assert "max_tx_amount" not in snapshot
    assert "wallet" not in snapshot
    assert "seller_secret" not in json.dumps(snapshot)
    assert "private_key" not in snapshot
    assert "seed_phrase" not in snapshot


def test_build_listing_snapshot_rebalancer_security():
    """Verify that seller's rebalancer strategy snapshot is sanitized."""
    seller = f"seller_reb_{uuid.uuid4().hex[:6]}.near"
    save_rebalancer_strategy(
        user_wallet=seller,
        selected_coins=["USDT", "NEAR", "ETH"],
        user_expectation="Test strategic expectations",
        cadence_days=7,
        allocations={"USDT": 30.0, "NEAR": 40.0, "ETH": 30.0},
        tp_sl_rules=[],
        market_regime="BULLISH",
        overall_strategy="Executive summary of alpha",
        min_stable_pct=25.0
    )

    snapshot = build_listing_snapshot(seller, "rebalancer")
    assert snapshot["snapshot_version"] == 1
    assert snapshot["agent_type"] == "rebalancer"
    assert snapshot["market_regime"] == "BULLISH"
    assert snapshot["min_stablecoin_floor_pct"] == 25.0
    assert snapshot["allocations"]["USDT"] == 30.0
    assert "private_key" not in json.dumps(snapshot)


def test_marketplace_listing_order_and_price_lock():
    """Verify listing creation, global read without config_json, and 24h order price lock."""
    seller = f"seller_market_{uuid.uuid4().hex[:6]}.near"
    buyer = f"buyer_market_{uuid.uuid4().hex[:6]}.near"

    upsert_user(seller, {"trader_active": 1, "trader_timeframe": "1h"})
    upsert_user(buyer, {})

    listing = create_marketplace_listing(
        seller_wallet=seller,
        agent_type="trader",
        title="Alpha Momentum Bot",
        description="High Sharpe ratio swing strategy",
        price_usdt="15.50"
    )

    listing_id = listing["listing_id"]
    assert listing["price_usdt"] == "15.50"
    assert "config_json" not in listing

    # Global listing query
    listings = get_marketplace_listings(limit=10)
    found = [l for l in listings if l["listing_id"] == listing_id]
    assert len(found) == 1
    assert "config_json" not in found[0]

    # Buyer creates order
    order = create_marketplace_order(listing_id, buyer)
    assert order["amount_usdt"] == "15.50"
    assert order["amount_base_units"] == "15500000"
    assert order["pay_to"] == seller
    assert order["status"] == "pending"

    # Verify duplicate pending returns same order
    order_dup = create_marketplace_order(listing_id, buyer)
    assert order_dup["order_id"] == order["order_id"]


def _make_mock_rpc_tx(
    signer_id: str,
    receiver_id: str,
    payout_recipient: str,
    amount_base_units: int,
    method_name: str = "ft_transfer",
    execution_status: str = "FINAL",
    is_success: bool = True
) -> dict:
    """Helper to build realistic NEAR JSON-RPC EXPERIMENTAL_tx_status responses."""
    args_json = {
        "receiver_id": payout_recipient,
        "amount": str(amount_base_units),
        "memo": "marketplace order payment"
    }
    encoded_args = base64.b64encode(json.dumps(args_json).encode("utf-8")).decode("utf-8")

    tx_status = {"SuccessValue": ""} if is_success else {"Failure": {"ActionError": "Execution failed"}}
    receipt_status = {"SuccessValue": ""} if is_success else {"Failure": "Receipt failed"}

    event_log = f"EVENT_JSON:{json.dumps({'standard': 'nep141', 'version': '1.0.0', 'event': 'ft_transfer', 'data': [{'old_owner_id': signer_id, 'new_owner_id': payout_recipient, 'amount': str(amount_base_units)}]})}"

    return {
        "final_execution_status": execution_status,
        "status": tx_status,
        "transaction": {
            "signer_id": signer_id,
            "receiver_id": receiver_id,
            "actions": [
                {
                    "FunctionCall": {
                        "method_name": method_name,
                        "args": encoded_args,
                        "gas": 30000000000000,
                        "deposit": "1"
                    }
                }
            ]
        },
        "receipts_outcome": [
            {
                "outcome": {
                    "executor_id": receiver_id,
                    "status": receipt_status,
                    "logs": [event_log] if is_success else []
                }
            }
        ]
    }


def test_verify_usdt_payment_success_and_mirroring():
    """Verify full successful payment verification and subsequent configuration mirroring."""
    seller = f"seller_ver_{uuid.uuid4().hex[:6]}.near"
    buyer = f"buyer_ver_{uuid.uuid4().hex[:6]}.near"

    upsert_user(seller, {
        "trader_active": 1,
        "trader_timeframe": "2h",
        "trader_min_confidence": 85,
        "trader_ema_fast": 15.0,
        "trader_ema_slow": 45.0
    })
    upsert_user(buyer, {
        "trader_active": 0,
        "trader_timeframe": "1h",
        "trader_max_trades_per_day": 2  # Hard cap
    })

    listing = create_marketplace_listing(seller, "trader", "Pro Strategy", "Great bot", "25.00")
    order = create_marketplace_order(listing["listing_id"], buyer)

    # Valid base58 hash
    valid_tx_hash = make_valid_base58()
    mock_rpc = _make_mock_rpc_tx(
        signer_id=buyer,
        receiver_id=order["token_contract"],
        payout_recipient=seller,
        amount_base_units=25000000
    )

    res = verify_usdt_payment(order, valid_tx_hash, mock_rpc_result=mock_rpc)
    assert res["status"] == "completed"
    assert res["tx_hash"] == valid_tx_hash

    # Verify order completed in DB
    updated_order = get_marketplace_order(order["order_id"])
    assert updated_order["status"] == "completed"
    assert updated_order["tx_hash"] == valid_tx_hash

    # Verify buyer's configuration was mirrored
    buyer_user = get_user(buyer)
    assert buyer_user["trader_active"] == 1
    assert buyer_user["trader_timeframe"] == "2h"
    assert buyer_user["trader_min_confidence"] == 85
    assert buyer_user["trader_ema_fast"] == 15.0
    # Verify capital protection hard cap preserved
    assert buyer_user["trader_max_trades_per_day"] == 2

    # Verify listing sales_count incremented
    updated_listing = get_marketplace_listing_by_id(listing["listing_id"])
    assert updated_listing["sales_count"] == 1


def test_verify_usdt_payment_replay_rejected():
    """Verify that reusing the same tx_hash for a second order is rejected with ALREADY_USED."""
    seller = f"seller_rep_{uuid.uuid4().hex[:6]}.near"
    buyer1 = f"buyer1_rep_{uuid.uuid4().hex[:6]}.near"
    buyer2 = f"buyer2_rep_{uuid.uuid4().hex[:6]}.near"

    upsert_user(seller, {"trader_active": 1})
    listing = create_marketplace_listing(seller, "trader", "Replay Strat", "desc", "10.00")

    order1 = create_marketplace_order(listing["listing_id"], buyer1)
    order2 = create_marketplace_order(listing["listing_id"], buyer2)

    shared_hash = make_valid_base58()

    # Complete order1
    mock_rpc1 = _make_mock_rpc_tx(buyer1, order1["token_contract"], seller, 10000000)
    res1 = verify_usdt_payment(order1, shared_hash, mock_rpc_result=mock_rpc1)
    assert res1["status"] == "completed"

    # Attempt to use same hash for order2
    mock_rpc2 = _make_mock_rpc_tx(buyer2, order2["token_contract"], seller, 10000000)
    res2 = verify_usdt_payment(order2, shared_hash, mock_rpc_result=mock_rpc2)
    assert res2["status"] == "failed"
    assert res2["reason"] == REASON_ALREADY_USED


def test_verify_usdt_payment_security_checks():
    """Verify rejection on wrong token, wrong recipient, underpayment, wrong signer, failed tx, outside window."""
    seller = f"seller_sec_{uuid.uuid4().hex[:6]}.near"
    buyer = f"buyer_sec_{uuid.uuid4().hex[:6]}.near"
    upsert_user(seller, {"trader_active": 1})

    listing = create_marketplace_listing(seller, "trader", "Sec Strat", "desc", "50.00")
    order = create_marketplace_order(listing["listing_id"], buyer)

    # 1. Invalid base58 hash
    res_inv = verify_usdt_payment(order, "not_valid_hash_!!!")
    assert res_inv["status"] == "failed"
    assert res_inv["reason"] == REASON_INVALID_HASH

    # 2. Wrong token contract (e.g. paying in WNEAR instead of USDT)
    h2 = make_valid_base58()
    mock_wrong_token = _make_mock_rpc_tx(buyer, "wrap.near", seller, 50000000)
    res_wt = verify_usdt_payment(order, h2, mock_rpc_result=mock_wrong_token)
    assert res_wt["status"] == "failed"
    assert res_wt["reason"] == REASON_WRONG_TOKEN

    # 3. Wrong recipient
    h3 = make_valid_base58()
    mock_wrong_rec = _make_mock_rpc_tx(buyer, order["token_contract"], "charlie.near", 50000000)
    res_wr = verify_usdt_payment(order, h3, mock_rpc_result=mock_wrong_rec)
    assert res_wr["status"] == "failed"
    assert res_wr["reason"] == REASON_WRONG_RECIPIENT

    # 4. Underpayment (required 50 USDT = 50,000,000 base units, paid 49 USDT)
    h4 = make_valid_base58()
    mock_under = _make_mock_rpc_tx(buyer, order["token_contract"], seller, 49000000)
    res_up = verify_usdt_payment(order, h4, mock_rpc_result=mock_under)
    assert res_up["status"] == "failed"
    assert res_up["reason"] == REASON_AMOUNT_TOO_LOW

    # 5. Wrong signer
    h5 = make_valid_base58()
    mock_wrong_sig = _make_mock_rpc_tx("evilimpostornear123456", order["token_contract"], seller, 50000000)
    res_ws = verify_usdt_payment(order, h5, mock_rpc_result=mock_wrong_sig)
    assert res_ws["status"] == "failed"
    assert res_ws["reason"] == REASON_WRONG_SIGNER

    # 6. Failed receipt execution
    h6 = make_valid_base58()
    mock_fail = _make_mock_rpc_tx(buyer, order["token_contract"], seller, 50000000, is_success=False)
    res_fl = verify_usdt_payment(order, h6, mock_rpc_result=mock_fail)
    assert res_fl["status"] == "failed"
    assert res_fl["reason"] == REASON_TX_FAILED

    # 7. Outside 24h window (tx timestamp 2 days before order creation)
    h7 = make_valid_base58()
    mock_valid = _make_mock_rpc_tx(buyer, order["token_contract"], seller, 50000000)
    past_timestamp_ns = int((datetime.now(timezone.utc) - timedelta(days=2)).timestamp() * 1_000_000_000)
    res_ow = verify_usdt_payment(order, h7, mock_rpc_result=mock_valid, mock_block_timestamp_ns=past_timestamp_ns)
    assert res_ow["status"] == "failed"
    assert res_ow["reason"] == REASON_OUTSIDE_WINDOW


def test_expire_stale_orders():
    """Verify that expired pending orders are marked 'expired'."""
    seller = f"seller_exp_{uuid.uuid4().hex[:6]}.near"
    buyer = f"buyer_exp_{uuid.uuid4().hex[:6]}.near"
    upsert_user(seller, {"trader_active": 1})

    listing = create_marketplace_listing(seller, "trader", "Expiring Strat", "desc", "5.00")
    order = create_marketplace_order(listing["listing_id"], buyer)

    # Force order expiry date to the past in DB
    past_iso = (datetime.now(timezone.utc) - timedelta(hours=25)).isoformat()
    conn = get_connection()
    conn.execute("UPDATE marketplace_orders SET expires_at = ? WHERE order_id = ?", (past_iso, order["order_id"]))
    conn.commit()
    conn.close()

    count = expire_stale_orders()
    assert count >= 1

    updated = get_marketplace_order(order["order_id"])
    assert updated["status"] == "expired"


def test_marketplace_api_endpoints():
    """Verify HTTP router endpoints: publish, browse, order creation, details, patch, delete, and orders query."""
    from fastapi.testclient import TestClient
    from main import app

    client = TestClient(app)

    seller = f"seller_api_{uuid.uuid4().hex[:6]}.near"
    buyer = f"buyer_api_{uuid.uuid4().hex[:6]}.near"
    upsert_user(seller, {"trader_active": 1, "trader_timeframe": "4h"})
    upsert_user(buyer, {})

    # 1. Publish listing
    pub_resp = client.post("/api/marketplace/listings", json={
        "wallet": seller,
        "agent_type": "trader",
        "title": "API Test Strategy",
        "description": "Testing API flow",
        "price_usdt": "20.00"
    })
    assert pub_resp.status_code == 200
    pub_data = pub_resp.json()
    assert pub_data["success"] is True
    listing_id = pub_data["listing"]["listing_id"]
    assert "config_json" not in pub_data["listing"]

    # 2. Browse listings (global, no auth required)
    browse_resp = client.get("/api/marketplace/listings")
    assert browse_resp.status_code == 200
    browse_data = browse_resp.json()
    assert browse_data["success"] is True
    found = [l for l in browse_data["listings"] if l["listing_id"] == listing_id]
    assert len(found) == 1
    assert "config_json" not in found[0]

    # 3. Get single listing details
    detail_resp = client.get(f"/api/marketplace/listings/{listing_id}")
    assert detail_resp.status_code == 200
    assert "config_json" not in detail_resp.json()["listing"]

    # 4. Create Order
    order_resp = client.post("/api/marketplace/orders", json={
        "listing_id": listing_id,
        "buyer_wallet": buyer
    })
    assert order_resp.status_code == 200
    order_data = order_resp.json()
    assert order_data["success"] is True
    assert order_data["amount_usdt"] == "20.00"
    assert order_data["amount_base_units"] == "20000000"
    assert order_data["pay_to"] == seller
    order_id = order_data["order_id"]

    # 5. List Buyer Orders
    buyer_orders_resp = client.get(f"/api/marketplace/orders?wallet={buyer}")
    assert buyer_orders_resp.status_code == 200
    b_orders = buyer_orders_resp.json()["orders"]
    assert any(o["order_id"] == order_id for o in b_orders)

    # 6. Patch Listing (Seller only)
    patch_resp = client.patch(f"/api/marketplace/listings/{listing_id}", json={
        "wallet": seller,
        "price_usdt": "22.50",
        "title": "Updated API Strategy"
    })
    assert patch_resp.status_code == 200
    assert patch_resp.json()["listing"]["price_usdt"] == "22.50"

    # 7. Delete Listing (Seller only)
    del_resp = client.delete(f"/api/marketplace/listings/{listing_id}?wallet={seller}")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True
