import requests
import json
import sys

tx_hash = "JjhCpTwZVfZPdBRPeoPJ2S58J7SCztJ9EuzP35RW9KN"
sender = "ayubabariya.tg"
url = "https://rpc.mainnet.near.org"

payload = {
    "jsonrpc": "2.0",
    "id": "dontcare",
    "method": "EXPERIMENTAL_tx_status",
    "params": [tx_hash, sender]
}

try:
    response = requests.post(url, json=payload)
    response.raise_for_status()
    data = response.json()
    print(json.dumps(data, indent=2))
except Exception as e:
    print(f"Error: {e}")
