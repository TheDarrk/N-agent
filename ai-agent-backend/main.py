from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from contextlib import asynccontextmanager

import uuid
import uvicorn
import os
import sys
import io
import logging
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Force UTF-8 for stdout/stderr to prevent crashes on Windows with Unicode characters
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)


# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Import our Agent logic
from agents import process_message
from knowledge_base import get_available_tokens_from_api, format_token_list_for_display

# Import v2 autonomy modules (additive   does NOT touch existing logic)
from database import (
    init_db, get_user, upsert_user, add_strategy,
    get_active_strategies, deactivate_strategy,
    get_agent_logs, activate_kill_switch, deactivate_kill_switch,
    save_agent_key, get_agent_key, get_all_agent_keys,
    update_agent_key_status, delete_agent_key, delete_all_user_agent_keys
)
from key_manager import (
    generate_near_keypair, generate_evm_keypair, generate_flow_keypair,
    encrypt_private_key, get_near_implicit_address
)

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)

# Suppress noisy polling logs (GET requests from 10s frontend polling)
class _PollFilter(logging.Filter):
    _QUIET = ["/api/settings/", "/api/strategies/", "/api/logs/",
              "/api/agent-wallet/keys/", "/api/agent-wallet/balance/"]
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not ("GET" in msg and any(p in msg for p in self._QUIET))

logging.getLogger("uvicorn.access").addFilter(_PollFilter())

# -- App Lifespan (init DB + autonomy scheduler) ------------------
@asynccontextmanager
async def lifespan(app):
    """Startup: init database + start autonomy scheduler."""
    # Initialize SQLite database
    init_db()
    print("[STARTUP] Neptune database ready")
    
    # Pre-fetch token list so the autonomy engine can map contracts -> symbols
    try:
        await get_available_tokens_from_api()
    except Exception as e:
        print(f"[STARTUP] Warning: Failed to pre-fetch tokens: {e}")

    # Start autonomy engine (background scheduler)
    scheduler = None
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        from autonomy_engine import check_all_strategies

        scheduler = AsyncIOScheduler()
        scheduler.add_job(
            check_all_strategies,
            'interval',
            seconds=30,
            id='strategy_check',
            replace_existing=True
        )
        scheduler.start()
        print("[STARTUP] Autonomy engine started (every 30 sec)")
    except ImportError:
        print("[STARTUP] APScheduler not installed   autonomy engine disabled")
    except Exception as e:
        print(f"[STARTUP] Autonomy engine error: {e}")

    yield  # App is running

    # Shutdown
    if scheduler:
        scheduler.shutdown()
        print("[SHUTDOWN] Autonomy engine stopped")


app = FastAPI(title="Neptune AI Agent", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Strict CORS Policy (Production Only)
ORIGINS = [
    "https://neptuneai-agent.vercel.app",
    "https://neptune-ai-agent.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
]


app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    print(f"DEBUG: {request.method} {request.url.path}")
    response = await call_next(request)
    return response


from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"  Validation Error: {exc.errors()}")
    try:
        body = await request.json()
        print(f"  Received Body: {body}")
    except:
        print("  Could not read body")
        
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(exc)},
    )

# In-memory session store
sessions: Dict[str, Dict[str, Any]] = {}

class ChatRequest(BaseModel):
    message: str
    session_id: str
    account_id: Optional[str] = None
    wallet_addresses: Optional[Dict[str, str]] = None
    connected_chains: Optional[List[str]] = None
    balances: Optional[Dict[str, Union[str, float, int]]] = None
    wallet_type: Optional[str] = "hotkit"

class ChatResponse(BaseModel):
    response: str
    action: Optional[str] = None
    payload: Optional[Union[Dict[str, Any], List[Any]]] = None

# ==================================================================
# EXISTING ENDPOINTS (unchanged)
# ==================================================================

@app.get("/api/health")
async def health_check():
    """
    Lightweight keep-alive endpoint for external ping services (like UptimeRobot)
    to prevent free-tier hosting services (like Render) from sleeping the background engine.
    """
    return {"status": "ok", "engine": "running"}

@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat_endpoint(body: ChatRequest, request: Request):
    session_id = body.session_id
    user_msg = body.message
    
    if session_id not in sessions:
        sessions[session_id] = {
            "history": [],
            "state": {"step": "IDLE"}
        }
    
    session_data = sessions[session_id]
    current_state = session_data["state"]
    history = session_data["history"]
    
    wallet_addresses = body.wallet_addresses or {}
    connected_chains = list(wallet_addresses.keys()) if wallet_addresses else []
    
    user_context = {
        "account_id": body.account_id,
        "connected_chains": connected_chains,
        "wallet_addresses": wallet_addresses,
        "balances": body.balances or {},
        "wallet_type": body.wallet_type or "hotkit",
        "history": history
    }
    result = await process_message(user_msg, current_state, user_context)
    
    session_data["state"] = result.get("new_state", {"step": "IDLE"})
    
    import re
    ai_text = re.sub(r'[^\x00-\x7F]+', ' ', result["response"])
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "ai", "content": ai_text})

    if len(history) > 20:
        session_data["history"] = history[-20:]

    return ChatResponse(
        response=ai_text,
        action=result.get("action"),
        payload=result.get("payload")
    )

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.get("/tokens")
async def get_tokens():
    try:
        tokens = await get_available_tokens_from_api()
        return {"tokens": tokens, "count": len(tokens)}
    except Exception as e:
        return {"error": str(e), "tokens": [], "count": 0}


# ==================================================================
# v2 AUTONOMY ENDPOINTS (all new   does NOT touch existing logic)
# ==================================================================

class SettingsRequest(BaseModel):
    wallet_address: str
    autonomy_level: Optional[int] = None
    max_tx_amount: Optional[float] = None
    daily_limit: Optional[float] = None
    risk_profile: Optional[str] = None
    allowed_tokens: Optional[str] = None
    agent_wallet: Optional[str] = None
    notification_email: Optional[str] = None

class StrategyRequest(BaseModel):
    wallet_address: str
    strategy_type: str
    trigger_condition: Dict[str, Any]
    schedule: Optional[str] = "every_10m"

class StrategyParseRequest(BaseModel):
    wallet_address: str
    strategy_type: str  # "price_alert", "stop_loss", "rebalance"
    nlp_text: str       # Natural language description

class AgentWalletRequest(BaseModel):
    wallet_address: str  # User's main wallet
    agent_wallet: str    # Separate wallet for agent actions


@app.get("/api/settings/{wallet_address}")
async def get_settings(wallet_address: str):
    """Get user autonomy settings."""
    user = get_user(wallet_address)
    if not user:
        user = upsert_user(wallet_address)
    return user


@app.post("/api/settings")
async def update_settings(body: SettingsRequest):
    """Update user autonomy settings."""
    settings = {}
    if body.autonomy_level is not None:
        settings['autonomy_level'] = body.autonomy_level
    if body.max_tx_amount is not None:
        settings['max_tx_amount'] = body.max_tx_amount
    if body.daily_limit is not None:
        settings['daily_limit'] = body.daily_limit
    if body.risk_profile is not None:
        settings['risk_profile'] = body.risk_profile
    if body.allowed_tokens is not None:
        settings['allowed_tokens'] = body.allowed_tokens
    if body.agent_wallet is not None:
        settings['agent_wallet'] = body.agent_wallet
    if body.notification_email is not None:
        settings['notification_email'] = body.notification_email

    user = upsert_user(body.wallet_address, settings)
    return {"status": "updated", "user": user}


@app.get("/api/strategies/{wallet_address}")
async def get_strategies(wallet_address: str):
    """Get active strategies for a user."""
    strategies = get_active_strategies(wallet_address)
    return {"strategies": strategies, "count": len(strategies)}


@app.post("/api/strategies")
async def create_strategy(body: StrategyRequest):
    """Create a new strategy rule."""
    # Ensure user exists
    upsert_user(body.wallet_address)
    strategy_id = add_strategy(
        user_wallet=body.wallet_address,
        strategy_type=body.strategy_type,
        trigger_condition=body.trigger_condition,
        schedule=body.schedule or "every_10m"
    )
    return {"status": "created", "strategy_id": strategy_id}


@app.post("/api/strategies/parse")
async def parse_strategy(body: StrategyParseRequest):
    """Parse NLP text into a strategy using LLM."""
    import json as _json
    try:
        from langchain_openai import ChatOpenAI
        from langchain_core.messages import SystemMessage, HumanMessage

        import os
        api_key = os.getenv("NEAR_AI_API_KEY")

        llm = ChatOpenAI(
            model="openai/gpt-oss-120b",
            temperature=0,
            openai_api_key=api_key,
            openai_api_base="https://cloud-api.near.ai/v1"
        )

        parse_prompt = f"""Extract strategy parameters from this natural language description.
Strategy type: {body.strategy_type}
User text: "{body.nlp_text}"

Return ONLY valid JSON with these fields based on strategy type:
- price_alert: {{"token": "near", "threshold_pct": 5, "direction": "drop" or "surge"}}
- stop_loss: {{"token": "near", "drop_pct": 15}}
- rebalance: {{"drift_pct": 10, "target": {{"near": 50, "usdt": 50}}}}

IMPORTANT RULES:
- For rebalance: use ONLY the tokens the user mentioned. If they say "50% NEAR 50% USDT", return target with just near and usdt
- drift_pct defaults to 10 if not mentioned by user
- Token names should be lowercase in the JSON
- The target percentages MUST sum to 100
- Do NOT add tokens the user didn't mention

Return ONLY the JSON object, no markdown or explanation."""

        response = llm.invoke([
            SystemMessage(content="You extract strategy parameters from natural language. Return only valid JSON. Use ONLY the tokens the user explicitly mentions."),
            HumanMessage(content=parse_prompt)
        ])

        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        parsed = _json.loads(raw)

        if "error" in parsed:
            return {"status": "error", "message": parsed["error"]}

        # -- Post-parse validation & defaults --
        # Flatten nested output if the LLM returned e.g. {"rebalance": {...}}
        if body.strategy_type in parsed and isinstance(parsed[body.strategy_type], dict):
            parsed = parsed[body.strategy_type]
        # Default chain if missing
        if "chain" not in parsed:
            parsed["chain"] = "near"
            
        if body.strategy_type == "rebalance":
            # Default drift_pct if missing
            if "drift_pct" not in parsed:
                parsed["drift_pct"] = 10
            # Validate target exists and has >=2 tokens
            target = parsed.get("target", {})
            if len(target) < 2:
                return {"status": "error", "message": "Rebalance needs at least 2 tokens. Try: 'keep 50% NEAR 50% USDT'"}
            total = sum(target.values())
            if total != 100:
                return {"status": "error", "message": f"Target allocation must sum to 100% (got {total}%). Please adjust."}

        # Create the strategy
        upsert_user(body.wallet_address)
        strategy_id = add_strategy(
            user_wallet=body.wallet_address,
            strategy_type=body.strategy_type,
            trigger_condition=parsed,
            schedule="every_10m"
        )
        return {
            "status": "created",
            "strategy_id": strategy_id,
            "parsed_condition": parsed
        }

    except _json.JSONDecodeError:
        return {"status": "error", "message": "Couldn't understand that. Try something like: 'Alert me when BTC drops 5%'"}
    except Exception as e:
        error_msg = str(e).lower()
        if "401" in error_msg or "unauthorized" in error_msg or "api key" in error_msg:
            return {"status": "error", "message": "API Key Required! Please configure a valid NEAR_AI_API_KEY in the backend to use this template."}
        return {"status": "error", "message": f"System Error: Could not process request. Check backend logs."}


@app.post("/api/agent-wallet")
async def bind_agent_wallet(body: AgentWalletRequest):
    """Bind a separate wallet for agent autonomous actions."""
    user = upsert_user(body.wallet_address, {"agent_wallet": body.agent_wallet})
    return {"status": "bound", "agent_wallet": body.agent_wallet, "user": user}


@app.delete("/api/agent-wallet/{wallet_address}")
async def unbind_agent_wallet(wallet_address: str):
    """Remove the agent wallet binding."""
    user = upsert_user(wallet_address, {"agent_wallet": ""})
    return {"status": "unbound", "user": user}


@app.delete("/api/strategies/{strategy_id}")
async def delete_strategy(strategy_id: int):
    """Deactivate a strategy."""
    found = deactivate_strategy(strategy_id)
    if not found:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return {"status": "deactivated", "strategy_id": strategy_id}


@app.get("/api/logs/{wallet_address}")
async def get_logs(wallet_address: str, limit: int = 50):
    """Get agent decision logs for a user."""
    logs = get_agent_logs(wallet_address, limit=limit)
    return {"logs": logs, "count": len(logs)}


@app.post("/api/kill-switch/{wallet_address}")
async def kill_switch(wallet_address: str, activate: bool = True):
    """Emergency stop   halt all autonomous actions."""
    if activate:
        activate_kill_switch(wallet_address)
        return {"status": "kill_switch_activated", "wallet": wallet_address}
    else:
        deactivate_kill_switch(wallet_address)
        return {"status": "kill_switch_deactivated", "wallet": wallet_address}


@app.get("/api/autonomy-status")
async def autonomy_status():
    """Get overall autonomy engine status."""
    try:
        from autonomy_engine import get_autonomy_status
        status = await get_autonomy_status()
        return status
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/storage-status")
async def storage_status():
    """Get decentralized storage status."""
    try:
        from decentralized_storage import get_storage_status
        return get_storage_status()
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/api/reasoning-trace/{cid}")
async def get_reasoning_trace(cid: str):
    """Retrieve a reasoning trace by CID."""
    try:
        from decentralized_storage import get_trace_by_cid
        trace = await get_trace_by_cid(cid)
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")
        return trace
    except HTTPException:
        raise
    except Exception as e:
        return {"error": str(e)}

# ===================================================================
# Agent Wallet Endpoints (agent gets its own wallet)
# ===================================================================

@app.get("/api/agent-wallet/propose/{wallet_address}")
async def propose_agent_key(wallet_address: str, chain: str = "near"):
    """
    Proposes a new agent keypair. The agent stores the encrypted private key
    and returns the public key for the user to add as an access key on-chain.
    """
    from key_manager import generate_near_keypair, generate_evm_keypair, generate_flow_keypair
    from key_manager import encrypt_private_key
    from database import save_agent_key

    chain = chain.lower()
    if chain == "near":
        keypair = generate_near_keypair()
    elif chain == "evm":
        keypair = generate_evm_keypair()
    elif chain == "flow":
        keypair = generate_flow_keypair()
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported chain: {chain}")

    # Store as pending
    encrypted_priv = encrypt_private_key(keypair["private_key"])
    key_id = save_agent_key(
        user_wallet=wallet_address,
        chain_type=chain,
        public_key=keypair["public_key"],
        encrypted_private_key=encrypted_priv,
        scope="function_call"
    )

    # Create a NEAR transaction payload for the frontend to sign (AddKey)
    sign_payload = None
    if chain == "near":
        sign_payload = {
            "receiver_id": wallet_address,
            "receiverId": wallet_address,
            "actions": [
                {
                    "type": "AddKey",
                    "params": {
                        # Provide both camelCase and snake_case for maximum wallet compatibility
                        "publicKey": keypair["public_key"],
                        "public_key": keypair["public_key"],
                        "accessKey": {
                            "permission": "FullAccess"
                        },
                        "access_key": {
                            "permission": "FullAccess"
                        }
                    }
                }
            ]
        }

    return {
        "key_id": key_id,
        "public_key": keypair["public_key"],
        "chain_type": chain,
        "status": "pending",
        "sign_payload": sign_payload,
        "message": "Public key generated. Please sign the transaction to authorize the agent on-chain."
    }

@app.post("/api/agent-wallet/create")
async def legacy_create_agent_wallet(body: SettingsRequest):
    """
    Legacy endpoint for backward compatibility with older frontends.
    Maps to the new 'propose' logic.
    """
    return await propose_agent_key(body.wallet_address)


class ActivateAgentKeyRequest(BaseModel):


    key_id: int
    agent_account_id: str
    tx_hash: str = ""

@app.post("/api/agent-wallet/activate")
async def activate_agent_key(body: ActivateAgentKeyRequest):
    """
    Finalizes agent key activation after the user has authorized it on-chain.
    """
    from database import update_agent_key_status
    update_agent_key_status(
        key_id=body.key_id,
        status="active",
        tx_hash=body.tx_hash,
        agent_account_id=body.agent_account_id
    )
    return {"status": "active", "message": f"Agent key #{body.key_id} is now active for {body.agent_account_id}"}



@app.get("/api/agent-wallet/keys/{wallet_address}")
async def list_agent_keys(wallet_address: str):
    """List all agent wallets for a user."""
    keys = get_all_agent_keys(wallet_address)
    # Enrich with wallet addresses
    for k in keys:
        if k.get("agent_account_id"):
            k["agent_wallet_address"] = k["agent_account_id"]
        elif k["chain_type"] == "near" and k["public_key"].startswith("ed25519:"):
            k["agent_wallet_address"] = get_near_implicit_address(k["public_key"])
        else:
            k["agent_wallet_address"] = k["public_key"]
    return {"keys": keys}



@app.get("/api/agent-wallet/balance/{address}")
async def get_agent_wallet_balance(address: str, chain: str = "near"):
    """Check the balance of an agent wallet via RPC. Supports near, evm, flow."""
    import requests as req
    try:
        if chain == "near":
            rpc_url = os.getenv("NEAR_RPC_URL", "https://rpc.mainnet.near.org")
            resp = req.post(rpc_url, json={
                "jsonrpc": "2.0", "id": "1", "method": "query",
                "params": {"request_type": "view_account", "finality": "final", "account_id": address}
            }, timeout=10)
            result = resp.json().get("result", {})
            if "error" in result:
                return {"balance": "0", "formatted": "0 NEAR", "exists": False}
            amount = result.get("amount", "0")
            near_bal = int(amount) / 1e24
            return {"balance": amount, "formatted": f"{near_bal:.4f} NEAR", "exists": True}

        elif chain == "evm":
            rpc_url = os.getenv("ETH_RPC_URL", "https://eth.llamarpc.com")
            resp = req.post(rpc_url, json={
                "jsonrpc": "2.0", "id": 1, "method": "eth_getBalance",
                "params": [address, "latest"]
            }, timeout=10)
            result = resp.json().get("result", "0x0")
            wei = int(result, 16)
            eth_bal = wei / 1e18
            return {"balance": str(wei), "formatted": f"{eth_bal:.6f} ETH", "exists": wei > 0}

        elif chain == "flow":
            # Flow Access API
            api_url = os.getenv("FLOW_API_URL", "https://rest-mainnet.onflow.org")
            resp = req.get(f"{api_url}/v1/accounts/{address}", timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                balance = int(data.get("balance", "0"))
                flow_bal = balance / 1e8  # Flow uses 8 decimals
                return {"balance": str(balance), "formatted": f"{flow_bal:.4f} FLOW", "exists": True}
            return {"balance": "0", "formatted": "0 FLOW", "exists": False}

        else:
            return {"balance": "0", "formatted": "0", "exists": False, "error": f"Unsupported chain: {chain}"}
    except Exception as e:
        symbol = "NEAR" if chain == "near" else "ETH" if chain == "evm" else "FLOW"
        return {"balance": "0", "formatted": f"0 {symbol}", "exists": False, "error": str(e)}


class DeleteAgentWalletRequest(BaseModel):
    wallet_address: str
    key_id: int

@app.delete("/api/agent-wallet/remove")
@app.post("/api/agent-wallet/remove")
async def remove_agent_wallet(body: DeleteAgentWalletRequest):
    """Remove an agent wallet definitively and clear user settings."""
    print(f"[API] Remove request for user: {body.wallet_address}, key_id: {body.key_id}")
    
    from database import delete_agent_key, clear_user_agent_wallet, delete_all_user_agent_keys
    
    # 1. Delete the specific key if provided
    if body.key_id > 0:
        delete_agent_key(body.key_id)
        
    # 2. To be completely sure UI is clean, delete ALL keys for this wallet
    delete_all_user_agent_keys(body.wallet_address)
    
    # 3. Clear the legacy field in users table
    clear_user_agent_wallet(body.wallet_address)
    
    return {
        "status": "removed", 
        "message": f"Agent data completely wiped for {body.wallet_address}. Please refresh your dashboard."
    }






if __name__ == "__main__":
    if not os.getenv("NEAR_AI_API_KEY"):
        print("WARNING: NEAR_AI_API_KEY not found in environment variables. Agent will fail.")

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
