import os
import pytest

def test_chat_persistence_and_wallet_isolation(tmp_path, monkeypatch):
    monkeypatch.setenv("TURSO_DATABASE_URL", "")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "")
    from database.dal import init_db, save_chat_message, get_chat_history, clear_chat_history
    from database.connection import normalize_wallet

    test_db = str(tmp_path / "test_chat.db")
    init_db(test_db)

    alice = "alice.near"
    bob = "bob.near"

    # Save messages for Alice
    msg1 = save_chat_message(alice, "user", "Hello Neptune", db_path=test_db)
    assert msg1["wallet"] == alice
    assert msg1["role"] == "user"

    msg2 = save_chat_message(alice, "assistant", "Hello Alice! How can I help you?", db_path=test_db)
    assert msg2["wallet"] == alice
    assert msg2["role"] == "assistant"

    # Save message for Bob
    msg_bob = save_chat_message(bob, "user", "What is my portfolio balance?", db_path=test_db)
    assert msg_bob["wallet"] == bob

    # Retrieve history for Alice
    alice_hist = get_chat_history(alice, db_path=test_db)
    assert len(alice_hist) == 2
    assert alice_hist[0]["content"] == "Hello Neptune"
    assert alice_hist[1]["content"] == "Hello Alice! How can I help you?"

    # Retrieve history for Bob
    bob_hist = get_chat_history(bob, db_path=test_db)
    assert len(bob_hist) == 1
    assert bob_hist[0]["content"] == "What is my portfolio balance?"

    # Clear Alice's history
    cleared = clear_chat_history(alice, db_path=test_db)
    assert cleared == 2

    # Verify Alice's history is empty, Bob's is intact
    assert len(get_chat_history(alice, db_path=test_db)) == 0
    assert len(get_chat_history(bob, db_path=test_db)) == 1
