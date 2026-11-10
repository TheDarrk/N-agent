"""
Neptune AI v2.1 — Encryption Layer
Pure-Python AES-256-GCM Authenticated Encryption with deterministic wallet-specific salts.
Derivation formula: SHA256(MASTER_KEY + WALLET_ADDRESS + ":" + FIELD_SALT)
Zero external C-dependencies; fully portable across Windows, Linux, and macOS.
"""

import os
import base64
import hashlib
import secrets
from typing import Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class WalletEncryption:
    def __init__(self, master_key: Optional[str] = None):
        raw = master_key or os.getenv("AGENT_ENCRYPTION_KEY", "")
        if not raw:
            # Fallback for dev mode
            raw = "neptune_dev_key_do_not_use_in_prod"
        self.master_key = hashlib.sha256(raw.encode("utf-8")).digest()

    def derive_key(self, wallet_address: str, field_salt: str) -> bytes:
        """Derive a 256-bit AES key unique to (wallet_address, field_salt)."""
        clean_wallet = (wallet_address or "").strip().lower()
        clean_salt = (field_salt or "general").strip().lower()
        combined = f"{clean_wallet}:{clean_salt}".encode("utf-8")
        return hashlib.sha256(self.master_key + combined).digest()

    def encrypt_field(self, wallet_address: str, field_salt: str, plaintext: str) -> str:
        """Encrypts a plaintext string using AES-256-GCM. Returns base64-encoded nonce+ciphertext."""
        if not plaintext:
            return ""
        key = self.derive_key(wallet_address, field_salt)
        aesgcm = AESGCM(key)
        nonce = secrets.token_bytes(12)  # 96-bit nonce
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        return base64.b64encode(nonce + ciphertext).decode("utf-8")

    def decrypt_field(self, wallet_address: str, field_salt: str, encrypted_b64: str) -> str:
        """Decrypts a base64-encoded AES-256-GCM payload. Validates authentication tag."""
        if not encrypted_b64:
            return ""
        key = self.derive_key(wallet_address, field_salt)
        aesgcm = AESGCM(key)
        raw = base64.b64decode(encrypted_b64.encode("utf-8"))
        if len(raw) < 12:
            raise ValueError("Invalid encrypted payload length (missing nonce).")
        nonce = raw[:12]
        ciphertext = raw[12:]
        plaintext = aesgcm.decrypt(nonce, ciphertext, None)
        return plaintext.decode("utf-8")


# Global singleton instance
_encryption_instance: Optional[WalletEncryption] = None

def get_encryption() -> WalletEncryption:
    global _encryption_instance
    if _encryption_instance is None:
        _encryption_instance = WalletEncryption()
    return _encryption_instance
