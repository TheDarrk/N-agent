"""
Neptune AI v2   Decentralized Storage Layer
Uploads reasoning traces to Storacha (IPFS/Filecoin).
Separate module: does NOT touch existing chat/swap logic.
"""

import json
import os
import hashlib
from typing import Dict, Any, Optional
from datetime import datetime


#   Configuration  

STORACHA_CONFIGURED = False  # Set to True once Storacha credentials are set up


#   Local Fallback Storage  

LOGS_DIR = os.path.join(os.path.dirname(__file__), "reasoning_logs")


def _ensure_logs_dir():
    os.makedirs(LOGS_DIR, exist_ok=True)


def _generate_local_cid(data: Dict) -> str:
    """Generate a mock CID from content hash (for local storage fallback)."""
    content = json.dumps(data, sort_keys=True)
    hash_hex = hashlib.sha256(content.encode()).hexdigest()
    return f"local_{hash_hex[:32]}"


#   Upload Functions  

async def upload_reasoning_trace(trace: Dict[str, Any]) -> Optional[str]:
    """
    Upload a reasoning trace to decentralized storage.
    Tries Storacha first, then Lighthouse/Filecoin, falls back to local.
    Returns the CID.
    """
    # Try Storacha
    if STORACHA_CONFIGURED:
        try:
            cid = await _upload_to_storacha(trace)
            if cid:
                return cid
        except Exception as e:
            print(f"[STORAGE] Storacha upload failed: {e}")

    # Fallback: save locally and return a local content hash
    return _save_locally(trace)


async def _upload_to_storacha(trace: Dict) -> Optional[str]:
    """
    Upload to Storacha via the Python client.
    Requires: pip install storacha
    And running: storacha login <email> (one-time setup)
    """
    try:
        # Dynamic import   only if storacha is installed
        from storacha.client import Client

        client = Client()
        blob = json.dumps(trace, indent=2).encode('utf-8')
        result = await client.upload(blob)
        cid = str(result)
        print(f"[STORAGE] Uploaded to Storacha   CID: {cid}")
        return cid
    except ImportError:
        print("[STORAGE] Storacha client not installed (pip install storacha)")
        return None
    except Exception as e:
        print(f"[STORAGE] Storacha error: {e}")
        return None


def _save_locally(trace: Dict) -> str:
    """Save reasoning trace as a local JSON file and return content hash."""
    _ensure_logs_dir()
    local_cid = _generate_local_cid(trace)
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    filename = f"trace_{timestamp}_{local_cid[:12]}.json"
    filepath = os.path.join(LOGS_DIR, filename)

    with open(filepath, 'w') as f:
        json.dump(trace, f, indent=2)

    print(f"[STORAGE] Saved locally: {filename} (CID: {local_cid})")
    return local_cid


#   Retrieval  

async def get_trace_by_cid(cid: str) -> Optional[Dict]:
    """Retrieve a reasoning trace by CID."""
    # Check local storage first
    if cid.startswith("local_"):
        return _get_local_trace(cid)

    # Try Storacha gateway
    if STORACHA_CONFIGURED:
        try:
            import httpx
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.get(f"https://w3s.link/ipfs/{cid}")
                if resp.status_code == 200:
                    return resp.json()
        except Exception as e:
            print(f"[STORAGE] IPFS retrieval failed: {e}")

    return None


def _get_local_trace(cid: str) -> Optional[Dict]:
    """Find a local trace file matching the CID."""
    _ensure_logs_dir()
    short_cid = cid.replace("local_", "")[:12]
    for filename in os.listdir(LOGS_DIR):
        if short_cid in filename:
            filepath = os.path.join(LOGS_DIR, filename)
            with open(filepath, 'r') as f:
                return json.load(f)
    return None


#   Status  

def get_storage_status() -> Dict:
    """Get storage configuration status."""
    _ensure_logs_dir()
    local_count = len([f for f in os.listdir(LOGS_DIR) if f.endswith('.json')])
    return {
        "storacha_configured": STORACHA_CONFIGURED,
        "local_traces_count": local_count,
        "storage_path": LOGS_DIR
    }
