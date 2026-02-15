import requests
import json

url = "https://api.hot-labs.org/partners/merchant_item"
jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkb21haW4iOiJwYXkuaG90LWxhYnMub3JnIiwia2V5X2lkIjoxNCwidzNfdXNlcl9pZCI6MzgzNTI2MzYsInR5cGUiOiJ3aWJlMyJ9.lRdqJnZhN_X6XiE7GV4-n3DnA6PnMI4qV63Na_U_i7A"

headers = {
    "Authorization": jwt,
    "Content-Type": "application/json"
}

data = {
    "merchant_id": "flame1.near",
    "memo": "agent_test_verify",
    "header": "Agent Link Test",
    "token": "nep141:usdc.tether-token.near",
    "amount": "0.1",
    "description": "Created via Neptune AI Agent Test"
}

try:
    print(f"Testing POST {url}...")
    response = requests.post(url, headers=headers, json=data, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
