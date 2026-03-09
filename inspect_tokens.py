
import requests
import json

def fetch_tokens():
    print("Fetching tokens from API...")
    try:
        response = requests.get("https://1click.chaindefuser.com/v0/tokens", timeout=10)
        response.raise_for_status()
        data = response.json()
    except Exception as e:
        print(f"Error fetching tokens: {e}")
        return

    print(f"Loaded {len(data)} tokens.")

    print("\n--- USDC Variants ---")
    
    # Filter for USDC
    usdc_tokens = []
    for t in data:
        symbol = t.get("symbol", "").upper()
        if "USDC" in symbol:
            usdc_tokens.append(t)

    # Sort by blockchain
    usdc_tokens.sort(key=lambda x: x.get("blockchain", "z"))

    for t in usdc_tokens:
        chain = t.get("blockchain", "??")
        symbol = t.get("symbol", "??")
        asset_id = t.get("assetId", "??")
        name = t.get("name", "??")
        
        print(f"Chain: {chain:<10} Symbol: {symbol:<8} Name: {name:<20} ID: {asset_id}")

fetch_tokens()
