"""
LangChain tools for the Neptune AI agent.
Each tool is decorated with @tool and can be called by the LLM when needed.
Supports multi-chain wallet connections via HOT Kit.
"""
import asyncio
from typing import Optional, Dict, Any
from langchain_core.tools import tool

from tools import get_swap_quote as _get_swap_quote, get_available_tokens, create_near_intent_transaction
from validators import fuzzy_match_token, validate_near_address, validate_evm_address, validate_address_for_chain, get_chain_address_format
from knowledge_base import (
    get_available_tokens_from_api, 
    get_token_symbols_list, 
    format_token_list_for_display,
    format_tokens_with_chain_prefix,
    get_token_by_symbol
)


@tool
async def get_available_tokens_tool() -> str:
    """
    Get the FULL list of ALL available tokens that can be swapped.
    Only use this when user wants to see ALL tokens, not a specific one.
    DO NOT use this when user asks about a specific token like ETH or AURORA - use get_token_chains_tool instead.
    
    Returns: A formatted string with [CHAIN] TOKEN format.
    """
    try:
        tokens = await get_available_tokens_from_api()
        # Use chain prefix format
        return format_tokens_with_chain_prefix(tokens, limit=80)
    except Exception as e:
        return f"⚠️ Can't get supported tokens for now: {str(e)}"


@tool
def get_token_chains_tool(token_symbol: str) -> str:
    """
    Get all chains and networks where a SPECIFIC token is available.
    ALWAYS use this instead of get_available_tokens_tool when user asks about a specific token.
    Use for queries like: "options for ETH", "where is AURORA available", "chains for USDC", "any ETH options?"
    
    Args:
        token_symbol: The token symbol to query (e.g., "ETH", "USDC", "AURORA")
    
    Returns: List of chains where the token is available
    """
    from knowledge_base import _token_cache
    
    tokens = _token_cache if _token_cache else []
    if not tokens:
        return "⚠️ Token data not loaded yet. Please try again."
    
    symbol_upper = token_symbol.upper().strip()
    
    # Find all entries for this token
    matching_tokens = [t for t in tokens if t["symbol"].upper() == symbol_upper]
    
    if not matching_tokens:
        return f"❌ Token '{token_symbol}' not found. Use get_available_tokens_tool to see all available tokens."
    
    # Group by chain
    chains = []
    for t in matching_tokens:
        chain = t.get("blockchain", "near").upper()
        chains.append(f"• [{chain}] {symbol_upper}")
    
    result = f"**{symbol_upper} is available on {len(chains)} chain(s):**\n"
    result += "\n".join(chains)
    result += f"\n\n**Note:** You can swap FROM any chain where you have a connected wallet."
    
    return result


@tool
async def validate_token_names_tool(token_in: str, token_out: str) -> str:
    """
    Validate token names and check for typos or misspellings.
    Use this when you suspect user might have misspelled a token name.
    
    Args:
        token_in: The input token symbol (what user is swapping from)
        token_out: The output token symbol (what user is swapping to)
    
    Returns: Validation result with suggestions if needed
    """
    try:
        tokens = await get_available_tokens_from_api()
        available = get_token_symbols_list(tokens)
        
        match_in = fuzzy_match_token(token_in, available)
        match_out = fuzzy_match_token(token_out, available)
        
        if match_in['exact_match'] and match_out['exact_match']:
            return f"✅ Both tokens are valid: {token_in.upper()} and {token_out.upper()}"
        
        issues = []
        if not match_in['exact_match']:
            if match_in['suggested_token']:
                issues.append(f"'{token_in}' → Did you mean '{match_in['suggested_token']}'?")
            else:
                issues.append(f"'{token_in}' is not recognized")
        
        if not match_out['exact_match']:
            if match_out['suggested_token']:
                issues.append(f"'{token_out}' → Did you mean '{match_out['suggested_token']}'?")
            else:
                issues.append(f"'{token_out}' is not recognized")
        
        return "⚠️ Token validation issues:\n" + "\n".join(issues)
    except Exception as e:
        return f"⚠️ Can't validate tokens right now: {str(e)}"


@tool
def get_swap_quote_tool(
    token_in: str, 
    token_out: str, 
    amount: float, 
    account_id: str, 
    connected_chains: str = "",
    wallet_addresses: str = "",
    destination_address: Optional[str] = None, 
    destination_chain: Optional[str] = None,
    source_chain: Optional[str] = None
) -> str:
    """
    Get a real-time swap quote for exchanging tokens via NEAR Intents.
    
    IMPORTANT SAFETY CHECKS (enforced by this tool):
    IMPORTANT SAFETY CHECKS (enforced by this tool):
    - Source token's chain must match a chain where the user has a connected wallet
    - Destination wallet connection is OPTIONAL if `destination_address` is provided
    - Cross-chain swaps auto-fill destination address from connected wallets when possible
    - Address format is validated for the destination chain
    
    Args:
        token_in: Symbol of token to swap from (e.g., "NEAR", "ETH")
        token_out: Symbol of token to swap to (e.g., "ETH", "USDC")
        amount: Amount of token_in to swap
        account_id: User's primary wallet address (required)
        connected_chains: Comma-separated list of chains user has wallets on (e.g., "near,eth,solana")
        wallet_addresses: Comma-separated chain:address pairs (e.g., "near:alice.near,eth:0x123")
        destination_address: Explicit destination address — use when user specifies a recipient different from their own wallet
        destination_chain: Specify which chain for the DESTINATION token (e.g., "near", "base", "arb")
        source_chain: Specify which chain the SOURCE token is on (e.g., "base" for USDC on Base, "near" for NEAR)
    
    Returns: Quote information or safety error with guidance
    """
    if not account_id or account_id == "Not connected":
        return "⚠️ **Wallet Not Connected**\n\nPlease connect your wallet using the Connect button first. You can connect wallets from any chain — NEAR, Ethereum, Solana, Tron, and more."
    
    # DEBUG: Log parameters
    print(f"[TOOL] get_swap_quote_tool called:")
    print(f"[TOOL]   token_in={token_in}, token_out={token_out}, amount={amount}")
    print(f"[TOOL]   source_chain={source_chain}, destination_chain={destination_chain}")
    print(f"[TOOL]   destination_address={destination_address}")
    
    # Parse connected chains
    user_chains = [c.strip().lower() for c in connected_chains.split(",") if c.strip()] if connected_chains else ["near"]
    
    # Parse wallet addresses into a dict
    addr_map = {}
    if wallet_addresses:
        for pair in wallet_addresses.split(","):
            if ":" in pair:
                chain_key, addr = pair.split(":", 1)
                addr_map[chain_key.strip().lower()] = addr.strip()
    
    # Get token cache
    from knowledge_base import _token_cache, get_token_by_symbol
    tokens = _token_cache if _token_cache else []
    
    # Expand EVM chains: if user has `eth` connected, they have ALL EVM chains
    from tools import is_evm_chain, EVM_CHAIN_IDS
    has_evm = any(c in ["eth", "ethereum"] or is_evm_chain(c) for c in user_chains)
    if has_evm:
        evm_chain_names = set(EVM_CHAIN_IDS.keys())
        user_chains_expanded = list(set(user_chains) | evm_chain_names)
    else:
        user_chains_expanded = user_chains
    
    # ── SAFETY CHECK 1: Validate source token exists ──
    # If source_chain is specified by the LLM, use it to find the correct token variant
    if source_chain:
        source_chain = source_chain.strip().lower()
        source_token = get_token_by_symbol(token_in.upper(), tokens, chain=source_chain)
        if not source_token:
            # Try without chain filter as fallback
            source_token = get_token_by_symbol(token_in.upper(), tokens, chain=None)
    else:
        source_token = get_token_by_symbol(token_in.upper(), tokens, chain=None)
    
    if not source_token:
        return f"❌ Token '{token_in}' not found. Use get_available_tokens_tool to see available tokens."
    
    # Determine source chain: prefer explicit source_chain, then token metadata
    if source_chain:
        effective_source_chain = source_chain
    else:
        effective_source_chain = source_token.get("blockchain", "near").lower()
    
    # Verify user has a wallet on the source chain
    source_on_connected = effective_source_chain in user_chains_expanded
    
    if not source_on_connected:
        all_chains_for_token = list(set(
            t.get("blockchain", "near").upper() 
            for t in tokens 
            if t["symbol"].upper() == token_in.upper()
        ))
        return (
            f"❌ **Cannot Swap — Wallet Not Connected**\n\n"
            f"**{token_in.upper()}** exists on: {', '.join(all_chains_for_token)}\n"
            f"**Your connected wallets**: {', '.join(c.upper() for c in user_chains)}\n\n"
            f"You need a connected wallet on one of those chains to swap {token_in.upper()}.\n"
            f"Please connect the appropriate wallet via HOT Kit."
        )
    
    # Re-lookup token with the effective source chain for correct defuseAssetId
    source_token = get_token_by_symbol(token_in.upper(), tokens, chain=effective_source_chain) or source_token
    
    # ── SAFETY CHECK 3: Resolve destination ──
    dest_token = get_token_by_symbol(token_out.upper(), tokens, chain=destination_chain)
    if not dest_token:
        # Fallback if specific chain token not found
        dest_token = get_token_by_symbol(token_out.upper(), tokens)
    
    if not dest_token:
        return f"❌ Token '{token_out}' not found. Use get_available_tokens_tool to see available tokens."
    
    dest_chain = dest_token.get("blockchain", "near").lower()
    
    # ── SAFETY CHECK 4: Validate recipient format matching destination chain ──
    # If using an explicit destination address, ensure it matches the token's chain
    if destination_address:
        is_evm_addr = destination_address.startswith("0x") and len(destination_address) == 42
        is_evm_token = is_evm_chain(dest_chain)
        
        if is_evm_addr and not is_evm_token:
            # Mismatch: User gave 0x address but we found a NEAR token (likely default behavior)
            # We must fail and ask for the chain
            return (
                f"⚠️ **Chain Not Specified**\n\n"
                f"You provided an Ethereum-style address (`{destination_address}`) but the system selected **{token_out.upper()} on {dest_chain.upper()}**.\n"
                f"This mismatch usually happens if you didn't specify the destination chain.\n\n"
                f"Please try again specifying the chain, e.g.:\n"
                f"- \"swap {token_in} to {token_out} **on Base**\"\n"
                f"- \"swap {token_in} to {token_out} **on Arbitrum**\""
            )
            
    # Determine if cross-chain
    is_cross_chain = dest_chain != effective_source_chain
    
    # ── Resolve recipient address ──
    # IMPORTANT: If user provides an explicit destination_address, ALWAYS use it
    # This handles "send USDC to frigid_degen5.user.intear.near" even on same chain
    if destination_address:
        # User provided explicit address — validate format
        if is_cross_chain and not validate_address_for_chain(destination_address, dest_chain):
            expected_format = get_chain_address_format(dest_chain)
            return (
                f"❌ **Invalid Address Format**\n\n"
                f"The address `{destination_address}` doesn't match the expected format for **{dest_chain.upper()}**.\n"
                f"Expected: {expected_format}\n\n"
                f"Please provide a valid {dest_chain.upper()} address."
            )
        recipient = destination_address
    elif is_cross_chain:
        # Cross-chain, no explicit address — try to auto-fill from connected wallets
        # For EVM dest chains, use the 'eth' address
        dest_addr_key = "eth" if is_evm_chain(dest_chain) else dest_chain
        if dest_addr_key in addr_map:
            recipient = addr_map[dest_addr_key]
        elif dest_chain in addr_map:
            recipient = addr_map[dest_chain]
        else:
            expected_format = get_chain_address_format(dest_chain)
            return (
                f"⚠️ **Cross-Chain Swap — Address Needed**\n\n"
                f"You want to receive **{token_out.upper()}** on **{dest_chain.upper()}** chain.\n"
                f"You don't have a {dest_chain.upper()} wallet connected.\n\n"
                f"Please provide your **{dest_chain.upper()} wallet address** ({expected_format})."
            )
    else:
        # Same chain, no explicit address — use the connected wallet for that chain
        # For NEAR source, use 'near' key; for EVM source, use 'eth' key
        if effective_source_chain == "near":
            recipient = addr_map.get("near", account_id)
        elif is_evm_chain(effective_source_chain):
            recipient = addr_map.get("eth", account_id)
        else:
            recipient = addr_map.get(effective_source_chain, account_id)
    
    # ── Get the actual quote ──
    # Determine refund address: for EVM source, use eth address; for NEAR, use NEAR address
    if is_evm_chain(effective_source_chain):
        refund_addr = addr_map.get("eth", account_id)
    elif effective_source_chain == "near":
        refund_addr = addr_map.get("near", account_id)
    else:
        refund_addr = addr_map.get(effective_source_chain, account_id)
    
    quote = _get_swap_quote(
        token_in.upper(), 
        token_out.upper(), 
        amount, 
        chain_id=effective_source_chain,  # Determines depositType (ORIGIN_CHAIN for EVM, INTENTS for NEAR)
        recipient_id=recipient,
        is_cross_chain=is_cross_chain,
        refund_address=refund_addr
    )
    
    if "error" in quote:
        return f"❌ Error getting quote: {quote['error']}"
    
    # Store quote globally for confirmation
    global _last_quote
    _last_quote = {
        "token_in": token_in.upper(),
        "token_out": token_out.upper(),
        "amount": amount,
        "amount_out": quote['amount_out'],
        "min_amount_out": quote['amount_out'] * 0.99,  # 1% slippage
        "deposit_address": quote['deposit_address'],
        "recipient": recipient,
        "is_cross_chain": is_cross_chain,
        "dest_chain": dest_chain,
        "source_chain": effective_source_chain,
        "account_id": account_id  # Needed for tx builder ft_transfer_call msg
    }
    
    # Format response
    dest_info = f" on **{dest_chain.upper()}**" if is_cross_chain else ""
    auto_filled = not destination_address and is_cross_chain and (dest_chain in addr_map or ("eth" if is_evm_chain(dest_chain) else "") in addr_map)
    addr_note = f"\n💡 _Using your connected {dest_chain.upper()} address. Reply 'use [address]' to change._" if auto_filled else ""
    
    return (
        f"✅ **Swap Quote**\n"
        f"**Swap**: {amount} [{effective_source_chain.upper()}] {token_in.upper()} → ~{quote['amount_out']:.6f} [{dest_chain.upper()}] {token_out.upper()}\n"
        f"**Rate**: 1 {token_in.upper()} = {quote['rate']:.6f} {token_out.upper()}\n"
        f"**Recipient**: `{recipient}`{dest_info}\n"
        f"{addr_note}\n\n"
        f"[QUOTE_ID: {id(_last_quote)}]\n"
        f"Present this quote to the user. Ask them to reply 'yes' or 'confirm' to proceed, or 'no' to cancel."
    )



# Global storage for last quote
_last_quote = None


@tool
def confirm_swap_tool() -> str:
    """
    Confirm and prepare the swap transaction after user approves the quote.
    Call this ONLY when user explicitly confirms (says yes, okay, proceed, go ahead, etc).
    This uses the most recent quote that was provided to the user.
    
    Returns: Status message about transaction preparation
    """
    global _last_quote
    
    if not _last_quote:
        return "❌ No recent quote found. Please get a quote first by asking for a swap."
    
    try:
        from tools import create_near_intent_transaction
        
        tx_payload = create_near_intent_transaction(
            _last_quote["token_in"],
            _last_quote["token_out"],
            _last_quote["amount"],
            _last_quote["min_amount_out"],
            _last_quote["deposit_address"],
            account_id=_last_quote.get("account_id", "")
        )
        
        # Return special marker that agents.py will detect
        return f"[TRANSACTION_READY] Transaction prepared successfully. User needs to sign in their wallet."
        
    except Exception as e:
        return f"❌ Error preparing transaction: {str(e)}"



@tool
def hot_pay_coming_soon_tool(query: str) -> str:
    """
    Handle requests related to HOT Pay features (creating links, checking payments, merchant tools).
    Use this when user asks: "create payment link", "check my payments", "track invoice", "i want to sell something".
    
    Args:
        query: The user's request (e.g. "create link for 5 usdc")
    
    Returns: A standard "Feature In Progress" message.
    """
    return (
        "🚧 **Feature In Progress**\n\n"
        "HOT Pay integration (Payment Links & Merchant Tracking) is currently being developed.\n"
        "I know about these features, but I can't execute them just yet!\n\n"
        "Current capabilities:\n"
        "✅ Token Swaps\n"
        "✅ Balance Checks\n"
        "✅ Cross-Chain Bridge\n"
        "❌ Merchant Payments (Coming Soon)"
    )

# Tool metadata for agent configuration
TOOL_LIST = [
    get_available_tokens_tool,
    get_token_chains_tool,
    validate_token_names_tool,
    get_swap_quote_tool,
    confirm_swap_tool,
    # HOT Pay placeholder
    hot_pay_coming_soon_tool,
]

