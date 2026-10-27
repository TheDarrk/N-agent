import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from autonomous_agents.hyperliquid_adapter import HyperliquidAdapter
from eth_account import Account


def test_hyperliquid_precision_and_pricing():
    adapter = HyperliquidAdapter(network="testnet")
    
    # 1. Price rounding (5 significant figures rule)
    assert adapter.round_price(80195.55) == 80195.6
    assert adapter.round_price(2319.748) == 2319.75
    assert adapter.round_price(4.56789) == 4.5679
    assert adapter.round_price(0.1234567) == 0.12346

    # 2. Asset support check
    assert adapter.is_asset_supported("NEAR") is True

    # 3. Size rounding
    near_dec = adapter.get_sz_decimals("NEAR")
    assert near_dec >= 1
    assert adapter.round_size("NEAR", 10.567) == round(adapter.round_size("NEAR", 10.567), near_dec)


def test_hyperliquid_bracket_order_formatting():
    # Use ephemeral test key
    test_acc = Account.create()
    adapter = HyperliquidAdapter(private_key=test_acc.key.hex(), network="testnet")
    assert adapter.is_configured() is True

    # Call place_bracket_order (simulates on-chain submission to testnet)
    res = adapter.place_bracket_order(
        coin="NEAR",
        is_buy=True,
        amount_usd=50.0,
        entry_price=4.50,
        tp_price=5.20,
        sl_price=4.10
    )
    assert "coin" in res
    assert res["coin"] == "NEAR"
    assert res["side"] == "BUY"
    assert res["size"] > 0
    assert res["tp_trigger_price"] == 5.20
    assert res["sl_trigger_price"] == 4.10
    assert "raw_response" in res
