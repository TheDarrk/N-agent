
import sys
import os
import asyncio
from unittest.mock import MagicMock

# Add path
sys.path.append("ai-agent-backend")

# Mock knowledge base cache
import knowledge_base
# We need to populate the cache for the tool to work
# Let's mock _token_cache
knowledge_base._token_cache = [
    {
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6,
        "defuseAssetId": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        "blockchain": "near"
    },
    {
        "symbol": "USDC",
        "name": "USD Coin",
        "decimals": 6,
        "defuseAssetId": "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near",
        "blockchain": "base"
    },
    {
        "symbol": "NEAR",
        "name": "NEAR",
        "decimals": 24,
        "defuseAssetId": "nep141:wrap.near",
        "blockchain": "near"
    }
]

from agent_tools import get_swap_quote_tool

# Mock the actual _get_swap_quote function in tools.py to avoid calling real API
# But we DO want to call the real tool logic up to the API call.
# The tool calls `tools.get_swap_quote`.
import tools
original_get_swap_quote = tools.get_swap_quote

def mock_get_swap_quote(*args, **kwargs):
    print("\n[MOCK] tools.get_swap_quote called with:")
    # print all args and kwargs
    for k, v in kwargs.items():
        print(f"  {k}: {v}")
    return "MOCK_QUOTE_RESULT"

tools.get_swap_quote = mock_get_swap_quote

def test_tool(scenario_name, **kwargs):
    print(f"\n--- Testing Scenario: {scenario_name} ---")
    try:
        # StructuredTool.invoke takes a dict
        result = get_swap_quote_tool.invoke(kwargs)
        print(f"Result: {result}")
    except Exception as e:
        print(f"Error: {e}")

# Scenario 1: User provides EVM address, but NO destination_chain (The Failure Case)
# This should match NEAR USDC and FAIL validation logic
test_tool(
    "1. Missing Dest Chain, EVM Address",
    token_in="NEAR",
    token_out="USDC",
    amount=0.1,
    account_id="flame1.near",
    destination_address="0x9bc045b38d9301326717BB5B400C1D99265C1dF0"
)

# Scenario 2: Valid Dest Chain with Whitespace "base " 
test_tool(
    "2. Dest Chain 'base ' (trailing space)",
    token_in="NEAR",
    token_out="USDC",
    amount=0.1,
    account_id="flame1.near",
    destination_address="0x9bc045b38d9301326717BB5B400C1D99265C1dF0",
    destination_chain="base "
)

# Scenario 3: Valid Dest Chain "BASE"
test_tool(
    "3. Dest Chain 'BASE'",
    token_in="NEAR",
    token_out="USDC",
    amount=0.1,
    account_id="flame1.near",
    destination_address="0x9bc045b38d9301326717BB5B400C1D99265C1dF0",
    destination_chain="BASE"
)

