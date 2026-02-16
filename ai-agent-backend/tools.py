from typing import Dict, Any, Optional, List
import httpx
import json
import datetime
import asyncio
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
    response.raise_for_status()
    return response

def get_swap_quote(
    token_in: str, 
    token_out: str, 
    amount: float, 
    chain_id: str = "near", 
    recipient_id: str = None,
    is_cross_chain: bool = False,
    refund_address: str = None
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
    
    token_in_data = get_token_by_symbol(t_in, tokens)
    token_out_data = get_token_by_symbol(t_out, tokens)
    
    if not token_in_data:
        return {"error": f"Token {t_in} not found in supported list"}
    if not token_out_data:
        return {"error": f"Token {t_out} not found in supported list"}
        
    asset_in = token_in_data.get("defuseAssetId")
    asset_out = token_out_data.get("defuseAssetId")
    
    decimals_in = token_in_data.get("decimals", 24)
    amount_atomic = int(amount * (10 ** decimals_in))
    
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
    
    deadline = (datetime.datetime.utcnow() + datetime.timedelta(minutes=5)).isoformat() + "Z"

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
        recipient = refund_to  # NEAR account for same-chain

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
    amount_int = int(amount * (10 ** decimals_in))

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


def create_evm_deposit_transaction(
    token_in: str,
    amount: float,
    deposit_address: str,
    source_chain: str,
    from_address: str
) -> Dict[str, Any]:
    """
    Constructs the EVM transaction payload for depositing tokens to the 1-Click deposit address.
    
    For EVM-sourced swaps, the user sends a native ETH transfer (or ERC-20 transfer)
    to the deposit address provided by the 1-Click API quote.
    
    The frontend will use HOT Kit's EvmWallet.sendTransaction() which handles
    chain switching automatically.
    
    Args:
        token_in: Source token symbol
        amount: Amount of source token
        deposit_address: The deposit address from the 1-Click quote
        source_chain: Source chain name (e.g., "eth", "base", "arb")
        from_address: User's EVM wallet address
        
    Returns:
        Dict with EVM transaction params: { chainId, from, to, value }
    """
    chain_id = get_evm_chain_id(source_chain)
    if not chain_id:
        raise ValueError(f"Unknown EVM chain: {source_chain}")
    
    # Get token decimals
    from knowledge_base import _token_cache, get_token_by_symbol
    tokens = _token_cache if _token_cache else []
    token_data = get_token_by_symbol(token_in.upper(), tokens)
    decimals = token_data.get("decimals", 18) if token_data else 18
    
    amount_wei = int(amount * (10 ** decimals))
    
    # For native tokens (ETH on Ethereum, ETH on Base/Arb, BNB on BSC, etc.)
    # Just send value to the deposit address
    # For ERC-20 tokens, we'd need a contract call, but 1-Click handles native deposits
    
    tx_payload = {
        "chainId": chain_id,
        "from": from_address,
        "to": deposit_address,
        "value": str(amount_wei),  # String for BigInt safety
    }
    
    print(f"[TOOL] EVM Transaction payload:")
    print(f"[TOOL]   Chain: {source_chain} (ID: {chain_id})")
    print(f"[TOOL]   From: {from_address}")
    print(f"[TOOL]   To: {deposit_address}")
    print(f"[TOOL]   Value: {amount_wei} ({amount} {token_in})")
    
    return tx_payload
