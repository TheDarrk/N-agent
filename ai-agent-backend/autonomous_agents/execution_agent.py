"""
Execution Agent   Executes approved actions via NEAR Intents (Defuse 1-Click API).
Only runs after Strategy Agent proposes and Risk Agent approves.

Uses the SAME swap infrastructure as Neptune AI's chat-based swaps:
  - get_swap_quote() for quotes
  - create_near_intent_transaction() for NEAR-chain tx payloads
  - All chains routed through NEAR Intents (NEAR, EVM, Flow)
"""

import json
import os
from typing import Dict, Any
from database import log_agent_action, get_agent_key
from key_manager import decrypt_private_key, get_near_implicit_address


class ExecutionAgent:
    """
    Handles the actual execution of approved autonomous actions.
    Routes swaps through NEAR Intents for all chains.
    """

    def __init__(self):
        self.name = "execution"

    async def execute(
        self,
        decision: Dict[str, Any],
        user_wallet: str,
        risk_result: Dict[str, Any] = None,
        autonomy_level: str = "notify"
    ) -> Dict[str, Any]:
        """
        Execute an approved action.
        
        autonomy_level:
          - "notify"   Log + send email notification (no swap)
          - "approve"   Log + ask user to approve in dashboard
          - "auto"      Actually execute the swap via NEAR Intents
        
        Returns execution result with tx_hash (when available).
        """
        action = decision.get("action", "unknown")
        strategy_type = decision.get("strategy_type", "unknown")
        reasoning = decision.get("reasoning", "")
        details = decision.get("details", {})

        result = {
            "success": False,
            "tx_hash": None,
            "action": action,
            "message": "",
            "execution_type": autonomy_level
        }

        try:
            if autonomy_level == "auto":
                #   Full autonomous execution via NEAR Intents  
                result = await self._execute_swap(
                    decision, user_wallet, result
                )
            else:
                #   Notification / Approval mode  
                result["success"] = True
                if autonomy_level == "approve":
                    result["message"] = (
                        f"  Awaiting approval: {action}. "
                        f"Reason: {reasoning}"
                    )
                else:
                    result["message"] = (
                        f"  Notification: {action}. "
                        f"Reason: {reasoning}"
                    )

            # Log to database
            log_agent_action(
                user_wallet=user_wallet,
                agent_name="execution",
                trigger_type="autonomous",
                reasoning_text=reasoning,
                action_taken=action,
                tx_hash=result.get("tx_hash"),
                status="executed" if result["success"] else "pending"
            )

            print(f"[EXECUTION] [{autonomy_level.upper()}] {user_wallet}: {action}")

        except Exception as e:
            print(f"[EXECUTION] Error for {user_wallet}: {e}")
            result["message"] = "Something went wrong during execution. Check backend logs."
            log_agent_action(
                user_wallet=user_wallet,
                agent_name="execution",
                trigger_type="autonomous",
                reasoning_text=reasoning,
                action_taken=f"FAILED: {action}",
                status="error"
            )

        return result

    async def _execute_swap(
        self,
        decision: Dict[str, Any],
        user_wallet: str,
        result: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Execute a real swap via NEAR Intents / Defuse 1-Click API.
        Uses the SAME get_swap_quote() and create_near_intent_transaction()
        that the chat agent uses for user swaps.
        """
        from tools import get_swap_quote, create_near_intent_transaction

        strategy_type = decision.get("strategy_type", "")
        details = decision.get("details", {})
        action = decision.get("action", "")

        #   Determine swap parameters from strategy decision  
        swap_params = self._resolve_swap_params(decision)

        if not swap_params:
            result["success"] = True
            result["message"] = f"Action logged: {action} (no swap needed)"
            return result

        token_in = swap_params["token_in"]
        token_out = swap_params["token_out"]
        amount = swap_params["amount"]
        chain = swap_params.get("chain", "near")

        print(f"[EXECUTION] Swap plan: {amount} {token_in} -> {token_out} on {chain}")

        #   1. Get agent wallet for this chain  
        agent_key = get_agent_key(user_wallet, chain)
        if not agent_key:
            result["message"] = (
                f"No agent wallet found for chain '{chain}'. "
                f"Logged action: {action}"
            )
            result["success"] = True
            return result

        #   1. Determine the account to sign and receive funds for  
        # New model: Agent signs as a delegate for an authorized account
        agent_account_id = agent_key.get("agent_account_id", "")
        
        if agent_account_id:
            agent_address = agent_account_id
        else:
            # Legacy/Fallback: Use the public key (implicit address for NEAR)
            agent_address = agent_key.get("public_key", "")
            if chain == "near" and agent_address.startswith("ed25519:"):
                try:
                    agent_address = get_near_implicit_address(agent_address)
                except Exception as e:
                    print(f"[EXECUTION] Error deriving implicit address: {e}")

        #   2. Get swap quote via Defuse 1-Click API  
        try:
            quote = get_swap_quote(
                token_in=token_in,
                token_out=token_out,
                amount=amount,
                chain_id=chain,
                recipient_id=agent_address,
                refund_address=agent_address
            )
        except Exception as e:
            print(f"[EXECUTION] Quote error: {e}")
            result["message"] = f"Could not get swap quote. Logged action: {action}"
            result["success"] = True
            return result

        if "error" in quote:
            result["message"] = f"Quote error: {quote['error']}. Logged action: {action}"
            result["success"] = True
            return result

        deposit_address = quote.get("deposit_address", "")
        min_amount_out = float(quote.get("min_amount_out", 0))

        print(f"[EXECUTION] Got quote: {amount} {token_in} -> ~{quote.get('amount_out', '?')} {token_out}")

        #   3. Build transaction payload  
        if chain == "near":
            try:
                # Sign strictly as the authorized agent account
                tx_payload = create_near_intent_transaction(
                    token_in=token_in,
                    token_out=token_out,
                    amount=amount,
                    min_amount_out=min_amount_out,
                    deposit_address=deposit_address,
                    account_id=agent_address
                )
                result["tx_payload"] = tx_payload
                
                from autonomous_agents.near_submitter import submit_near_transaction
                from key_manager import decrypt_private_key
                
                decrypted_key = decrypt_private_key(agent_key.get("encrypted_private_key"))
                
                print(f"[EXECUTION] Submitting transaction as authorized signer: {agent_address}...")
                tx_hash = await submit_near_transaction(
                    tx_payload=tx_payload,
                    agent_address=agent_address,
                    private_key=decrypted_key
                )

                if tx_hash:
                    result["success"] = True
                    result["tx_hash"] = tx_hash
                    result["message"] = f"  Swap Executed: {amount} {token_in} -> {token_out} (Tx: {tx_hash})"
                    print(f"[EXECUTION] Swap successful! Hash: {tx_hash}")
                else:
                    raise Exception("Transaction failed. Hash was None.")

            except Exception as e:
                import traceback
                print(f"[EXECUTION] Full execution error: {e}")
                traceback.print_exc()
                result["success"] = False
                result["message"] = f"Swap logic failed. Details: {e}"
        else:
            # EVM/Flow   quote obtained, log the intent for now
            result["success"] = True
            result["message"] = (
                f"  Swap quote ready: {amount} {token_in} -> {token_out} on {chain}. "
                f"Autonomous EVM execution via NEAR Intents coming soon."
            )

        return result

    def _resolve_swap_params(self, decision: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert a strategy decision into concrete swap parameters.
        Returns None if no swap is needed (e.g., notification-only alerts).
        """
        strategy_type = decision.get("strategy_type", "")
        action = decision.get("action", "")
        details = decision.get("details", {})

        if strategy_type == "price_alert":
            # Price alerts are notification-only, no swap
            return None

        elif strategy_type == "stop_loss":
            # Stop loss: sell the dropping token for a stable
            token = details.get("token", "near")
            return {
                "token_in": token.upper(),
                "token_out": "USDT",
                "amount": details.get("sell_amount", 1.0),
                "chain": details.get("chain", "near")
            }

        elif strategy_type == "rebalance":
            # Rebalance: sell overweight token, buy underweight token
            # The strategy agent should populate these in details
            overweight = details.get("sell_token")
            underweight = details.get("buy_token")
            amount = details.get("rebalance_amount", 0)

            if overweight and underweight and amount > 0:
                return {
                    "token_in": overweight.upper(),
                    "token_out": underweight.upper(),
                    "amount": amount,
                    "chain": details.get("chain", "near")
                }
            return None

        return None
