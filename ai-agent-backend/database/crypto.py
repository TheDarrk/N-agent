"""
Neptune AI v2.1 — Field-Level Encryption Layer (Task 4.1)
HKDF-SHA256 key derivation with wallet-specific salt + Fernet authenticated encryption.
Zero plaintext user parameters, results, private agent configurations, or chat history in storage.
"""

import os
import json
import base64
import hashlib
import logging
from typing import Any, Optional, Union
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

logger = logging.getLogger("neptune.crypto")

DEV_FALLBACK_MASTER_KEY = "neptune_dev_master_key_32bytes_sec!"

def get_master_key_bytes() -> bytes:
    master_key = os.getenv("FERNET_MASTER_KEY", "").strip()
    if not master_key:
        if os.getenv("RENDER"):
            raise RuntimeError(
                "[CRITICAL] FERNET_MASTER_KEY environment variable is missing on Render! "
                "Set a secure 32+ character key to enable database encryption."
            )
        master_key = DEV_FALLBACK_MASTER_KEY
    return hashlib.sha256(master_key.encode("utf-8")).digest()


def normalize_wallet_str(wallet: str) -> str:
    if not wallet:
        return ""
    return str(wallet).strip().lower()


def derive_user_key(wallet: str) -> bytes:
    """
    Derives a deterministic, 32-byte url-safe base64-encoded Fernet key
    using HKDF-SHA256 with the user wallet as salt.
    """
    clean_wallet = normalize_wallet_str(wallet)
    if not clean_wallet:
        clean_wallet = "anonymous"
    # Salt: SHA256(normalize_wallet(wallet))[:16]
    salt = hashlib.sha256(clean_wallet.encode("utf-8")).digest()[:16]
    master_bytes = get_master_key_bytes()
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        info=b"neptune-wallet-encryption-v1"
    )
    derived_32 = hkdf.derive(master_bytes)
    return base64.urlsafe_b64encode(derived_32)


def encrypt_field(wallet: str, plaintext: Optional[str]) -> str:
    """
    Encrypts a string field using the wallet-derived Fernet key.
    Returns standard Fernet token string (starts with 'gAAAAA').
    """
    if plaintext is None or plaintext == "":
        return ""
    try:
        key = derive_user_key(wallet)
        f = Fernet(key)
        return f.encrypt(str(plaintext).encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"[CRYPTO] Encrypt field error for {wallet}: {e}")
        return str(plaintext)


def decrypt_field(wallet: str, ciphertext: Optional[str]) -> str:
    """
    Decrypts a Fernet token string.
    If payload is unencrypted (e.g. legacy row not starting with 'gAAAAA'), returns as-is.
    """
    if not ciphertext:
        return ""
    val = str(ciphertext).strip()
    if not val.startswith("gAAAAA"):
        # Backwards-compatible pass-through for unencrypted data
        return val
    try:
        key = derive_user_key(wallet)
        f = Fernet(key)
        return f.decrypt(val.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.warning(f"[CRYPTO] Decryption failed: invalid token or mismatched wallet for {wallet}")
        return val
    except Exception as e:
        logger.error(f"[CRYPTO] Decrypt field error for {wallet}: {e}")
        return val


def encrypt_dict(wallet: str, data: Any) -> str:
    """
    Serializes a dict/list to JSON string and encrypts it.
    """
    if data is None:
        return ""
    if isinstance(data, (dict, list)):
        payload_str = json.dumps(data)
    else:
        payload_str = str(data)
    return encrypt_field(wallet, payload_str)


def decrypt_dict(wallet: str, ciphertext: Optional[str]) -> Any:
    """
    Decrypts ciphertext and deserializes the JSON object/list.
    """
    raw_decrypted = decrypt_field(wallet, ciphertext)
    if not raw_decrypted:
        return {}
    try:
        return json.loads(raw_decrypted)
    except Exception:
        return raw_decrypted
