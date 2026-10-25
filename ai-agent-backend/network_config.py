"""
Neptune AI — Centralized NEAR Network Configuration & Hard Network Guards
Ensures that all backend operations (RPC queries, balance lookups, PyNear account creation,
Defuse 1-Click quote requests, and transaction building) strictly respect Testnet vs Mainnet.
Mainnet is prohibited by default (ENABLE_MAINNET=false).
"""

import os
from typing import Tuple, Dict, Any

# Primary RPC Endpoints
TESTNET_RPC = os.getenv("NEAR_TESTNET_RPC", "https://test.rpc.fastnear.com")
TESTNET_RPC_ENDPOINTS = [
    "https://test.rpc.fastnear.com",
    "https://rpc.testnet.fastnear.com",
    "https://testnet.neardata.xyz/v1/node"
]
MAINNET_RPC = os.getenv("NEAR_MAINNET_RPC", "https://rpc.mainnet.near.org")

# Contracts
TESTNET_INTENTS_CONTRACT = "intents.testnet"
MAINNET_INTENTS_CONTRACT = "intents.near"

TESTNET_WRAP_NEAR = "wrap.testnet"
MAINNET_WRAP_NEAR = "wrap.near"

# Token Mapping
TESTNET_TOKEN_MAP = {
    "NEAR": "nep141:wrap.testnet",
    "WNEAR": "nep141:wrap.testnet",
    "USDT": "nep141:usdt.fakes.testnet",
    "USDC": "nep141:usdc.fakes.testnet",
    "ETH": "nep141:eth.fakes.testnet",
    "WBTC": "nep141:wbtc.fakes.testnet",
}

MAINNET_TOKEN_MAP = {
    "NEAR": "nep141:wrap.near",
    "WNEAR": "nep141:wrap.near",
    "USDT": "nep141:usdt.tether-token.near",
    "USDC": "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    "ETH": "nep141:eth.bridge.near",
    "WBTC": "nep141:minter.bridge.near",
    "AURORA": "nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
}


def is_mainnet_allowed() -> bool:
    """
    Returns True only if ENABLE_MAINNET env var is explicitly set to 'true' or '1'.
    Mainnet is prohibited when False.
    """
    val = os.getenv("ENABLE_MAINNET", "false").lower().strip()
    return val in ("true", "1")


def get_network(user_wallet: str = None) -> str:
    """
    Get active NEAR network ('testnet' or 'mainnet').
    If Mainnet is prohibited via env, ALWAYS forces 'testnet'.
    Otherwise prioritizes wallet domain (.testnet -> testnet, .near -> mainnet),
    falling back to os.environ['NEAR_NETWORK'].
    """
    if not is_mainnet_allowed():
        return "testnet"

    if user_wallet and isinstance(user_wallet, str):
        wallet_lower = user_wallet.lower().strip()
        if wallet_lower.endswith(".testnet"):
            return "testnet"
        if wallet_lower.endswith(".near"):
            return "mainnet"

    env_val = os.getenv("NEAR_NETWORK", "testnet").lower().strip()
    return "mainnet" if env_val == "mainnet" else "testnet"


def is_testnet(user_wallet: str = None) -> bool:
    """Hard check: Returns True if active mode is Testnet."""
    return get_network(user_wallet) == "testnet"


def is_mainnet(user_wallet: str = None) -> bool:
    """Hard check: Returns True if active mode is Mainnet (only when allowed)."""
    return get_network(user_wallet) == "mainnet"


def get_near_rpc(user_wallet: str = None) -> str:
    """Returns the strict RPC endpoint for the active network."""
    return TESTNET_RPC if is_testnet(user_wallet) else MAINNET_RPC


def get_intents_contract(user_wallet: str = None) -> str:
    """Returns the Defuse / NEAR Intents contract address."""
    return TESTNET_INTENTS_CONTRACT if is_testnet(user_wallet) else MAINNET_INTENTS_CONTRACT


def get_wrap_near_contract(user_wallet: str = None) -> str:
    """Returns the Wrapped NEAR NEP-141 contract address."""
    return TESTNET_WRAP_NEAR if is_testnet(user_wallet) else MAINNET_WRAP_NEAR


def get_token_map(user_wallet: str = None) -> Dict[str, str]:
    """Returns the Defuse asset mapping for active network."""
    return TESTNET_TOKEN_MAP if is_testnet(user_wallet) else MAINNET_TOKEN_MAP


def get_defuse_asset_id(token_symbol: str, user_wallet: str = None) -> str:
    """Get the defuseAssetId for a token symbol according to network mode."""
    sym = (token_symbol or "").upper().strip()
    token_map = get_token_map(user_wallet)
    if sym in token_map:
        return token_map[sym]
    # Fallback
    if is_testnet(user_wallet):
        return f"nep141:{sym.lower()}.fakes.testnet"
    return f"nep141:{sym.lower()}.near"


def validate_account_network(user_wallet: str, expected_network: str = None) -> Tuple[bool, str]:
    """
    Hard assertion check preventing account / network mismatches.
    """
    if not user_wallet:
        return False, "No wallet address provided"

    net = expected_network or get_network(user_wallet)
    wallet_lower = user_wallet.lower().strip()

    if not is_mainnet_allowed() and net == "mainnet":
        return False, "Mainnet is prohibited by environment configuration (ENABLE_MAINNET=false)."

    if net == "testnet":
        if wallet_lower.endswith(".near"):
            return False, f"Account '{user_wallet}' is a Mainnet account (.near). In Testnet mode, only .testnet accounts are allowed."
        return True, "Valid testnet account"

    if net == "mainnet":
        if wallet_lower.endswith(".testnet"):
            return False, f"Account '{user_wallet}' is a Testnet account (.testnet). In Mainnet mode, only .near accounts are allowed."
        return True, "Valid mainnet account"

    return True, "Valid account"
