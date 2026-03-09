"""
Flow blockchain tools   token swaps via PunchSwap (Flow EVM DEX) and NFT transfers via Cadence.
All swap logic uses Flow EVM (chainId 747, Uniswap V2/V3 fork).
"""
from typing import Dict, List, Any, Optional
from decimal import Decimal
import httpx
import json

#  
# CONSTANTS
#  

FLOW_EVM_CHAIN_ID = 747
FLOW_EVM_RPC = "https://mainnet.evm.nodes.onflow.org"
FLOW_ACCESS_NODE = "https://rest-mainnet.onflow.org"

# PunchSwap (Uniswap V2 fork on Flow EVM) - KittyPunch DEX
PUNCHSWAP_ROUTER = "0x..."  # TODO: Replace with actual PunchSwap V2 Router address
PUNCHSWAP_FACTORY = "0x..."  # TODO: Replace with actual PunchSwap V2 Factory address

# Well-known Flow EVM token addresses
FLOW_EVM_TOKENS = {
    "WFLOW": {"address": "0xd3bF53DAC106A0290B0483EcBC89d40FcC961f3e", "decimals": 18, "name": "Wrapped FLOW"},
    # Add more tokens as we discover them from PunchSwap factory
}

# Cache for Flow token list
_flow_token_cache: Optional[List[Dict]] = None


#  
# TOKEN DISCOVERY
#  

async def flow_get_available_tokens() -> List[Dict]:
    """
    Fetch available tokens on Flow EVM (from PunchSwap or known list).
    Returns list of token dicts with symbol, name, decimals, address.
    """
    global _flow_token_cache
    if _flow_token_cache:
        return _flow_token_cache

    # Start with known tokens
    tokens = []
    for symbol, data in FLOW_EVM_TOKENS.items():
        tokens.append({
            "symbol": symbol,
            "name": data["name"],
            "decimals": data["decimals"],
            "address": data["address"],
            "blockchain": "flow"
        })

    # TODO: Query PunchSwap factory for all pairs to discover more tokens
    # For now, use the known list + any tokens we find

    _flow_token_cache = tokens
    print(f"[FLOW] Loaded {len(tokens)} Flow EVM tokens")
    return tokens


#  
# TOKEN SWAPS (via PunchSwap / Flow EVM)
#  

async def flow_get_swap_quote(
    token_in: str,
    token_out: str,
    amount: float,
    account_address: str = ""
) -> Dict[str, Any]:
    """
    Get a swap quote from PunchSwap (Uniswap V2 router on Flow EVM).
    Uses eth_call to router.getAmountsOut() for price estimation.
    """
    print(f"[FLOW] Getting swap quote: {amount} {token_in}   {token_out}")

    tokens = await flow_get_available_tokens()

    # Find token addresses
    token_in_data = next((t for t in tokens if t["symbol"].upper() == token_in.upper()), None)
    token_out_data = next((t for t in tokens if t["symbol"].upper() == token_out.upper()), None)

    if not token_in_data:
        return {"error": f"Token {token_in} not found on Flow. Use flow_get_available_tokens to see available tokens."}
    if not token_out_data:
        return {"error": f"Token {token_out} not found on Flow. Use flow_get_available_tokens to see available tokens."}

    decimals_in = token_in_data["decimals"]
    amount_wei = int(Decimal(str(amount)) * Decimal(10 ** decimals_in))

    # Build getAmountsOut call to PunchSwap router
    # Function selector: getAmountsOut(uint256,address[]) = 0xd06ca61f
    try:
        from web3 import Web3
        w3 = Web3(Web3.HTTPProvider(FLOW_EVM_RPC))

        router_abi = [{
            "inputs": [
                {"name": "amountIn", "type": "uint256"},
                {"name": "path", "type": "address[]"}
            ],
            "name": "getAmountsOut",
            "outputs": [{"name": "amounts", "type": "uint256[]"}],
            "stateMutability": "view",
            "type": "function"
        }]

        router = w3.eth.contract(address=Web3.to_checksum_address(PUNCHSWAP_ROUTER), abi=router_abi)
        path = [
            Web3.to_checksum_address(token_in_data["address"]),
            Web3.to_checksum_address(token_out_data["address"])
        ]

        amounts = router.functions.getAmountsOut(amount_wei, path).call()
        amount_out_wei = amounts[-1]
        decimals_out = token_out_data["decimals"]
        amount_out = float(Decimal(amount_out_wei) / Decimal(10 ** decimals_out))

        rate = amount_out / amount if amount > 0 else 0

        return {
            "token_in": token_in.upper(),
            "token_out": token_out.upper(),
            "amount_in": amount,
            "amount_out": amount_out,
            "rate": rate,
            "path": [t["address"] for t in [token_in_data, token_out_data]],
            "router": PUNCHSWAP_ROUTER,
            "chain_id": FLOW_EVM_CHAIN_ID,
            "account_address": account_address
        }
    except Exception as e:
        print(f"[FLOW] Error getting swap quote: {e}")
        return {"error": f"Failed to get swap quote: {str(e)}"}


def flow_build_swap_transaction(
    quote: Dict[str, Any],
    from_address: str,
    slippage: float = 0.01
) -> Dict[str, Any]:
    """
    Build a PunchSwap swap transaction (Uniswap V2 swapExactTokensForTokens).
    Returns EVM transaction payload for signing.
    """
    from web3 import Web3
    import time

    amount_in = int(Decimal(str(quote["amount_in"])) * Decimal(10 ** 18))  # Assume 18 decimals
    min_amount_out = int(Decimal(str(quote["amount_out"])) * Decimal(10 ** 18) * Decimal(1 - slippage))
    deadline = int(time.time()) + 1200  # 20 minutes

    # Uniswap V2 swapExactTokensForTokens ABI
    router_abi = [{
        "inputs": [
            {"name": "amountIn", "type": "uint256"},
            {"name": "amountOutMin", "type": "uint256"},
            {"name": "path", "type": "address[]"},
            {"name": "to", "type": "address"},
            {"name": "deadline", "type": "uint256"}
        ],
        "name": "swapExactTokensForTokens",
        "outputs": [{"name": "amounts", "type": "uint256[]"}],
        "stateMutability": "nonpayable",
        "type": "function"
    }]

    w3 = Web3()
    router = w3.eth.contract(abi=router_abi)

    path = [Web3.to_checksum_address(addr) for addr in quote["path"]]
    data = router.encode_abi("swapExactTokensForTokens", args=[
        amount_in,
        min_amount_out,
        path,
        Web3.to_checksum_address(from_address),
        deadline
    ])

    tx_payload = {
        "chainId": FLOW_EVM_CHAIN_ID,
        "to": Web3.to_checksum_address(PUNCHSWAP_ROUTER),
        "from": from_address,
        "value": "0",
        "data": data
    }

    print(f"[FLOW] Built swap tx: {quote['amount_in']} {quote['token_in']}   {quote['token_out']}")
    return tx_payload


#  
# NFT OPERATIONS (via Cadence)
#  

async def flow_get_user_nfts(account_address: str) -> List[Dict]:
    """
    Query a Flow account for its NFTs using the Flow REST API.
    Returns list of NFTs with id, name, collection, image.
    """
    print(f"[FLOW] Fetching NFTs for {account_address}")

    # Use Alchemy Flow API or direct Cadence script execution
    # For now, use the Flow REST API to query account storage
    try:
        async with httpx.AsyncClient() as client:
            # Query account storage paths for NFT collections
            response = await client.get(
                f"{FLOW_ACCESS_NODE}/v1/accounts/{account_address}",
                timeout=10.0
            )
            response.raise_for_status()
            account_data = response.json()

        # Parse account data to find NFT collections
        nfts = []
        # NOTE: Full implementation requires executing a Cadence script
        # that iterates over account storage and finds NonFungibleToken.Collection
        # This is a simplified version
        print(f"[FLOW] Account data retrieved for {account_address}")

        # TODO: Execute Cadence script to enumerate NFTs
        # Script would borrow each collection and list NFT IDs + metadata
        
        return nfts

    except Exception as e:
        print(f"[FLOW] Error fetching NFTs: {e}")
        return []


def flow_build_nft_transfer_transaction(
    nft_id: int,
    collection_path: str,
    collection_public_path: str,
    to_address: str
) -> Dict[str, Any]:
    """
    Build a Cadence transaction to transfer an NFT.
    Returns a payload for FCL signing.
    """
    # Standard NonFungibleToken transfer Cadence transaction
    cadence_script = f"""
import NonFungibleToken from 0x1d7e57aa55817448

transaction(recipient: Address, withdrawID: UInt64) {{
    let senderCollection: auth(NonFungibleToken.Withdraw) &{{NonFungibleToken.Collection}}
    let recipientCollection: &{{NonFungibleToken.Collection}}

    prepare(signer: auth(BorrowValue) &Account) {{
        self.senderCollection = signer.storage
            .borrow<auth(NonFungibleToken.Withdraw) &{{NonFungibleToken.Collection}}>(
                from: /storage/{collection_path}
            ) ?? panic("Could not borrow sender's NFT collection")

        self.recipientCollection = getAccount(recipient)
            .capabilities.get<&{{NonFungibleToken.Collection}}>(/public/{collection_public_path})
            .borrow()
            ?? panic("Could not borrow recipient's NFT collection")
    }}

    execute {{
        let nft <- self.senderCollection.withdraw(withdrawID: withdrawID)
        self.recipientCollection.deposit(token: <-nft)
    }}
}}
"""

    tx_payload = {
        "type": "cadence_transaction",
        "cadence": cadence_script,
        "args": [
            {"type": "Address", "value": to_address},
            {"type": "UInt64", "value": str(nft_id)}
        ],
        "chain": "flow"
    }

    print(f"[FLOW] Built NFT transfer tx: NFT #{nft_id} from {collection_path}   {to_address}")
    return tx_payload


#  
# FLOW ADDRESS VALIDATION
#  

def is_valid_flow_address(address: str) -> bool:
    """
    Validate a Flow Cadence address (0x + 16 hex chars).
    """
    import re
    if not address or not isinstance(address, str):
        return False
    return bool(re.match(r'^0x[0-9a-fA-F]{16}$', address))


def is_valid_flow_evm_address(address: str) -> bool:
    """
    Validate a Flow EVM address (0x + 40 hex chars)   standard EVM format.
    """
    import re
    if not address or not isinstance(address, str):
        return False
    return bool(re.match(r'^0x[0-9a-fA-F]{40}$', address))
