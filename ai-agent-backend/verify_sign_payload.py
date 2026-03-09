import requests
import json

def test_propose_payload():
    url = "http://localhost:8000/api/agent-wallet/propose/thedarrrk.near"
    print(f"Testing {url}...")
    try:
        response = requests.get(url)
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("\n--- Response Sample ---")
            print(json.dumps(data, indent=2))
            
            if "sign_payload" in data and data["sign_payload"]:
                print("\nSUCCESS: Found sign_payload!")
                payload = data["sign_payload"]
                if payload.get("receiverId") == "thedarrrk.near" and len(payload.get("actions", [])) > 0:
                    print("SUCCESS: Payload structure looks correct.")
                else:
                    print("ERROR: Payload structure is invalid.")
            else:
                print("\nERROR: sign_payload missing from response.")
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Connection failed (is backend running?): {e}")

if __name__ == "__main__":
    test_propose_payload()
