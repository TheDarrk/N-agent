"""
Agent Signer   Signs and broadcasts transactions on behalf of users.
Only executes actions that have been:
  1. Proposed by Strategy Agent
  2. Approved by Risk Agent (guardrails check)
  3. Authorized by the user (autonomy level check)
"""

import json
import os
import requests
from typing import Dict, Any, Optional

from key_manager import decrypt_private_key
from database import get_agent_key
from network_config import get_near_rpc, is_testnet


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
    agent_key = get_agent_key(user_wallet, "near")
    if not agent_key:
        return {
            "success": False,
            "tx_hash": None,
            "message": f"No agent key found for {user_wallet} on near"
        }
    
    encrypted_key = agent_key.get("encrypted_private_key")
    if not encrypted_key:
        return {
            "success": False,
            "tx_hash": None,
            "message": "Agent key has no private key (read-only mode)"
        }
    
    try:
        private_key = decrypt_private_key(encrypted_key)
        
        from autonomous_agents.near_submitter import submit_near_transaction
        
        tx_payload = [{
            "receiverId": receiver_id,
            "actions": actions
        }]
        
        tx_hash = await submit_near_transaction(
            tx_payload=tx_payload,
            agent_address=user_wallet,
            private_key=private_key
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
    """Fetch access key info (nonce, block_hash) from NEAR RPC with dynamic network resolution."""
    rpc_endpoint = get_near_rpc(account_id)
    try:
        resp = requests.post(rpc_endpoint, json={
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
