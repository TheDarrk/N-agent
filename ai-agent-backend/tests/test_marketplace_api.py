import pytest
import os
import sys
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import init_db

@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as c:
        yield c

def test_api_marketplace_flow(client):
    # 1. Test listing (initially real database listings)
    res = client.get("/api/marketplace/agents")
    assert res.status_code == 200
    data = res.json()
    assert "agents" in data

    # 2. Publish a Trader agent via HTTP
    pub_payload = {
        "creator_wallet": "api_trader.testnet",
        "agent_type": "trader",
        "name": "API Scalper Pro",
        "description": "Momentum scalper running via API",
        "pricing_type": "profit_share",
        "pricing_value": 14.0,
        "config_snapshot": {"timeframe": "15m", "min_confidence": 80}
    }
    pub_res = client.post("/api/marketplace/publish", json=pub_payload)
    assert pub_res.status_code == 200
    listing = pub_res.json()["listing"]
    listing_id = listing["listing_id"]
    assert listing["creator_wallet"] == "api_trader.testnet"

    # 3. Moderator agent publication should be rejected with 400
    mod_payload = {
        "creator_wallet": "admin.testnet",
        "agent_type": "moderator",
        "name": "Should Fail",
        "description": "Moderator cannot be published",
        "pricing_type": "profit_share",
        "pricing_value": 10.0
    }
    mod_res = client.post("/api/marketplace/publish", json=mod_payload)
    assert mod_res.status_code == 400
    assert "Moderator Watchdog agent is platform-reserved" in mod_res.json()["detail"]

    # 4. Hire the agent via HTTP
    hire_payload = {
        "subscriber_wallet": "api_subscriber.testnet",
        "listing_id": listing_id
    }
    hire_res = client.post("/api/marketplace/hire", json=hire_payload)
    assert hire_res.status_code == 200
    hire_data = hire_res.json()
    assert hire_data["success"] is True
    hire_id = hire_data["hire_id"]

    # 5. Fetch user hires
    hires_res = client.get("/api/marketplace/hires/api_subscriber.testnet")
    assert hires_res.status_code == 200
    hires_data = hires_res.json()
    assert "my_hires" in hires_data
    assert any(h["listing_id"] == listing_id for h in hires_data["my_hires"])

    # 6. Cancel hire
    cancel_payload = {
        "subscriber_wallet": "api_subscriber.testnet",
        "hire_id": hire_id
    }
    cancel_res = client.post("/api/marketplace/hire/cancel", json=cancel_payload)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["success"] is True
