import re
import pytest
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import (
    init_db,
    create_agent_wallet,
    import_agent_wallet,
    assign_agent_wallets,
    get_user_agent_wallet_config,
    delete_user_agent_wallet,
    delete_all_user_agent_keys,
    activate_agent_wallet,
    get_fund_agent_wallet_payload
)

TEST_USER = "wallet_tester.testnet"

def setup_module(module):
    init_db()
    delete_all_user_agent_keys(TEST_USER)

def test_agent_wallet_pool_and_max_4_limit():
    # 1. Create wallet 1
    w1 = create_agent_wallet(TEST_USER, label="Trader Scalper Wallet")
    assert w1["id"] is not None
    assert w1["label"] == "Trader Scalper Wallet"
    assert w1["public_key"].startswith("ed25519:")
    assert len(w1["agent_wallet_address"]) > 0

    # 2. Create wallet 2
    w2 = create_agent_wallet(TEST_USER, label="Rebalance Vault")
    assert w2["id"] is not None

    # 3. Import wallet 3
    w3 = import_agent_wallet(
        user_wallet=TEST_USER,
        public_key="ed25519:3AbCDeF123456789012345678901234567890123456",
        agent_account_id="research_bot.testnet",
        label="Alpha Research Subaccount"
    )
    assert w3["agent_wallet_address"] == "research_bot.testnet"

    # 4. Create wallet 4 (Maximum reached)
    w4 = create_agent_wallet(TEST_USER, label="Watchdog Guardian")
    assert w4["id"] is not None

    # 5. Attempt 5th wallet -> MUST fail with max 4 error
    with pytest.raises(ValueError, match="Maximum 4 agent wallets allowed"):
        create_agent_wallet(TEST_USER, label="Should Fail 5th Wallet")

    # Verify config returns 4 wallets
    cfg = get_user_agent_wallet_config(TEST_USER)
    assert cfg["total_wallets"] == 4
    assert cfg["max_wallets"] == 4

def test_agent_wallet_assignment_rules():
    cfg = get_user_agent_wallet_config(TEST_USER)
    w1_id = str(cfg["wallets"][0]["id"])
    w2_id = str(cfg["wallets"][1]["id"])
    w3_id = str(cfg["wallets"][2]["id"])

    # Rule: 1 wallet can be shared by multiple agents (e.g. Trader & Rebalancer share w1)
    # Rule: Each agent has at most 1 wallet assigned
    assignments = {
        "trader": w1_id,
        "rebalancer": w1_id,  # Shared with trader!
        "research": w2_id,
        "moderator": w3_id
    }

    updated = assign_agent_wallets(TEST_USER, assignments)
    assert updated["assignments"]["trader"] == w1_id
    assert updated["assignments"]["rebalancer"] == w1_id
    assert updated["assignments"]["research"] == w2_id
    assert updated["assignments"]["moderator"] == w3_id

    # Verify w1 shows assigned to both trader and rebalancer
    wallet_1 = next(w for w in updated["wallets"] if str(w["id"]) == w1_id)
    assert "trader" in wallet_1["assigned_agents"]
    assert "rebalancer" in wallet_1["assigned_agents"]

def test_agent_wallet_deletion_and_unassign():
    cfg = get_user_agent_wallet_config(TEST_USER)
    w1_id = cfg["wallets"][0]["id"]

    # Delete w1
    deleted = delete_user_agent_wallet(TEST_USER, w1_id)
    assert deleted is True

    # Verify trader and rebalancer are now unassigned
    cfg_after = get_user_agent_wallet_config(TEST_USER)
    assert cfg_after["total_wallets"] == 3
    assert cfg_after["assignments"]["trader"] == ""
    assert cfg_after["assignments"]["rebalancer"] == ""

def test_named_subaccount_creation_and_activation():
    # Test High-Level Named Subaccount creation
    sub_wallet = create_agent_wallet(
        user_wallet=TEST_USER,
        label="High-Level Quant Subaccount",
        wallet_type="subaccount",
        subaccount_prefix="quant"
    )

    assert sub_wallet["id"] is not None
    assert sub_wallet["wallet_type"] == "subaccount"
    assert sub_wallet["agent_wallet_address"] == f"quant.{TEST_USER}"
    assert sub_wallet["status"] == "pending_funding"
    assert sub_wallet["sign_payload"] is not None
    assert sub_wallet["sign_payload"]["receiverId"] == f"quant.{TEST_USER}"
    assert len(sub_wallet["sign_payload"]["actions"]) == 3
    assert sub_wallet["sign_payload"]["actions"][0]["type"] == "CreateAccount"
    assert sub_wallet["sign_payload"]["actions"][1]["type"] == "Transfer"
    assert sub_wallet["sign_payload"]["actions"][2]["type"] == "AddKey"

    # Test activation once on-chain tx confirms
    activated = activate_agent_wallet(
        user_wallet=TEST_USER,
        key_id=sub_wallet["id"],
        tx_hash="testnet_tx_mock_hash_123"
    )
    assert activated is True

    # Verify status changed to active in DB
    cfg = get_user_agent_wallet_config(TEST_USER)
    found = next(w for w in cfg["wallets"] if w["id"] == sub_wallet["id"])
    assert found["status"] == "active"
    assert found["agent_wallet_address"] == f"quant.{TEST_USER}"


def test_agent_multichain_wallet_rules():
    test_user = "multichain_rules_user.testnet"
    delete_all_user_agent_keys(test_user)

    # 1. Create a NEAR execution wallet
    near_w = create_agent_wallet(test_user, label="Trader NEAR Key", chain_type="near", wallet_type="implicit")
    
    # 2. Import an Arbitrum/Ethereum EVM wallet
    evm_w = import_agent_wallet(
        user_wallet=test_user,
        public_key="0x71C8363837918a2132b12829283748291a92182b",
        agent_account_id="0x71C8363837918a2132b12829283748291a92182b",
        label="Trader Arbitrum EVM Wallet"
    )
    # Manually ensure chain_type is evm in DB for test
    from database import get_connection
    conn = get_connection()
    conn.execute("UPDATE agent_keys SET chain_type = 'evm' WHERE id = ?", (evm_w["id"],))
    conn.commit()
    conn.close()

    # 3. Create a 2nd NEAR wallet
    near_w2 = create_agent_wallet(test_user, label="Second NEAR Wallet", chain_type="near", wallet_type="implicit")

    # RULE 1: An agent CAN connect to 1 NEAR + 1 EVM wallet (different chains)
    res_multichain = assign_agent_wallets(test_user, {
        "trader": [str(near_w["id"]), str(evm_w["id"])],
        "rebalancer": str(near_w["id"])
    })
    trader_assigned = res_multichain["assignments"]["trader"]
    assert str(near_w["id"]) in trader_assigned
    assert str(evm_w["id"]) in trader_assigned

    # RULE 2: An agent CANNOT connect to 2 wallets on the SAME chain (2 NEAR wallets)
    with pytest.raises(ValueError, match="cannot connect to multiple wallets on the same chain"):
        assign_agent_wallets(test_user, {
            "trader": [str(near_w["id"]), str(near_w2["id"])]
        })


def test_wallet_guard_transfer_to_create_implicit_address():
    test_user = "wallet_guard_tester.testnet"
    delete_all_user_agent_keys(test_user)

    # 1. Create agent wallet via Transfer-to-Create (implicit)
    w = create_agent_wallet(
        user_wallet=test_user,
        label="Titan Safe Implicit Wallet",
        wallet_type="implicit",
        funding_near=0.5
    )

    # WALLET GUARD ASSERTIONS
    address = w["agent_wallet_address"]
    # Receiver MUST be strictly a 64-character lowercase hex address (Ed25519 public key hex)
    assert len(address) == 64, f"Expected 64-char address, got {len(address)}"
    assert bool(re.match(r'^[0-9a-f]{64}$', address)), f"Address {address} is not valid 64 lowercase hex"
    assert not address.endswith(".testnet"), "Transfer-to-Create recipient must NOT be a named .testnet account"

    # Signing payload verification
    payload = w["sign_payload"]
    assert payload is not None, "Expected signing payload for funding"
    assert payload["receiverId"] == address, f"Receiver ID mismatch: {payload['receiverId']} vs {address}"
    assert len(payload["actions"]) == 1, "Transfer-to-Create MUST contain strictly a single Transfer action"
    assert payload["actions"][0]["type"] == "Transfer", "Action MUST be pure Transfer (safe from Meteor AddKey blocks)"
    assert payload["actions"][0]["params"]["deposit"] == "500000000000000000000000", "0.5 NEAR deposit in yoctoNEAR"

    # 2. Test get_fund_agent_wallet_payload for topping up
    topup_payload = get_fund_agent_wallet_payload(test_user, w["id"], amount_near=1.0)
    assert topup_payload["receiverId"] == address
    assert topup_payload["actions"][0]["type"] == "Transfer"
    assert topup_payload["actions"][0]["params"]["deposit"] == "1000000000000000000000000"
