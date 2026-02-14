"""
Test script to validate NEAR AI API tool calling support.
"""
import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("NEAR_AI_API_KEY")
BASE_URL = "https://cloud-api.near.ai/v1"

# Test 1: Basic chat (no tools)
print("=" * 60)
print("TEST 1: Basic Chat")
print("=" * 60)

response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "user", "content": "Say 'Hello World'"}
        ]
    }
)

print(f"Status: {response.status_code}")
if response.status_code == 200:
    result = response.json()
    print(f"Response: {result['choices'][0]['message']['content']}")
else:
    print(f"Error: {response.text}")

# Test 2: Tool calling
print("\n" + "=" * 60)
print("TEST 2: Tool Calling")
print("=" * 60)

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the weather for a location",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string", "description": "City name"}
                },
                "required": ["location"]
            }
        }
    }
]

response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "openai/gpt-oss-120b",
        "messages": [
            {"role": "user", "content": "What's the weather in Paris?"}
        ],
        "tools": tools,
        "tool_choice": "auto"
    }
)

print(f"Status: {response.status_code}")
if response.status_code == 200:
    result = response.json()
    message = result['choices'][0]['message']
    print(f"Has tool_calls: {bool(message.get('tool_calls'))}")
    if message.get('tool_calls'):
        print(f"Tool calls: {json.dumps(message['tool_calls'], indent=2)}")
    else:
        print(f"Content: {message.get('content')}")
else:
    print(f"Error: {response.text}")

# Test 3: Tool result response
print("\n" + "=" * 60)
print("TEST 3: Responding with Tool Results")
print("=" * 60)

# Simulate tool was called
conversation = [
    {"role": "user", "content": "What's the weather in Paris?"},
    {
        "role": "assistant",
        "content": None,
        "tool_calls": [
            {
                "id": "call_test123",
                "type": "function",
                "function": {
                    "name": "get_weather",
                    "arguments": '{"location": "Paris"}'
                }
            }
        ]
    },
    {
        "role": "tool",
        "tool_call_id": "call_test123",
        "name": "get_weather",
        "content": "The weather in Paris is sunny, 22°C"
    }
]

response = requests.post(
    f"{BASE_URL}/chat/completions",
    headers={"Authorization": f"Bearer {API_KEY}"},
    json={
        "model": "openai/gpt-oss-120b",
        "messages": conversation,
        "tools": tools
    }
)

print(f"Status: {response.status_code}")
if response.status_code == 200:
    result = response.json()
    message = result['choices'][0]['message']
    print(f"Content: {message.get('content')}")
    print(f"Content empty?: {not message.get('content')}")
else:
    print(f"Error: {response.text}")

print("\n" + "=" * 60)
print("TESTING COMPLETE")
print("=" * 60)
