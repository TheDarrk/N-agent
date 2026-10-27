"""
Functions to fetch and manage token information from NEAR Intents API.
LLM will handle answering questions naturally - no hardcoded FAQs.
"""
import os
import json
from typing import Dict, List, Optional
import httpx
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime

# Cache for token list & live prices
_token_cache: Optional[List[Dict]] = None
_cache_timestamp: Optional[datetime] = None
_token_prices: Dict[str, float] = {}
_server_time_offset_seconds: float = 0.0
CACHE_DURATION = timedelta(hours=6)  # Refresh every 6 hours


def get_1click_token_price(symbol: str) -> float:
    """Instant 0ms lookup for live spot price fetched from 1-Click API."""
    return _token_prices.get(symbol.upper(), _token_prices.get(symbol.lower(), 0.0))


def get_1click_server_now() -> datetime:
    """Returns estimated current UTC time synchronized with 1-Click solver server."""
    global _server_time_offset_seconds
    if _server_time_offset_seconds == 0.0:
        try:
            with httpx.Client(timeout=3.0) as client:
                res = client.head("https://1click.chaindefuser.com/v0/tokens")
                date_hdr = res.headers.get("date")
                if date_hdr:
                    server_dt = parsedate_to_datetime(date_hdr)
                    local_now = datetime.now(timezone.utc)
                    if server_dt.tzinfo is None:
                        server_dt = server_dt.replace(tzinfo=timezone.utc)
                    _server_time_offset_seconds = (server_dt - local_now).total_seconds()
        except Exception:
            pass
    local_now = datetime.now(timezone.utc)
    return local_now + timedelta(seconds=_server_time_offset_seconds)


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
        global _server_time_offset_seconds
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://1click.chaindefuser.com/v0/tokens",
                timeout=10.0
            )
            response.raise_for_status()
            data = response.json()
            
            # Synchronize server clock offset to prevent deadline invalidation errors
            server_date_str = response.headers.get("date")
            if server_date_str:
                server_dt = parsedate_to_datetime(server_date_str)
                local_now = datetime.now(timezone.utc)
                if server_dt.tzinfo is None:
                    server_dt = server_dt.replace(tzinfo=timezone.utc)
                _server_time_offset_seconds = (server_dt - local_now).total_seconds()
        
        if not isinstance(data, list):
            print("[KNOWLEDGE] Unexpected API response format")
            raise ValueError("Can't get supported tokens - API returned unexpected format")
        
        def _sanitize(text: str) -> str:
            if not text: return ""
            import re
            return re.sub(r'[^\x00-\x7F]+', ' ', str(text)).strip()

        # Extract relevant token info
        tokens = []
        for item in data:
            if item.get("assetId") and item.get("symbol"):
                # Normalize NEAR/WNEAR
                symbol = _sanitize(item["symbol"])
                if symbol.upper() in ["WNEAR", "NEAR"]:
                    symbol = "NEAR"
                
                price_val = float(item.get("price", 0.0) or 0.0)
                if price_val > 0:
                    _token_prices[symbol.upper()] = price_val
                    _token_prices[symbol.lower()] = price_val

                tokens.append({
                    "symbol": symbol,
                    "name": _sanitize(item.get("name", symbol)),
                    "decimals": item.get("decimals", 18),
                    "defuseAssetId": item["assetId"],
                    "contractAddress": item.get("contractAddress", ""),
                    "blockchain": item.get("blockchain", "near"),
                    "price": price_val
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
        
        # Update in-memory and persistent disk cache
        _token_cache = sorted_tokens
        _cache_timestamp = datetime.now()
        
        try:
            cache_file = os.path.join(os.path.dirname(__file__), "knowledge_base", "tokens_cache.json")
            os.makedirs(os.path.dirname(cache_file), exist_ok=True)
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(sorted_tokens, f)
        except Exception:
            pass

        print(f"[KNOWLEDGE] Loaded {len(sorted_tokens)} tokens from API (all chains)")
        return sorted_tokens
        
    except Exception as e:
        print(f"[KNOWLEDGE] Error fetching tokens from API: {e}")
        # 1. Fall back to in-memory cache
        if _token_cache:
            print(f"[KNOWLEDGE] Using in-memory cache as fallback")
            return _token_cache
        # 2. Fall back to persistent disk cache
        cache_file = os.path.join(os.path.dirname(__file__), "knowledge_base", "tokens_cache.json")
        if os.path.isfile(cache_file):
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    disk_tokens = json.load(f)
                if disk_tokens:
                    print(f"[KNOWLEDGE] Loaded {len(disk_tokens)} tokens from persistent disk cache fallback.")
                    _token_cache = disk_tokens
                    _cache_timestamp = datetime.now()
                    return disk_tokens
            except Exception:
                pass
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
    If chain is specified, prefer exact match on that chain; if not found on that chain,
    fall back to any chain variation or NEAR/Aurora NEP-141 intent representation.
    """
    symbol_upper = symbol.upper()
    
    # 1. If chain specified, try exact match first
    if chain:
        chain_lower = chain.lower()
        for token in tokens:
            if token["symbol"].upper() == symbol_upper and token.get("blockchain", "near").lower() == chain_lower:
                return token
    
    # 2. Prefer NEAR/Aurora chain match
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
            lines.append(f"    {token['symbol']} - {token['name']}")
    
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
        lines.append(f"  [{chain}] {symbol}")
    
    if len(tokens) > limit:
        lines.append(f"\n...and {len(tokens) - limit} more tokens")
    
    return "\n".join(lines)

