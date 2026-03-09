"""
Neptune AI   Agent Signer
Signs and submits transactions using delegated access keys.
Used by the Execution Agent in the autonomy pipeline.
"""

import os
import json
import requests
from typing import Dict, Any, Optional

from key_manager import decrypt_private_key
from database import get_agent_key


NEAR_RPC = os.getenv("NEAR_RPC_URL", "https://rpc.mainnet.near.org")


async def sign_near_transaction(
    user_wallet: str,
    receiver_id: str,
    actions: list,
) -> Dict[str, Any]:
    """
    Sign and send a NEAR transaction using the agent's delegated Function Call key.
    
    Args:
        user_wallet: The user's NEAR account (signer)
        receiver_id: The contract to call
        actions: List of NEAR actions (e.g., FunctionCall)
    
    Returns:
        {"success": bool, "tx_hash": str or None, "message": str}
    """
    # Retrieve the agent's key for this user
    key_record = get_agent_key(user_wallet, "near")
    if not key_record:
        return {
            "success": False,
            "tx_hash": None,
            "message": "No NEAR delegation key found. User needs to grant agent access first."
        }
    
    if key_record.get("status") != "active":
        return {
            "success": False,
            "tx_hash": None,
            "message": f"Agent key is not active (status: {key_record.get('status')})"
        }
    
    try:
        # Decrypt the private key
        private_key_str = decrypt_private_key(key_record["encrypted_private_key"])
        
        # Use near-api-py or direct RPC to sign
        import base58
        from nacl.signing import SigningKey
        
        # Parse ed25519:base58 format
        key_data = private_key_str.replace("ed25519:", "")
        key_bytes = base58.b58decode(key_data)
        signing_key = SigningKey(key_bytes[:32])  # First 32 bytes = private key
        
        # Get current nonce and block hash from RPC
        access_key_info = _get_access_key(user_wallet, key_record["public_key"])
        if not access_key_info:
            return {
                "success": False,
                "tx_hash": None,
                "message": "Could not fetch access key info   key may have been revoked on-chain"
            }
        
        nonce = access_key_info["nonce"] + 1
        block_hash = access_key_info["block_hash"]
        
        # Build, sign, and send the transaction
        tx_hash = _build_sign_send(
            signer_id=user_wallet,
            receiver_id=receiver_id,
            nonce=nonce,
            block_hash=block_hash,
            actions=actions,
            signing_key=signing_key,
            public_key=key_record["public_key"]
        )
        
        return {
            "success": True,
            "tx_hash": tx_hash,
            "message": f"Transaction sent: {tx_hash}"
        }
        
    except Exception as e:
        print(f"[AGENT_SIGNER] NEAR signing error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "tx_hash": None,
            "message": f"Signing error: {str(e)}"
        }


def _get_access_key(account_id: str, public_key: str) -> Optional[Dict]:
    """Fetch access key info (nonce, block_hash) from NEAR RPC."""
    try:
        resp = requests.post(NEAR_RPC, json={
            "jsonrpc": "2.0",
            "id": "1",
            "method": "query",
            "params": {
                "request_type": "view_access_key",
                "finality": "final",
                "account_id": account_id,
                "public_key": public_key,
            }
        }, timeout=10)
        
        result = resp.json().get("result", {})
        if "error" in result:
            print(f"[AGENT_SIGNER] Access key query error: {result['error']}")
            return None
        
        return result
    except Exception as e:
        print(f"[AGENT_SIGNER] RPC error: {e}")
        return None


def _build_sign_send(
    signer_id: str,
    receiver_id: str,
    nonce: int,
    block_hash: str,
    actions: list,
    signing_key,
    public_key: str
) -> str:
    """
    Build a NEAR transaction, sign it, and broadcast via RPC.
    Returns the transaction hash.
    """
    import base58
    import hashlib
    import struct
    
    # This is a simplified NEAR transaction builder.
    # For production, use the `py-near` library for proper serialization.
    # For now, we use the JSON RPC broadcast_tx_commit with a signed transaction.
    
    # Encode the transaction using borsh serialization
    # This requires the py-near or near-api-py package for proper borsh encoding
    # Placeholder: direct RPC call approach
    
    from nacl.signing import SigningKey as NaClSigningKey
    
    # For the MVP, we'll use a simpler approach: 
    # Call the NEAR RPC with a pre-built signed transaction
    # The full borsh serialization is complex   in production use py-near
    
    print(f"[AGENT_SIGNER] Signing tx: {signer_id} -> {receiver_id} | nonce: {nonce}")
    print(f"[AGENT_SIGNER] Actions: {json.dumps(actions, indent=2)}")
    
    # TODO: Implement full borsh serialization or use py-near
    # For now, return a placeholder that indicates the signing infrastructure is ready
    raise NotImplementedError(
        "Full NEAR transaction signing requires py-near package. "
        "Install with: pip install py-near"
    )
