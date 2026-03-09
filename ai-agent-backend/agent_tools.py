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
        return f"  Can't get supported tokens for now: {str(e)}"


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
        return "  Token data not loaded yet. Please try again."
    
    symbol_upper = token_symbol.upper().strip()
    
    # Find all entries for this token
    matching_tokens = [t for t in tokens if t["symbol"].upper() == symbol_upper]
    
    if not matching_tokens:
        return f"  Token '{token_symbol}' not found. Use get_available_tokens_tool to see all available tokens."
    
    # Group by chain
    chains = []
    for t in matching_tokens:
        chain = t.get("blockchain", "near").upper()
        chains.append(f"  [{chain}] {symbol_upper}")
    
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
            return f"  Both tokens are valid: {token_in.upper()} and {token_out.upper()}"
        
        issues = []
        if not match_in['exact_match']:
            if match_in['suggested_token']:
                issues.append(f"'{token_in}' -> Did you mean '{match_in['suggested_token']}'?")
            else:
                issues.append(f"'{token_in}' is not recognized")
        
        if not match_out['exact_match']:
            if match_out['suggested_token']:
                issues.append(f"'{token_out}' -> Did you mean '{match_out['suggested_token']}'?")
            else:
                issues.append(f"'{token_out}' is not recognized")
        
        return "  Token validation issues:\n" + "\n".join(issues)
    except Exception as e:
        return f"  Can't validate tokens right now: {str(e)}"


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
        destination_address: Explicit destination address   use when user specifies a recipient different from their own wallet
        destination_chain: Specify which chain for the DESTINATION token (e.g., "near", "base", "arb")
        source_chain: Specify which chain the SOURCE token is on (e.g., "base" for USDC on Base, "near" for NEAR)
    
    Returns: Quote information or safety error with guidance
    """
    if not account_id or account_id == "Not connected":
        return "  **Wallet Not Connected**\n\nPlease connect your wallet using the Connect button first. You can connect wallets from any chain   NEAR, Ethereum, Solana, Tron, and more."
    
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
    
    # -- SAFETY CHECK 1: Validate source token exists --
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
        return f"  Token '{token_in}' not found. Use get_available_tokens_tool to see available tokens."
    
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
            f"  **Cannot Swap   Wallet Not Connected**\n\n"
            f"**{token_in.upper()}** exists on: {', '.join(all_chains_for_token)}\n"
            f"**Your connected wallets**: {', '.join(c.upper() for c in user_chains)}\n\n"
            f"You need a connected wallet on one of those chains to swap {token_in.upper()}.\n"
            f"Please connect the appropriate wallet via HOT Kit."
        )
    
    # Re-lookup token with the effective source chain for correct defuseAssetId
    source_token = get_token_by_symbol(token_in.upper(), tokens, chain=effective_source_chain) or source_token
    
    # Determine/Validate Destination Chain
    dest_chain = "near"
    if destination_chain:
        dest_chain = destination_chain.strip().lower()

    # -- SAFETY CHECK 3: Resolve destination --
    # STRICT LOOKUP: If user specified a chain, we MUST find the token on that chain.
    # Do NOT fallback to default (which finds NEAR token) if explicit chain is requested.
    lookup_chain = dest_chain if destination_chain else None
    dest_token = get_token_by_symbol(token_out.upper(), tokens, chain=lookup_chain)
    
    if not dest_token:
        if destination_chain:
            return f"  Token '{token_out.upper()}' not found on chain '{dest_chain}'. Use get_available_tokens_tool to check availability."
        else:
            # Fallback for generic request (should verify if this ever happens given safety check 1)
            # Try to find ANY token match
            dest_token = get_token_by_symbol(token_out.upper(), tokens)
            
    if not dest_token:
        return f"  Token '{token_out}' not found. Use get_available_tokens_tool to see available tokens."

    dest_chain = dest_token.get("blockchain", "near").lower()
    
    # -- SAFETY CHECK 4: Validate recipient format matching destination chain --
    # If using an explicit destination address, ensure it matches the token's chain
    if destination_address:
        is_evm_addr = destination_address.startswith("0x") and len(destination_address) == 42
        is_evm_token = is_evm_chain(dest_chain)
        
        if is_evm_addr and not is_evm_token:
            # Mismatch: User gave 0x address but we found a NEAR token (likely default behavior)
            # We must fail and ask for the chain
            return (
                f"  **Chain Not Specified**\n\n"
                f"You provided an Ethereum-style address (`{destination_address}`) but the system selected **{token_out.upper()} on {dest_chain.upper()}**.\n"
                f"This mismatch usually happens if you didn't specify the destination chain.\n\n"
                f"Please try again specifying the chain, e.g.:\n"
                f"- \"swap {token_in} to {token_out} **on Base**\"\n"
                f"- \"swap {token_in} to {token_out} **on Arbitrum**\""
            )
            
    # Determine if cross-chain
    is_cross_chain = dest_chain != effective_source_chain
    
    # -- Resolve recipient address --
    # IMPORTANT: If user provides an explicit destination_address, ALWAYS use it
    # This handles "send USDC to frigid_degen5.user.intear.near" even on same chain
    if destination_address:
        # User provided explicit address   validate format
        if is_cross_chain and not validate_address_for_chain(destination_address, dest_chain):
            expected_format = get_chain_address_format(dest_chain)
            return (
                f"  **Invalid Address Format**\n\n"
                f"The address `{destination_address}` doesn't match the expected format for **{dest_chain.upper()}**.\n"
                f"Expected: {expected_format}\n\n"
                f"Please provide a valid {dest_chain.upper()} address."
            )
        recipient = destination_address
    elif is_cross_chain:
        # Cross-chain, no explicit address   try to auto-fill from connected wallets
        # For EVM dest chains, use the 'eth' address
        dest_addr_key = "eth" if is_evm_chain(dest_chain) else dest_chain
        if dest_addr_key in addr_map:
            recipient = addr_map[dest_addr_key]
        elif dest_chain in addr_map:
            recipient = addr_map[dest_chain]
        else:
            expected_format = get_chain_address_format(dest_chain)
            return (
                f"  **Cross-Chain Swap   Address Needed**\n\n"
                f"You want to receive **{token_out.upper()}** on **{dest_chain.upper()}** chain.\n"
                f"You don't have a {dest_chain.upper()} wallet connected.\n\n"
                f"Please provide your **{dest_chain.upper()} wallet address** ({expected_format})."
            )
    else:
        # Same chain, no explicit address   use the connected wallet for that chain
        # For NEAR source, use 'near' key; for EVM source, use 'eth' key
        if effective_source_chain == "near":
            recipient = addr_map.get("near", account_id)
        elif is_evm_chain(effective_source_chain):
            recipient = addr_map.get("eth", account_id)
        else:
            recipient = addr_map.get(effective_source_chain, account_id)
    
    # -- Get the actual quote --
    # Determine refund address: for EVM source, use eth address; for NEAR, use NEAR address
    if is_evm_chain(effective_source_chain):
        refund_addr = addr_map.get("eth", account_id)
        
        # Validate EVM refund address
        # If fallback to account_id occurred (and account_id is "user.near"), it will fail validation
        if not refund_addr or not refund_addr.startswith("0x") or len(refund_addr) != 42:
             return (
                f"  **Missing EVM Address for Refund**\n\n"
                f"You are swapping from **{effective_source_chain.upper()}**, so we need your EVM wallet address for refunds.\n"
                f"We couldn't find a valid EVM address in your connected wallets.\n\n"
                f"**Please connect your Ethereum/EVM wallet** to proceed."
            )
            
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
        refund_address=refund_addr,
        source_chain=effective_source_chain,
        dest_chain=dest_chain
    )
    
    if "error" in quote:
        return f"  Error getting quote: {quote['error']}"
    
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
    addr_note = f"\n  _Using your connected {dest_chain.upper()} address. Reply 'use [address]' to change._" if auto_filled else ""
    
    return (
        f"  **Swap Quote**\n"
        f"**Swap**: {amount} [{effective_source_chain.upper()}] {token_in.upper()} -> ~{quote['amount_out']:.6f} [{dest_chain.upper()}] {token_out.upper()}\n"
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
        return "  No recent quote found. Please get a quote first by asking for a swap."
    
    try:
        from tools import create_deposit_transaction, get_sign_action_type
        
        source_chain = _last_quote.get("source_chain", "near").lower()
        
        tx_payload = create_deposit_transaction(
            token_in=_last_quote["token_in"],
            token_out=_last_quote["token_out"],
            amount=_last_quote["amount"],
            min_amount_out=_last_quote.get("min_amount_out", 0),
            deposit_address=_last_quote["deposit_address"],
            source_chain=source_chain,
            account_id=_last_quote.get("account_id", "")
        )
        
        action_type = get_sign_action_type(source_chain)
        
        # Return special marker that agents.py will detect
        return f"[TRANSACTION_READY] Transaction prepared for {source_chain.upper()}. Action: {action_type}. User needs to sign in their wallet."
        
    except Exception as e:
        return f"  Error preparing transaction: {str(e)}"



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
        "  **Feature In Progress**\n\n"
        "HOT Pay integration (Payment Links & Merchant Tracking) is currently being developed.\n"
        "I know about these features, but I can't execute them just yet!\n\n"
        "Current capabilities:\n"
        "  Token Swaps\n"
        "  Balance Checks\n"
        "  Cross-Chain Bridge\n"
        "  Merchant Payments (Coming Soon)"
    )


# ===================================================================
# Autonomy Tools   Let the user set up strategies through conversation
# ===================================================================

@tool
def create_strategy_tool(
    wallet_address: str,
    strategy_type: str,
    token: str = "",
    threshold_pct: float = 0,
    direction: str = "",
    target_allocation: str = "",
    schedule: str = "every_10m",
    chain: str = "near"
) -> str:
    """
    Create an autonomous strategy rule for the user through conversation.
    The agent MUST gather all required details from the user BEFORE calling this tool.

    ALWAYS ASK THE USER THESE QUESTIONS FIRST:
    - For price_alert: Which token? What % threshold? Alert on drop or surge?
    - For stop_loss: Which token? At what % drop should I sell? What chain?
    - For rebalance: What's your target allocation? What drift % triggers it? What chain?

    Args:
        wallet_address: The user's wallet address (you already have this from context)
        strategy_type: One of "price_alert", "stop_loss", "rebalance", "restake"
        token: The token symbol this strategy applies to (e.g., "btc", "eth", "near")
        threshold_pct: The percentage threshold that triggers the strategy
        direction: For price_alert only   "drop" or "surge"
        target_allocation: For rebalance only   JSON string like '{"eth": 50, "btc": 30, "near": 20}'
        schedule: How often to check   "every_10m" (default), "every_1h", "every_24h"
        chain: The blockchain network where the agent wallet lives (e.g., "near", "base", "ethereum"). Defaults to "near".

    Returns: Confirmation message with strategy details
    """
    import json as _json
    try:
        from database import add_strategy

        # Build the trigger condition based on strategy type
        if strategy_type == "price_alert":
            if not token or not threshold_pct or not direction:
                return "  Missing info. I need: which token, what % threshold, and whether to alert on 'drop' or 'surge'. Please provide all details."
            condition = {"token": token.lower(), "threshold_pct": threshold_pct, "direction": direction.lower(), "chain": chain}

        elif strategy_type == "stop_loss":
            if not token or not threshold_pct:
                return "  Missing info. I need: which token and at what % drop to trigger the stop-loss."
            condition = {"token": token.lower(), "drop_pct": threshold_pct, "chain": chain}

        elif strategy_type == "rebalance":
            if not target_allocation or not threshold_pct:
                return "  Missing info. I need: your target portfolio allocation (e.g., 50% ETH, 30% BTC, 20% NEAR) and what drift % should trigger rebalancing."
            try:
                targets = _json.loads(target_allocation) if isinstance(target_allocation, str) else target_allocation
            except:
                return "  I couldn't parse the target allocation. Please provide it like: 50% ETH, 30% BTC, 20% NEAR"
            condition = {"drift_pct": threshold_pct, "target": targets, "chain": chain}

        elif strategy_type == "restake":
            condition = {"token": token.lower() if token else "near", "chain": chain}

        else:
            return f"  Unknown strategy type '{strategy_type}'. Available types: price_alert, stop_loss, rebalance, restake"

        strategy_id = add_strategy(wallet_address, strategy_type, condition, schedule)

        # Build confirmation message
        type_label = strategy_type.replace("_", " ").title()
        msg = f"  **{type_label} Strategy Created** (ID: {strategy_id})\n\n"

        if strategy_type == "price_alert":
            msg += f"I'll monitor **{token.upper()}** and alert you if it **{direction}s {threshold_pct}%** or more.\n"
        elif strategy_type == "stop_loss":
            msg += f"I'll monitor **{token.upper()}** and recommend selling if it **drops {threshold_pct}%**.\n"
        elif strategy_type == "rebalance":
            msg += f"I'll check your portfolio every cycle and trigger rebalancing if allocation **drifts {threshold_pct}%** from your targets.\n"
        elif strategy_type == "restake":
            msg += f"I'll auto-restake your **{token.upper() or 'NEAR'}** rewards when available.\n"

        msg += f"\nChecking frequency: **{schedule.replace('_', ' ')}**"
        msg += "\n\nYou can view and manage your strategies in the **Autonomy** panel in the sidebar."
        return msg

    except Exception as e:
        return f"  Error creating strategy: {str(e)}"


@tool
def list_strategies_tool(wallet_address: str) -> str:
    """
    List all active strategies for the user's wallet.
    Use when user asks: "what strategies do I have?", "show my rules", "list my alerts", "what's set up?"

    Args:
        wallet_address: The user's wallet address (you already have this from context)

    Returns: Formatted list of active strategies
    """
    import json as _json
    try:
        from database import get_active_strategies

        strategies = get_active_strategies(wallet_address)
        if not strategies:
            return "You don't have any active strategies yet. Would you like me to set one up? I can help with:\n\n  **Price Alert**   Alert when a token drops or surges past a threshold\n  **Stop Loss**   Auto-sell when a token drops dangerously\n  **Portfolio Rebalance**   Keep your portfolio balanced\n\nJust tell me what you'd like!"

        msg = f"  **Your Active Strategies** ({len(strategies)} total)\n\n"
        for s in strategies:
            sid = s["id"]
            stype = s["strategy_type"].replace("_", " ").title()
            condition = s["trigger_condition"] if isinstance(s["trigger_condition"], dict) else _json.loads(s["trigger_condition"])
            schedule = s["schedule"]

            msg += f"**{sid}. {stype}** ({schedule.replace('_', ' ')})\n"

            if s["strategy_type"] == "price_alert":
                msg += f"   Token: {condition.get('token', '?').upper()} | Threshold: {condition.get('threshold_pct', '?')}% {condition.get('direction', '?')}\n"
            elif s["strategy_type"] == "stop_loss":
                msg += f"   Token: {condition.get('token', '?').upper()} | Trigger at: {condition.get('drop_pct', '?')}% drop\n"
            elif s["strategy_type"] == "rebalance":
                targets = condition.get("target", {})
                target_str = ", ".join(f"{v}% {k.upper()}" for k, v in targets.items())
                msg += f"   Target: {target_str} | Drift trigger: {condition.get('drift_pct', '?')}%\n"
            elif s["strategy_type"] == "restake":
                msg += f"   Token: {condition.get('token', 'near').upper()}\n"

            msg += "\n"

        msg += "To remove a strategy, just say 'remove strategy [number]'."
        return msg

    except Exception as e:
        return f"  Error listing strategies: {str(e)}"


@tool
def remove_strategy_tool(strategy_id: int) -> str:
    """
    Remove/deactivate a strategy by its ID.
    Use when user says: "remove strategy 3", "delete my stop loss", "cancel alert #2"

    Args:
        strategy_id: The ID of the strategy to remove (shown in list_strategies_tool output)

    Returns: Confirmation message
    """
    try:
        from database import deactivate_strategy
        deactivate_strategy(strategy_id)
        return f"  Strategy #{strategy_id} has been deactivated. It will no longer trigger."
    except Exception as e:
        return f"  Error removing strategy: {str(e)}"


@tool
def update_autonomy_settings_tool(
    wallet_address: str,
    autonomy_level: int = -1,
    max_tx_amount: float = -1,
    daily_limit: float = -1,
    kill_switch: int = -1
) -> str:
    """
    Update the user's autonomy settings (guardrails, limits, autonomy level, kill switch).
    Use when user says things like: "set my max trade to $100", "turn on auto mode", "activate kill switch", "set daily limit to $500"

    Args:
        wallet_address: The user's wallet address (you already have this from context)
        autonomy_level: 0=Off, 1=Notify Only, 2=Auto-Execute. Pass -1 to keep unchanged.
        max_tx_amount: Maximum USD per transaction. Pass -1 to keep unchanged.
        daily_limit: Maximum USD per day. Pass -1 to keep unchanged.
        kill_switch: 1=activate (halt everything), 0=deactivate. Pass -1 to keep unchanged.

    Returns: Confirmation of updated settings
    """
    try:
        from database import upsert_user

        updates = {}
        if autonomy_level >= 0:
            updates["autonomy_level"] = autonomy_level
        if max_tx_amount >= 0:
            updates["max_tx_amount"] = max_tx_amount
        if daily_limit >= 0:
            updates["daily_limit"] = daily_limit
        if kill_switch >= 0:
            updates["kill_switch"] = kill_switch

        if not updates:
            return "No settings were changed. Tell me what you'd like to update:\n  Autonomy level (Off / Notify / Auto)\n  Max per transaction\n  Daily spending limit\n  Kill switch (on/off)"

        upsert_user(wallet_address, updates)

        msg = "  **Settings Updated:**\n"
        if "autonomy_level" in updates:
            levels = {0: "Off", 1: "Notify Only", 2: "Auto-Execute"}
            msg += f"  Autonomy Level: **{levels.get(autonomy_level, autonomy_level)}**\n"
        if "max_tx_amount" in updates:
            msg += f"  Max per transaction: **${max_tx_amount}**\n"
        if "daily_limit" in updates:
            msg += f"  Daily limit: **${daily_limit}**\n"
        if "kill_switch" in updates:
            msg += f"  Kill switch: **{'ACTIVATED  ' if kill_switch else 'Deactivated  '}**\n"

        return msg

    except Exception as e:
        return f"  Error updating settings: {str(e)}"


@tool
def get_autonomy_status_tool(wallet_address: str) -> str:
    """
    Get the user's current autonomy settings and status overview.
    Use when user asks: "what are my settings?", "am I in auto mode?", "is kill switch on?", "show my limits"

    Args:
        wallet_address: The user's wallet address

    Returns: Overview of current autonomy settings
    """
    try:
        from database import get_user, get_active_strategies, get_agent_logs

        user = get_user(wallet_address)
        strategies = get_active_strategies(wallet_address)
        logs = get_agent_logs(wallet_address, limit=5)

        if not user:
            return "You haven't set up autonomy yet. Would you like me to help? I can configure:\n  Your autonomy level (Off / Notify / Auto)\n  Spending limits and guardrails\n  Trading strategies (price alerts, stop-loss, rebalancing)"

        levels = {0: "Off", 1: "Notify Only", 2: "Auto-Execute"}
        kill = "  ACTIVE" if user["kill_switch"] else "  Off"

        msg = "  **Your Autonomy Status**\n\n"
        msg += f"  Autonomy Level: **{levels.get(user['autonomy_level'], 'Unknown')}**\n"
        msg += f"  Kill Switch: **{kill}**\n"
        msg += f"  Max per TX: **${user['max_tx_amount']}**\n"
        msg += f"  Daily Limit: **${user['daily_limit']}**\n"
        msg += f"  Active Strategies: **{len(strategies)}**\n"

        if logs:
            msg += f"\n  **Last {len(logs)} Decisions:**\n"
            for log in logs[:3]:
                status_icon = " " if log["status"] == "executed" else " " if log["status"] == "blocked" else " "
                msg += f"  {status_icon} [{log['agent_name']}] {log['action_taken'][:50]}...\n"

        return msg

    except Exception as e:
        return f"  Error getting status: {str(e)}"


# -- Tool Lists per Agent (each agent gets ONLY its own tools) ----

# Swap Agent   handles token swaps, quotes, discovery
SWAP_TOOL_LIST = [
    get_available_tokens_tool,
    get_token_chains_tool,
    validate_token_names_tool,
    get_swap_quote_tool,
    confirm_swap_tool,
    hot_pay_coming_soon_tool,
]

# Autonomy Agent   handles strategies, settings, guardrails
AUTONOMY_TOOL_LIST = [
    create_strategy_tool,
    list_strategies_tool,
    remove_strategy_tool,
    update_autonomy_settings_tool,
    get_autonomy_status_tool,
]

# Combined (backward compatibility)
TOOL_LIST = SWAP_TOOL_LIST + AUTONOMY_TOOL_LIST
