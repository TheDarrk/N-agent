"""
LangChain tool definitions for Flow blockchain operations.
These wrap functions from flow_tools.py and are used exclusively
when the user connects via Flow Wallet / Dapper Wallet.
"""
from langchain.tools import tool
from typing import Optional

# Global quote storage for Flow swaps (same pattern as NEAR agent)
_flow_last_quote = None


@tool
async def flow_get_available_tokens_tool() -> str:
    """
    List all tokens available for swapping on Flow blockchain.
    Use this when the user asks what tokens are available on Flow, 
    or before a swap to verify token availability.
    """
    from flow_tools import flow_get_available_tokens

    tokens = await flow_get_available_tokens()
    if not tokens:
        return "No tokens found on Flow at this time. The token list may still be loading."

    lines = ["**Tokens available on Flow:**"]
    for t in tokens:
        lines.append(f"  **{t['symbol']}**   {t['name']}")
    return "\n".join(lines)


@tool
async def flow_get_swap_quote_tool(
    token_in: str,
    token_out: str,
    amount: float,
    account_address: str = ""
) -> str:
    """
    Get a live swap quote for tokens on Flow blockchain (via PunchSwap DEX).
    Use this when the user wants to swap tokens, e.g., "swap 10 FLOW for USDC".
    Takes token_in (symbol), token_out (symbol), and amount.
    Returns a quote with output amount and exchange rate.
    """
    from flow_tools import flow_get_swap_quote

    global _flow_last_quote

    quote = await flow_get_swap_quote(
        token_in=token_in,
        token_out=token_out,
        amount=amount,
        account_address=account_address
    )

    if "error" in quote:
        return f"  Error getting quote: {quote['error']}"

    _flow_last_quote = quote

    return (
        f"  **Flow Swap Quote**\n"
        f"**Swap**: {amount} {token_in.upper()}   ~{quote['amount_out']:.6f} {token_out.upper()}\n"
        f"**Rate**: 1 {token_in.upper()} = {quote['rate']:.6f} {token_out.upper()}\n"
        f"**DEX**: PunchSwap (Flow EVM)\n"
        f"**Chain**: Flow (chainId: {FLOW_EVM_CHAIN_ID})\n\n"
        f"Would you like to proceed with this swap?\n\n"
        f"[QUOTE_ID: flow_{id(quote)}]"
    )

FLOW_EVM_CHAIN_ID = 747


@tool
async def flow_confirm_swap_tool() -> str:
    """
    Confirm and prepare the last Flow swap quote for signing.
    Use this ONLY when the user confirms a previously shown quote 
    (e.g., "yes", "go ahead", "confirm", "proceed").
    Do NOT call this without first having an active quote from flow_get_swap_quote_tool.
    """
    from flow_tools import flow_build_swap_transaction

    global _flow_last_quote

    if not _flow_last_quote:
        return "  No active swap quote found. Please request a quote first."

    try:
        from_address = _flow_last_quote.get("account_address", "")
        tx_payload = flow_build_swap_transaction(
            quote=_flow_last_quote,
            from_address=from_address,
            slippage=0.01
        )

        result = (
            f"  Swap transaction prepared!\n"
            f"**Swapping**: {_flow_last_quote['amount_in']} {_flow_last_quote['token_in']}   "
            f"~{_flow_last_quote['amount_out']:.6f} {_flow_last_quote['token_out']}\n"
            f"**Chain**: Flow EVM (chainId: 747)\n\n"
            f"Please review and sign the transaction in your wallet.\n\n"
            f"[TRANSACTION_READY]"
        )

        return result

    except Exception as e:
        return f"  Error preparing swap transaction: {str(e)}"


@tool
async def flow_get_user_nfts_tool(account_address: str = "") -> str:
    """
    List NFTs owned by the connected Flow wallet.
    Use this when the user asks to see their NFTs, or before transferring an NFT.
    """
    from flow_tools import flow_get_user_nfts

    if not account_address:
        return "  No Flow address provided. Please make sure your Flow wallet is connected."

    nfts = await flow_get_user_nfts(account_address)

    if not nfts:
        return f"No NFTs found for address `{account_address}`. The account may have NFTs in collections we don't yet support."

    lines = [f"**Your NFTs ({len(nfts)} found):**"]
    for nft in nfts[:20]:  # Limit display
        lines.append(
            f"  **{nft.get('name', 'Unnamed')}** (#{nft.get('id', '?')})   "
            f"{nft.get('collection', 'Unknown Collection')}"
        )

    if len(nfts) > 20:
        lines.append(f"\n...and {len(nfts) - 20} more NFTs")

    return "\n".join(lines)


@tool
async def flow_transfer_nft_tool(
    nft_id: int,
    collection_name: str,
    to_address: str
) -> str:
    """
    Transfer an NFT to another Flow address.
    Use this when the user wants to send an NFT, e.g., "send my TopShot moment #12345 to 0x...".
    Takes nft_id (the NFT's ID number), collection_name (e.g., "TopShot", "NFLAllDay"), 
    and to_address (0x + 16 hex chars Flow address).
    ALWAYS confirm with the user before calling this tool   show them the NFT name and recipient.
    """
    from flow_tools import flow_build_nft_transfer_transaction, is_valid_flow_address

    # Validate recipient address
    if not is_valid_flow_address(to_address):
        return f"  Invalid Flow address: `{to_address}`. Flow addresses are 0x followed by 16 hex characters."

    # Map collection names to storage paths
    # TODO: Expand this mapping with more collections
    collection_map = {
        "topshot": {"storage": "MomentCollection", "public": "MomentCollection"},
        "nflallday": {"storage": "NFLAllDayNFTCollection", "public": "NFLAllDayNFTCollection"},
        "ufcstrike": {"storage": "UFCStrikeCollection", "public": "UFCStrikeCollection"},
    }

    collection_key = collection_name.lower().replace(" ", "").replace("_", "")
    paths = collection_map.get(collection_key)

    if not paths:
        return (
            f"  Collection '{collection_name}' is not yet supported for transfers. "
            f"Supported collections: {', '.join(collection_map.keys())}"
        )

    try:
        tx_payload = flow_build_nft_transfer_transaction(
            nft_id=nft_id,
            collection_path=paths["storage"],
            collection_public_path=paths["public"],
            to_address=to_address
        )

        return (
            f"  NFT Transfer prepared!\n"
            f"**Sending**: {collection_name} #{nft_id}\n"
            f"**To**: `{to_address}`\n\n"
            f"Please review and sign the transaction in your Flow wallet.\n\n"
            f"[FLOW_NFT_TRANSFER_READY]"
        )

    except Exception as e:
        return f"  Error preparing NFT transfer: {str(e)}"


# List of all Flow agent tools
FLOW_TOOL_LIST = [
    flow_get_available_tokens_tool,
    flow_get_swap_quote_tool,
    flow_confirm_swap_tool,
    flow_get_user_nfts_tool,
    flow_transfer_nft_tool,
]
