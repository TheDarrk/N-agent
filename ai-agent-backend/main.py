from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union

import uuid
import uvicorn
import os
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Rate limiting
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Import our Agent logic
from agents import process_message
from knowledge_base import get_available_tokens_from_api, format_token_list_for_display

# Initialize Limiter
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Neptune AI Agent")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Strict CORS Policy (Production Only)
ORIGINS = [
    "https://neptuneai-agent.vercel.app",
    "https://neptune-ai-agent.vercel.app", # Including potential alias just in case, but user specified the confirmed one
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session store
sessions: Dict[str, Dict[str, Any]] = {}

class ChatRequest(BaseModel):
    message: str
    session_id: str
    account_id: Optional[str] = None
    wallet_addresses: Optional[Dict[str, str]] = None  # {"near": "x.near", "eth": "0x...", "solana": "..."}
    connected_chains: Optional[List[str]] = None       # ["near", "eth", "solana"]
    balances: Optional[Dict[str, str]] = None          # {"near": "10.5", "eth": "1.2"}

class ChatResponse(BaseModel):
    response: str
    action: Optional[str] = None
    payload: Optional[Union[Dict[str, Any], List[Any]]] = None

@app.post("/chat", response_model=ChatResponse)
@limiter.limit("20/minute")
async def chat_endpoint(body: ChatRequest, request: Request):
    session_id = body.session_id
    user_msg = body.message
    
    # 1. Initialize or Retrieve Session
    if session_id not in sessions:
        sessions[session_id] = {
            "history": [],
            "state": {"step": "IDLE"} # Start in IDLE state
        }
    
    session_data = sessions[session_id]
    current_state = session_data["state"]
    history = session_data["history"]
    
    # 2. Process Message via Agent Orchestrator with conversation history
    wallet_addresses = body.wallet_addresses or {}
    connected_chains = list(wallet_addresses.keys()) if wallet_addresses else []
    
    user_context = {
        "account_id": body.account_id,
        "connected_chains": connected_chains,
        "wallet_addresses": wallet_addresses,
        "balances": body.balances or {},
        "history": history  # Pass conversation history to agent
    }
    result = await process_message(user_msg, current_state, user_context)
    
    # 3. Update Session State
    session_data["state"] = result.get("new_state", {"step": "IDLE"})
    
    # 4. Update History
    ai_text = result["response"]
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
    """
    Get list of all available tokens from 1-Click API.
    """
    try:
        tokens = await get_available_tokens_from_api()
        return {
            "tokens": tokens,
            "count": len(tokens)
        }
    except Exception as e:
        return {
            "error": str(e),
            "tokens": [],
            "count": 0
        }

if __name__ == "__main__":
    if not os.getenv("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY not found in environment variables. Agent will fail.")
        
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
