"""
Validation utilities for wallet addresses and token names.
Supports: NEAR, EVM, Solana, Tron, TON
"""
from typing import Dict, Optional, List, Tuple
import re
from fuzzywuzzy import fuzz, process


def validate_near_address(address: str) -> bool:
    """
    Validate NEAR wallet address format.
    
    NEAR addresses can be:
    - Named accounts: alice.near, alice.testnet (alphanumeric with dots, hyphens, underscores)
    - Implicit accounts: 64-character hex string
    """
    if not address or not isinstance(address, str):
        return False
    
    address = address.strip()
    
    # Check for implicit account (64 hex chars)
    if re.match(r'^[a-f0-9]{64}$', address.lower()):
        return True
    
    # Check for named account
    if re.match(r'^[a-z0-9_-]{2,}(\.[a-z0-9_-]{2,})*\.?(near|testnet)$', address.lower()):
        return True
    
    # Check for valid subaccount pattern without TLD
    if re.match(r'^[a-z0-9_-]{2,}(\.[a-z0-9_-]{2,})+$', address.lower()):
        return True
    
    return False


def validate_evm_address(address: str) -> bool:
    """
    Validate Ethereum/EVM wallet address format.
    Works for ETH, ARB, BASE, OP, BSC, Gnosis, etc.
    """
    if not address or not isinstance(address, str):
        return False
    
    address = address.strip()
    
    # Basic format check: 0x followed by 40 hex characters
    if not re.match(r'^0x[a-fA-F0-9]{40}$', address):
        return False
    
    try:
        from web3 import Web3
        return Web3.is_address(address)
    except ImportError:
        return True


def validate_solana_address(address: str) -> bool:
    """
    Validate Solana wallet address format.
    Solana addresses are base58-encoded, 32-44 characters long.
    """
    if not address or not isinstance(address, str):
        return False
    
    address = address.strip()
    
    # Solana addresses: base58 chars (no 0, O, I, l), typically 32-44 chars
    if not re.match(r'^[1-9A-HJ-NP-Za-km-z]{32,44}$', address):
        return False
    
    return True


def validate_tron_address(address: str) -> bool:
    """
    Validate Tron wallet address format.
    Tron addresses start with 'T' and are 34 characters (base58).
    """
    if not address or not isinstance(address, str):
        return False
    
    address = address.strip()
    
    # Tron address: starts with T, 34 chars, base58
    if not re.match(r'^T[1-9A-HJ-NP-Za-km-z]{33}$', address):
        return False
    
    return True


def validate_ton_address(address: str) -> bool:
    """
    Validate TON wallet address format.
    TON addresses can be:
    - Raw: 0:hex (workchain:hash)
    - User-friendly: EQ or UQ prefix, base64, ~48 chars
    """
    if not address or not isinstance(address, str):
        return False
    
    address = address.strip()
    
    # Raw format: 0:64hex or -1:64hex
    if re.match(r'^-?[0-9]+:[a-fA-F0-9]{64}$', address):
        return True
    
    # User-friendly format: EQ or UQ prefix, base64url, ~48 chars
    if re.match(r'^(EQ|UQ)[A-Za-z0-9_-]{46,48}$', address):
        return True
    
    return False


def validate_address_for_chain(address: str, chain: str) -> bool:
    """
    Validate a wallet address for a specific blockchain.
    
    Args:
        address: The wallet address to validate
        chain: Chain identifier (e.g., 'near', 'eth', 'solana', 'tron', 'ton')
    
    Returns:
        bool: True if the address format is valid for the given chain
    """
    chain_lower = chain.lower().strip()
    
    # Map chain names to validators
    chain_validators = {
        'near': validate_near_address,
        'aurora': validate_near_address,  # Aurora uses NEAR addresses
        'eth': validate_evm_address,
        'ethereum': validate_evm_address,
        'arb': validate_evm_address,
        'arbitrum': validate_evm_address,
        'base': validate_evm_address,
        'op': validate_evm_address,
        'optimism': validate_evm_address,
        'bsc': validate_evm_address,
        'gnosis': validate_evm_address,
        'polygon': validate_evm_address,
        'avalanche': validate_evm_address,
        'solana': validate_solana_address,
        'sol': validate_solana_address,
        'tron': validate_tron_address,
        'trx': validate_tron_address,
        'ton': validate_ton_address,
    }
    
    validator = chain_validators.get(chain_lower)
    if validator:
        return validator(address)
    
    # Unknown chain — accept any non-empty string as we can't validate
    return bool(address and len(address) > 5)


def get_chain_from_address(address: str) -> Optional[str]:
    """
    Determine the blockchain from address format.
    
    Returns:
        str: 'near', 'evm', 'solana', 'tron', 'ton', or None if unrecognized
    """
    if validate_near_address(address):
        return 'near'
    elif validate_evm_address(address):
        return 'evm'
    elif validate_tron_address(address):
        return 'tron'
    elif validate_ton_address(address):
        return 'ton'
    elif validate_solana_address(address):
        return 'solana'
    return None


def get_chain_address_format(chain: str) -> str:
    """
    Get a human-readable description of the expected address format for a chain.
    Useful for error messages when address validation fails.
    """
    formats = {
        'near': 'NEAR address (e.g., alice.near or 64-char hex)',
        'eth': 'EVM address starting with 0x (42 characters)',
        'ethereum': 'EVM address starting with 0x (42 characters)',
        'arb': 'EVM address starting with 0x (42 characters)',
        'base': 'EVM address starting with 0x (42 characters)',
        'solana': 'Solana address (32-44 base58 characters)',
        'sol': 'Solana address (32-44 base58 characters)',
        'tron': 'Tron address starting with T (34 characters)',
        'trx': 'Tron address starting with T (34 characters)',
        'ton': 'TON address (EQ/UQ prefix or raw format)',
    }
    return formats.get(chain.lower(), f'{chain} wallet address')


# ─── Token Matching ───────────────────────────────────────

def fuzzy_match_token(
    input_token: str, 
    available_tokens: List[str],
    threshold: int = 70
) -> Dict[str, any]:
    """
    Find the best matching token from available tokens using fuzzy matching.
    """
    if not input_token or not available_tokens:
        return {
            'exact_match': False,
            'suggested_token': None,
            'confidence': 0,
            'alternatives': []
        }
    
    input_upper = input_token.upper().strip()
    available_upper = [t.upper() for t in available_tokens]
    
    # Check for exact match first
    if input_upper in available_upper:
        return {
            'exact_match': True,
            'suggested_token': input_upper,
            'confidence': 100,
            'alternatives': []
        }
    
    # Use fuzzy matching to find best match
    matches = process.extract(input_upper, available_upper, scorer=fuzz.ratio, limit=3)
    
    if not matches or matches[0][1] < threshold:
        return {
            'exact_match': False,
            'suggested_token': None,
            'confidence': 0,
            'alternatives': [m[0] for m in matches if m[1] >= 50]
        }
    
    best_match, confidence = matches[0]
    alternatives = [m[0] for m in matches[1:] if m[1] >= 50]
    
    return {
        'exact_match': False,
        'suggested_token': best_match,
        'confidence': confidence,
        'alternatives': alternatives
    }


def validate_token_pair(token_in: str, token_out: str, available_tokens: List[str]) -> Tuple[bool, str, Optional[str], Optional[str]]:
    """
    Validate and potentially correct a token pair.
    """
    match_in = fuzzy_match_token(token_in, available_tokens)
    match_out = fuzzy_match_token(token_out, available_tokens)
    
    # Both exact matches - all good
    if match_in['exact_match'] and match_out['exact_match']:
        return True, "Valid token pair", token_in.upper(), token_out.upper()
    
    # Handle input token issues
    if not match_in['exact_match']:
        if match_in['suggested_token']:
            if match_out['exact_match'] or match_out['suggested_token']:
                return False, f"Did you mean {match_in['suggested_token']} instead of {token_in}?", match_in['suggested_token'], match_out.get('suggested_token') or token_out.upper()
        else:
            return False, f"Token '{token_in}' not recognized. Available alternatives: {', '.join(match_in['alternatives'][:3]) if match_in['alternatives'] else 'none'}", None, None
    
    # Handle output token issues
    if not match_out['exact_match']:
        if match_out['suggested_token']:
            return False, f"Did you mean {match_out['suggested_token']} instead of {token_out}?", match_in.get('suggested_token') or token_in.upper(), match_out['suggested_token']
        else:
            return False, f"Token '{token_out}' not recognized. Available alternatives: {', '.join(match_out['alternatives'][:3]) if match_out['alternatives'] else 'none'}", None, None
    
    return True, "Valid token pair", match_in.get('suggested_token') or token_in.upper(), match_out.get('suggested_token') or token_out.upper()
