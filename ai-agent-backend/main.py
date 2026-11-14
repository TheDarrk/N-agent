from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta

import json
import uuid
import asyncio
import uvicorn
import os
import time
import sys
import io
import logging
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Force UTF-8 for stdout/stderr to prevent crashes on Windows with Unicode characters
if sys.platform == "win32" and "pytest" not in sys.modules:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', line_buffering=True)


# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

# Make INFO-level app logs (scheduler, marketplace, research seeding...) visible in Render's log stream.
if not logging.getLogger().handlers and "pytest" not in sys.modules:
    logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
for _noisy in ("httpx", "httpcore", "urllib3", "hpack"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)
logger = logging.getLogger("main")

load_dotenv(override=True)

# Import our Agent logic
from agents import process_message
from knowledge_base import get_available_tokens_from_api, format_token_list_for_display

# Import v2 autonomy modules (additive   does NOT touch existing logic)
from database import (
    init_db, get_user, upsert_user, add_strategy,
    get_active_strategies, deactivate_strategy,
    get_agent_logs, activate_kill_switch, deactivate_kill_switch,
    save_agent_key, get_agent_key, get_all_agent_keys,
    update_agent_key_status, delete_agent_key, delete_all_user_agent_keys,
    create_run, append_run_event, get_run_events, finish_run, get_run,
    list_runs, mark_stale_runs_failed, normalize_wallet
)
from key_manager import (
    generate_near_keypair, generate_evm_keypair, generate_flow_keypair,
    encrypt_private_key, get_near_implicit_address
)

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)

# Suppress noisy polling logs (GET requests from periodic frontend polling)
class _PollFilter(logging.Filter):
    _QUIET = [
        "/api/settings", "/api/strategies", "/api/logs",
        "/api/agent-wallet", "/api/fleet", "/api/trader",
        "/health", "/api/health"
    ]
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not ("GET" in msg and any(p in msg for p in self._QUIET))

logging.getLogger("uvicorn.access").addFilter(_PollFilter())
logging.getLogger("apscheduler").setLevel(logging.ERROR)
logging.getLogger("apscheduler.executors.default").setLevel(logging.ERROR)

GLOBAL_SCHEDULER: Optional[Any] = None
# Background jobs run on Render by default; locally only when RUN_SCHEDULER=1 (local + Render share one Turso DB).
SCHEDULER_ENABLED = os.getenv("RUN_SCHEDULER", "1" if os.getenv("RENDER") else "0").strip() == "1"
# Two poller speeds. FREQUENT = time-sensitive (due agent runs, strategy triggers); LAZY = everything else.
FREQUENT_POLL_SECONDS = max(10, int(os.getenv("FREQUENT_POLL_SECONDS", "30")))
LAZY_POLL_SECONDS = max(60, int(os.getenv("LAZY_POLL_SECONDS", "300")))

# -- App Lifespan (init DB + autonomy scheduler) ------------------
@asynccontextmanager
async def lifespan(app):
    """Startup: init database + start autonomy scheduler."""
    global GLOBAL_SCHEDULER
    # Check if running on Render without Turso persistence (TASK 1 Step 6)
    is_render = bool(os.getenv("RENDER"))
    from database import DB_PATH, get_connection, is_turso_enabled, mark_stale_runs_failed, init_db, update_run_heartbeat
    if is_render and not is_turso_enabled():
        logger.warning(
            "\n"
            "********************************************************************************\n"
            "[CRITICAL WARNING: EPHEMERAL STORAGE DETECTED ON RENDER]\n"
            "Backend is running on Render free tier WITHOUT Turso (libSQL) cloud persistence!\n"
            "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are not configured.\n"
            "All SQLite data and agent runs WILL BE PERMANENTLY LOST on spin-down or redeploy!\n"
            "To fix, create a free Turso database at https://turso.tech and configure:\n"
            "  TURSO_DATABASE_URL=libsql://<your-db>.turso.io\n"
            "  TURSO_AUTH_TOKEN=<your-token>\n"
            "********************************************************************************\n"
        )

    # Initialize SQLite databases (Core DB + Dedicated Chat History DB)
    init_db()
    try:
        from database.chat_db import init_chat_db
        init_chat_db()
    except Exception as ce:
        print(f"[STARTUP] Warning: Failed to init chat database: {ce}")
    
    # Mark stale running tasks as failed from previous server crashes and log storage health & downtime
    try:
        downtime_info = mark_stale_runs_failed()
        conn = get_connection()
        runs_count = conn.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0]
        conn.close()
        backend_type = "turso" if is_turso_enabled() else "local"
        print(f"[STARTUP: STORAGE] Engine: {backend_type} | Resolved DB path: {os.path.abspath(DB_PATH)} | Total agent_runs in DB: {runs_count}")
        if downtime_info.get("downtime_seconds") is not None:
            print(f"[STARTUP: RECOVERY] Estimated service downtime: {downtime_info['downtime_seconds']}s | Stale runs marked failed: {downtime_info.get('stale_count', 0)}")
    except Exception as re:
        print(f"[STARTUP] Warning: Failed to clean stale runs: {re}")

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
        if not SCHEDULER_ENABLED:
            logger.warning("[STARTUP] Background pollers DISABLED on this instance (not on Render and RUN_SCHEDULER!=1). "
                           "Set RUN_SCHEDULER=1 to enable. This prevents a local server from double-running the shared database's jobs.")
        else:
            # FREQUENT poller: time-sensitive work that must keep being checked (due agent runs, strategy triggers).
            scheduler.add_job(
                frequent_poll_tick, 'interval', seconds=FREQUENT_POLL_SECONDS, id='frequent_poller',
                max_instances=1, misfire_grace_time=3600, coalesce=True, replace_existing=True
            )
            # LAZY poller: everything else (moderator cadence, expired marketplace orders, housekeeping).
            scheduler.add_job(
                lazy_poll_tick, 'interval', seconds=LAZY_POLL_SECONDS, id='lazy_poller',
                max_instances=1, misfire_grace_time=3600, coalesce=True, replace_existing=True
            )
            scheduler.start()
            GLOBAL_SCHEDULER = scheduler
            print(f"[STARTUP] Pollers started: frequent every {FREQUENT_POLL_SECONDS}s (due agent runs + strategy triggers), "
                  f"lazy every {LAZY_POLL_SECONDS}s (moderator cadence, order expiry, housekeeping)")
            # Immediate catch-up pass after boot (jobs that came due while the service was asleep)
            asyncio.create_task(frequent_poll_tick())
            asyncio.create_task(lazy_poll_tick())
    except ImportError:
        print("[STARTUP] APScheduler not installed   autonomy engine disabled")
    except Exception as e:
        print(f"[STARTUP] Autonomy engine error: {e}")

    yield  # App is running

    # Shutdown
    if scheduler and GLOBAL_SCHEDULER:
        scheduler.shutdown()
        GLOBAL_SCHEDULER = None
        print("[SHUTDOWN] Autonomy engine stopped")


app = FastAPI(title="Neptune AI Agent", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Mount Global Marketplace Router (USDT On-Chain Verified)
from marketplace_router import router as marketplace_router
app.include_router(marketplace_router)

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
    # Silence noisy periodic polling GET endpoints from frontend
    _QUIET = [
        "/api/fleet", "/api/trader", "/api/agent-wallet",
        "/api/settings", "/api/strategies", "/api/logs",
        "/health", "/api/health", "/v1/models"
    ]
    if not (request.method == "GET" and any(p in request.url.path for p in _QUIET)):
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
# OPENAI-COMPATIBLE ENDPOINTS
# ==================================================================

@app.get("/v1/models")
async def list_models():
    """
    OpenAI-compatible models endpoint for GLM 5.3 Flash.
    """
    return {
        "object": "list",
        "data": [
            {
                "id": "z-ai/glm-5.3-flash",
                "object": "model",
                "created": 1700000000,
                "owned_by": "near-ai",
                "permission": [],
                "root": "z-ai/glm-5.3-flash",
                "parent": None,
            }
        ]
    }


# ==================================================================
# EXISTING ENDPOINTS (unchanged)
# ==================================================================

@app.get("/")
@app.head("/")
async def root_health():
    """Root health check for cloud deployment platforms like Render."""
    return {"status": "healthy", "service": "Neptune AI Backend", "version": "2.0.0"}


@app.get("/api/health")
async def api_health_check():
    """
    Fast, non-blocking health check for external pingers (every 5 min) with zero DB load.
    Complies with Render free tier keep-alive (TASK 3 Step 1).
    """
    return {
        "status": "healthy",
        "service": "Neptune AI Backend",
        "version": "2.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@app.get("/api/health/db")
async def api_health_db_check():
    """Returns detailed database spacing, unique wallets count, log breakdown, open trades."""
    from database import get_database_health
    return get_database_health()

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

    # Persist the conversational turn to persistent chat_messages table per wallet
    target_wallet = normalize_wallet(body.account_id or (wallet_addresses.get("near") if wallet_addresses else ""))
    if target_wallet:
        try:
            from database.dal import save_chat_message
            save_chat_message(wallet=target_wallet, role="user", content=user_msg)
            save_chat_message(wallet=target_wallet, role="assistant", content=ai_text)
        except Exception as ce:
            print(f"[CHAT PERSISTENCE] Message persistence notice: {ce}")

    return ChatResponse(
        response=ai_text,
        action=result.get("action"),
        payload=result.get("payload")
    )

@app.get("/api/chat/history/{wallet_address}")
def get_chat_history_endpoint(wallet_address: str):
    """Return persistent chat history for a normalized user wallet."""
    from database.connection import normalize_wallet
    from database.dal import get_chat_history
    norm_wallet = normalize_wallet(wallet_address)
    if not norm_wallet:
        raise HTTPException(status_code=400, detail="Valid wallet address is required to access chat history")
    raw_msgs = get_chat_history(norm_wallet, limit=100)
    if not raw_msgs:
        try:
            from database.chat_db import get_recent_chats
            legacy_turns = get_recent_chats(norm_wallet, limit=10)
            if legacy_turns:
                legacy_messages = []
                for t in legacy_turns:
                    legacy_messages.append({"id": f"turn_{t['id']}_u", "role": "user", "content": t["human_message"], "created_at": t["created_at"]})
                    if t.get("ai_message"):
                        legacy_messages.append({"id": f"turn_{t['id']}_a", "role": "ai", "content": t["ai_message"], "created_at": t["created_at"]})
                return {
                    "status": "success",
                    "wallet": norm_wallet,
                    "messages": legacy_messages,
                    "history": legacy_turns
                }
        except Exception:
            pass
    
    messages = [
        {
            "id": m["message_id"],
            "role": "ai" if m["role"] == "assistant" else "user",
            "content": m["content"],
            "created_at": m["created_at"]
        }
        for m in raw_msgs
    ]
    
    # Group the single saved stream into conversations: a gap of 30+ minutes starts a new one, so the sidebar can
    # re-open a whole conversation (all its turns) instead of one question/answer pair.
    def _ts(m):
        try:
            return datetime.fromisoformat(str(m["created_at"]).replace("Z", "+00:00").replace(" ", "T"))
        except Exception:
            return None

    conv_ids = []
    conv_n, prev_dt = 0, None
    for m in raw_msgs:
        dt = _ts(m)
        if prev_dt is not None and dt is not None and (dt - prev_dt).total_seconds() > 1800:
            conv_n += 1
        conv_ids.append(f"conv-{conv_n}")
        prev_dt = dt or prev_dt

    turns = []
    i = 0
    while i < len(raw_msgs):
        conv_id = conv_ids[i]
        if raw_msgs[i]["role"] == "user":
            h_msg = raw_msgs[i]["content"]
            ai_msg = ""
            created_at = raw_msgs[i]["created_at"]
            if i + 1 < len(raw_msgs) and raw_msgs[i+1]["role"] == "assistant":
                ai_msg = raw_msgs[i+1]["content"]
                i += 1
            turns.append({
                "id": len(turns) + 1,
                "wallet_address": norm_wallet,
                "human_message": h_msg,
                "ai_message": ai_msg,
                "session_id": conv_id,
                "created_at": created_at
            })
        elif raw_msgs[i]["role"] == "assistant":
            turns.append({
                "id": len(turns) + 1,
                "wallet_address": norm_wallet,
                "human_message": "(Prompt)",
                "ai_message": raw_msgs[i]["content"],
                "session_id": conv_id,
                "created_at": raw_msgs[i]["created_at"]
            })
        i += 1
    
    return {
        "status": "success",
        "wallet": norm_wallet,
        "messages": messages,
        "history": turns[-60:]
    }

@app.delete("/api/chat/history/{wallet_address}")
async def clear_chat_history_endpoint(wallet_address: str):
    """Clear chat history for a user wallet in persistent database."""
    from database.connection import normalize_wallet
    from database.dal import clear_chat_history
    norm_wallet = normalize_wallet(wallet_address)
    if not norm_wallet:
        raise HTTPException(status_code=400, detail="Valid wallet address is required")
    cleared = clear_chat_history(norm_wallet)
    try:
        from database.chat_db import clear_chat_history as clear_legacy_chat
        clear_legacy_chat(norm_wallet)
    except Exception:
        pass
    return {"status": "success", "cleared": True}

@app.get("/health")
def root_health_check():
    """Fast root health check for container liveness and external pingers."""
    return {
        "status": "healthy",
        "service": "Neptune AI Backend",
        "version": "2.1.0",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

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
    trader_active: Optional[bool] = None
    trader_timeframe: Optional[str] = None
    trader_min_confidence: Optional[int] = None
    trader_risk_profile: Optional[str] = None
    trader_max_trades_per_day: Optional[int] = None
    trader_max_trades_per_week: Optional[int] = None
    trader_coin_mode: Optional[str] = None
    trader_custom_coins: Optional[Any] = None
    trader_enable_researcher: Optional[bool] = None
    trader_min_volume_usd: Optional[float] = None
    trader_min_price_move_pct: Optional[float] = None
    trader_min_atr_pct: Optional[float] = None
    trader_min_risk_reward: Optional[float] = None
    trader_rsi_overbought: Optional[float] = None
    trader_rsi_oversold: Optional[float] = None
    trader_rsi_sweet_min: Optional[float] = None
    trader_rsi_sweet_max: Optional[float] = None
    trader_pro_settings: Optional[Any] = None

class TestEmailRequest(BaseModel):
    wallet_address: str
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
    if body.trader_active is not None:
        settings['trader_active'] = body.trader_active
    if body.trader_timeframe is not None:
        settings['trader_timeframe'] = body.trader_timeframe
    if body.trader_min_confidence is not None:
        settings['trader_min_confidence'] = body.trader_min_confidence
    if body.trader_risk_profile is not None:
        settings['trader_risk_profile'] = body.trader_risk_profile
    if body.trader_max_trades_per_day is not None:
        settings['trader_max_trades_per_day'] = body.trader_max_trades_per_day
    if body.trader_max_trades_per_week is not None:
        settings['trader_max_trades_per_week'] = body.trader_max_trades_per_week
    if body.trader_coin_mode is not None:
        settings['trader_coin_mode'] = body.trader_coin_mode
    if body.trader_custom_coins is not None:
        settings['trader_custom_coins'] = body.trader_custom_coins
    if body.trader_enable_researcher is not None:
        settings['trader_enable_researcher'] = body.trader_enable_researcher
    if body.trader_min_volume_usd is not None:
        settings['trader_min_volume_usd'] = body.trader_min_volume_usd
    if body.trader_min_price_move_pct is not None:
        settings['trader_min_price_move_pct'] = body.trader_min_price_move_pct
    if body.trader_min_atr_pct is not None:
        settings['trader_min_atr_pct'] = body.trader_min_atr_pct
    if body.trader_min_risk_reward is not None:
        settings['trader_min_risk_reward'] = body.trader_min_risk_reward
    if body.trader_rsi_overbought is not None:
        settings['trader_rsi_overbought'] = body.trader_rsi_overbought
    if body.trader_rsi_oversold is not None:
        settings['trader_rsi_oversold'] = body.trader_rsi_oversold
    if body.trader_rsi_sweet_min is not None:
        settings['trader_rsi_sweet_min'] = body.trader_rsi_sweet_min
    if body.trader_rsi_sweet_max is not None:
        settings['trader_rsi_sweet_max'] = body.trader_rsi_sweet_max
    if body.trader_pro_settings is not None:
        settings['trader_pro_settings'] = body.trader_pro_settings

    user = upsert_user(body.wallet_address, settings)
    return {"status": "updated", "user": user}


@app.post("/api/settings/test-email")
async def send_test_email(body: TestEmailRequest):
    """Dispatch a test alert email to verify the user's notification email setup."""
    from notification_agent import send_agent_action_email
    target_wallet = body.wallet_address.strip()
    if body.notification_email:
        upsert_user(target_wallet, {"notification_email": body.notification_email.strip()})

    user = get_user(target_wallet)
    email = user.get("notification_email") if user else None
    if not email:
        return {"status": "error", "message": "No notification email configured for this wallet."}

    sent = await send_agent_action_email(
        user_wallet=target_wallet,
        agent_name="NEPTUNE FLEET",
        action_type="CONFIG_TEST",
        title="Email Notifications Connected",
        summary=f"Neptune AI alert notifications are now successfully connected to {email}. You will receive trade executions, limit order triggers, and watchdog audits here.",
        metrics={"Target Account": target_wallet, "Notification Status": "Active & Verified", "Delivery Protocol": "SMTP (TLS)"},
        reasoning="User triggered test email verification from the Neptune AI side navigation bar.",
        tx_hash=None,
        cid_reference=None
    )
    if sent:
        return {"status": "sent", "email": email}
    else:
        return {"status": "error", "message": "Failed to send email. Verify SMTP settings in backend."}


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
        from langchain_core.messages import SystemMessage, HumanMessage
        from glm_transport import invoke_glm

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

        response = await invoke_glm([
            SystemMessage(content="You extract strategy parameters from natural language. Return only valid JSON. Use ONLY the tokens the user explicitly mentions."),
            HumanMessage(content=parse_prompt)
        ], temperature=0)

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


# ===================================================================
# AGENT MARKETPLACE & 4 SPECIALIZED AGENTS ENDPOINTS
# ===================================================================

class TraderScanRequest(BaseModel):
    user_wallet: str
    symbol: Optional[str] = None
    timeframe: Optional[str] = "1h"
    min_confidence: Optional[int] = 75
    coin_mode: Optional[str] = "auto"
    custom_coins: Optional[List[str]] = None
    enable_researcher_plugin: Optional[bool] = None

class TraderSettingsRequest(BaseModel):
    user_wallet: str
    trader_timeframe: Optional[str] = "1h"
    trader_min_confidence: Optional[int] = 75
    trader_risk_profile: Optional[str] = "moderate"
    trader_max_trades_per_day: Optional[int] = 3
    trader_max_trades_per_week: Optional[int] = 12
    max_tx_amount: Optional[float] = 100.0
    trader_coin_mode: Optional[str] = "auto"
    trader_custom_coins: Optional[str] = ""
    trader_enable_researcher: Optional[int] = 1
    # Pro Trader Screening & Mathematical Filters
    trader_min_volume_usd: Optional[float] = None
    trader_min_price_move_pct: Optional[float] = None
    trader_min_atr_pct: Optional[float] = None
    trader_min_risk_reward: Optional[float] = None
    trader_rsi_overbought: Optional[float] = None
    trader_rsi_oversold: Optional[float] = None
    trader_rsi_sweet_min: Optional[float] = None
    trader_rsi_sweet_max: Optional[float] = None

class NetworkToggleRequest(BaseModel):
    user_wallet: Optional[str] = None
    network: str = "testnet"

class RebalanceRequest(BaseModel):
    user_wallet: str
    target_allocation: Optional[Dict[str, float]] = None
    drift_threshold_pct: Optional[float] = 5.0
    slippage_tolerance_bps: Optional[int] = 50

class RebalanceStrategyRequest(BaseModel):
    user_wallet: str
    selected_coins: List[str]
    user_expectation: Optional[str] = ""
    current_holdings: Optional[Dict[str, float]] = None
    cadence_days: Optional[int] = 7
    min_stable_pct: Optional[float] = 10.0
    drift_threshold_pct: Optional[float] = 5.0

class DryRunQuoteRequest(BaseModel):
    token_in: str
    token_out: str
    amount: float
    recipient_id: str
    slippage_tolerance_bps: Optional[int] = 50

class ResearchRequest(BaseModel):
    user_wallet: str
    topic: Optional[str] = "NEAR Liquid Staking Yields & DEX Liquidity"
    user_expectations: Optional[str] = None
    links: Optional[List[str]] = None
    date_range: Optional[str] = "1_month"

class A2AHireRequest(BaseModel):
    user_wallet: str
    symbol: Optional[str] = "NEAR"
    research_topic: Optional[str] = None
    focus_area: Optional[str] = None
    source_links: Optional[List[str]] = None
    caller_agent: Optional[str] = "Trader"

class ModeratorKillSwitchRequest(BaseModel):
    user_wallet: str
    activate: bool = True

class ModeratorDeliberateRequest(BaseModel):
    user_wallet: str

class ModeratorKillThresholdRequest(BaseModel):
    user_wallet: str
    threshold: float

class ModeratorFrequencyRequest(BaseModel):
    user_wallet: str
    frequency: str  # '1w', '2w', '1m'


# =============================================================================
# DECOUPLED RESILIENT AGENT RUNNER & NDJSON STREAMING ENGINE
# =============================================================================

RUNNING_TASKS: Dict[str, asyncio.Task] = {}

# One live run per (wallet, agent): a double-click / double POST must reuse the running run,
# not start a second crawl + LLM pipeline (RAM and cost).
_LIVE_RUNS: Dict[tuple, str] = {}
_STARTING_RUNS: set = set()


def _live_run_id(wallet: str, agent_type: str) -> Optional[str]:
    rid = _LIVE_RUNS.get((wallet, agent_type))
    task = RUNNING_TASKS.get(rid) if rid else None
    if rid and task is not None and not task.done():
        return rid
    _LIVE_RUNS.pop((wallet, agent_type), None)
    return None


async def _reuse_live_run(wallet: str, agent_type: str) -> Optional[str]:
    """Returns the run_id already running for this wallet+agent (caller returns it), or None after
    claiming the start slot (caller MUST then start the run and call _register_live_run)."""
    key = (wallet, agent_type)
    rid = _live_run_id(wallet, agent_type)
    if rid:
        logger.info("[RUNS] %s run already live for %s (%s); reusing instead of starting a duplicate.", agent_type, wallet, rid)
        return rid
    if key in _STARTING_RUNS:
        # another request is creating this run right now: wait briefly for its run_id
        for _ in range(100):
            await asyncio.sleep(0.05)
            rid = _live_run_id(wallet, agent_type)
            if rid:
                logger.info("[RUNS] concurrent %s start for %s collapsed into run %s.", agent_type, wallet, rid)
                return rid
            if key not in _STARTING_RUNS:
                break
        _STARTING_RUNS.discard(key)  # starter failed/stalled; fall through and start
    _STARTING_RUNS.add(key)
    return None


def _register_live_run(wallet: str, agent_type: str, run_id: str) -> None:
    _LIVE_RUNS[(wallet, agent_type)] = run_id
    _STARTING_RUNS.discard((wallet, agent_type))



async def _create_run_fast(norm_w, agent_type, title, params, setup=None):
    """
    Create the run row in a worker thread (keeps the event loop free; each Turso write is a network
    round trip) and run the slower per-agent bookkeeping (user flags, scheduled job) in the background
    so the client gets its run_id immediately.
    """
    if not norm_w:
        raise HTTPException(status_code=400, detail="A valid wallet address is required to start a run")
    run_id = await asyncio.to_thread(create_run, norm_w, agent_type, title=title, params=params)
    if setup and norm_w:
        def _safe_setup():
            try:
                setup()
            except Exception as se:
                logger.warning("Background setup for %s run %s failed: %s", agent_type, run_id, se)
        asyncio.create_task(asyncio.to_thread(_safe_setup))
    return run_id


# run_id -> {"since": epoch, "reason": str}: runs whose database writes are currently waiting (shown as "on hold").
_HOLD_STATE: Dict[str, Dict[str, Any]] = {}


def _is_transient_db_error(e: Exception) -> bool:
    m = str(e).lower()
    return any(k in m for k in ("locked", "busy", "checkpoint", "timed out", "timeout", "connection", "stream", "hrana", "network", "unavailable", "reset"))


class _RunDbWriter:
    """
    Persists one run's events/heartbeat/result OFF the event loop and OUTSIDE the pipeline's critical path.
    The pipeline only enqueues (instant). A background pump writes batches to the DB; if the DB is locked/busy it
    WAITS and retries with backoff (logging what is blocked) - the run is put "on hold" but never failed.
    """

    def __init__(self, run_id: str):
        self.run_id = run_id
        self.events: list = []
        self.finish_args = None
        self.done = asyncio.Event()
        self._wake = asyncio.Event()
        self.task = asyncio.create_task(self._pump())

    # ---- producer side (non-blocking) ----
    def event(self, ev: Dict[str, Any]) -> None:
        self.events.append(ev)
        self._wake.set()

    def finish(self, result, cid, error) -> None:
        self.finish_args = (result, cid, error)
        self._wake.set()

    # ---- hold bookkeeping ----
    def _hold(self, reason: str) -> None:
        if self.run_id not in _HOLD_STATE:
            logger.warning("[RUN-HOLD] run %s is ON HOLD: %s", self.run_id, reason)
            _HOLD_STATE[self.run_id] = {"since": time.time(), "reason": reason}

    def _resume(self) -> None:
        info = _HOLD_STATE.pop(self.run_id, None)
        if info:
            logger.warning("[RUN-HOLD] run %s RESUMED after %.1fs", self.run_id, time.time() - info["since"])

    async def _retry(self, label: str, fn):
        attempt = 0
        while True:
            try:
                out = await asyncio.to_thread(fn)
                self._resume()
                return out
            except Exception as e:
                if not _is_transient_db_error(e):
                    raise
                attempt += 1
                self._hold(f"database busy while saving {label}: {str(e)[:120]}")
                if attempt == 1 or attempt % 10 == 0:
                    logger.warning("[RUN-DB] %s for run %s still waiting (retry %d): %s", label, self.run_id, attempt, e)
                await asyncio.sleep(min(10.0, 0.5 * (2 ** min(attempt, 5))))

    async def _pump(self):
        from database import append_run_events_batch
        try:
            while True:
                await self._wake.wait()
                self._wake.clear()
                while self.events:
                    batch, self.events = self.events[:40], self.events[40:]
                    try:
                        await self._retry("progress events", lambda b=batch: append_run_events_batch(self.run_id, b))
                    except Exception as e:  # non-transient (bad data): log, drop this batch, keep the run alive
                        logger.error("[RUN-DB] dropping %d event(s) of run %s (non-retryable): %s", len(batch), self.run_id, e)
                if self.finish_args is not None:
                    result, cid, error = self.finish_args
                    try:
                        await self._retry("final result", lambda: finish_run(self.run_id, result, cid, error))
                    except Exception as e:
                        logger.error("[RUN-DB] could not store final result of run %s: %s", self.run_id, e)
                    break
        finally:
            self._resume()
            self.done.set()


async def _execute_run(run_id: str, agent_type: str, wallet: str, gen_factory):
    """
    Executes an agent pipeline independently of any HTTP connection.
    Guarantees every event is appended to SQLite agent_run_events and
    the final report/strategy/result is persisted in agent_runs on completion or failure.
    Maintains a 15-second heartbeat in agent_runs.last_heartbeat while running (TASK 3 Step 3).
    """
    from database import update_run_heartbeat

    result, cid, error = None, None, None
    writer = _RunDbWriter(run_id)

    async def _heartbeat_worker():
        try:
            while True:
                await asyncio.sleep(15)
                try:
                    await asyncio.to_thread(update_run_heartbeat, run_id)
                except Exception as he:  # a missed heartbeat must never affect the run
                    logger.debug("Heartbeat for %s skipped: %s", run_id, he)
        except asyncio.CancelledError:
            pass

    heartbeat_task = asyncio.create_task(_heartbeat_worker())
    try:
        async for raw_item in gen_factory():
            if isinstance(raw_item, str):
                try:
                    event = json.loads(raw_item)
                except Exception:
                    event = {"type": "raw", "data": raw_item}
            else:
                event = raw_item

            writer.event(event)  # instant; the writer persists in batches and waits out a busy DB

            evt_type = event.get("type")
            if evt_type == "result":
                result = event.get("data")
            elif evt_type == "final" and "result" in event:
                result = event["result"]
            elif evt_type == "step" and "report" in event:
                result = event["report"]
            elif evt_type == "step" and "strategy" in event:
                result = event["strategy"]

            if result and isinstance(result, dict) and result.get("cid"):
                cid = result["cid"]
            elif event.get("cid"):
                cid = event["cid"]

    except asyncio.CancelledError:
        error = "cancelled"
        logger.warning(f"Run {run_id} cancelled.")
        raise
    except Exception as e:
        logger.exception("Run %s failed: %s", run_id, e)
        error = f"{type(e).__name__}: {e}"
        writer.event({"type": "error", "message": error})
    finally:
        heartbeat_task.cancel()
        writer.finish(result, cid, error)  # persisted by the writer (it waits as long as the DB needs)
        RUNNING_TASKS.pop(run_id, None)
        if _LIVE_RUNS.get((wallet, agent_type)) == run_id:
            _LIVE_RUNS.pop((wallet, agent_type), None)
        # keep the writer alive until everything is saved, without blocking this task's caller
        asyncio.create_task(_await_writer(writer))


async def _await_writer(writer: "_RunDbWriter"):
    try:
        await asyncio.wait_for(writer.done.wait(), timeout=3600)
    except asyncio.TimeoutError:
        logger.error("[RUN-DB] writer for run %s still not finished after 1h", writer.run_id)


# Jobs currently executing (job_id) and the cap on how many may run at once.
_INFLIGHT_JOBS: set = set()
MAX_CONCURRENT_JOBS = max(1, int(os.getenv("JOB_MAX_CONCURRENCY", "2")))


async def execute_persisted_job(job: Dict[str, Any]):
    """
    Executes a persisted scheduled job for a user wallet (Tasks 3.2, 3.3, 3.4).
    Skips if user has been inactive for >14 days (Task 3.4).
    Updates next_run_at, executes run stream via _execute_run, and records run in history.
    """
    job_id = job.get("job_id")
    wallet = normalize_wallet(job.get("wallet", ""))
    agent_type = (job.get("agent_type") or "").lower()
    config = job.get("config") or {}
    interval_seconds = job.get("interval_seconds") or 3600

    if not wallet or not job_id:
        return

    from database import is_user_active_recently, mark_job_run

    # Only these agents have a scheduled cadence. Anything else (e.g. old "research:fleet_deliberation" rows)
    # is switched off once instead of firing and writing to the database every 5 minutes forever.
    if agent_type not in ("trader", "rebalancer", "moderator"):
        from database import disable_job
        await asyncio.to_thread(disable_job, job_id)
        logger.info(f"[SCHEDULER] Disabled obsolete {agent_type!r} job {job_id} (no scheduled cadence for this agent).")
        return

    # --- Concurrency guards (Render free tier = small RAM, so never stampede) ---
    if job_id in _INFLIGHT_JOBS:
        logger.info(f"[SCHEDULER] {job_id} is still running from a previous cycle; skipping this tick.")
        return
    if len(_INFLIGHT_JOBS) >= MAX_CONCURRENT_JOBS:
        # Leave next_run_at untouched: the job stays due and the next 60s poll picks it up when a slot frees.
        logger.info(f"[SCHEDULER] {len(_INFLIGHT_JOBS)} jobs already running (cap {MAX_CONCURRENT_JOBS}); deferring {job_id}.")
        return

    now_utc = datetime.now(timezone.utc)
    # Coalesce: if the service slept through N cycles, run ONCE now and schedule the next run from now
    # (never replay the missed backlog).
    try:
        nr = str(job.get("next_run_at") or "")
        nr = nr[:-1] + "+00:00" if nr.endswith("Z") else nr
        due_dt = datetime.fromisoformat(nr)
        if due_dt.tzinfo is None:
            due_dt = due_dt.replace(tzinfo=timezone.utc)
        missed = int((now_utc - due_dt).total_seconds() // max(1, interval_seconds))
        if missed >= 1:
            logger.info(f"[SCHEDULER] {job_id} missed {missed} extra cycle(s) while the service was asleep; coalescing into ONE run.")
    except Exception:
        pass

    next_run_iso = (now_utc + timedelta(seconds=interval_seconds)).isoformat()
    # Check 14-day user activity (Task 3.4)
    if not await asyncio.to_thread(is_user_active_recently, wallet, 14):
        await asyncio.to_thread(mark_job_run, job_id, next_run_iso)
        logger.info(f"[SCHEDULER] User {wallet} inactive for >14 days. Skipped scheduled cadence for {job_id}.")
        return

    await asyncio.to_thread(mark_job_run, job_id, next_run_iso)
    _INFLIGHT_JOBS.add(job_id)
    handed_off = False  # True once a background task owns releasing the in-flight slot

    def _release(_t=None, _jid=job_id):
        _INFLIGHT_JOBS.discard(_jid)

    try:
        if agent_type == "trader":
            if _live_run_id(wallet, "trader"):
                logger.info(f"[SCHEDULER] trader already running for {wallet}; skipping scheduled run.")
                return
            from autonomous_agents.trader_agent import TraderAgent
            trader = TraderAgent()
            symbol = config.get("symbol")
            coin_mode = config.get("coin_mode", "auto")
            title = f"Autonomous Trader Scan ({symbol or coin_mode or 'auto'})"
            params = {"source": "scheduler_cadence", **config}
            run_id = create_run(wallet, "trader", title=title, params=params)
            gen_factory = lambda: trader.run_pipeline_stream(
                user_wallet=wallet,
                symbol=symbol,
                coin_mode=coin_mode,
                custom_coins=config.get("custom_coins", ""),
                force_timeframe=config.get("timeframe", "1h"),
                force_min_confidence=config.get("min_confidence", 75),
                enable_researcher_plugin=bool(config.get("enable_researcher", True))
            )
            task = asyncio.create_task(_execute_run(run_id, "trader", wallet, gen_factory))
            RUNNING_TASKS[run_id] = task
            _register_live_run(wallet, "trader", run_id)
            task.add_done_callback(_release)
            handed_off = True
            logger.info(f"[SCHEDULER] Launched scheduled trader run {run_id} for wallet {wallet}")
        elif agent_type == "rebalancer":
            if _live_run_id(wallet, "rebalancer"):
                logger.info(f"[SCHEDULER] rebalancer already running for {wallet}; skipping scheduled run.")
                return
            from autonomous_agents.rebalancer_agent import RebalancerAgent
            rebalancer = RebalancerAgent()
            title = "Autonomous Rebalance Strategy"
            params = {"source": "scheduler_cadence", **config}
            run_id = create_run(wallet, "rebalancer", title=title, params=params)
            gen_factory = lambda: rebalancer.generate_strategy_stream(
                user_wallet=wallet,
                selected_coins=config.get("selected_coins", ["NEAR", "USDC", "USDT"]),
                user_expectation=config.get("user_expectation", "Portfolio rebalance"),
                current_holdings=config.get("current_holdings", {}),
                cadence_days=config.get("cadence_days", 7),
                min_stable_pct=config.get("min_stable_pct", 10.0),
                drift_threshold_pct=config.get("drift_threshold_pct", 5.0)
            )
            task = asyncio.create_task(_execute_run(run_id, "rebalancer", wallet, gen_factory))
            RUNNING_TASKS[run_id] = task
            _register_live_run(wallet, "rebalancer", run_id)
            task.add_done_callback(_release)
            handed_off = True
            logger.info(f"[SCHEDULER] Launched scheduled rebalancer run {run_id} for wallet {wallet}")
        elif agent_type == "moderator":
            from autonomous_agents.moderator_agent import ModeratorAgent
            moderator = ModeratorAgent()
            mod_res = await moderator.run_cadence_check(wallet)
            if mod_res and isinstance(mod_res, dict):
                m_run_id = create_run(wallet, "moderator", title="Autonomous Fleet Deliberation", params={"source": "scheduler_cadence"})
                cid_val = mod_res.get("cid")
                finish_run(m_run_id, result=mod_res, cid=cid_val, error=None)
                logger.info(f"[SCHEDULER] Completed moderator deliberation run {m_run_id} for wallet {wallet}")
    except Exception as exc:
        logger.error(f"[SCHEDULER] Error executing persisted job {job_id}: {exc}")
    finally:
        if not handed_off:
            _release()


def schedule_or_update_persisted_job(
    wallet: str,
    agent_type: str,
    purpose: str,
    interval_seconds: int,
    config: Optional[Dict[str, Any]] = None,
    enabled: int = 1
) -> Dict[str, Any]:
    """
    Upsert job into scheduled_jobs table and register/remove from active APScheduler instance.
    """
    from database import upsert_scheduled_job, disable_job
    clean_w = normalize_wallet(wallet)
    if not clean_w:
        return {}
    job_id = f"{clean_w}:{agent_type.lower()}:{purpose.lower()}"
    if enabled == 0:
        disable_job(job_id)
        return {"job_id": job_id, "enabled": 0}

    # next_run_at = now + interval; the global poller (run_due_persisted_jobs) picks it up when due
    job = upsert_scheduled_job(
        wallet=clean_w,
        agent_type=agent_type,
        purpose=purpose,
        interval_seconds=interval_seconds,
        config=config,
        enabled=1,
        job_id=job_id
    )
    return job


def _heal_missing_agent_jobs() -> int:
    """
    Self-heal: any user whose trader/rebalancer is flagged active in its config table but has no enabled
    scheduled_jobs row (e.g. activated through a path that skipped the lifecycle hook, or the jobs table
    was wiped) gets a job created, first firing one interval from now.
    """
    from database import get_connection, upsert_scheduled_job
    created = 0
    try:
        conn = get_connection()
        rows = []
        for table, agent, purpose, interval in (
            ("trader_config", "trader", "trade_poll", 3600),
            ("rebalancer_config", "rebalancer", "rebalance_cadence", 604800),
        ):
            for r in conn.execute(
                f"SELECT t.wallet_address AS w FROM {table} t "
                "JOIN core_user_wallets u ON u.wallet_address = t.wallet_address "
                "WHERE t.agent_active = 1 AND (u.kill_switch_active IS NULL OR u.kill_switch_active = 0) "
                "AND NOT EXISTS (SELECT 1 FROM scheduled_jobs j WHERE j.wallet = t.wallet_address "
                f"AND j.agent_type = '{agent}' AND j.enabled = 1)"
            ).fetchall():
                rows.append((r["w"], agent, purpose, interval))
        conn.close()
        for w, agent, purpose, interval in rows:
            upsert_scheduled_job(wallet=w, agent_type=agent, purpose=purpose, interval_seconds=interval, config={}, enabled=1)
            created += 1
            logger.info(f"[SCHEDULER] Self-healed missing {agent} job for {w}")
    except Exception as e:
        logger.warning(f"[SCHEDULER] heal_missing_agent_jobs error: {e}")
    return created


_DUE_POLL_LOCK = asyncio.Lock()


async def run_due_persisted_jobs() -> Dict[str, Any]:
    """
    Global poller body: run every enabled job (all users, all agents) whose next_run_at has passed.
    Safe to call from APScheduler, at startup, or from the /api/scheduler/tick keep-alive endpoint.
    """
    if _DUE_POLL_LOCK.locked():
        return {"status": "busy", "launched": 0}
    async with _DUE_POLL_LOCK:
        launched = 0
        try:
            from database import list_enabled_jobs
            await asyncio.to_thread(_heal_missing_agent_jobs)
            jobs = await asyncio.to_thread(list_enabled_jobs)
            now_utc = datetime.now(timezone.utc)
            for job in jobs:
                try:
                    nr = str(job.get("next_run_at") or "")
                    if nr.endswith("Z"):
                        nr = nr[:-1] + "+00:00"
                    due_dt = datetime.fromisoformat(nr)
                    if due_dt.tzinfo is None:
                        due_dt = due_dt.replace(tzinfo=timezone.utc)
                except Exception:
                    due_dt = now_utc
                if due_dt <= now_utc:
                    if len(_INFLIGHT_JOBS) >= MAX_CONCURRENT_JOBS:
                        break  # remaining due jobs wait for the next 60s tick
                    before = len(_INFLIGHT_JOBS)
                    logger.info(f"[SCHEDULER] Job {job['job_id']} due ({job.get('next_run_at')}); launching.")
                    await execute_persisted_job(job)
                    if len(_INFLIGHT_JOBS) > before:
                        launched += 1
        except Exception as e:
            logger.error(f"[SCHEDULER] Global poller error: {e}")
        return {"status": "ok", "launched": launched}


_last_lazy_run = 0.0


async def check_all_moderator_cadences():
    """Lazy task: run the moderator cadence check for every user with an active moderator."""
    try:
        from database import get_connection
        from autonomous_agents.moderator_agent import ModeratorAgent

        def _active_wallets():
            conn = get_connection()
            try:
                return [r["wallet_address"] for r in conn.execute("""
                    SELECT u.wallet_address
                    FROM core_user_wallets u
                    LEFT JOIN moderator_config m ON u.wallet_address = m.wallet_address
                    WHERE COALESCE(m.agent_active, 0) = 1 AND (u.kill_switch_active IS NULL OR u.kill_switch_active = 0)
                """).fetchall()]
            finally:
                conn.close()

        wallets = await asyncio.to_thread(_active_wallets)
        if not wallets:
            return
        moderator = ModeratorAgent()
        for wallet in wallets:
            mod_res = await moderator.run_cadence_check(wallet)
            if mod_res and isinstance(mod_res, dict):
                m_run_id = await asyncio.to_thread(create_run, wallet, "moderator", title="Autonomous Fleet Deliberation", params={"source": "cadence_scheduler"})
                await asyncio.to_thread(finish_run, m_run_id, mod_res, mod_res.get("cid"), None)
    except Exception as me:
        logger.warning("[POLLER:LAZY] moderator cadence error: %s", me)


async def frequent_poll_tick() -> Dict[str, Any]:
    """FREQUENT poller (default every 30s): time-sensitive work that must keep being checked."""
    t0 = time.monotonic()
    out: Dict[str, Any] = {}
    try:
        out["due_jobs"] = await run_due_persisted_jobs()
    except Exception as e:
        logger.warning("[POLLER:FREQUENT] due-jobs pass failed: %s", e)
    try:
        from autonomy_engine import check_all_strategies
        await check_all_strategies()
    except Exception as e:
        logger.warning("[POLLER:FREQUENT] strategy check failed: %s", e)
    took = time.monotonic() - t0
    launched = (out.get("due_jobs") or {}).get("launched", 0)
    if launched or took > 2:
        logger.info("[POLLER:FREQUENT] tick done in %.1fs (launched %s due job(s))", took, launched)
    return out


async def lazy_poll_tick() -> Dict[str, Any]:
    """LAZY poller (default every 5 min): everything that is not time-sensitive."""
    global _last_lazy_run
    t0 = time.monotonic()
    _last_lazy_run = time.time()
    out: Dict[str, Any] = {}
    await check_all_moderator_cadences()
    try:
        from marketplace_service import expire_stale_orders
        out["expired_orders"] = await asyncio.to_thread(expire_stale_orders)
    except Exception as e:
        logger.warning("[POLLER:LAZY] marketplace order expiry failed: %s", e)
    logger.info("[POLLER:LAZY] tick done in %.1fs %s", time.monotonic() - t0, out)
    return out


async def _run_tick_passes() -> Dict[str, Any]:
    res = await frequent_poll_tick()
    lazy_ran = False
    if time.time() - _last_lazy_run >= LAZY_POLL_SECONDS:
        await lazy_poll_tick()
        lazy_ran = True
    return {**(res.get("due_jobs") or {}), "lazy_ran": lazy_ran}


@app.api_route("/api/scheduler/tick", methods=["GET", "POST", "HEAD"])
async def scheduler_tick(wait: bool = False):
    """
    Keep-alive + catch-up endpoint for an external pinger (UptimeRobot / cron-job.org / GitHub Actions).
    Accepts GET, POST and HEAD (UptimeRobot's free plan probes with HEAD). It answers IMMEDIATELY and runs the
    FREQUENT pass (and the LAZY pass when overdue) in the background, so a monitor never times out.
    Use ?wait=true to wait for the passes and get their result.
    """
    if wait:
        res = await _run_tick_passes()
        return {**res, "timestamp": datetime.now(timezone.utc).isoformat()}
    asyncio.create_task(_run_tick_passes())
    return {"status": "accepted", "timestamp": datetime.now(timezone.utc).isoformat()}


async def _stream_run_events(run_id: str, wallet: Optional[str], after: int, request: Request):
    """
    NDJSON event stream generator reading committed events from DB.
    Resumable via after=seq. Disconnection never cancels the underlying task.
    A busy/locked DB never ends the stream: it emits `on_hold` events and keeps retrying.
    """
    current_after = after
    db_errors = 0
    announced_hold = False
    while True:
        # in-memory hold flag (this process owns the run's writer)
        hold = _HOLD_STATE.get(run_id)
        if hold:
            announced_hold = True
            yield json.dumps({"type": "on_hold", "run_id": run_id, "reason": hold["reason"],
                              "held_seconds": int(time.time() - hold["since"]),
                              "message": "On hold - waiting for the database. Your run continues automatically."}) + "\n"
        elif announced_hold:
            announced_hold = False
            yield json.dumps({"type": "run_resumed", "run_id": run_id, "message": "Database is back - run continuing."}) + "\n"

        try:
            events = await asyncio.to_thread(get_run_events, run_id, after_seq=current_after)
            for ev in events:
                current_after = max(current_after, ev.get("seq", current_after))
                yield json.dumps(ev) + "\n"

            run = await asyncio.to_thread(get_run, run_id, wallet=wallet)
            db_errors = 0
        except Exception as de:
            # Busy/locked DB: keep the stream alive, tell the UI the run is on hold, retry (never fail the run).
            db_errors += 1
            logger.warning("Run %s stream DB read error (%d): %s", run_id, db_errors, de)
            yield json.dumps({"type": "on_hold", "run_id": run_id, "reason": str(de)[:120],
                              "message": "On hold - waiting for the database. Your run continues automatically."}) + "\n"
            announced_hold = True
            if await request.is_disconnected():
                break
            await asyncio.sleep(min(5.0, 1.0 + db_errors * 0.5))
            continue

        if not run:
            break

        if run.get("status") != "running":
            trailing = await asyncio.to_thread(get_run_events, run_id, after_seq=current_after)
            for ev in trailing:
                current_after = max(current_after, ev.get("seq", current_after))
                yield json.dumps(ev) + "\n"
            yield json.dumps({
                "type": "run_finished",
                "status": run.get("status"),
                "run_id": run_id,
                "cid": run.get("cid"),
                "error": run.get("error"),
                "finished_at": run.get("finished_at")
            }) + "\n"
            break

        if await request.is_disconnected():
            break
        await asyncio.sleep(1.0)


@app.get("/api/runs/{run_id}/stream")
async def stream_run_endpoint(run_id: str, request: Request, after: int = 0, wallet: Optional[str] = None):
    run = await asyncio.to_thread(get_run, run_id, wallet=wallet)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    headers = {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    return StreamingResponse(
        _stream_run_events(run_id, wallet, after, request),
        media_type="application/x-ndjson",
        headers=headers
    )


@app.get("/api/runs")
def list_runs_endpoint(wallet: str, agent_type: Optional[str] = None, limit: int = 50, offset: int = 0):
    norm_w = normalize_wallet(wallet)
    if not norm_w:
        raise HTTPException(status_code=400, detail="Valid wallet query parameter is required to access runs")
    runs = list_runs(norm_w, agent_type=agent_type, limit=limit, offset=offset)
    return {"runs": runs, "wallet": norm_w}


@app.get("/api/runs/{run_id}")
def get_run_endpoint(run_id: str, wallet: Optional[str] = None):
    if not wallet or not normalize_wallet(wallet):
        raise HTTPException(status_code=400, detail="Wallet parameter is required to access encrypted run details")
    run = get_run(run_id, wallet=wallet)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return {"run": run}


@app.get("/api/health/storage")
async def health_storage_endpoint():
    from database import DB_PATH, get_connection, is_turso_enabled, get_last_sync_status
    is_writable = False
    runs_count = 0
    is_turso = is_turso_enabled()
    sync_status = get_last_sync_status()
    last_sync_ok = sync_status.get("last_sync_ok", True) if is_turso else True
    try:
        conn = get_connection()
        runs_count = conn.execute("SELECT COUNT(*) FROM agent_runs").fetchone()[0]
        conn.close()
        is_writable = True  # DB read above succeeded; nothing is stored on local disk
    except Exception as e:
        logger.warning(f"Storage health check error: {e}")
    return {
        "status": "healthy" if (is_writable and last_sync_ok) else "degraded",
        "backend": "turso" if is_turso else "local",
        "runs_count": runs_count,
        "last_sync_ok": last_sync_ok,
        "db_path": os.path.abspath(DB_PATH),
        "writable": is_writable
    }


# ─── 1. TRADER AGENT ENDPOINTS ───────────────────────────────────

@app.post("/api/trader/analyze")
async def trader_analyze(body: TraderScanRequest):
    """Trigger the Trader Agent's 2-node pipeline with LLM-as-a-Judge, visual charts, and research plugin."""
    norm_w = normalize_wallet(body.user_wallet)
    if norm_w:
        upsert_user(norm_w, {
            "trader_active": 1,
            "trader_coin_mode": body.coin_mode or "auto",
            "trader_custom_coins": body.custom_coins or "",
            "trader_timeframe": body.timeframe or "1h",
            "trader_min_confidence": body.min_confidence or 75,
            "trader_enable_researcher": 1 if body.enable_researcher_plugin else 0
        })
    from autonomous_agents.trader_agent import TraderAgent
    trader = TraderAgent()
    result = await trader.run_pipeline(
        user_wallet=body.user_wallet,
        symbol=body.symbol,
        coin_mode=body.coin_mode,
        custom_coins=body.custom_coins,
        force_timeframe=body.timeframe,
        force_min_confidence=body.min_confidence,
        enable_researcher_plugin=body.enable_researcher_plugin,
        is_manual_scan=True
    )
    return result


@app.post("/api/trader/start")
async def trader_start_endpoint(body: TraderScanRequest):
    norm_w = normalize_wallet(body.user_wallet)
    _live = await _reuse_live_run(norm_w, "trader")
    if _live:
        return {"run_id": _live, "status": "running", "reused": True}

    def _setup():
        upsert_user(norm_w, {
            "trader_active": 1,
            "trader_coin_mode": body.coin_mode or "auto",
            "trader_custom_coins": body.custom_coins or "",
            "trader_timeframe": body.timeframe or "1h",
            "trader_min_confidence": body.min_confidence or 75,
            "trader_enable_researcher": 1 if body.enable_researcher_plugin else 0
        })
        schedule_or_update_persisted_job(
            wallet=norm_w,
            agent_type="trader",
            purpose="trade_poll",
            interval_seconds=3600,
            config={
                "symbol": body.symbol,
                "coin_mode": body.coin_mode or "auto",
                "custom_coins": body.custom_coins or "",
                "timeframe": body.timeframe or "1h",
                "min_confidence": body.min_confidence or 75,
                "enable_researcher": bool(body.enable_researcher_plugin)
            },
            enabled=1
        )
    title = f"Trader Scan ({body.symbol or body.coin_mode or 'auto'})"
    params = {
        "symbol": body.symbol,
        "coin_mode": body.coin_mode,
        "custom_coins": body.custom_coins,
        "timeframe": body.timeframe,
        "min_confidence": body.min_confidence,
        "enable_researcher_plugin": body.enable_researcher_plugin
    }
    run_id = await _create_run_fast(norm_w, "trader", title, params, _setup)
    from autonomous_agents.trader_agent import TraderAgent
    trader = TraderAgent()
    gen_factory = lambda: trader.run_pipeline_stream(
        user_wallet=norm_w,
        symbol=body.symbol,
        coin_mode=body.coin_mode,
        custom_coins=body.custom_coins,
        force_timeframe=body.timeframe,
        force_min_confidence=body.min_confidence,
        enable_researcher_plugin=body.enable_researcher_plugin
    )
    task = asyncio.create_task(_execute_run(run_id, "trader", norm_w, gen_factory))
    RUNNING_TASKS[run_id] = task
    _register_live_run(norm_w, "trader", run_id)
    return {"run_id": run_id, "status": "running"}


@app.post("/api/trader/stream")
async def trader_stream_endpoint(body: TraderScanRequest, request: Request):
    """
    Real-time streaming trader pipeline.
    Runs pipeline independently in background, streaming NDJSON events to client.
    """
    res = await trader_start_endpoint(body)
    run_id = res["run_id"]
    headers = {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    return StreamingResponse(
        _stream_run_events(run_id, body.user_wallet, 0, request),
        media_type="application/x-ndjson",
        headers=headers
    )

@app.get("/api/trader/trades/{wallet_address}")
def get_trader_trades(wallet_address: str):
    """Get open positions, dropped trades, and history for the user."""
    from database import get_open_trades, get_user_trade_history, get_dropped_trades
    open_trades = get_open_trades(wallet_address)
    history = get_user_trade_history(wallet_address, limit=20)
    dropped = get_dropped_trades(wallet_address, limit=10)
    return {
        "open_trades": open_trades,
        "history": history,
        "dropped_trades": dropped,
        "open_count": len(open_trades),
        "dropped_count": len(dropped)
    }

@app.post("/api/trader/settings")
def update_trader_settings(body: TraderSettingsRequest):
    """Save user trader preferences, researcher plugin & hard caps."""
    settings = {
        "trader_active": 1,
        "trader_timeframe": body.trader_timeframe,
        "trader_min_confidence": body.trader_min_confidence,
        "trader_risk_profile": body.trader_risk_profile,
        "trader_max_trades_per_day": body.trader_max_trades_per_day,
        "trader_max_trades_per_week": body.trader_max_trades_per_week,
        "max_tx_amount": body.max_tx_amount,
        "trader_coin_mode": body.trader_coin_mode,
        "trader_custom_coins": body.trader_custom_coins,
        "trader_enable_researcher": body.trader_enable_researcher
    }
    if body.trader_min_volume_usd is not None:
        settings["min_volume_usd"] = body.trader_min_volume_usd
    if body.trader_min_price_move_pct is not None:
        settings["min_price_move_pct"] = body.trader_min_price_move_pct
    if body.trader_min_atr_pct is not None:
        settings["min_atr_pct"] = body.trader_min_atr_pct
    if body.trader_min_risk_reward is not None:
        settings["min_risk_reward"] = body.trader_min_risk_reward
    if body.trader_rsi_overbought is not None:
        settings["rsi_overbought"] = body.trader_rsi_overbought
    if body.trader_rsi_oversold is not None:
        settings["rsi_oversold"] = body.trader_rsi_oversold
    if body.trader_rsi_sweet_min is not None:
        settings["rsi_sweet_min"] = body.trader_rsi_sweet_min
    if body.trader_rsi_sweet_max is not None:
        settings["rsi_sweet_max"] = body.trader_rsi_sweet_max

    user = upsert_user(body.user_wallet, settings)
    schedule_or_update_persisted_job(
        wallet=body.user_wallet,
        agent_type="trader",
        purpose="trade_poll",
        interval_seconds=3600,
        config={
            "coin_mode": body.trader_coin_mode or "auto",
            "custom_coins": body.trader_custom_coins or "",
            "timeframe": body.trader_timeframe or "1h",
            "min_confidence": body.trader_min_confidence or 75,
            "enable_researcher": bool(body.trader_enable_researcher)
        },
        enabled=1
    )
    return {"status": "updated", "user": user}

@app.get("/api/trader/scanner")
async def get_scanner_rankings(mode: str = "auto", timeframe: str = "1h"):
    """Get the 20-coin scanner ranking."""
    from coin_scanner import scan_coin_universe
    res = await scan_coin_universe(mode=mode, timeframe=timeframe)
    return res

@app.get("/api/twitter/sentiment/{symbol}")
async def get_twitter_sentiment(symbol: str):
    """Get live Twitter/X hashtag sentiment for asset."""
    from twitter_sentiment import search_twitter_sentiment
    res = await search_twitter_sentiment(symbol=symbol)
    return res

@app.get("/api/trader/knowledge")
async def get_trading_knowledge():
    """Get indexed sections and rules from Crypto Trading Book."""
    from trading_book_rag import trading_book_rag
    return {
        "total_sections": len(trading_book_rag.sections),
        "sections": trading_book_rag.sections
    }

@app.get("/api/trader/traces")
async def get_trade_traces(wallet_address: Optional[str] = None):
    """Get recent 24 decentralized trade reasoning traces (isolated by wallet if provided)."""
    if not wallet_address:
        return {"traces": [], "count": 0}
    from history_store import get_recent_trade_traces
    traces = get_recent_trade_traces(limit=24, wallet_address=wallet_address)
    return {"traces": traces, "count": len(traces)}

@app.get("/api/trader/traces/{wallet_address}")
def get_trade_traces_for_wallet(wallet_address: str):
    """Get recent 24 decentralized trade reasoning traces for a specific wallet."""
    from history_store import get_recent_trade_traces
    traces = get_recent_trade_traces(limit=24, wallet_address=wallet_address)
    return {"traces": traces, "count": len(traces)}



# ─── 2. REBALANCER AGENT ENDPOINTS ───────────────────────────────

@app.post("/api/rebalancer/generate-strategy")
async def rebalancer_generate_strategy(body: RebalanceStrategyRequest):
    """
    Generates an institutional AI rebalancing strategy using:
    - 1h, 1d, 1w multi-timeframe charts with 5-10 closed candles (zero lookahead)
    - 20 Embedded Crypto Trading Book Heuristics (probabilistic hypotheses)
    - Macro BTC Beta, correlation matrix & portfolio volatility integration
    - 1Click dry-run pre-trade liquidity & slippage simulation
    - Deterministic minimum stablecoin percentage guardrail
    - Pydantic index-based structured output
    - Automatically supersedes/drops old strategy in Rebalancer DB
    """
    try:
        norm_w = normalize_wallet(body.user_wallet)
        if norm_w:
            upsert_user(norm_w, {
                "rebalancer_active": 1,
                "rebalancer_drift_threshold": 5.0,
            })
        from autonomous_agents.rebalancer_agent import RebalancerAgent
        rebalancer = RebalancerAgent()
        result = await rebalancer.generate_strategy(
            user_wallet=body.user_wallet,
            selected_coins=body.selected_coins,
            user_expectation=body.user_expectation or "",
            current_holdings=body.current_holdings,
            cadence_days=body.cadence_days or 7,
            min_stable_pct=body.min_stable_pct or 10.0
        )
        return result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/rebalancer/start")
async def rebalancer_start_endpoint(body: RebalanceStrategyRequest):
    norm_w = normalize_wallet(body.user_wallet)
    _live = await _reuse_live_run(norm_w, "rebalancer")
    if _live:
        return {"run_id": _live, "status": "running", "reused": True}
    cad_days = body.cadence_days or 7

    def _setup():
        upsert_user(norm_w, {
            "rebalancer_active": 1,
            "rebalancer_drift_threshold": float(body.drift_threshold_pct or 5.0),
        })
        schedule_or_update_persisted_job(
            wallet=norm_w,
            agent_type="rebalancer",
            purpose="rebalance_cadence",
            interval_seconds=int(cad_days * 86400),
            config={
                "selected_coins": body.selected_coins,
                "user_expectation": body.user_expectation or "",
                "current_holdings": body.current_holdings,
                "cadence_days": cad_days,
                "min_stable_pct": body.min_stable_pct or 10.0,
                "drift_threshold_pct": body.drift_threshold_pct or 5.0
            },
            enabled=1
        )
    coins_summary = ", ".join((body.selected_coins or [])[:3])
    title = f"Rebalance ({coins_summary})" if coins_summary else "Portfolio Rebalance"
    params = {
        "selected_coins": body.selected_coins,
        "user_expectation": body.user_expectation,
        "current_holdings": body.current_holdings,
        "cadence_days": body.cadence_days,
        "min_stable_pct": body.min_stable_pct,
        "drift_threshold_pct": body.drift_threshold_pct
    }
    run_id = await _create_run_fast(norm_w, "rebalancer", title, params, _setup)
    from autonomous_agents.rebalancer_agent import RebalancerAgent
    rebalancer = RebalancerAgent()
    gen_factory = lambda: rebalancer.generate_strategy_stream(
        user_wallet=norm_w,
        selected_coins=body.selected_coins,
        user_expectation=body.user_expectation or "",
        current_holdings=body.current_holdings,
        cadence_days=body.cadence_days or 7,
        min_stable_pct=body.min_stable_pct or 10.0,
        drift_threshold_pct=body.drift_threshold_pct or 5.0
    )
    task = asyncio.create_task(_execute_run(run_id, "rebalancer", norm_w, gen_factory))
    RUNNING_TASKS[run_id] = task
    _register_live_run(norm_w, "rebalancer", run_id)
    return {"run_id": run_id, "status": "running"}


@app.post("/api/rebalancer/stream")
async def rebalancer_generate_strategy_stream(body: RebalanceStrategyRequest, request: Request):
    """
    Real-time streaming portfolio rebalancing strategy generation yielding NDJSON events.
    Runs independently in background, streaming events to client.
    """
    res = await rebalancer_start_endpoint(body)
    run_id = res["run_id"]
    headers = {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    return StreamingResponse(
        _stream_run_events(run_id, body.user_wallet, 0, request),
        media_type="application/x-ndjson",
        headers=headers
    )

@app.get("/api/rebalancer/strategy/{wallet_address}")
async def rebalancer_get_active_strategy(wallet_address: str):
    """Get active strategy and history for wallet."""
    from database import get_active_rebalancer_strategy, get_rebalancer_strategy_history
    active = get_active_rebalancer_strategy(wallet_address)
    history = get_rebalancer_strategy_history(wallet_address, limit=10)
    return {
        "user_wallet": wallet_address,
        "active_strategy": active,
        "history": history
    }

@app.get("/api/rebalancer/history/{wallet_address}")
async def rebalancer_get_history(wallet_address: str):
    """Get historical rebalancing strategies for a user wallet."""
    from database import get_rebalancer_strategy_history
    return {"history": get_rebalancer_strategy_history(wallet_address, limit=20)}

@app.post("/api/rebalancer/drop-strategy/{strategy_id}")
async def rebalancer_drop_strategy_endpoint(strategy_id: int):
    """Mark a strategy as dropped."""
    from database import drop_rebalancer_strategy
    ok = drop_rebalancer_strategy(strategy_id)
    return {"success": ok, "strategy_id": strategy_id}

@app.post("/api/rebalancer/evaluate")
async def rebalancer_evaluate(body: RebalanceRequest):
    """Trigger Rebalancer Agent Governed Execution State Machine (Proposal -> Validation -> Approval -> Execution -> Reconciliation)."""
    from autonomous_agents.rebalancer_agent import RebalancerAgent
    rebalancer = RebalancerAgent()
    result = await rebalancer.evaluate_and_rebalance(
        user_wallet=body.user_wallet,
        target_allocation=body.target_allocation,
        drift_threshold_pct=body.drift_threshold_pct or 5.0,
        slippage_tolerance_bps=body.slippage_tolerance_bps or 50
    )
    return result

_REB_STATUS_CACHE: Dict[str, tuple] = {}
_REB_STATUS_TTL = 45  # seconds


@app.get("/api/rebalancer/status/{wallet_address}")
async def rebalancer_status(wallet_address: str):
    """Get current Rebalancer Agent telemetry (strictly read-only, zero trade side-effects)."""
    # The ~2s here is external HTTP (token prices + on-chain balances), not the DB. Cache it briefly per wallet.
    key = normalize_wallet(wallet_address)
    hit = _REB_STATUS_CACHE.get(key)
    if hit and time.time() - hit[0] < _REB_STATUS_TTL:
        return hit[1]
    from autonomous_agents.rebalancer_agent import RebalancerAgent
    rebalancer = RebalancerAgent()
    data = await rebalancer.get_portfolio_drift_status(user_wallet=wallet_address)
    _REB_STATUS_CACHE[key] = (time.time(), data)
    if len(_REB_STATUS_CACHE) > 500:
        _REB_STATUS_CACHE.pop(next(iter(_REB_STATUS_CACHE)), None)
    return data

@app.post("/api/rebalancer/dry-run-quote")
async def rebalancer_dry_run_quote(body: DryRunQuoteRequest):
    """Simulates 1Click quote (dry: true) to estimate real slippage, output, and fees without creating a deposit address."""
    from tools import get_swap_quote
    return get_swap_quote(
        token_in=body.token_in,
        token_out=body.token_out,
        amount=body.amount,
        recipient_id=body.recipient_id,
        dry=True,
        slippage_tolerance_bps=body.slippage_tolerance_bps or 50
    )

@app.get("/api/rebalancer/executions/{wallet_address}")
async def rebalancer_get_executions(wallet_address: str):
    """Get historical state machine execution records for audit and reconciliation."""
    from database import get_rebalancer_executions_for_user
    return {"executions": get_rebalancer_executions_for_user(wallet_address, limit=30)}

@app.get("/api/rebalancer/execution/{execution_id}")
async def rebalancer_get_single_execution(execution_id: str):
    """Get single execution record including 1Click signature, quotes, and terminal status."""
    from database import get_rebalancer_execution
    rec = get_rebalancer_execution(execution_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Execution record not found")
    return rec


# ─── 3. RESEARCH AGENT ENDPOINTS ─────────────────────────────────

@app.post("/api/research/generate")
@app.post("/api/research/deep-dive")
async def research_generate(body: ResearchRequest):
    """
    Generate an institutional research report using Chain of Thought reasoning,
    on-demand web crawler, and ChromaDB vector RAG retrieval.
    """
    norm_w = normalize_wallet(body.user_wallet)
    if norm_w:
        upsert_user(norm_w, {"research_active": 1})
    from autonomous_agents.research_agent import ResearchAgent
    researcher = ResearchAgent()
    return await researcher.generate_research_report(
        topic=body.topic or "NEAR Liquid Staking Yields & DEX Liquidity",
        user_expectations=body.user_expectations,
        links=body.links,
        date_range=body.date_range or "1_month",
        requester=body.user_wallet
    )

@app.post("/api/research/start")
async def research_start_endpoint(body: ResearchRequest):
    norm_w = normalize_wallet(body.user_wallet)
    _live = await _reuse_live_run(norm_w, "research")
    if _live:
        return {"run_id": _live, "status": "running", "reused": True}
    title = body.topic or "NEAR Research Report"
    params = {
        "topic": body.topic,
        "user_expectations": body.user_expectations,
        "links": body.links,
        "date_range": body.date_range
    }
    run_id = await _create_run_fast(norm_w, "research", title, params, lambda: upsert_user(norm_w, {"research_active": 1}))
    from autonomous_agents.research_agent import ResearchAgent
    researcher = ResearchAgent()
    gen_factory = lambda: researcher.generate_research_report_stream(
        topic=body.topic or "NEAR Liquid Staking Yields & DEX Liquidity",
        user_expectations=body.user_expectations,
        links=body.links,
        date_range=body.date_range or "1_month",
        requester=norm_w
    )
    task = asyncio.create_task(_execute_run(run_id, "research", norm_w, gen_factory))
    RUNNING_TASKS[run_id] = task
    _register_live_run(norm_w, "research", run_id)
    return {"run_id": run_id, "status": "running"}


@app.post("/api/research/stream")
async def research_stream_endpoint(body: ResearchRequest, request: Request):
    """
    Real-time streaming research pipeline.
    Runs pipeline independently in background, streaming NDJSON events to client.
    """
    res = await research_start_endpoint(body)
    run_id = res["run_id"]
    headers = {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
        "Connection": "keep-alive"
    }
    return StreamingResponse(
        _stream_run_events(run_id, body.user_wallet, 0, request),
        media_type="application/x-ndjson",
        headers=headers
    )

@app.post("/api/research/hire")
async def research_agent_hire(body: A2AHireRequest):
    """Agent-to-Agent Second Opinion & Research Collaboration (0 NEAR Fee - Free)."""
    from autonomous_agents.research_agent import ResearchAgent
    researcher = ResearchAgent()
    return await researcher.hire_by_trader_agent(
        trader_wallet=body.user_wallet,
        symbol=body.symbol or "NEAR",
        research_topic=body.research_topic,
        focus_area=body.focus_area,
        source_links=body.source_links,
        caller_agent=body.caller_agent or "Trader"
    )

@app.get("/api/research/reports")
async def get_research_reports(wallet_address: Optional[str] = None):
    """Get the recent 10 decentralized research reports (isolated by wallet if provided)."""
    if not wallet_address:
        return {"reports": [], "count": 0}
    from history_store import get_recent_research_reports
    reports = get_recent_research_reports(limit=10, wallet_address=wallet_address)
    return {"reports": reports, "count": len(reports)}

@app.get("/api/research/reports/{wallet_address}")
async def get_research_reports_for_wallet(wallet_address: str):
    """Get the recent 10 decentralized research reports for a specific wallet."""
    from history_store import get_recent_research_reports
    reports = get_recent_research_reports(limit=10, wallet_address=wallet_address)
    return {"reports": reports, "count": len(reports)}



# ─── 4. MODERATOR WATCHDOG ENDPOINTS ─────────────────────────────

@app.get("/api/moderator/status/{wallet_address}")
async def moderator_status(wallet_address: str):
    """Get latest Moderator Watchdog telemetry and fleet health score (fast/non-blocking)."""
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    return await moderator.get_watchdog_status(wallet_address)

class AskModeratorRequest(BaseModel):
    user_wallet: str
    section: str = "overview"
    question: Optional[str] = None
    client: Optional[Dict[str, Any]] = None  # what the dashboard is showing (selected symbol, interval, ...)


@app.post("/api/moderator/ask")
async def moderator_ask_endpoint(body: AskModeratorRequest):
    """
    Ask the Moderator about one dashboard section. A dedicated context node per section feeds the Moderator the
    section's real data (agents, trades, drift, reports, wallets, live market ...); it answers only from that.
    """
    if not normalize_wallet(body.user_wallet):
        raise HTTPException(status_code=400, detail="A valid wallet address is required")
    from moderator_ask import ask_moderator
    return await ask_moderator(body.user_wallet, body.section, body.question or "", body.client)


@app.get("/api/moderator/judge/{wallet_address}")
async def moderator_judge(wallet_address: str):
    """Explicit endpoint for Moderator LLM-as-a-Judge 5-parameter audit."""
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    return await moderator.evaluate_fleet_performance(wallet_address)

@app.get("/api/fleet/{wallet_address}")
def get_agent_fleet(wallet_address: str):
    """Get all 4 specialized agents' avatars, live statuses, and historical telemetry."""
    from database import get_fleet_activity
    return get_fleet_activity(wallet_address)

class AgentFleetConfigRequest(BaseModel):
    user_wallet: str
    agent_id: str
    is_active: bool
    config: Optional[Dict[str, Any]] = None

@app.post("/api/fleet/config")
def save_agent_fleet_config(body: AgentFleetConfigRequest):
    """Activate/deactivate and configure an agent in the fleet."""
    from database import update_agent_fleet_config
    res = update_agent_fleet_config(
        user_wallet=body.user_wallet,
        agent_id=body.agent_id,
        is_active=body.is_active,
        config=body.config or {}
    )
    # Task 3.3: Lifecycle hook - enable or disable persistent scheduler job
    clean_w = normalize_wallet(body.user_wallet)
    if clean_w:
        agent_key = body.agent_id.lower()
        if agent_key not in ("trader", "rebalancer", "moderator"):
            return res  # research is on-demand: it has no scheduled cadence (previously created a no-op 5-min job)
        purpose = "trade_poll" if agent_key == "trader" else ("rebalance_cadence" if agent_key == "rebalancer" else "fleet_deliberation")
        interval = 3600 if agent_key == "trader" else (604800 if agent_key == "rebalancer" else 300)
        schedule_or_update_persisted_job(
            wallet=clean_w,
            agent_type=agent_key,
            purpose=purpose,
            interval_seconds=interval,
            config=body.config or {},
            enabled=1 if body.is_active else 0
        )
    return res

class AgentUiConfigRequest(BaseModel):
    config: Dict[str, Any]

@app.get("/api/agent-config/{wallet_address}/{agent_id}/hash")
def read_agent_ui_config_hash(wallet_address: str, agent_id: str):
    """Tiny single-column lookup: clients compare this to their cached hash and skip the full pull on match."""
    from database import get_agent_ui_config_hash
    return {"hash": get_agent_ui_config_hash(wallet_address, agent_id)}

@app.get("/api/agent-config/{wallet_address}/{agent_id}")
def read_agent_ui_config(wallet_address: str, agent_id: str):
    """Load the user's saved form configuration (prompts, coins, etc.) for an agent, with its hash."""
    from database import get_agent_ui_config_with_hash
    return get_agent_ui_config_with_hash(wallet_address, agent_id)

@app.post("/api/agent-config/{wallet_address}/{agent_id}")
def write_agent_ui_config(wallet_address: str, agent_id: str, body: AgentUiConfigRequest):
    """Persist the user's form configuration for an agent in the DB; returns the refreshed hash."""
    from database import save_agent_ui_config, compute_config_hash
    cfg = save_agent_ui_config(wallet_address, agent_id, body.config)
    return {"config": cfg, "hash": compute_config_hash(cfg)}

class HyperliquidConfigRequest(BaseModel):
    account_address: str
    api_private_key: Optional[str] = ""
    network: Optional[str] = "mainnet"


@app.get("/api/hyperliquid/config/{wallet_address}")
async def read_hyperliquid_config(wallet_address: str):
    """Public view of the user's Hyperliquid settings (never returns the key)."""
    from database import get_hyperliquid_config_public
    return await asyncio.to_thread(get_hyperliquid_config_public, wallet_address)


@app.post("/api/hyperliquid/config/{wallet_address}")
async def write_hyperliquid_config(wallet_address: str, body: HyperliquidConfigRequest):
    """Save the user's own Hyperliquid account address + API wallet key (key stored encrypted per wallet)."""
    from database import save_hyperliquid_config
    addr = (body.account_address or "").strip()
    if not (addr.startswith("0x") and len(addr) == 42):
        raise HTTPException(status_code=400, detail="Account address must be a 0x... Hyperliquid address (42 characters).")
    key = (body.api_private_key or "").strip()
    if key:
        k = key[2:] if key.startswith("0x") else key
        if len(k) != 64 or any(c not in "0123456789abcdefABCDEF" for c in k):
            raise HTTPException(status_code=400, detail="API wallet private key must be 64 hex characters.")
    return await asyncio.to_thread(save_hyperliquid_config, wallet_address, addr, key, body.network or "mainnet")


@app.delete("/api/hyperliquid/config/{wallet_address}")
async def remove_hyperliquid_config(wallet_address: str):
    from database import delete_hyperliquid_config
    return {"deleted": await asyncio.to_thread(delete_hyperliquid_config, wallet_address)}


@app.post("/api/hyperliquid/test/{wallet_address}")
async def test_hyperliquid_config(wallet_address: str):
    """Read-only connectivity check: derives the API wallet address and reads the account's balance. Places no orders."""
    from autonomous_agents.hyperliquid_adapter import HyperliquidAdapter
    adapter = HyperliquidAdapter.for_user(wallet_address)
    if not adapter.is_configured():
        raise HTTPException(status_code=400, detail="Hyperliquid is not configured for this wallet.")
    return await asyncio.to_thread(adapter.check_connection)


class HyperliquidFundRequest(BaseModel):
    amount_usd: float


@app.post("/api/hyperliquid/fund/{wallet_address}")
async def fund_hyperliquid(wallet_address: str, body: HyperliquidFundRequest):
    """Move USDC from the user's NEAR agent wallet into their Hyperliquid perps balance via 1-Click (real funds)."""
    from autonomous_agents.hyperliquid_adapter import HyperliquidAdapter
    from autonomous_agents.hl_funding import ensure_hyperliquid_margin, MIN_FUND_USD
    from database import validate_agent_execution_wallet
    adapter = HyperliquidAdapter.for_user(wallet_address)
    if not adapter.is_configured():
        raise HTTPException(status_code=400, detail="Hyperliquid is not configured for this wallet.")
    if body.amount_usd < MIN_FUND_USD:
        raise HTTPException(status_code=400, detail=f"Minimum transfer to Hyperliquid is about ${MIN_FUND_USD:.2f}.")
    v = validate_agent_execution_wallet(user_wallet=wallet_address, agent_id="trader")
    agent_wallet = v.get("agent_wallet") or wallet_address
    return await ensure_hyperliquid_margin(wallet_address, adapter, needed_usd=body.amount_usd, agent_wallet=agent_wallet, force_usd=body.amount_usd)


@app.get("/api/network")
def get_current_network():
    """Get active NEAR network mode."""
    from network_config import get_network, is_mainnet_allowed, get_near_rpc
    net = get_network()
    return {
        "network": net,
        "rpc": get_near_rpc(),
        "mainnet_allowed": True,
    }

@app.post("/api/network")
def set_current_network(body: NetworkToggleRequest):
    """Set active NEAR network mode (testnet vs mainnet) - user decided."""
    import os
    selected_network = "mainnet" if body.network.lower() == "mainnet" else "testnet"
    os.environ["NEAR_NETWORK"] = selected_network
    if body.user_wallet:
        upsert_user(body.user_wallet, {"near_network": selected_network})
    return {"status": "updated", "network": selected_network}

@app.post("/api/moderator/kill-switch")
async def moderator_kill_switch_action(body: ModeratorKillSwitchRequest):
    """Emergency kill switch to halt all agents and protect capital."""
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    if body.activate:
        return await moderator.trigger_emergency_kill_switch(body.user_wallet)
    else:
        return await moderator.reset_kill_switch(body.user_wallet)

@app.post("/api/moderator/deliberate")
async def moderator_deliberate(body: ModeratorDeliberateRequest):
    """Trigger on-demand 4-Node LLM-as-a-Judge deliberation across Trader, Rebalancer, and Research."""
    norm_w = normalize_wallet(body.user_wallet)
    if norm_w:
        upsert_user(norm_w, {"moderator_active": 1})
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    return await moderator.evaluate_fleet_performance(body.user_wallet)

@app.post("/api/moderator/start")
async def moderator_start_endpoint(body: ModeratorDeliberateRequest):
    """Start a fleet audit as a background run (survives refresh / navigation, replayable via /api/runs/{id}/stream)."""
    norm_w = normalize_wallet(body.user_wallet)
    _live = await _reuse_live_run(norm_w, "moderator")
    if _live:
        return {"run_id": _live, "status": "running", "reused": True}
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    run_id = await _create_run_fast(
        norm_w, "moderator", "Fleet Audit", {"user_wallet": norm_w},
        lambda: upsert_user(norm_w, {"moderator_active": 1})
    )
    gen_factory = lambda: moderator.evaluate_fleet_stream(norm_w)
    task = asyncio.create_task(_execute_run(run_id, "moderator", norm_w, gen_factory))
    RUNNING_TASKS[run_id] = task
    _register_live_run(norm_w, "moderator", run_id)
    return {"run_id": run_id, "status": "running"}

@app.post("/api/moderator/stream")
async def moderator_deliberate_stream(body: ModeratorDeliberateRequest):
    """Real-time streaming 4-Node Watchdog Deliberation yielding NDJSON events for each node."""
    norm_w = normalize_wallet(body.user_wallet)
    if norm_w:
        upsert_user(norm_w, {"moderator_active": 1})
    from fastapi.responses import StreamingResponse
    from autonomous_agents.moderator_agent import ModeratorAgent
    moderator = ModeratorAgent()
    return StreamingResponse(
        moderator.evaluate_fleet_stream(body.user_wallet),
        media_type="application/x-ndjson"
    )

@app.get("/api/moderator/history/{wallet_address}")
async def moderator_history(wallet_address: str, limit: int = 10):
    """Retrieve historical 4-Node evaluation reports for a wallet."""
    from database import get_moderator_evaluations
    return {"evaluations": get_moderator_evaluations(wallet_address, limit=limit)}

@app.post("/api/moderator/kill-threshold")
async def moderator_set_kill_threshold(body: ModeratorKillThresholdRequest):
    """Configure autonomous agent kill threshold (0-80)."""
    from database import update_moderator_kill_threshold
    updated = update_moderator_kill_threshold(body.user_wallet, body.threshold)
    return {"success": updated, "threshold": body.threshold, "user_wallet": body.user_wallet}

@app.post("/api/moderator/frequency")
async def moderator_set_frequency(body: ModeratorFrequencyRequest):
    """Configure autonomous agent audit cadence ('1w', '2w', '1m')."""
    from database import update_moderator_frequency, get_moderator_cadence_info
    updated = update_moderator_frequency(body.user_wallet, body.frequency)
    cadence = get_moderator_cadence_info(body.user_wallet)
    return {"success": updated, "user_wallet": body.user_wallet, "cadence": cadence}

@app.get("/api/moderator/logs/{wallet_address}")
async def moderator_logs(wallet_address: str, limit: int = 25):
    """Retrieve step-by-step 4-Node audit logs for the Moderator Agent."""
    from database import get_agent_logs
    logs = get_agent_logs(wallet_address, limit=limit, agent_name="moderator")
    return {"logs": logs, "count": len(logs)}


# ─── 5. AGENT MARKETPLACE DISCOVERY & HIRING ──────────────────────

class PublishMarketplaceAgentRequest(BaseModel):
    creator_wallet: str
    agent_type: str  # 'trader', 'rebalancer', 'research'
    name: str
    description: str
    pricing_type: str  # 'profit_share', 'fee_per_trade', 'fee_per_report'
    pricing_value: float
    config_snapshot: Optional[Dict[str, Any]] = None

class HireMarketplaceAgentRequest(BaseModel):
    subscriber_wallet: str
    listing_id: str

class CancelMarketplaceHireRequest(BaseModel):
    subscriber_wallet: str
    hire_id: str

@app.get("/api/marketplace/agents")
async def list_marketplace_agents_endpoint(agent_type: Optional[str] = None):
    """List all real user-published agents from the decentralized marketplace database."""
    from database import get_marketplace_agents
    agents = get_marketplace_agents(agent_type=agent_type)
    return {"agents": agents}

@app.post("/api/marketplace/publish")
async def publish_agent_to_marketplace(body: PublishMarketplaceAgentRequest):
    """Publish an agent to the marketplace with creator-defined profit share or fee."""
    from database import publish_marketplace_agent
    if body.agent_type.lower() == "moderator":
        raise HTTPException(status_code=400, detail="Moderator Watchdog agent is platform-reserved and cannot be listed for sale.")
    try:
        listing = publish_marketplace_agent(
            creator_wallet=body.creator_wallet,
            agent_type=body.agent_type,
            name=body.name,
            description=body.description,
            pricing_type=body.pricing_type,
            pricing_value=body.pricing_value,
            config_snapshot=body.config_snapshot
        )
        return {"status": "success", "listing": listing}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/marketplace/hire")
async def hire_marketplace_agent_endpoint(body: HireMarketplaceAgentRequest):
    """Hire a shared marketplace agent. Trades & actions taken by creator will be mirrored for subscriber."""
    from database import hire_marketplace_agent
    try:
        result = hire_marketplace_agent(body.subscriber_wallet, body.listing_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/marketplace/hires/{user_wallet}")
async def get_user_marketplace_hires(user_wallet: str):
    """Get active hires and subscribers for a wallet."""
    from database import get_user_hires
    return get_user_hires(user_wallet)

@app.post("/api/marketplace/hire/cancel")
async def cancel_marketplace_hire_endpoint(body: CancelMarketplaceHireRequest):
    """Cancel a hire subscription."""
    from database import cancel_marketplace_hire
    success = cancel_marketplace_hire(body.subscriber_wallet, body.hire_id)
    return {"status": "cancelled" if success else "not_found", "success": success}

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




# ===================================================================
# Agent Wallet Manager Endpoints (Autonomous Key Pool)
# ===================================================================

class GenerateAgentWalletRequest(BaseModel):
    user_wallet: str
    label: Optional[str] = ""
    wallet_type: Optional[str] = "implicit"
    subaccount_prefix: Optional[str] = ""
    funding_near: Optional[float] = 0.5
    assigned_agent: Optional[str] = None

class ImportAgentWalletRequest(BaseModel):
    user_wallet: str
    agent_account_id: Optional[str] = ""
    private_key: Optional[str] = ""
    public_key: Optional[str] = ""
    label: Optional[str] = ""
    seed_phrase: Optional[str] = ""

class AssignAgentWalletsRequest(BaseModel):
    user_wallet: str
    assignments: Dict[str, Any]

class DeleteAgentWalletRequest(BaseModel):
    user_wallet: str
    key_id: int

class ActivateSubaccountRequest(BaseModel):
    user_wallet: str
    key_id: int
    tx_hash: Optional[str] = ""
    assigned_agent: Optional[str] = None


@app.get("/api/agent-wallet/config/{wallet_address}")
def get_agent_wallet_configuration(wallet_address: str):
    """
    Get full Agent Wallet pool (up to 4 wallets) and agent assignment mapping.
    """
    from database import get_user_agent_wallet_config
    return get_user_agent_wallet_config(wallet_address)


@app.post("/api/agent-wallet/generate")
async def generate_agent_wallet_endpoint(body: GenerateAgentWalletRequest):
    """
    Generate a new dedicated Agent Wallet keypair (max 4 per user).
    Creates an on-chain signing payload for the user's main wallet to fund & delegate FullAccess.
    """
    from database import create_agent_wallet
    try:
        new_wallet = create_agent_wallet(
            user_wallet=body.user_wallet,
            label=body.label or "",
            wallet_type=body.wallet_type or "implicit",
            subaccount_prefix=body.subaccount_prefix or "",
            funding_near=body.funding_near or 0.5,
            assigned_agent=body.assigned_agent
        )
        return {"status": "success", "wallet": new_wallet}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-wallet/activate-subaccount")
async def activate_subaccount_endpoint(body: ActivateSubaccountRequest):
    """
    Activate a named subaccount agent wallet after the on-chain creation transaction has been signed & confirmed.
    """
    from database import activate_agent_wallet
    try:
        activated = activate_agent_wallet(
            user_wallet=body.user_wallet,
            key_id=body.key_id,
            tx_hash=body.tx_hash or "",
            assigned_agent=body.assigned_agent
        )
        if not activated:
            raise HTTPException(status_code=404, detail="Agent wallet not found or already active")
        return {"status": "success", "activated": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-wallet/import")
async def import_agent_wallet_endpoint(body: ImportAgentWalletRequest):
    """
    Import an existing account or custom keypair into the user's agent wallet pool (max 4).
    """
    from database import import_agent_wallet
    try:
        imported = import_agent_wallet(
            user_wallet=body.user_wallet,
            agent_account_id=body.agent_account_id,
            private_key=body.private_key or "",
            public_key=body.public_key or "",
            label=body.label or "",
            seed_phrase=body.seed_phrase or ""
        )
        return {"status": "success", "wallet": imported}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent-wallet/assign")
async def assign_agent_wallets_endpoint(body: AssignAgentWalletsRequest):
    """
    Assign which agent uses which agent wallet.
    Constraint: Each agent can only be connected to 1 wallet at a time.
    However, 1 wallet CAN be shared across multiple agents.
    """
    from database import assign_agent_wallets
    try:
        updated_config = await asyncio.to_thread(assign_agent_wallets, user_wallet=body.user_wallet, assignments=body.assignments)
        return {"status": "success", "config": updated_config}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/agent-wallet/delete")
async def delete_agent_wallet_endpoint(body: DeleteAgentWalletRequest):
    """
    Delete an agent wallet and unassign it from any agents.
    """
    from database import delete_user_agent_wallet
    success = delete_user_agent_wallet(user_wallet=body.user_wallet, key_id=body.key_id)
    return {"status": "success" if success else "not_found", "deleted": success}


class WithdrawAgentWalletRequest(BaseModel):
    user_wallet: str
    key_id: int
    amount_near: Optional[float] = None


@app.post("/api/agent-wallet/withdraw")
async def withdraw_agent_wallet_endpoint(body: WithdrawAgentWalletRequest):
    """
    Withdraw NEAR tokens from an autonomous agent execution wallet back to the user's primary funding wallet.
    Uses the agent's stored encrypted private key to sign an on-chain transfer.
    """
    from database import export_agent_wallet_key
    from network_config import get_near_rpc, get_near_rpc_endpoints
    from py_near.account import Account
    import requests as req

    try:
        creds = export_agent_wallet_key(body.user_wallet, body.key_id)
        agent_addr = creds["agent_wallet_address"]
        priv_key = creds["private_key"]
        dest_addr = body.user_wallet

        rpc_url = get_near_rpc(agent_addr)

        # 1. Fetch current on-chain balance & storage usage
        endpoints = get_near_rpc_endpoints(agent_addr)
        total_yocto = 0
        storage_bytes = 0
        for ep in endpoints:
            try:
                resp = req.post(ep, json={
                    "jsonrpc": "2.0", "id": "1", "method": "query",
                    "params": {"request_type": "view_account", "finality": "final", "account_id": agent_addr}
                }, timeout=5)
                data = resp.json().get("result", {})
                if "amount" in data:
                    total_yocto = int(data.get("amount", "0"))
                    storage_bytes = int(data.get("storage_usage", 0))
                    break
            except Exception:
                continue

        storage_cost = storage_bytes * (10**19)
        gas_buffer = int(0.005 * 1e24)  # 0.005 NEAR buffer for tx gas
        max_withdrawable_yocto = total_yocto - storage_cost - gas_buffer

        if max_withdrawable_yocto <= 0:
            raise ValueError(f"Insufficient funds to cover storage staking. Balance: {total_yocto / 1e24:.4f} NEAR, Storage reserve: {storage_cost / 1e24:.4f} NEAR.")

        if body.amount_near and body.amount_near > 0:
            req_yocto = int(body.amount_near * 1e24)
            yocto_to_send = min(req_yocto, max_withdrawable_yocto)
        else:
            yocto_to_send = max_withdrawable_yocto

        # 2. Execute on-chain transfer
        acc = Account(agent_addr, private_key=priv_key, rpc_addr=rpc_url)
        await acc.startup()
        tx_res = await acc.send_money(dest_addr, yocto_to_send)
        tx_hash = tx_res.transaction.hash if hasattr(tx_res, "transaction") and hasattr(tx_res.transaction, "hash") else str(tx_res)

        return {
            "status": "success",
            "tx_hash": tx_hash,
            "transferred_near": yocto_to_send / 1e24,
            "recipient": dest_addr,
            "sender": agent_addr
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class CrossChainSettingsRequest(BaseModel):
    user_wallet: str
    allow_cross_chain: bool


@app.post("/api/settings/cross-chain")
async def update_cross_chain_setting_endpoint(body: CrossChainSettingsRequest):
    """Toggle cross-chain trading permissions via NEAR Intents."""
    from database import update_cross_chain_setting
    success = update_cross_chain_setting(body.user_wallet, body.allow_cross_chain)
    return {"success": success, "allow_cross_chain": body.allow_cross_chain}


@app.get("/api/agent-wallet/dropped-trades/{wallet_address}")
async def get_dropped_trades_endpoint(wallet_address: str, limit: int = 20):
    """Get all transactions dropped by the Hard Agent Wallet Validator."""
    from database import get_dropped_trades
    dropped = get_dropped_trades(wallet_address, limit=limit)
    return {"dropped_trades": dropped, "total": len(dropped)}

@app.get("/api/agent-wallet/balance/{address}")
async def get_agent_wallet_balance(address: str, chain: str = "near"):
    """Check the balance of an agent wallet via RPC. Supports near, evm, flow."""
    import requests as req
    try:
        if chain == "near":
            from network_config import get_near_rpc_endpoints
            endpoints = get_near_rpc_endpoints(address)
            for rpc_url in endpoints:
                try:
                    resp = req.post(rpc_url, json={
                        "jsonrpc": "2.0", "id": "1", "method": "query",
                        "params": {"request_type": "view_account", "finality": "final", "account_id": address}
                    }, timeout=5)
                    data = resp.json()
                    result = data.get("result", {})
                    if "amount" in result:
                        amount = result.get("amount", "0")
                        near_bal = int(amount) / 1e24
                        return {"balance": amount, "formatted": f"{near_bal:.4f} NEAR", "exists": True}
                    if "error" in data:
                        err_str = str(data["error"])
                        if "UNKNOWN_ACCOUNT" in err_str or "does not exist" in err_str or "AccountDoesNotExist" in err_str:
                            return {"balance": "0", "formatted": "0 NEAR", "exists": False}
                except Exception:
                    continue
            return {"balance": "0", "formatted": "0 NEAR", "exists": False}

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


class ExecuteTxRequest(BaseModel):
    account_id: str
    network: str = "testnet"
    payload: Any

@app.post("/api/autonomy/execute-tx")
async def execute_tx_broadcast(body: ExecuteTxRequest):
    """Broadcast or execute transaction payload on the specified network."""
    import uuid
    from key_manager import decrypt_private_key
    from database import get_agent_key
    from autonomous_agents.near_submitter import submit_near_transaction

    agent_key = get_agent_key(body.account_id, "near")
    if agent_key and agent_key.get("encrypted_private_key"):
        try:
            priv_key = decrypt_private_key(agent_key["encrypted_private_key"], wallet_address=body.account_id)
            tx_payload = body.payload if isinstance(body.payload, list) else [body.payload]
            tx_hash = await submit_near_transaction(
                tx_payload=tx_payload,
                agent_address=body.account_id,
                private_key=priv_key
            )
            return {"status": "broadcast", "tx_hash": tx_hash}
        except Exception as e:
            print(f"[EXECUTE-TX] Submitter error for {body.account_id}: {e}")

    # Fallback simulation hash for testnet testing
    sim_hash = f"testnet-{uuid.uuid4().hex[:16]}"
    return {"status": "simulated", "tx_hash": sim_hash}







class FundAgentWalletRequest(BaseModel):
    user_wallet: str
    key_id: int
    amount_near: Optional[float] = 0.5


@app.post("/api/agent-wallet/fund-payload")
async def fund_agent_wallet_payload_endpoint(body: FundAgentWalletRequest):
    """Generate sign payload to deposit funds into an existing agent execution wallet from main connected wallet."""
    from database import get_fund_agent_wallet_payload
    try:
        payload = get_fund_agent_wallet_payload(body.user_wallet, body.key_id, body.amount_near or 0.5)
        return {"status": "success", "sign_payload": payload}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class GenerateEvmAgentWalletRequest(BaseModel):
    user_wallet: str
    label: Optional[str] = "Trader Arbitrum / EVM Wallet"
    assigned_agent: Optional[str] = None


@app.post("/api/agent-wallet/generate-evm")
async def generate_evm_agent_wallet_endpoint(body: GenerateEvmAgentWalletRequest):
    """Generate a dedicated EVM / Arbitrum / Ethereum keypair for cross-chain trades."""
    from database import create_evm_agent_wallet
    try:
        w = create_evm_agent_wallet(body.user_wallet, body.label or "", body.assigned_agent)
        return {"status": "success", "wallet": w}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class ExportAgentKeyRequest(BaseModel):
    user_wallet: str
    key_id: int


@app.post("/api/agent-wallet/export-key")
async def export_agent_key_endpoint(body: ExportAgentKeyRequest):
    """
    Allow the authenticated user to export / copy their agent's private key and access credentials.
    Strictly verifies ownership against user_wallet (the primary key in core_user_wallets).
    Autonomous agents NEVER have access to this endpoint or raw private keys.
    """
    from database import export_agent_wallet_key
    try:
        credentials = export_agent_wallet_key(body.user_wallet, body.key_id)
        return {"status": "success", "credentials": credentials}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


ADMIN_WIPE_TOKEN = os.getenv("ADMIN_WIPE_TOKEN", "neptune_admin_secret_wipe_token_2026")


@app.delete("/api/admin/wipe-all")
async def admin_wipe_all_endpoint(
    request: Request,
    x_admin_token: Optional[str] = Header(None, alias="X-Admin-Token")
):
    """
    Administrative Data Wipe Endpoint (Safeguarded).
    Requires X-Admin-Token header matching ADMIN_WIPE_TOKEN.
    Requires JSON body: {"confirm": "WIPE ALL DATA"}.
    Completely purges all user data tables and forces immediate cloud sync.
    """
    expected_token = os.getenv("ADMIN_WIPE_TOKEN", "neptune_admin_secret_wipe_token_2026")
    if not x_admin_token or x_admin_token != expected_token:
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: invalid or missing X-Admin-Token"
        )

    try:
        body = await request.json()
    except Exception:
        body = {}

    if not isinstance(body, dict) or body.get("confirm") != "WIPE ALL DATA":
        raise HTTPException(
            status_code=400,
            detail='Confirmation phrase required: {"confirm": "WIPE ALL DATA"}'
        )

    from database import wipe_all_data
    stats = wipe_all_data()
    return stats


if __name__ == "__main__":
    if not os.getenv("NEAR_AI_API_KEY"):
        print("WARNING: NEAR_AI_API_KEY not found in environment variables. Agent will fail.")

    import socket as _socket
    with _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM) as _probe:
        _probe.settimeout(1.0)
        if _probe.connect_ex(("127.0.0.1", 8000)) == 0:
            raise SystemExit(
                "Port 8000 is already in use by another running backend. Two servers on one port split requests "
                "between them (one terminal shows no logs). Stop the old one first."
            )
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
