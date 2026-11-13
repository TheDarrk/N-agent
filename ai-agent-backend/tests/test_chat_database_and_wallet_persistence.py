import os
import pytest
from fastapi.testclient import TestClient

from database.chat_db import (
    init_chat_db,
    save_chat_turn,
    get_recent_chats,
    clear_chat_history,
)
from database.dal import (
    init_db,
    upsert_user,
    import_agent_wallet,
    assign_agent_wallets,
    get_user_agent_wallet_config,
    validate_agent_execution_wallet,
    activate_agent_wallet,
)
from main import app


def test_dedicated_chat_database_retention_and_isolation(tmp_path):
    """Test that dedicated chat database strictly maintains 5 recent turns per wallet with full isolation."""
    db_file = str(tmp_path / "test_chat.db")
    init_chat_db(db_path=db_file)

    wallet_a = "trader_alice.near"
    wallet_b = "trader_bob.near"

    # Save 7 messages for Alice
    for i in range(1, 8):
        save_chat_turn(
            wallet_address=wallet_a,
            human_message=f"Human prompt {i}",
            ai_message=f"AI answer {i}",
            session_id=f"sess_{i}",
            db_path=db_file
        )

    # Verify only the 5 most recent are retained for Alice
    alice_chats = get_recent_chats(wallet_a, limit=10, db_path=db_file)
    assert len(alice_chats) == 5
    # Newest should be prompt 7
    assert alice_chats[0]["human_message"] == "Human prompt 7"
    assert alice_chats[0]["ai_message"] == "AI answer 7"
    # Oldest retained should be prompt 3 (prompts 1 & 2 pruned)
    assert alice_chats[-1]["human_message"] == "Human prompt 3"

    # Save 2 messages for Bob
    save_chat_turn(
        wallet_address=wallet_b,
        human_message="Bob prompt 1",
        ai_message="Bob answer 1",
        session_id="sess_bob_1",
        db_path=db_file
    )
    save_chat_turn(
        wallet_address=wallet_b,
        human_message="Bob prompt 2",
        ai_message="Bob answer 2",
        session_id="sess_bob_2",
        db_path=db_file
    )

    bob_chats = get_recent_chats(wallet_b, limit=5, db_path=db_file)
    assert len(bob_chats) == 2
    assert bob_chats[0]["human_message"] == "Bob prompt 2"

    # Ensure Alice's chats are unaffected by Bob's
    alice_chats_check = get_recent_chats(wallet_a, limit=5, db_path=db_file)
    assert len(alice_chats_check) == 5

    # Clear Alice's chats
    clear_chat_history(wallet_a, db_path=db_file)
    assert len(get_recent_chats(wallet_a, limit=5, db_path=db_file)) == 0
    # Bob still has chats
    assert len(get_recent_chats(wallet_b, limit=5, db_path=db_file)) == 2


def test_chat_history_api_endpoints():
    """Test GET and DELETE /api/chat/history endpoints."""
    client = TestClient(app)
    test_wallet = "api_test_user.near"

    # Save a chat turn
    save_chat_turn(
        wallet_address=test_wallet,
        human_message="Analyze NEAR price momentum",
        ai_message="Titan Quantitative Trader: NEAR shows bullish RSI divergence."
    )

    # Call GET API
    res = client.get(f"/api/chat/history/{test_wallet}")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert len(data["history"]) >= 1
    assert "Analyze NEAR price momentum" in data["history"][0]["human_message"]

    # Call DELETE API
    del_res = client.delete(f"/api/chat/history/{test_wallet}")
    assert del_res.status_code == 200
    assert del_res.json()["cleared"] is True

    # Verify empty now
    res_after = client.get(f"/api/chat/history/{test_wallet}")
    assert res_after.status_code == 200
    assert len(res_after.json()["history"]) == 0


def test_agent_wallet_persistence_across_refresh():
    """
    Test that when an agent wallet is assigned or activated,
    it persists across calls/refreshes and is correctly returned by get_user_agent_wallet_config
    and validate_agent_execution_wallet.
    """
    init_db()
    user_wallet = "persistence_test.near"
    upsert_user(user_wallet)

    # Import an agent execution wallet
    imported = import_agent_wallet(
        user_wallet=user_wallet,
        public_key="ed25519:6E8s8mVb7T3f6W6yJv5G5M6m6G6T6Y6U6I6O6P6A6S6D",
        agent_account_id="persistence-agent.near",
        label="Test Trader Key",
        chain_type="near"
    )
    key_id = imported["id"]
    assert key_id is not None

    # Assign wallet to Trader and Rebalancer
    updated_config = assign_agent_wallets(
        user_wallet=user_wallet,
        assignments={
            "trader": str(key_id),
            "rebalancer": str(key_id)
        }
    )

    assert str(key_id) in updated_config["assignments"]["trader"]
    assert str(key_id) in updated_config["assignments"]["rebalancer"]

    # SIMULATE BROWSER REFRESH: Calling get_user_agent_wallet_config fresh
    reloaded_config = get_user_agent_wallet_config(user_wallet)
    assert reloaded_config["assignments"]["trader"] == str(key_id)
    assert reloaded_config["assignments"]["rebalancer"] == str(key_id)

    # Test activation helper with assigned_agent parameter
    activate_agent_wallet(
        user_wallet=user_wallet,
        key_id=key_id,
        tx_hash="txn_test_activation_123",
        assigned_agent="trader"
    )

    # Verify validate_agent_execution_wallet finds the assigned wallet
    validation = validate_agent_execution_wallet(
        user_wallet=user_wallet,
        agent_id="trader",
        target_chain="near"
    )
    # The assigned wallet is found
    assert validation.get("agent_wallet") == "persistence-agent.near"
