"""
Neptune AI   Key Manager
Generates, encrypts, and manages cryptographic keypairs for agent delegation.
Supports NEAR (ed25519), EVM (secp256k1), and Flow (P-256).
"""

import os
import base64
import hashlib
import secrets
from typing import Dict, Tuple

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


#   Encryption Key (from environment)  

def _get_encryption_key() -> bytes:
    """Get the 32-byte AES-256 encryption key from environment."""
    raw = os.getenv("AGENT_ENCRYPTION_KEY", "")
    if not raw:
        # Auto-generate and warn (dev mode only)
        print("[KEY_MANAGER] WARNING: AGENT_ENCRYPTION_KEY not set   using insecure default! Set this in production.")
        raw = "neptune_dev_key_do_not_use_in_prod"
    # Derive 32-byte key from whatever string is provided
    return hashlib.sha256(raw.encode()).digest()


def encrypt_private_key(private_key: str) -> str:
    """Encrypt a private key string using AES-256-GCM. Returns base64-encoded ciphertext."""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    nonce = secrets.token_bytes(12)  # 96-bit nonce
    ciphertext = aesgcm.encrypt(nonce, private_key.encode(), None)
    # Combine nonce + ciphertext and base64 encode
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt_private_key(encrypted: str) -> str:
    """Decrypt an AES-256-GCM encrypted private key."""
    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode()


#   NEAR Keypair (ed25519)  

def generate_near_keypair() -> Dict[str, str]:
    """
    Generate an ed25519 keypair for NEAR Protocol.
    Returns: {"public_key": "ed25519:...", "private_key": "ed25519:...", "public_key_raw": "..."}
    """
    from nacl.signing import SigningKey
    
    signing_key = SigningKey.generate()
    verify_key = signing_key.verify_key
    
    # NEAR format: ed25519:<base58_encoded_key>
    import base58
    pub_b58 = base58.b58encode(bytes(verify_key)).decode()
    priv_b58 = base58.b58encode(bytes(signing_key) + bytes(verify_key)).decode()
    
    return {
        "public_key": f"ed25519:{pub_b58}",
        "private_key": f"ed25519:{priv_b58}",
        "public_key_raw": pub_b58,
    }


#   EVM Keypair (secp256k1)  

def generate_evm_keypair() -> Dict[str, str]:
    """
    Generate a secp256k1 keypair for EVM chains.
    Returns: {"public_key": "0x...", "private_key": "0x...", "address": "0x..."}
    """
    from eth_account import Account
    
    acct = Account.create()
    return {
        "public_key": acct.address,
        "private_key": acct.key.hex(),
        "address": acct.address,
    }


#   Flow Keypair (P-256 / ECDSA_P256)  

def generate_flow_keypair() -> Dict[str, str]:
    """
    Generate a P-256 keypair for Flow blockchain.
    Returns: {"public_key": "<hex>", "private_key": "<hex>"}
    """
    from cryptography.hazmat.primitives.asymmetric import ec
    from cryptography.hazmat.primitives import serialization
    
    private_key = ec.generate_private_key(ec.SECP256R1())
    
    # Get raw private key bytes (32 bytes)
    priv_bytes = private_key.private_numbers().private_value.to_bytes(32, byteorder='big')
    
    # Get uncompressed public key (65 bytes: 04 + x + y), strip the 04 prefix
    pub_bytes = private_key.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint
    )
    
    return {
        "public_key": pub_bytes[1:].hex(),  # Strip 0x04 prefix, Flow expects raw x||y
        "private_key": priv_bytes.hex(),
    }


#   NEAR Implicit Account Address  

def get_near_implicit_address(public_key: str) -> str:
    """
    Convert an ed25519 public key to a NEAR implicit account address.
    NEAR implicit accounts = hex-encoded public key bytes (64 chars).
    
    Args:
        public_key: "ed25519:<base58>" format
    Returns:
        64-character hex string (the implicit account ID)
    """
    from nacl.signing import VerifyKey
    import base58
    
    # Strip "ed25519:" prefix
    raw_b58 = public_key.replace("ed25519:", "")
    key_bytes = base58.b58decode(raw_b58)
    
    return key_bytes.hex()

