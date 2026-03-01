"""
LangChain agent for NEAR token swaps using tool calling.
LLM decides which tools to call based on user query.
"""
import json
import os
from typing import Dict, Any

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from agent_tools import TOOL_LIST
from prompts import MASTER_SYSTEM_PROMPT


# Initialize LLM with NEAR AI endpoint
api_key = os.getenv("NEAR_AI_API_KEY") or os.getenv("OPENAI_API_KEY")

llm = ChatOpenAI(
    model="openai/gpt-oss-120b",
    temperature=0.3,
    openai_api_key=api_key,
    openai_api_base="https://cloud-api.near.ai/v1"
)

# Bind tools to LLM
llm_with_tools = llm.bind_tools(TOOL_LIST)

# System message for the agent
SYSTEM_MESSAGE = MASTER_SYSTEM_PROMPT + """

**Runtime Tool Reference (quick lookup):**
- get_available_tokens_tool → List ALL supported tokens (use ONLY for "show all tokens" queries)
- get_token_chains_tool → Chains for a SPECIFIC token (use for "options for ETH", "where is AURORA?", etc.)
- validate_token_names_tool → Fix token name typos/misspellings
- get_swap_quote_tool → Get a live swap quote (for new swap requests only)
- confirm_swap_tool → Confirm and prepare transaction (after user says "yes" to a quote)
- hot_pay_coming_soon_tool → Handle ANY request about payment links, invoices, or checking payments (features are currently in progress)

REMEMBER: If user asks about a SPECIFIC token → get_token_chains_tool. If user wants ALL tokens → get_available_tokens_tool.
If user asks about payment links or tracking → use hot_pay_coming_soon_tool.
Be conversational, friendly, and concise. You are Neptune AI.
"""


async def process_message(
    user_msg: str,
    session_state: Dict[str, Any],
    user_context: Dict[str, Any] = {}
) -> Dict[str, Any]:
    """
    Process user message using tool-calling LLM.
    LLM decides what tools to call (if any) and formulates response.
    
    Args:
        user_msg: User's message
        session_state: Current session state
        user_context: User context (account_id, etc.)
    
    Returns:
        Dict with response, action, payload, and new state
    """
    account_id = user_context.get("account_id", "Not connected")
    current_step = session_state.get("step", "IDLE")
    
    print(f"[AGENT] Processing: {user_msg} | Step: {current_step} | Account: {account_id}")
    
    # Ensure token cache is populated for cross-chain detection
    try:
        from knowledge_base import _token_cache, get_available_tokens_from_api
        if not _token_cache:
            print("[AGENT] Populating token cache...")
            await get_available_tokens_from_api()
    except Exception as e:
        print(f"[AGENT] Warning: Could not populate token cache: {e}")
    
    # Handle confirmation state
    if current_step == "WAITING_CONFIRMATION":
        pending = session_state.get("pending_quote", {})
        
        user_lower = user_msg.lower().strip()
        is_confirmed = any(word in user_lower for word in ["yes", "confirm", "go", "proceed", "ok", "sure", "yep", "yeah"])
        
        if is_confirmed:
            from tools import create_deposit_transaction, get_sign_action_type

            source_chain = pending.get("source_chain", "near").lower()
            
            tx_payload = create_deposit_transaction(
                token_in=pending["token_in"],
                token_out=pending["token_out"],
                amount=pending["amount"],
                min_amount_out=pending.get("min_amount_out", 0),
                deposit_address=pending["deposit_address"],
                source_chain=source_chain,
                account_id=pending.get("account_id", account_id)
            )
            action = get_sign_action_type(source_chain)
            
            return {
                "response": f"✅ Transaction prepared for {source_chain.upper()}! Please review and sign it in your wallet.",
                "action": action,
                "payload": tx_payload,
                "new_state": {"step": "IDLE"}
            }
        else:
            return {
                "response": "No problem! Swap cancelled. Let me know if you'd like to try a different swap!",
                "new_state": {"step": "IDLE"}
            }
    
    # Process with LLM and tools
    try:
        # Convert history to LangChain messages
        history = user_context.get("history", [])
        
        # Limit history to last 6 messages (3 exchanges) to avoid context issues
        # Tool calling with long history can cause problems
        recent_history = history[-6:] if len(history) > 6 else history
        
        messages = [SystemMessage(content=SYSTEM_MESSAGE)]
        
        # Add recent conversation history only
        for msg in recent_history:
            if msg["role"] == "user":
                messages.append(HumanMessage(content=msg["content"]))
            elif msg["role"] == "ai":
                messages.append(AIMessage(content=msg["content"]))
        
        # Add current message with wallet context (multi-chain via HOT Kit)
        connected_chains = user_context.get("connected_chains", [])
        wallet_addresses = user_context.get("wallet_addresses", {})
        balances = user_context.get("balances", {})
        
        wallet_info = f"[User wallet: {account_id}"
        if connected_chains:
            wallet_info += f" | connected_chains: [{', '.join(connected_chains)}]"
        if wallet_addresses:
            addr_parts = [f"{chain}: {addr}" for chain, addr in wallet_addresses.items()]
            wallet_info += f" | addresses: {', '.join(addr_parts)}"
        if balances:
            bal_parts = [f"{chain}: {amt}" for chain, amt in balances.items()]
            wallet_info += f" | balances: {', '.join(bal_parts)}"
        wallet_info += "]"
        
        messages.append(HumanMessage(content=f"{user_msg}\n\n{wallet_info}"))
        
        print(f"[AGENT] Sending {len(messages)} messages (including {len(recent_history)} recent history items)")
        
        # Call LLM
        response = await llm_with_tools.ainvoke(messages)
        
        # Initialize tool messages list (used by both branches)
        tool_messages = []
        
        # Check if LLM wants to call tools
        if response.tool_calls:
            print(f"[AGENT] LLM calling {len(response.tool_calls)} tool(s)")
            
            # Execute each tool call
            transaction_prepared = False
            tx_payload = None
            
            for tool_call in response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                
                print(f"[AGENT] Calling tool: {tool_name} with args: {tool_args}")
                
                # Special handling for transaction preparation
                if tool_name == "prepare_swap_transaction_tool":
                    transaction_prepared = True
                    from tools import create_deposit_transaction
                    try:
                        tx_payload = create_deposit_transaction(
                            token_in=tool_args["token_in"],
                            token_out=tool_args["token_out"],
                            amount=tool_args["amount"],
                            min_amount_out=tool_args.get("min_amount_out", 0),
                            deposit_address=tool_args["deposit_address"],
                            source_chain=tool_args.get("source_chain", "near"),
                            account_id=tool_args.get("account_id", account_id)
                        )
                        tool_result = "✅ Transaction prepared successfully and ready for user signature."
                    except Exception as e:
                        tool_result = f"❌ Error preparing transaction: {str(e)}"
                        print(f"[AGENT] Transaction prep error: {e}")
                else:
                    # Find and execute the tool normally
                    tool_result = None
                    for tool in TOOL_LIST:
                        if tool.name == tool_name:
                            # Try up to 2 attempts (auto-retry on failure)
                            for attempt in range(2):
                                try:
                                    print(f"[AGENT] Executing tool: {tool_name}" + (f" (retry)" if attempt > 0 else ""))
                                    tool_result = await tool.ainvoke(tool_args)
                                    print(f"[AGENT] Tool result: {tool_result[:200] if isinstance(tool_result, str) else tool_result}")
                                    break  # Success, stop retrying
                                except Exception as e:
                                    print(f"[AGENT] ERROR in tool execution (attempt {attempt+1}): {e}")
                                    if attempt == 0:
                                        import asyncio
                                        await asyncio.sleep(0.5)
                                        continue  # Retry once
                                    import traceback
                                    traceback.print_exc()
                                    tool_result = f"Error calling tool: {str(e)}"
                            break
                    
                    if tool_result is None:
                        tool_result = f"Tool {tool_name} not found"
                        print(f"[AGENT] WARNING: {tool_result}")
                
                # Add tool result using HumanMessage (NEAR AI workaround)
                # NEAR AI ignores ToolMessage content, so we use HumanMessage instead
                tool_messages.append(HumanMessage(
                    content=f"Tool '{tool_name}' returned:\n{tool_result}"
                ))
            
            # Get final response from LLM with tool results
            print(f"[AGENT] Getting final response from LLM with {len(tool_messages)} tool results")
            
            # Build the final message sequence for tool response
            # NEAR AI workaround: Do NOT include the AIMessage with tool_calls
            # (NEAR AI returns empty responses when it encounters tool_calls in AIMessage).
            # Instead, merge user query + tool results into a single HumanMessage
            # to avoid consecutive HumanMessages which also cause empty responses.
            tool_response_messages = [SystemMessage(content=SYSTEM_MESSAGE)]
            
            # Include history
            for msg in recent_history:
                if msg["role"] == "user":
                    tool_response_messages.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "ai":
                    tool_response_messages.append(AIMessage(content=msg["content"]))
            
            # Combine user message + tool results into ONE HumanMessage
            # This avoids consecutive HumanMessages that confuse NEAR AI
            # Use a bridge AIMessage to separate user query from tool results
            # so the LLM understands: user asked → I fetched data → here it is
            tool_results_text = "\n\n".join(
                msg.content for msg in tool_messages
            )
            
            # User's original question
            connected_chains = user_context.get("connected_chains", [])
            chains_str = ', '.join(connected_chains) if connected_chains else 'none'
            tool_response_messages.append(HumanMessage(content=f"{user_msg}\n\n[User wallet: {account_id} | connected_chains: [{chains_str}]]"))
            
            # Bridge AIMessage: makes the LLM think it "decided" to fetch data
            tool_names_called = ", ".join(tc["name"] for tc in response.tool_calls)
            tool_response_messages.append(AIMessage(content=f"Let me look that up using {tool_names_called}."))
            
            # Tool results as a HumanMessage with clear instruction
            tool_response_messages.append(HumanMessage(
                content=(
                    f"Here are the results:\n\n{tool_results_text}\n\n"
                    f"Based on this data, take the NEXT action:\n"
                    f"- If you now have enough info to swap (token, amount, chains confirmed), call `get_swap_quote_tool` NOW.\n"
                    f"- If the user needs to choose or you need more info, respond with a question.\n"
                    f"- NEVER respond with text saying 'Fetching quote...' or 'Let me get a quote' without ACTUALLY calling the tool.\n"
                    f"- If a tool errored, try once more or explain the issue to the user."
                )
            ))
            
            # Debug: Show message types being sent
            msg_types = [f"{type(m).__name__}" for m in tool_response_messages]
            print(f"[AGENT] Tool response sequence: {' → '.join(msg_types)}")
            
            print(f"[AGENT] Sending {len(tool_response_messages)} messages to LLM for final response")
            print(f"[AGENT] Sending {len(tool_response_messages)} messages to LLM for final response")
            
            # Enable tools for this response too, to allow multi-step flows (Check Chains -> Get Quote)
            final_response = await llm_with_tools.ainvoke(tool_response_messages)
            
            # Handle multi-step tool chains (e.g. Get Chains → Get Quote → Confirm)
            # Loop up to 3 more passes so tools can chain together in one user message
            pass_count = 1
            MAX_TOOL_PASSES = 3
            while final_response.tool_calls and pass_count <= MAX_TOOL_PASSES:
                pass_count += 1
                print(f"[AGENT] Pass {pass_count} tool calling: {len(final_response.tool_calls)} tool(s)")
                
                # Do NOT re-append the AIMessage with tool_calls (NEAR AI workaround)
                # Just process the tools and append results
                
                for tool_call in final_response.tool_calls:
                    tool_name = tool_call["name"]
                    tool_args = tool_call["args"]
                    print(f"[AGENT] Calling tool (Pass {pass_count}): {tool_name}")
                    
                    tool_result = None
                    
                    # Special handling for transaction preparation
                    if tool_name == "prepare_swap_transaction_tool":
                        transaction_prepared = True
                        from tools import create_deposit_transaction
                        try:
                            tx_payload = create_deposit_transaction(
                                token_in=tool_args["token_in"],
                                token_out=tool_args["token_out"],
                                amount=tool_args["amount"],
                                min_amount_out=tool_args.get("min_amount_out", 0),
                                deposit_address=tool_args["deposit_address"],
                                source_chain=tool_args.get("source_chain", "near"),
                                account_id=tool_args.get("account_id", account_id)
                            )
                            tool_result = "✅ Transaction prepared successfully and ready for user signature."
                        except Exception as e:
                            tool_result = f"❌ Error preparing transaction: {str(e)}"
                            
                    else:
                        # Standard tools — with 1 retry on failure
                        for attempt in range(2):
                            found = False
                            for tool in TOOL_LIST:
                                if tool.name == tool_name:
                                    try:
                                        tool_result = await tool.ainvoke(tool_args)
                                        found = True
                                    except Exception as e:
                                        print(f"[AGENT] Tool {tool_name} failed (attempt {attempt+1}): {e}")
                                        tool_result = f"Error: {str(e)}"
                                        if attempt == 0:
                                            print(f"[AGENT] Retrying {tool_name}...")
                                            import asyncio
                                            await asyncio.sleep(0.5)
                                            continue
                                    break
                            if found or attempt == 1:
                                break
                        if tool_result is None:
                             tool_result = f"Tool {tool_name} not found"
                         
                    # Append result to prompt
                    tool_msg = HumanMessage(content=f"Tool '{tool_name}' returned:\n{tool_result}")
                    tool_response_messages.append(tool_msg)
                    
                    # CRITICAL: Append to tool_messages so downstream logic (state transitions) sees it
                    tool_messages.append(tool_msg)

                # Get next response — allow tools on intermediate passes, no tools on final pass
                if pass_count < MAX_TOOL_PASSES:
                    print(f"[AGENT] Getting response after Pass {pass_count} (tools enabled)")
                    final_response = await llm_with_tools.ainvoke(tool_response_messages)
                else:
                    print(f"[AGENT] Getting final response after Pass {pass_count} (no tools, prevent loops)")
                    final_response = await llm.ainvoke(tool_response_messages)

            print(f"[AGENT] LLM raw response type: {type(final_response)}")
            print(f"[AGENT] LLM response content: {final_response.content if hasattr(final_response, 'content') else final_response}")
            
            response_text = final_response.content if hasattr(final_response, 'content') else str(final_response)
            
            if not response_text or response_text.strip() == "":
                print("[AGENT] WARNING: Empty response from LLM!")
                response_text = "I apologize, I encountered an issue generating a response. Could you please rephrase your request?"
            
            print(f"[AGENT] Final response ({len(response_text)} chars): {response_text[:200]}")
            
            # Check if transaction was prepared by confirm_swap_tool
            transaction_prepared = False
            for msg in tool_messages:
                if hasattr(msg, 'content') and '[TRANSACTION_READY]' in msg.content:
                    transaction_prepared = True
                    break
            
            if transaction_prepared:
                # Get the actual transaction payload
                from agent_tools import _last_quote
                if _last_quote:
                    try:
                        from tools import create_deposit_transaction, get_sign_action_type
                        
                        source_chain = _last_quote.get("source_chain", "near").lower()
                        
                        # Resolve the correct sender address for the source chain
                        sender_address = _last_quote.get("account_id", account_id)
                        wallet_addresses = user_context.get("wallet_addresses", {})
                        if isinstance(wallet_addresses, dict):
                            # Try to find the right address for this chain
                            from tools import is_evm_chain
                            if is_evm_chain(source_chain):
                                sender_address = wallet_addresses.get("eth", wallet_addresses.get(source_chain, sender_address))
                            else:
                                sender_address = wallet_addresses.get(source_chain, sender_address)
                        
                        tx_payload = create_deposit_transaction(
                            token_in=_last_quote["token_in"],
                            token_out=_last_quote["token_out"],
                            amount=_last_quote["amount"],
                            min_amount_out=_last_quote.get("min_amount_out", 0),
                            deposit_address=_last_quote["deposit_address"],
                            source_chain=source_chain,
                            account_id=sender_address
                        )
                        action_type = get_sign_action_type(source_chain)
                        
                        print(f"[AGENT] Transaction prepared for {source_chain} | Action: {action_type}")
                        print(f"[AGENT] Transaction payload: {json.dumps(tx_payload, indent=2)}")
                        return {
                            "response": f"✅ Transaction prepared for {source_chain.upper()}! Please review and sign it in your wallet.",
                            "action": action_type,
                            "payload": tx_payload,
                            "new_state": {"step": "IDLE"}
                        }
                    except Exception as e:
                        print(f"[AGENT] Error creating transaction payload: {e}")
                        import traceback
                        traceback.print_exc()
        else:
            # No tools needed, use direct response
            response_text = response.content
            print(f"[AGENT] Direct response (no tools): {response_text[:200]}")
        
        # Determine new state based on tool results
        new_state = {"step": "IDLE"}
        
        # Check if a quote was just provided — transition to WAITING_CONFIRMATION
        for msg in tool_messages:
            if hasattr(msg, 'content') and '[QUOTE_ID:' in msg.content:
                from agent_tools import _last_quote
                if _last_quote:
                    new_state = {
                        "step": "WAITING_CONFIRMATION",
                        "pending_quote": _last_quote.copy()
                    }
                    print(f"[AGENT] State → WAITING_CONFIRMATION (quote stored)")
                break
        
        return {
            "response": response_text,
            "new_state": new_state
        }
        
    except Exception as e:
        print(f"[AGENT] Error: {e}")
        import traceback
        traceback.print_exc()
        return {
            "response": "I encountered an error processing your request. Could you try rephrasing?",
            "new_state": {"step": "IDLE"}
        }


# Import asyncio for async tool execution
import asyncio
