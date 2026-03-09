"""
Neptune AI   Orchestrator Agent
Splits compound user queries into individual intents, routes each to
the correct sub-agent, executes what's possible, and asks follow-up
questions for the rest. Returns a unified response.

Example: "Set alert for BTC at 5%, rebalance my portfolio, and quote 0.1 NEAR to USDC"
-> Splits into 3 intents, routes to Autonomy + Swap agents, merges results.
"""

import os
import json
import asyncio
from typing import Dict, Any, List

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


# -- Orchestrator LLM (lightweight, fast) -------------------------

api_key = os.getenv("NEAR_AI_API_KEY")

orchestrator_llm = ChatOpenAI(
    model="openai/gpt-oss-120b",
    temperature=0,
    openai_api_key=api_key,
    openai_api_base="https://cloud-api.near.ai/v1"
)


# -- Intent Splitter Prompt ---------------------------------------

SPLIT_PROMPT = """You are Neptune AI's Intent Splitter. Your ONLY job is to split a compound user message into individual intents.

For each intent, classify it as one of:
- "swap"   token swap, quote, trade, exchange, price check
- "autonomy"   strategy setup, alert, stop loss, rebalance, guardrails, kill switch, settings
- "flow"   Flow blockchain operations, Flow NFTs, Flow transfers
- "general"   general question, capabilities, help

For each intent, also determine:
- "has_enough_info": true/false   can this intent be acted on WITHOUT asking the user for more info?
- "extracted_query": the standalone question/command for this single intent

IMPORTANT:
- If the user's message has ONLY ONE intent, return a list with 1 item.
- If unclear, default to 1 intent with the full message.
- Do NOT split too aggressively   "swap 0.1 NEAR for USDC on Base" is ONE intent, not three.

Return ONLY valid JSON array, no markdown:
[
  {"type": "swap", "has_enough_info": true, "extracted_query": "get quote for 0.1 NEAR to USDC"},
  {"type": "autonomy", "has_enough_info": true, "extracted_query": "set alert for BTC drop 5%"},
  {"type": "autonomy", "has_enough_info": false, "extracted_query": "rebalance my portfolio"}
]
"""


async def split_intents(user_msg: str) -> List[Dict[str, Any]]:
    """
    Use LLM to split a compound message into individual intents.
    Returns list of intent dicts with type, has_enough_info, extracted_query.
    """
    try:
        response = await orchestrator_llm.ainvoke([
            SystemMessage(content=SPLIT_PROMPT),
            HumanMessage(content=user_msg)
        ])

        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        intents = json.loads(raw)

        if not isinstance(intents, list) or len(intents) == 0:
            return [{"type": "general", "has_enough_info": True, "extracted_query": user_msg}]

        print(f"[ORCHESTRATOR] Split into {len(intents)} intent(s): {[i['type'] for i in intents]}")
        return intents

    except Exception as e:
        error_msg = str(e).lower()
        if "401" in error_msg or "unauthorized" in error_msg or "api key" in error_msg:
            # Send a special internal intent so the orchestrator knows it failed due to Auth
            return [{"type": "auth_error", "has_enough_info": True, "extracted_query": str(e)}]
            
        print(f"[ORCHESTRATOR] Split failed: {e}, falling back to single intent")
        return [{"type": "general", "has_enough_info": True, "extracted_query": user_msg}]


async def orchestrate_compound_query(
    user_msg: str,
    session_state: Dict[str, Any],
    user_context: Dict[str, Any],
    process_swap_fn,
    process_autonomy_fn,
    process_flow_fn
) -> Dict[str, Any]:
    """
    Orchestrate a compound query:
    1. Split into intents
    2. Route each to the right agent
    3. Execute in parallel where possible
    4. Merge results into one response
    """
    intents = await split_intents(user_msg)

    # Single intent   route directly (no overhead)
    if len(intents) == 1:
        intent = intents[0]
        query = intent.get("extracted_query", user_msg)

        if intent["type"] == "auth_error":
            return {
                "response": "  **API Key Required**\n\nI need a valid LLM API key to process this request. Please configure your `NEAR_AI_API_KEY` in the backend service and restart the server.",
                "new_state": {"step": "IDLE"}
            }
        elif intent["type"] == "autonomy":
            return await process_autonomy_fn(query, session_state, user_context)
        elif intent["type"] == "flow":
            return await process_flow_fn(query, session_state, user_context)
        else:
            return await process_swap_fn(query, session_state, user_context)

    # Multiple intents   process each and merge
    print(f"[ORCHESTRATOR] Processing {len(intents)} intents in parallel where possible")
    
    # Check if ANY intent is an auth error
    for intent in intents:
        if intent.get("type") == "auth_error":
             return {
                "response": "  **API Key Required**\n\nI need a valid LLM API key to process this request. Please configure your `NEAR_AI_API_KEY` in the backend service and restart the server.",
                "new_state": {"step": "IDLE"}
             }

    results = []
    pending_questions = []

    # Group by type for efficient processing
    tasks = []
    for i, intent in enumerate(intents):
        query = intent.get("extracted_query", "")
        itype = intent.get("type", "general")

        if itype == "autonomy":
            tasks.append((i, intent, process_autonomy_fn(query, session_state, user_context)))
        elif itype == "flow":
            tasks.append((i, intent, process_flow_fn(query, session_state, user_context)))
        elif itype == "swap":
            tasks.append((i, intent, process_swap_fn(query, session_state, user_context)))
        else:
            # General questions   route to swap (main) agent
            tasks.append((i, intent, process_swap_fn(query, session_state, user_context)))

    # Execute all concurrently
    task_coroutines = [t[2] for t in tasks]
    agent_results = await asyncio.gather(*task_coroutines, return_exceptions=True)

    # Merge results
    completed = []
    follow_ups = []
    tx_action = None
    tx_payload = None

    for idx, (i, intent, _) in enumerate(tasks):
        result = agent_results[idx]

        if isinstance(result, Exception):
            follow_ups.append(f"  **{intent['type'].title()}**: Error processing   {str(result)}")
            continue

        response_text = result.get("response", "")
        action = result.get("action")
        payload = result.get("payload")

        # Check if this result needs user input (contains a question)
        has_question = any(q in response_text.lower() for q in [
            "which token", "what %", "what's your", "could you",
            "please specify", "what drift", "what should"
        ])

        if has_question and not intent.get("has_enough_info", True):
            follow_ups.append(f"  **{intent['type'].title()}**: {response_text}")
        else:
            completed.append(f"  **{intent['type'].title()}**: {response_text}")

        # Capture transaction payload if present (for swap confirmations)
        if action and payload:
            tx_action = action
            tx_payload = payload

    # Build merged response
    merged_parts = []

    if completed:
        merged_parts.append("**Completed:**\n" + "\n\n".join(completed))

    if follow_ups:
        merged_parts.append("**Need your input:**\n" + "\n\n".join(follow_ups))

    merged_response = "\n\n---\n\n".join(merged_parts) if merged_parts else "I processed your request. Check the results above."

    result = {
        "response": merged_response,
        "new_state": {"step": "IDLE"}
    }

    if tx_action:
        result["action"] = tx_action
    if tx_payload:
        result["payload"] = tx_payload

    return result
