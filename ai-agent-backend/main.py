from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any, Union

import uuid
import uvicorn
import os
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

# Import our Agent logic
from agents import process_message
from knowledge_base import get_available_tokens_from_api, format_token_list_for_display

app = FastAPI(title="Neptune AI Agent")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    balances: Optional[Dict[str, str]] = None          # {"near": "10.5", "eth": "1.2"}

class ChatResponse(BaseModel):
    response: str
    action: Optional[str] = None
    payload: Optional[Union[Dict[str, Any], List[Any]]] = None

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    session_id = request.session_id
    user_msg = request.message
    
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
    wallet_addresses = request.wallet_addresses or {}
    connected_chains = list(wallet_addresses.keys()) if wallet_addresses else []
    
    user_context = {
        "account_id": request.account_id,
        "connected_chains": connected_chains,
        "wallet_addresses": wallet_addresses,
        "balances": request.balances or {},
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
