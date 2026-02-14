"""
Functions to fetch and manage token information from NEAR Intents API.
LLM will handle answering questions naturally - no hardcoded FAQs.
"""
from typing import Dict, List, Optional
import httpx
from datetime import datetime, timedelta

# Cache for token list
_token_cache: Optional[List[Dict]] = None
_cache_timestamp: Optional[datetime] = None
CACHE_DURATION = timedelta(hours=6)  # Refresh every 6 hours


async def get_available_tokens_from_api() -> List[Dict]:
    """
    Fetch supported tokens from the 1-Click API.
    Returns list of token dictionaries with symbol, name, decimals, etc.
    Implements caching to avoid excessive API calls.
    
    Raises exception if API fails - no fallback tokens.
    """
    global _token_cache, _cache_timestamp
    
    # Check cache first
    if _token_cache and _cache_timestamp:
        if datetime.now() - _cache_timestamp < CACHE_DURATION:
            print(f"[KNOWLEDGE] Using cached token list ({len(_token_cache)} tokens)")
            return _token_cache
    
    try:
        print("[KNOWLEDGE] Fetching token list from 1-Click API...")
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://1click.chaindefuser.com/v0/tokens",
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
        
        if not isinstance(data, list):
            print("[KNOWLEDGE] Unexpected API response format")
            raise ValueError("Can't get supported tokens - API returned unexpected format")
        
        # Extract relevant token info
        tokens = []
        for item in data:
            if item.get("assetId") and item.get("symbol"):
                # Normalize NEAR/WNEAR
                symbol = item["symbol"]
                if symbol.upper() in ["WNEAR", "NEAR"]:
                    symbol = "NEAR"
                
                tokens.append({
                    "symbol": symbol,
                    "name": item.get("name", symbol),
                    "decimals": item.get("decimals", 18),
                    "defuseAssetId": item["assetId"],
                    "contractAddress": item.get("contractAddress", ""),
                    "blockchain": item.get("blockchain", "near")
                })
        
        if not tokens:
            raise ValueError("Can't get supported tokens - API returned empty list")
        
        # Sort: NEAR chain first, then alphabetically by chain
        def sort_key(t):
            chain = t.get("blockchain", "near").lower()
            # NEAR and Aurora first (priority 0), then others alphabetically
            if chain in ["near", "aurora"]:
                return (0, chain, t["symbol"].upper())
            return (1, chain, t["symbol"].upper())
        
        sorted_tokens = sorted(tokens, key=sort_key)
        
        # Update cache
        _token_cache = sorted_tokens
        _cache_timestamp = datetime.now()
        
        print(f"[KNOWLEDGE] Loaded {len(sorted_tokens)} tokens from API (all chains)")
        return sorted_tokens
        
    except httpx.HTTPError as e:
        print(f"[KNOWLEDGE] HTTP error fetching tokens from API: {e}")
        # If we have cache, return it even if expired
        if _token_cache:
            print(f"[KNOWLEDGE] Using expired cache as fallback")
            return _token_cache
        raise Exception("Can't get supported tokens for now - API unavailable")
    except Exception as e:
        print(f"[KNOWLEDGE] Error fetching tokens from API: {e}")
        # If we have cache, return it even if expired
        if _token_cache:
            print(f"[KNOWLEDGE] Using expired cache as fallback")
            return _token_cache
        raise Exception(f"Can't get supported tokens for now - {str(e)}")




def get_token_symbols_list(tokens: List[Dict]) -> List[str]:
    """Extract just the symbol names from token list"""
    return [t["symbol"] for t in tokens]


def get_token_symbols_with_chain(tokens: List[Dict]) -> List[str]:
    """Extract symbols with chain prefix: [CHAIN] SYMBOL"""
    return [f"[{t.get('blockchain', 'near').upper()}] {t['symbol']}" for t in tokens]


def get_token_by_symbol(symbol: str, tokens: List[Dict], chain: str = None) -> Optional[Dict]:
    """
    Find a token by its symbol (case-insensitive).
    If chain is specified, match both symbol and chain.
    If chain is None, prefer NEAR chain token.
    """
    symbol_upper = symbol.upper()
    
    # If chain specified, find exact match
    if chain:
        chain_lower = chain.lower()
        for token in tokens:
            if token["symbol"].upper() == symbol_upper and token.get("blockchain", "near").lower() == chain_lower:
                return token
        return None
    
    # No chain specified - prefer NEAR chain
    near_match = None
    first_match = None
    for token in tokens:
        if token["symbol"].upper() == symbol_upper:
            if first_match is None:
                first_match = token
            if token.get("blockchain", "near").lower() in ["near", "aurora"]:
                near_match = token
                break
    
    return near_match or first_match


def format_token_list_for_display(tokens: List[Dict]) -> str:
    """Format token list for displaying to user"""
    if not tokens:
        return "No tokens available at the moment."
    
    # Group by blockchain for better organization
    by_chain = {}
    for token in tokens:
        chain = token.get("blockchain", "unknown")
        if chain not in by_chain:
            by_chain[chain] = []
        by_chain[chain].append(token)
    
    lines = []
    for chain, chain_tokens in sorted(by_chain.items()):
        lines.append(f"\n**{chain.title()} Tokens:**")
        for token in sorted(chain_tokens[:20], key=lambda x: x["symbol"]):  # Limit to 20 per chain
            lines.append(f"  • {token['symbol']} - {token['name']}")
    
    return "\n".join(lines)


def format_tokens_with_chain_prefix(tokens: List[Dict], limit: int = 80) -> str:
    """
    Format tokens as [CHAIN] SYMBOL with NEAR chain first.
    This shows all chain variations of each token.
    """
    if not tokens:
        return "No tokens available."
    
    # Tokens are already sorted with NEAR first
    lines = ["**Available Tokens (with chain):**"]
    
    for token in tokens[:limit]:
        chain = token.get("blockchain", "near").upper()
        symbol = token["symbol"]
        lines.append(f"• [{chain}] {symbol}")
    
    if len(tokens) > limit:
        lines.append(f"\n...and {len(tokens) - limit} more tokens")
    
    return "\n".join(lines)

