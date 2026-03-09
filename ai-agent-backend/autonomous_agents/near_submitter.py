import asyncio
from py_near.account import Account
from py_near.models import Action
from py_near import transactions

async def submit_near_transaction(tx_payload: list, agent_address: str, private_key: str) -> str:
    """
    Translates a Defuse 1-Click tx_payload list into py-near Actions, signs them,
    and broadcasts to the NEAR protocol.
    """
    account = Account(agent_address, private_key=private_key)
    await account.startup()

    tx_hash = None
    try:
        for tx in tx_payload:
            receiver_id = tx.get("receiverId")
            actions_list = tx.get("actions", [])
            
            py_near_actions: list[Action] = []
            
            for action in actions_list:
                action_type = action.get("type")
                if action_type == "FunctionCall":
                    params = action.get("params", {})
                    method_name = params.get("methodName")
                    args = params.get("args", {})
                    gas = int(params.get("gas", 30000000000000))
                    deposit = int(params.get("deposit", 0))
                    
                    import json
                    ser_args = json.dumps(args).encode("utf8")
                    
                    fn_action = transactions.create_function_call_action(
                        method_name,
                        ser_args,
                        gas,
                        deposit
                    )
                    py_near_actions.append(fn_action)
                else:
                    print(f"[SUBMIT] Unsupported action type: {action_type}")
            
            if py_near_actions:
                print(f"[SUBMIT] Sending {len(py_near_actions)} actions to {receiver_id}...")
                result = await account.sign_and_submit_tx(receiver_id, py_near_actions, included=True)
                
                # Check if result is a TransactionResult object with a status dict
                if hasattr(result, "transaction") and hasattr(result, "status"):
                    tx_hash = result.transaction.hash
                    if isinstance(result.status, dict) and "Failure" in result.status:
                        error_msg = str(result.status["Failure"])
                        print(f"[SUBMIT]   Transaction FAILED! Hash: {tx_hash} | Error: {error_msg}")
                        raise RuntimeError(f"NEAR Transaction Failed: {error_msg}")
                else:
                    tx_hash = getattr(result, "transaction", result).hash if hasattr(result, "transaction") else str(result)
                    
                print(f"[SUBMIT]   Transaction successful! Hash: {tx_hash}")

    finally:
        await account.shutdown()
        
    return tx_hash
