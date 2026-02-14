from typing import Dict, Any, Optional, List
import httpx
import json
import datetime
import asyncio
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from validators import validate_near_address, validate_evm_address, get_chain_from_address
from knowledge_base import get_available_tokens_from_api, get_token_by_symbol, get_token_symbols_list

# Defuse Asset IDs map
TOKEN_MAP = {
    "NEAR": "nep141:wrap.near",
    "ETH": "nep141:eth.bridge.near", # Using eth.bridge.near as primary ETH
    "USDC": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    "USDT": "nep141:usdt.tether-token.near",
    "WBTC": "nep141:minter.bridge.near", # Assuming standard bridge
    "AURORA": "nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
}

# Decimals map for simple conversion
DECIMALS_MAP = {
    "NEAR": 24,
    "ETH": 18,
    "USDC": 6,
    "USDT": 6,
    "WBTC": 8,
    "AURORA": 18
}

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
            # No token data available, assume same-chain for safety
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
    response.raise_for_status()
    return response

def get_swap_quote(token_in: str, token_out: str, amount: float, chain_id: str = "near", recipient_id: str = None) -> Dict[str, Any]:
    """
    Fetches a real swap quote from Defuse 1-Click API.
    """
    t_in = token_in.upper()
    t_out = token_out.upper()
    
    asset_in = TOKEN_MAP.get(t_in)
    asset_out = TOKEN_MAP.get(t_out)
    
    if not asset_in or not asset_out:
        return {"error": f"Token pair {t_in}->{t_out} not supported"}

    decimals_in = DECIMALS_MAP.get(t_in, 24)
    amount_atomic = int(amount * (10 ** decimals_in))
    
    print(f"[TOOL] Fetching 1-Click quote for {amount} {t_in} -> {t_out} (Recipient: {recipient_id})")

    url = "https://1click.chaindefuser.com/v0/quote"
    
    # Use real recipient if available, otherwise fail or fallback (but fallback loses money)
    if not recipient_id:
        return {"error": "Wallet must be connected to fetch a quote (missing Account ID)"}
    
    recipient = recipient_id
    deadline = (datetime.datetime.utcnow() + datetime.timedelta(minutes=5)).isoformat() + "Z"

    payload = {
        "swapType": "EXACT_INPUT",
        "originAsset": asset_in,
        "destinationAsset": asset_out,
        "amount": str(amount_atomic),
        "depositType": "INTENTS",
        "refundType": "INTENTS",
        "recipient": recipient,
        "recipientType": "DESTINATION_CHAIN",  # Required field
        "refundTo": recipient,
        "slippageTolerance": 10,
        "dry": False,
        "deadline": deadline,
        "quoteWaitingTimeMs": 0
    }
    
    print(f"[TOOL] Request Payload: {json.dumps(payload)}")
    
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
        
        # Check for error in body
        if "message" in data:
             return {"error": data["message"]}
             
        quote = data.get("quote") or data
        if not quote.get("depositAddress"):
             return {"error": "No deposit address found in quote"}
             
        # Format output amount
        amount_out_atomic = int(quote["amountOut"])
        decimals_out = DECIMALS_MAP.get(t_out, 18)
        amount_out_fmt = amount_out_atomic / (10 ** decimals_out)
        
        return {
            "token_in": t_in,
            "token_out": t_out,
            "amount_in": amount,
            "amount_out": amount_out_fmt,
            "rate": amount_out_fmt / amount if amount > 0 else 0,
            "chain": chain_id,
            "deposit_address": quote["depositAddress"], # CRITICAL: The Solver ID
            "defuse_asset_in": asset_in,
            "defuse_asset_out": asset_out
        }
        
    except Exception as e:
        print(f"[TOOL] API Error: {e}")
        return {"error": str(e)}

def create_near_intent_transaction(token_in: str, token_out: str, amount: float, min_amount_out: float, deposit_address: str = "solver-relay.near") -> List[Dict[str, Any]]:
    """
    Constructs the transaction payload for the NEAR Intents contract using the specific solver address.
    """
    print(f"[TOOL] Creating transaction: {amount} {token_in} -> {token_out} via {deposit_address}")
    
    contract_id = "intents.near" 
    transactions = []
    
    decimals_in = DECIMALS_MAP.get(token_in.upper(), 24)
    amount_int = int(amount * (10 ** decimals_in))

    if token_in.lower() == "near":
        # TX 1: Deposit to Wrap NEAR -> Intents
        transactions.append({
            "receiverId": "wrap.near",
            "actions": [
                 # 1. Storage Deposit (Optional but safe)
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "storage_deposit",
                        "args": {
                            "account_id": contract_id,
                            "registration_only": True
                        },
                        "gas": "30000000000000",
                        "deposit": "1250000000000000000000" # 0.00125 NEAR
                    }
                },
                # 2. Wrap NEAR
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "near_deposit",
                        "args": {},
                        "gas": "10000000000000",
                        "deposit": str(amount_int)
                    }
                },
                # 3. Transfer to Intents (Deposit)
                {
                    "type": "FunctionCall",
                    "params": {
                        "methodName": "ft_transfer_call",
                        "args": {
                            "receiver_id": contract_id,
                            "amount": str(amount_int),
                            "msg": "" 
                        },
                        "gas": "50000000000000",
                        "deposit": "1"
                    }
                }
            ]
        })
    else:
        # NEP-141 Deposit
        t_in_contract = TOKEN_MAP.get(token_in.upper(), "").replace("nep141:", "")
        if not t_in_contract:
             # Fallback logic or error
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
                            "msg": ""
                        },
                        "gas": "50000000000000",
                        "deposit": "1"
                    }
                }
             ]
        })

    # TX 2: Swap (mt_transfer) to VALID SOLVER
    transactions.append({
        "receiverId": contract_id,
        "actions": [
            {
                "type": "FunctionCall",
                "params": {
                    "methodName": "mt_transfer",
                    "args": {
                        "token_id": TOKEN_MAP.get(token_in.upper(), f"nep141:{token_in.lower()}.near"),
                        "receiver_id": deposit_address, # The real solver from the quote
                        "amount": str(amount_int),
                        "msg": ""
                    },
                    "gas": "30000000000000",
                    "deposit": "1", 
                }
            }
        ]
    })
    
    return transactions
