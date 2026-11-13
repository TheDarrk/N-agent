import os
import sys
import json
import pytest

# Add backend root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database.crypto import (
    derive_user_key,
    encrypt_field,
    decrypt_field,
    encrypt_dict,
    decrypt_dict,
    normalize_wallet_str
)
from database.connection import get_connection
from database.dal import (
    init_db,
    create_run,
    finish_run,
    get_run,
    save_chat_message,
    get_chat_history
)

TEST_DB = os.path.abspath(os.path.join(os.path.dirname(__file__), "test_crypto.db"))

@pytest.fixture(autouse=True)
def setup_test_crypto(monkeypatch):
    monkeypatch.setenv("TURSO_DATABASE_URL", "")
    monkeypatch.setenv("TURSO_AUTH_TOKEN", "")
    monkeypatch.setenv("RENDER", "")
    monkeypatch.setenv("FERNET_MASTER_KEY", "test_master_key_for_unit_tests_32_bytes!")
    monkeypatch.setattr("database.connection.is_turso_enabled", lambda: False)
    monkeypatch.setattr("database.dal.is_turso_enabled", lambda: False)
    monkeypatch.setattr("database.connection.DB_PATH", TEST_DB)
    monkeypatch.setattr("database.dal.DB_PATH", TEST_DB)

    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass

    init_db(TEST_DB)
    yield
    if os.path.exists(TEST_DB):
        try:
            os.remove(TEST_DB)
        except Exception:
            pass


def test_key_derivation_determinism_and_isolation():
    k_alice_1 = derive_user_key("alice.near")
    k_alice_2 = derive_user_key("ALICE.near ")
    assert k_alice_1 == k_alice_2, "Key derivation should normalize wallet address"

    k_bob = derive_user_key("bob.near")
    assert k_alice_1 != k_bob, "Different wallets must produce different keys"


def test_encrypt_decrypt_field():
    wallet = "alice.near"
    plaintext = "Secret strategy data: RSI 32, BUY NEAR @ $4.50"
    ciphertext = encrypt_field(wallet, plaintext)

    assert ciphertext != plaintext
    assert ciphertext.startswith("gAAAAA"), "Fernet token must start with gAAAAA"

    # Decrypt with correct wallet
    decrypted = decrypt_field(wallet, ciphertext)
    assert decrypted == plaintext

    # Decrypt with wrong wallet should fail gracefully and not reveal plaintext
    wrong_decrypted = decrypt_field("attacker.near", ciphertext)
    assert wrong_decrypted != plaintext
    assert wrong_decrypted == ciphertext


def test_plaintext_pass_through():
    # Legacy data unencrypted in DB should not fail
    legacy = '{"timeframe": "1h", "symbol": "NEAR"}'
    assert decrypt_field("alice.near", legacy) == legacy


def test_encrypt_decrypt_dict():
    wallet = "whale.near"
    original = {
        "coins": ["NEAR", "USDC", "BTC"],
        "confidence": 88,
        "nested": {"risk": "conservative", "cap": 5000.0}
    }
    enc = encrypt_dict(wallet, original)
    assert enc.startswith("gAAAAA")

    dec = decrypt_dict(wallet, enc)
    assert dec == original


def test_database_agent_run_encryption():
    wallet = "trader_alice.near"
    params = {"symbol": "NEAR", "timeframe": "15m", "mode": "breakout"}
    run_id = create_run(wallet, "trader", title="Encrypted Test Run", params=params, db_path=TEST_DB)

    # Inspect raw database: params_json must be encrypted, not plaintext JSON
    conn = get_connection(TEST_DB)
    row = conn.execute("SELECT params_json, result_json FROM agent_runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()

    raw_params = row["params_json"]
    assert raw_params.startswith("gAAAAA"), f"params_json must be encrypted Fernet token, got {raw_params}"
    assert "breakout" not in raw_params, "Plaintext parameters must not appear in raw SQLite storage"

    # Finish run with result
    result_data = {"verdict": "STRONG_BUY", "entry": 5.20, "tp": 6.10}
    finish_run(run_id, result=result_data, db_path=TEST_DB)

    conn = get_connection(TEST_DB)
    row2 = conn.execute("SELECT result_json FROM agent_runs WHERE run_id = ?", (run_id,)).fetchone()
    conn.close()

    raw_result = row2["result_json"]
    assert raw_result.startswith("gAAAAA"), f"result_json must be encrypted Fernet token, got {raw_result}"
    assert "STRONG_BUY" not in raw_result, "Plaintext results must not appear in raw SQLite storage"

    # Read through DAL get_run with wallet
    run = get_run(run_id, wallet=wallet, db_path=TEST_DB)
    assert run["params"] == params
    assert run["result"] == result_data


def test_database_chat_encryption():
    wallet = "chatter.near"
    secret_prompt = "What is the secret passphrase for my agent wallet?"
    msg = save_chat_message(wallet, "user", secret_prompt, db_path=TEST_DB)
    mid = msg["message_id"]

    # Inspect raw database
    conn = get_connection(TEST_DB)
    row = conn.execute("SELECT content FROM chat_messages WHERE message_id = ?", (mid,)).fetchone()
    conn.close()

    raw_content = row["content"]
    assert raw_content.startswith("gAAAAA")
    assert secret_prompt not in raw_content, "Chat message content must be encrypted in storage"

    # Read back through DAL
    history = get_chat_history(wallet, limit=10, db_path=TEST_DB)
    assert len(history) == 1
    assert history[0]["content"] == secret_prompt
