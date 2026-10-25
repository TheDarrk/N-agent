import pytest
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from network_config import (
    get_network,
    is_testnet,
    is_mainnet,
    is_mainnet_allowed,
    get_near_rpc,
    get_intents_contract,
    get_wrap_near_contract,
    get_defuse_asset_id,
    validate_account_network,
)
from tools import create_near_intent_transaction


def test_mainnet_prohibition_flag(monkeypatch):
    # By default in .env: ENABLE_MAINNET=false
    monkeypatch.setenv("ENABLE_MAINNET", "false")
    assert is_mainnet_allowed() is False

    # When prohibited, even a .near account falls back to testnet
    assert get_network("user.near") == "testnet"
    assert is_testnet("user.near") is True
    assert is_mainnet("user.near") is False

    # Attempting to validate mainnet when prohibited must fail
    valid, msg = validate_account_network("user.near", expected_network="mainnet")
    assert valid is False
    assert "Mainnet is prohibited" in msg


def test_testnet_routing():
    # Testnet addresses always route to Testnet
    assert get_network("alice.testnet") == "testnet"
    assert is_testnet("alice.testnet") is True
    assert is_mainnet("alice.testnet") is False

    assert get_near_rpc("alice.testnet") == "https://test.rpc.fastnear.com"
    assert get_intents_contract("alice.testnet") == "intents.testnet"
    assert get_wrap_near_contract("alice.testnet") == "wrap.testnet"
    assert get_defuse_asset_id("NEAR", "alice.testnet") == "nep141:wrap.testnet"
    assert get_defuse_asset_id("USDT", "alice.testnet") == "nep141:usdt.fakes.testnet"

    # Trying to use .near on testnet must fail
    valid, msg = validate_account_network("alice.near", expected_network="testnet")
    assert valid is False
    assert "Mainnet account" in msg


def test_enabled_mainnet_routing(monkeypatch):
    # If ENABLE_MAINNET is explicitly set to true
    monkeypatch.setenv("ENABLE_MAINNET", "true")
    assert is_mainnet_allowed() is True

    assert get_network("user.near") == "mainnet"
    assert is_mainnet("user.near") is True
    assert is_testnet("user.near") is False

    assert get_near_rpc("user.near") == "https://rpc.mainnet.near.org"
    assert get_intents_contract("user.near") == "intents.near"
    assert get_wrap_near_contract("user.near") == "wrap.near"
    assert get_defuse_asset_id("NEAR", "user.near") == "nep141:wrap.near"
    assert get_defuse_asset_id("USDT", "user.near") == "nep141:usdt.tether-token.near"

    valid, _ = validate_account_network("user.near", expected_network="mainnet")
    assert valid is True

    valid, msg = validate_account_network("bob.testnet", expected_network="mainnet")
    assert valid is False
    assert "Testnet account" in msg


def test_create_near_intent_transaction_testnet_routing():
    # When account is .testnet, tx receiverId and contract must strictly be testnet
    txs = create_near_intent_transaction(
        token_in="NEAR",
        token_out="USDT",
        amount=1.5,
        min_amount_out=0.0,
        deposit_address="solver.testnet",
        account_id="testagen.testnet"
    )

    assert len(txs) >= 2
    # TX 1 should wrap NEAR on wrap.testnet and deposit to intents.testnet
    assert txs[0]["receiverId"] == "wrap.testnet"
    actions = txs[0]["actions"]
    assert any(a["params"]["args"].get("receiver_id") == "intents.testnet" for a in actions if a["type"] == "FunctionCall")

    # TX 2 should mt_transfer within intents.testnet
    assert txs[1]["receiverId"] == "intents.testnet"
