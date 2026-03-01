from typing import Dict, Any, List, Optional
import httpx
import json
import datetime
import asyncio
from decimal import Decimal
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from validators import validate_near_address, validate_evm_address, get_chain_from_address
from knowledge_base import get_available_tokens_from_api, get_token_by_symbol, get_token_symbols_list

# EVM Chain IDs (from HOT Kit Network enum — ALL supported EVM chains)
EVM_CHAIN_IDS = {
    # Major L1s
    "eth": 1,
    "ethereum": 1,
    "bnb": 56,
    "bsc": 56,
    "polygon": 137,
    "pol": 137,
    "avalanche": 43114,
    "avax": 43114,
    "fantom": 250,
    "gnosis": 100,
    "cronos": 25,
    "kava": 2222,
    # L2s / Rollups
    "arbitrum": 42161,
    "arb": 42161,
    "base": 8453,
    "optimism": 10,
    "op": 10,
    "linea": 59144,
    "scroll": 534352,
    "zksync": 324,
    "mantle": 5000,
    "manta": 169,
    "blast": 81457,
    "taiko": 167000,
    "metis": 1088,
    "mode": 34443,
    "lisk": 1135,
    "sonic": 146,
    "zora": 7777777,
    "ink": 57073,
    "soneium": 1868,
    "unichain": 130,
    "apechain": 2741,
    "ape": 2741,
    # Others
    "aurora": 1313161554,
    "xlayer": 196,
    "opbnb": 204,
    "berachain": 80094,
    "bera": 80094,
    "sei": 1329,
    "chiliz": 88888,
    "moonbeam": 1284,
    "ronin": 2020,
    "monad": 143,
    "ebichain": 98881,
    "adi": 36900,
}

# Non-EVM chains supported by HOT Kit + NEAR Intents
# These have their own wallet types and signing flows
NON_EVM_CHAINS = {
    "near": "near",
    "solana": "solana",
    "sol": "solana",
    "ton": "ton",
    "tron": "tron",
    "trx": "tron",
    "stellar": "stellar",
    "xlm": "stellar",
    "cosmos": "cosmos",
    "btc": "btc",
    "bitcoin": "btc",
    "doge": "doge",
    "xrp": "xrp",
    "ada": "ada",
    "cardano": "cardano",
    "aptos": "aptos",
    "apt": "aptos",
    "sui": "sui",
    "litecoin": "litecoin",
    "ltc": "litecoin",
    "zcash": "zcash",
    "zec": "zcash",
}

# All chains — lookup helper
ALL_SUPPORTED_CHAINS = set(list(EVM_CHAIN_IDS.keys()) + list(NON_EVM_CHAINS.keys()))

# Chains that are EVM-based (same wallet type)
EVM_CHAINS = set(EVM_CHAIN_IDS.keys())

def is_evm_chain(chain: str) -> bool:
    """Check if a chain name is EVM-based."""
    return chain.lower() in EVM_CHAINS

def get_evm_chain_id(chain: str) -> Optional[int]:
    """Get the EVM chain ID for a chain name."""
    return EVM_CHAIN_IDS.get(chain.lower())

def is_supported_chain(chain: str) -> bool:
    """Check if a chain is supported at all (EVM, NEAR, or other)."""
    return chain.lower() in ALL_SUPPORTED_CHAINS


def get_available_tokens() -> List[str]:
    """
    Returns list of currently supported token symbols from API.
    Returns empty list if API fails.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If already in event loop, use the cached version
            from knowledge_base import _token_cache
            tokens = _token_cache if _token_cache else []
        else:
            try:
                tokens = loop.run_until_complete(get_available_tokens_from_api())
            except Exception as e:
                print(f"[TOOL] Failed to get tokens: {e}")
                return []
        return get_token_symbols_list(tokens) if tokens else []
    except Exception as e:
        print(f"[TOOL] Error in get_available_tokens: {e}")
        return []


def is_cross_chain_swap(token_in: str, token_out: str) -> bool:
    """
    Determine if this is a cross-chain swap by checking token blockchains.
    Uses cached token metadata to avoid async issues.
    """
    try:
        from knowledge_base import _token_cache, get_token_by_symbol
        
        # Use cached tokens only to avoid event loop issues
        tokens = _token_cache if _token_cache else []
        
        if not tokens:
            print(f"[TOOLS] Warning: No cached token data for cross-chain detection")
            return False
        
        # Find both tokens
        token_in_data = get_token_by_symbol(token_in.upper(), tokens)
        token_out_data = get_token_by_symbol(token_out.upper(), tokens)
        
        if not token_in_data or not token_out_data:
            print(f"[TOOLS] Warning: Could not find token data for {token_in} or {token_out}")
            return False
        
        # Get blockchain for each token
        chain_in = token_in_data.get("blockchain", "near").lower()
        chain_out = token_out_data.get("blockchain", "near").lower()
        
        # Normalize chain names (NEAR and Aurora are same chain)
        if chain_in in ["near", "aurora"]:
            chain_in = "near"
        if chain_out in ["near", "aurora"]:
            chain_out = "near"
        
        is_cross = chain_in != chain_out
        print(f"[TOOLS] Cross-chain check: {token_in}({chain_in}) -> {token_out}({chain_out}) = {is_cross}")
        
        return is_cross
        
    except Exception as e:
        print(f"[TOOLS] Error in cross-chain detection: {e}")
        import traceback
        traceback.print_exc()
        return False


@retry(
    stop=stop_after_attempt(8),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.HTTPError, httpx.TimeoutException)),
    reraise=True
)
def _fetch_quote_with_retry(url: str, payload: Dict, attempt_num: int = 1) -> httpx.Response:
    """
    Internal function to fetch quote with retry logic.
    Decorated with tenacity retry for 5-8 attempts with exponential backoff.
    """
    print(f"[TOOL] Fetching quote attempt {attempt_num}/8...")
    response = httpx.post(url, json=payload, timeout=10.0)
    if response.status_code >= 400:
        print(f"[TOOL] API Error ({response.status_code}): {response.text}")
    response.raise_for_status()
    return response

def get_swap_quote(
    token_in: str, 
    token_out: str, 
    amount: float, 
    chain_id: str = "near", 
    recipient_id: str = None,
    is_cross_chain: bool = False,
    refund_address: str = None,
    source_chain: str = None,
    dest_chain: str = None
) -> Dict[str, Any]:
    """
    Fetches a real swap quote from Defuse 1-Click API.
    
    Args:
        token_in: Source token symbol
        token_out: Destination token symbol
        amount: Amount to swap
        chain_id: Chain identifier
        recipient_id: Recipient address (NEAR account for same-chain, destination chain address for cross-chain)
        is_cross_chain: Whether this is a cross-chain swap
        refund_address: Address for refunds (should be source chain address, e.g. NEAR account)
    """
    t_in = token_in.upper()
    t_out = token_out.upper()
    
    # Dynamic lookup from knowledge base
    from knowledge_base import _token_cache, get_token_by_symbol
    tokens = _token_cache if _token_cache else []
    
    token_in_data = get_token_by_symbol(t_in, tokens, chain=source_chain or chain_id)
    token_out_data = get_token_by_symbol(t_out, tokens, chain=dest_chain)
    
    if not token_in_data:
        return {"error": f"Token {t_in} not found in supported list"}
    if not token_out_data:
        return {"error": f"Token {t_out} not found in supported list"}
        
    asset_in = token_in_data.get("defuseAssetId")
    asset_out = token_out_data.get("defuseAssetId")
    
    decimals_in = token_in_data.get("decimals", 24)
    amount_atomic = int(Decimal(str(amount)) * Decimal(10 ** decimals_in))
    
    print(f"[TOOL] Fetching 1-Click quote for {amount} {t_in} -> {t_out}")
    print(f"[TOOL]   Asset In:  {asset_in}")
    print(f"[TOOL]   Asset Out: {asset_out}")
    print(f"[TOOL]   Recipient: {recipient_id}")
    print(f"[TOOL]   Cross-chain: {is_cross_chain}")
    print(f"[TOOL]   Refund To: {refund_address}")

    url = "https://1click.chaindefuser.com/v0/quote"
    
    if not recipient_id:
        return {"error": "Wallet must be connected to fetch a quote (missing Account ID)"}
    
    # Use refund_address if provided, otherwise fall back to recipient 
    refund_to = refund_address or recipient_id
    
    deadline = (datetime.datetime.utcnow() + datetime.timedelta(minutes=5)).isoformat(timespec='seconds') + "Z"

    # Key logic: depositType/recipientType depend on source and destination chains
    # Determine if source is EVM or NEAR
    source_is_evm = is_evm_chain(chain_id)
    
    if source_is_evm:
        # EVM-sourced: deposit via ORIGIN_CHAIN (user sends native tx on EVM)
        deposit_type = "ORIGIN_CHAIN"
        refund_type = "ORIGIN_CHAIN"
    else:
        # NEAR-sourced: deposit via INTENTS (mt_transfer inside NEAR)
        deposit_type = "INTENTS"
        refund_type = "INTENTS"
    
    if is_cross_chain:
        recipient_type = "DESTINATION_CHAIN"
        recipient = recipient_id  # destination chain address (e.g. 0x... for EVM)
    else:
        recipient_type = "INTENTS"
        # Use recipient_id if explicitly provided (e.g. "send USDC to flame1.near")
        # Only fall back to refund_to when no specific recipient was given
        recipient = recipient_id or refund_to

    payload = {
        "swapType": "EXACT_INPUT",
        "originAsset": asset_in,
        "destinationAsset": asset_out,
        "amount": str(amount_atomic),
        "depositType": deposit_type,
        "refundType": refund_type,
        "recipient": recipient,
        "recipientType": recipient_type,
        "refundTo": refund_to,
        "slippageTolerance": 10,
        "dry": False,
        "deadline": deadline,
        "quoteWaitingTimeMs": 0
    }
    
    print(f"[TOOL] Quote Request Payload: {json.dumps(payload, indent=2)}")
    
    try:
        # Use retry logic - attempt up to 8 times
        for attempt in range(1, 9):
            try:
                response = _fetch_quote_with_retry(url, payload, attempt)
                break
            except (httpx.HTTPError, httpx.TimeoutException) as e:
                if attempt == 8:
                    print(f"[TOOL] Failed to fetch quote after {attempt} attempts")
                    return {"error": "Unable to fetch quote after multiple attempts. Please try again later."}
                print(f"[TOOL] Attempt {attempt} failed, retrying... ({str(e)})")
                continue
        data = response.json()
        
        print(f"[TOOL] Quote Response: {json.dumps(data, indent=2)}")
        
        # Check for error in body
        if "message" in data:
             return {"error": data["message"]}
             
        quote = data.get("quote") or data
        if not quote.get("depositAddress"):
             return {"error": "No deposit address found in quote"}
             
        # Format output amount using dynamic decimals
        amount_out_atomic = int(quote["amountOut"])
        decimals_out = token_out_data.get("decimals", 18)
        amount_out_fmt = amount_out_atomic / (10 ** decimals_out)
        
        print(f"[TOOL] Quote received: {amount} {t_in} -> {amount_out_fmt} {t_out}")
        print(f"[TOOL] Deposit address: {quote['depositAddress']}")
        
        return {
            "token_in": t_in,
            "token_out": t_out,
            "amount_in": amount,
            "amount_out": amount_out_fmt,
            "rate": amount_out_fmt / amount if amount > 0 else 0,
            "chain": chain_id,
            "deposit_address": quote["depositAddress"],
            "defuse_asset_in": asset_in,
            "defuse_asset_out": asset_out
        }
        
    except Exception as e:
        print(f"[TOOL] API Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

def create_near_intent_transaction(
    token_in: str, 
    token_out: str, 
    amount: float, 
    min_amount_out: float, 
    deposit_address: str,
    account_id: str = ""
) -> List[Dict[str, Any]]:
    """
    Constructs the transaction payload for NEAR-sourced swaps via 1-Click API.
    
    Flow (per 1-Click API docs):
      TX1: Deposit source token into intents.near
        - For NEAR: wrap.near -> near_deposit + ft_transfer_call to intents.near
        - For NEP-141: token contract -> ft_transfer_call to intents.near
      TX2: Transfer within intents.near to the quote's deposit address
        - intents.near -> mt_transfer(token_id, deposit_address, amount)
    
    Args:
        token_in: Source token symbol
        token_out: Destination token symbol  
        amount: Amount of source token
        min_amount_out: Minimum acceptable output (unused by 1-Click, kept for compatibility)
        deposit_address: The deposit address from the 1-Click quote response
        account_id: User's NEAR account ID (used in ft_transfer_call msg)
    """
    print(f"[TOOL] Creating transaction: {amount} {token_in} -> {token_out}")
    print(f"[TOOL]   Deposit address: {deposit_address}")
    print(f"[TOOL]   Account ID: {account_id}")
    
    contract_id = "intents.near" 
    transactions = []
    
    # Dynamic lookup
    from knowledge_base import _token_cache, get_token_by_symbol
    tokens = _token_cache if _token_cache else []
    
    token_in_data = get_token_by_symbol(token_in.upper(), tokens)
    token_out_data = get_token_by_symbol(token_out.upper(), tokens)
    
    decimals_in = token_in_data.get("decimals", 24) if token_in_data else 24
    amount_int = int(Decimal(str(amount)) * Decimal(10 ** decimals_in))

    # ── TX 1: Deposit source token into intents.near ──
    if token_in.upper() == "NEAR":
        # Wrap NEAR and transfer to intents.near
        # Per example: near_deposit() + ft_transfer_call() with msg = account_id
        transactions.append({
            "receiverId": "wrap.near",
            "actions": [
                # 1. Wrap NEAR -> wNEAR 
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "near_deposit",
                        "args": {},
                        "gas": "10000000000000",  # 10 TGas
                        "deposit": str(amount_int)
                    }
                },
                # 2. Transfer wNEAR to intents.near (deposit)
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "ft_transfer_call",
                        "args": {
                            "receiver_id": contract_id,
                            "amount": str(amount_int),
                            "msg": account_id  # Per example: msg = account_id
                        },
                        "gas": "50000000000000",  # 50 TGas
                        "deposit": "1"
                    }
                }
            ]
        })
    else:
        # NEP-141 token: ft_transfer_call to intents.near
        t_in_contract = ""
        if token_in_data:
            t_in_contract = token_in_data.get("contractAddress", "")
        
        if not t_in_contract:
            # Fallback: parse from defuse asset ID (nep141:contract.near)
            defuse_id = token_in_data.get("defuseAssetId", "") if token_in_data else ""
            if defuse_id.startswith("nep141:"):
                t_in_contract = defuse_id.replace("nep141:", "")
            else:
                t_in_contract = f"{token_in.lower()}.near"

        transactions.append({
            "receiverId": t_in_contract,
            "actions": [
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "ft_transfer_call",
                        "args": {
                            "receiver_id": contract_id,
                            "amount": str(amount_int), 
                            "msg": account_id  # Per example: msg = account_id
                        },
                        "gas": "50000000000000",
                        "deposit": "1"
                    }
                }
            ]
        })

    # ── TX 2: mt_transfer to the quote's deposit address ──
    # This tells 1-Click to start the swap
    token_in_id = token_in_data.get("defuseAssetId") if token_in_data else ""
    if token_in.upper() == "NEAR":
        token_in_id = "nep141:wrap.near"
        
    transactions.append({
        "receiverId": contract_id,
        "actions": [
            {
                "type": "FunctionCall",
                "params": {
                    "methodName": "mt_transfer",
                    "args": {
                        "token_id": token_in_id,
                        "receiver_id": deposit_address,
                        "amount": str(amount_int),
                    },
                    "gas": "100000000000000",  # 100 TGas (increased for safety)
                    "deposit": "1", 
                }
            }
        ]
    })
    
    print(f"[TOOL] Transaction payload ({len(transactions)} txs):")
    for i, tx in enumerate(transactions):
        print(f"[TOOL]   TX{i+1}: receiverId={tx['receiverId']}, actions={len(tx['actions'])}")
        for j, action in enumerate(tx['actions']):
            if action.get('params'):
                print(f"[TOOL]     Action{j+1}: {action['params'].get('methodName', 'unknown')}")
    
    return transactions


# ══════════════════════════════════════════════════════════════════
# TRANSACTION SAFETY VALIDATION
# Pre-sign checks to prevent users from signing malformed transactions.
# These run BEFORE the payload is returned to the frontend.
# ══════════════════════════════════════════════════════════════════

import re

def is_valid_evm_address(address: str) -> bool:
    """Check if a string is a valid EVM hex address (0x + 40 hex chars)."""
    if not address or not isinstance(address, str):
        return False
    return bool(re.match(r'^0x[0-9a-fA-F]{40}$', address))


def validate_evm_transaction(tx_payload: Dict[str, Any], deposit_address: str, amount: float, token_in: str) -> Dict[str, Any]:
    """
    Validate an EVM transaction payload before presenting to user.
    Returns { valid: bool, errors: list[str], warnings: list[str] }
    """
    errors = []
    warnings = []
    
    # 1. chainId must exist and be a positive integer
    chain_id = tx_payload.get("chainId")
    if not chain_id or not isinstance(chain_id, int) or chain_id <= 0:
        errors.append(f"Invalid chainId: {chain_id}")
    
    # 2. 'to' address must be a valid EVM address
    to_addr = tx_payload.get("to", "")
    if not is_valid_evm_address(to_addr):
        errors.append(f"Invalid 'to' address: '{to_addr}' — must be a valid 0x address")
    
    # 3. 'from' address — if present, must be valid EVM address
    from_addr = tx_payload.get("from", "")
    if from_addr and not is_valid_evm_address(from_addr):
        errors.append(f"Invalid 'from' address: '{from_addr}' — not a valid EVM address (NEAR account ID?)")
    
    # 4. Value sanity check
    value = tx_payload.get("value", "0")
    try:
        value_int = int(value)
        if value_int < 0:
            errors.append(f"Negative value: {value_int}")
    except (ValueError, TypeError):
        errors.append(f"Invalid value field: '{value}'")
    
    # 5. ERC-20 data field cross-check
    data = tx_payload.get("data")
    if data and isinstance(data, str) and data.startswith("0xa9059cbb"):
        # This is an ERC-20 transfer() call — verify the encoded recipient matches deposit_address
        try:
            # Data format: 0xa9059cbb + 32 bytes address + 32 bytes amount
            # Extract the address from bytes 4..36 (hex chars 10..74)
            if len(data) >= 74:  # 0x + 8 selector + 64 address
                encoded_addr = "0x" + data[34:74]  # Strip leading zeros from 32-byte padded address
                encoded_addr_clean = "0x" + encoded_addr[-40:]  # Last 40 hex chars are the actual address
                
                if deposit_address and encoded_addr_clean.lower() != deposit_address.lower():
                    errors.append(
                        f"ERC-20 MISMATCH: encoded recipient {encoded_addr_clean} "
                        f"≠ expected deposit address {deposit_address}"
                    )
                
                # Also verify 'to' field is the token CONTRACT (not the deposit address)
                # For ERC-20, 'to' = contract, data contains the actual recipient
                if to_addr.lower() == deposit_address.lower():
                    warnings.append(
                        "ERC-20 'to' field equals deposit_address. "
                        "For ERC-20 transfers, 'to' should be the token contract address."
                    )
        except Exception as e:
            warnings.append(f"Could not verify ERC-20 data encoding: {e}")
    
    # 6. Native transfer: 'to' should match deposit_address 
    if not data or data == "0x":
        if to_addr and deposit_address and to_addr.lower() != deposit_address.lower():
            errors.append(
                f"Native transfer 'to' address {to_addr} ≠ expected deposit address {deposit_address}"
            )
        # Native transfer must have non-zero value
        try:
            if int(tx_payload.get("value", "0")) == 0:
                errors.append("Native transfer with zero value — no tokens would be sent")
        except (ValueError, TypeError):
            pass
    
    # 7. Amount cross-check: warn if computed wei seems unreasonable
    if amount <= 0:
        errors.append(f"Amount must be positive, got: {amount}")
    
    result = {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings
    }
    
    if errors:
        print(f"[SAFETY] ❌ EVM TX VALIDATION FAILED for {amount} {token_in}:")
        for e in errors:
            print(f"[SAFETY]   ERROR: {e}")
    if warnings:
        for w in warnings:
            print(f"[SAFETY]   ⚠ WARNING: {w}")
    if not errors:
        print(f"[SAFETY] ✅ EVM TX validated: {amount} {token_in} → {to_addr[:10]}...")
    
    return result


def validate_near_transaction(tx_payload: Any, deposit_address: str, amount: float, token_in: str) -> Dict[str, Any]:
    """
    Validate a NEAR transaction payload (list of tx objects) before presenting to user.
    """
    errors = []
    warnings = []
    
    if not isinstance(tx_payload, list):
        errors.append(f"NEAR payload should be a list of transactions, got: {type(tx_payload)}")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    if len(tx_payload) == 0:
        errors.append("Empty transaction list — no transactions to sign")
        return {"valid": False, "errors": errors, "warnings": warnings}
    
    for i, tx in enumerate(tx_payload):
        prefix = f"TX[{i}]"
        
        # 1. receiverId must exist and look like a NEAR account
        receiver = tx.get("receiverId", "")
        if not receiver:
            errors.append(f"{prefix}: Missing receiverId")
        elif not re.match(r'^[a-z0-9._-]+$', receiver):
            errors.append(f"{prefix}: Invalid NEAR receiverId: '{receiver}'")
        
        # 2. Actions must exist
        actions = tx.get("actions", [])
        if not actions:
            errors.append(f"{prefix}: No actions in transaction")
        
        # 3. Validate each action
        for j, action in enumerate(actions):
            action_prefix = f"{prefix}.action[{j}]"
            action_type = action.get("type", "")
            
            if action_type == "FunctionCall":
                params = action.get("params", {})
                method = params.get("methodName", "")
                
                if not method:
                    errors.append(f"{action_prefix}: FunctionCall with no methodName")
                
                # Check deposit amount for ft_transfer_call and near_deposit
                deposit = params.get("deposit", "0")
                gas = params.get("gas", "0")
                
                if not gas or gas == "0":
                    warnings.append(f"{action_prefix}: Zero gas attached to {method}")
                
                # For ft_transfer_call, verify args contain the deposit_address
                if method == "ft_transfer_call" and deposit_address:
                    args = params.get("args", {})
                    if isinstance(args, dict):
                        receiver_id = args.get("receiver_id", "")
                        if receiver_id and receiver_id != deposit_address:
                            # Check inside msg JSON for the actual intents receiver
                            msg_str = args.get("msg", "")
                            if deposit_address not in str(msg_str) and deposit_address not in str(receiver_id):
                                warnings.append(
                                    f"{action_prefix}: ft_transfer_call receiver '{receiver_id}' — "
                                    f"verify this is the correct intents contract"
                                )
            elif action_type not in ["FunctionCall", "Transfer"]:
                warnings.append(f"{action_prefix}: Unusual action type: '{action_type}'")
    
    # 4. Amount sanity
    if amount <= 0:
        errors.append(f"Amount must be positive, got: {amount}")
    
    result = {
        "valid": len(errors) == 0,
        "errors": errors, 
        "warnings": warnings
    }
    
    if errors:
        print(f"[SAFETY] ❌ NEAR TX VALIDATION FAILED for {amount} {token_in}:")
        for e in errors:
            print(f"[SAFETY]   ERROR: {e}")
    if warnings:
        for w in warnings:
            print(f"[SAFETY]   ⚠ WARNING: {w}")
    if not errors:
        print(f"[SAFETY] ✅ NEAR TX validated: {amount} {token_in}, {len(tx_payload)} txs")
    
    return result


def validate_generic_transaction(tx_payload: Dict[str, Any], amount: float, token_in: str) -> Dict[str, Any]:
    """Validate a generic chain (Solana/Cosmos/Tron/etc.) transaction payload."""
    errors = []
    warnings = []
    
    if not tx_payload.get("to"):
        errors.append("Missing 'to' (deposit) address")
    if not tx_payload.get("chain"):
        errors.append("Missing 'chain' identifier")
    if amount <= 0:
        errors.append(f"Amount must be positive, got: {amount}")
    
    result = {"valid": len(errors) == 0, "errors": errors, "warnings": warnings}
    if errors:
        print(f"[SAFETY] ❌ Generic TX VALIDATION FAILED: {errors}")
    else:
        print(f"[SAFETY] ✅ Generic TX validated: {amount} {token_in} on {tx_payload.get('chain')}")
    return result



def encode_erc20_transfer(to_address: str, amount_wei: int) -> str:
    """
    Encode ERC-20 transfer(address,uint256) call using web3.py.
    """
    from web3 import Web3
    w3 = Web3()
    # Minimal ABI for ERC20 transfer
    abi = [{
        "constant": False, 
        "inputs": [
            {"name": "_to", "type": "address"}, 
            {"name": "_value", "type": "uint256"}
        ], 
        "name": "transfer", 
        "outputs": [{"name": "", "type": "bool"}], 
        "payable": False, 
        "stateMutability": "nonpayable", 
        "type": "function"
    }]
    # Create empty contract for encoding
    contract = w3.eth.contract(abi=abi)
    # Encode the transfer ABI specifying the exact recipient and amount
    # We use to_checksum_address carefully just in case the backend requires it, 
    # but Web3 handles the internal formatting correctly. 
    try:
        checksum_address = w3.to_checksum_address(to_address)
    except ValueError:
        # Fallback if invalid checksum, usually addresses should be strictly formatted
        checksum_address = to_address
        
    return contract.encode_abi("transfer", args=[checksum_address, amount_wei])

def create_deposit_transaction(
    token_in: str,
    token_out: str,
    amount: float,
    min_amount_out: float,
    deposit_address: str,
    source_chain: str,
    account_id: str
) -> Any:
    """
    Modular builder for generating transaction payloads across multiple chains (EVM, NEAR, Solana, Cosmos).
    Delegates to the correct builder based on the source chain.
    All payloads are VALIDATED before being returned — malformed transactions are rejected.
    """
    if source_chain == "near":
        tx_payload = create_near_intent_transaction(
            token_in=token_in,
            token_out=token_out,
            amount=amount,
            min_amount_out=min_amount_out,
            deposit_address=deposit_address,
            account_id=account_id
        )
        # Safety validation
        validation = validate_near_transaction(tx_payload, deposit_address, amount, token_in)
        if not validation["valid"]:
            raise ValueError(f"Transaction safety check failed: {'; '.join(validation['errors'])}")
        return tx_payload
        
    elif is_evm_chain(source_chain):
        tx_payload = create_evm_deposit_transaction(
            token_in=token_in,
            amount=amount,
            deposit_address=deposit_address,
            source_chain=source_chain,
            from_address=account_id
        )
        # Safety validation
        validation = validate_evm_transaction(tx_payload, deposit_address, amount, token_in)
        if not validation["valid"]:
            raise ValueError(f"Transaction safety check failed: {'; '.join(validation['errors'])}")
        return tx_payload
        
    else:
        # Fallback for non-EVM and non-NEAR (Solana, Cosmos, Tron etc.)
        print(f"[TOOL] Creating Generic/Native transfer for {token_in} on {source_chain}")
        tx_payload = {
            "chain": source_chain,
            "type": "native_transfer",
            "to": deposit_address,
            "from": account_id,
            "amount": float(amount),
            "token": token_in.upper()
        }
        # Safety validation
        validation = validate_generic_transaction(tx_payload, amount, token_in)
        if not validation["valid"]:
            raise ValueError(f"Transaction safety check failed: {'; '.join(validation['errors'])}")
        return tx_payload


def create_evm_deposit_transaction(
    token_in: str,
    amount: float,
    deposit_address: str,
    source_chain: str,
    from_address: str
) -> Dict[str, Any]:
    """
    Constructs the EVM transaction payload for depositing tokens.
    Supports both Native (ETH, BNB, etc.) and ERC-20 tokens.
    """
    chain_id = get_evm_chain_id(source_chain)
    if not chain_id:
        raise ValueError(f"Unknown EVM chain: {source_chain}")
    
    # Validate from_address is a proper EVM address (0x...)
    # If it's a NEAR account ID or other non-EVM format, omit it — 
    # the frontend wallet-provider will fill it from the connected wallet
    if from_address and not from_address.startswith("0x"):
        print(f"[TOOL] WARNING: from_address '{from_address}' is not a valid EVM address, omitting")
        from_address = ""
    
    # Get token data to check if Native or ERC-20
    from knowledge_base import _token_cache, get_token_by_symbol
    tokens = _token_cache if _token_cache else []
    token_data = get_token_by_symbol(token_in.upper(), tokens, chain=source_chain)
    
    # Default to 18 decimals if not found
    decimals = token_data.get("decimals", 18) if token_data else 18
    contract_address = token_data.get("contractAddress") if token_data else None
    
    amount_wei = int(Decimal(str(amount)) * Decimal(10 ** decimals))
    
    # Determine transaction type
    # If explicit contract address exists, it's likely ERC-20.
    # Native tokens usually have empty contractAddress in the API.
    # Exception: Wrapped tokens (WETH) have contract address but user might intend to send Native ETH.
    # BUT 1-Click usually expects the exact asset you quoted. 
    # If quote was for "ETH" (native), contractAddress should be empty.
    # If quote was "WETH", contractAddress is present.
    
    is_erc20 = bool(contract_address and contract_address.strip())
    
    if is_erc20:
        # ERC-20 Transfer
        print(f"[TOOL] Creating ERC-20 transfer for {token_in} on {source_chain}")
        print(f"[TOOL] Contract: {contract_address}, To: {deposit_address}, Amount: {amount_wei}")
        
        data_payload = encode_erc20_transfer(deposit_address, amount_wei)
        
        tx_payload = {
            "chainId": chain_id,
            "to": contract_address, # Send to Token Contract
            "value": "0",           # No native ETH sent
            "data": data_payload    # Encoded transfer() call
        }
        if from_address:
            tx_payload["from"] = from_address
    else:
        # Native Asset Transfer (ETH, BNB, etc.)
        print(f"[TOOL] Creating Native transfer for {token_in} on {source_chain}")
        tx_payload = {
            "chainId": chain_id,
            "to": deposit_address,  # Send directly to deposit address
            "value": str(amount_wei),
        }
        if from_address:
            tx_payload["from"] = from_address
    
    print(f"[TOOL] EVM Transaction payload:")
    print(f"[TOOL]   Chain: {source_chain} (ID: {chain_id})")
    print(f"[TOOL]   From: {from_address}")
    print(f"[TOOL]   To: {deposit_address}")
    print(f"[TOOL]   Value: {amount_wei} ({amount} {token_in})")
    
    return tx_payload


def get_sign_action_type(source_chain: str) -> str:
    """
    Returns the frontend action type string based on the source chain.
    The frontend wallet adapter uses this to route to the correct signing flow.
    """
    source = source_chain.lower()
    if source == "near":
        return "SIGN_TRANSACTION"
    elif is_evm_chain(source):
        return "SIGN_EVM_TRANSACTION"
    elif source in ("solana", "sol"):
        return "SIGN_SOLANA_TRANSACTION"
    elif source in ("ton",):
        return "SIGN_TON_TRANSACTION"
    elif source in ("tron", "trx"):
        return "SIGN_TRON_TRANSACTION"
    elif source in ("cosmos", "atom"):
        return "SIGN_COSMOS_TRANSACTION"
    elif source in ("btc", "bitcoin"):
        return "SIGN_BTC_TRANSACTION"
    else:
        # Generic fallback — frontend should handle based on chain field in payload
        return "SIGN_GENERIC_TRANSACTION"


async def submit_deposit_tx(
    deposit_address: str,
    tx_hash: str,
    near_sender_account: Optional[str] = None
) -> Dict[str, Any]:
    """
    Optionally notify the 1-Click service that a deposit has been sent.
    Speeds up swap processing by allowing the system to preemptively verify the deposit.
    
    POST /v0/deposit/submit
    Body: { txHash, depositAddress, nearSenderAccount? }
    """
    url = "https://1click.chaindefuser.com/v0/deposit/submit"
    payload = {
        "txHash": tx_hash,
        "depositAddress": deposit_address,
    }
    if near_sender_account:
        payload["nearSenderAccount"] = near_sender_account
    
    print(f"[TOOL] Submitting deposit tx to 1-Click: hash={tx_hash}, addr={deposit_address}")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=10.0)
            data = response.json()
            print(f"[TOOL] Deposit submit response: {json.dumps(data, indent=2)}")
            return data
    except Exception as e:
        print(f"[TOOL] Deposit submit error (non-critical): {e}")
        # This is optional — don't fail the swap if this call fails
        return {"error": str(e)}
