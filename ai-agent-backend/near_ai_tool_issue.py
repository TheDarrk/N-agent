


"""
NEAR AI + LangChain Tool Calling Issue - Diagnostic Test

ISSUE SUMMARY:
When using NEAR AI's OpenAI-compatible endpoint (https://cloud-api.near.ai/v1) 
with LangChain's tool calling, the model correctly calls tools but returns 
EMPTY responses after receiving tool results.

ENVIRONMENT:
- Model: openai/gpt-oss-120b
- LangChain: langchain-openai
- Tool calling: Using LangChain's bind_tools() and ToolMessage format
"""
import os
import asyncio
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage

load_dotenv()

# Initialize NEAR AI
llm = ChatOpenAI(
    model="openai/gpt-oss-120b",
    temperature=0.3,
    openai_api_key=os.getenv("NEAR_AI_API_KEY"),
    openai_api_base="https://cloud-api.near.ai/v1"
)

# Simple test tool
@tool
def get_weather(location: str) -> str:
    """Get the weather for a location."""
    return f"The weather in {location} is sunny, 22°C"

llm_with_tools = llm.bind_tools([get_weather])

async def test_issue():
    print("=" * 80)
    print("NEAR AI + LangChain Tool Calling - Issue Reproduction")
    print("=" * 80)
    
    # Step 1: Initial request
    print("\n[STEP 1] User asks: 'What's the weather in Paris?'")
    messages = [
        SystemMessage(content="You are a helpful assistant."),
        HumanMessage(content="What's the weather in Paris?")
    ]
    
    response1 = await llm_with_tools.ainvoke(messages)
    print(f"✓ LLM Response: Has tool_calls = {bool(response1.tool_calls)}")
    
    if not response1.tool_calls:
        print("✗ ERROR: LLM did not call the tool!")
        return
    
    # Step 2: Execute tool
    print(f"\n[STEP 2] Executing tool: {response1.tool_calls[0]['name']}")
    tool_call = response1.tool_calls[0]
    tool_result = await get_weather.ainvoke(tool_call['args'])
    print(f"✓ Tool returned: '{tool_result}'")
    
    # Step 3: Send tool result back (THIS IS WHERE IT FAILS)
    print("\n[STEP 3] Sending tool result to LLM using ToolMessage format")
    messages.append(response1)  # Add AIMessage with tool_calls
    messages.append(ToolMessage(
        content=tool_result,
        tool_call_id=tool_call['id']
    ))
    
    print(f"Message sequence:")
    for i, msg in enumerate(messages):
        msg_type = type(msg).__name__
        content_preview = getattr(msg, 'content', 'tool_calls')[:40] if isinstance(getattr(msg, 'content', ''), str) else 'tool_calls'
        print(f"  {i+1}. {msg_type}: {content_preview}...")
    
    print(f"\nSending {len(messages)} messages to NEAR AI...")
    final_response = await llm.ainvoke(messages)
    
    # Step 4: Check result
    print("\n[STEP 4] Final response from LLM:")
    print(f"Type: {type(final_response)}")
    print(f"Has content: {bool(final_response.content)}")
    print(f"Content: '{final_response.content}'")
    print(f"Content length: {len(final_response.content) if final_response.content else 0}")
    
    # Diagnosis
    print("\n" + "=" * 80)
    print("DIAGNOSIS:")
    print("=" * 80)
    
    if not final_response.content or final_response.content.strip() == "":
        print("❌ ISSUE CONFIRMED: Empty response after ToolMessage")
        print("\nExpected: LLM should summarize the tool result:")
        print("  'The weather in Paris is sunny with a temperature of 22°C'")
        print("\nActual: Empty string")
        print("\nPossible causes:")
        print("  1. NEAR AI endpoint may not fully support OpenAI's tool message format")
        print("  2. ToolMessage with tool_call_id might not be recognized")
        print("  3. The conversation flow after tools might need different format")
    else:
        print("✓ SUCCESS: LLM returned proper response")
        print(f"Response: {final_response.content[:200]}")
    
    # Additional test: Try without ToolMessage (workaround)
    print("\n" + "=" * 80)
    print("[WORKAROUND TEST] Using HumanMessage instead of ToolMessage")
    print("=" * 80)
    
    messages_workaround = [
        SystemMessage(content="You are a helpful assistant."),
        HumanMessage(content="What's the weather in Paris?"),
        HumanMessage(content=f"Tool 'get_weather' returned: {tool_result}")
    ]
    
    response_workaround = await llm.ainvoke(messages_workaround)
    print(f"Response with HumanMessage workaround:")
    print(f"  Has content: {bool(response_workaround.content)}")
    print(f"  Content: '{response_workaround.content[:200] if response_workaround.content else 'EMPTY'}'")
    
    if response_workaround.content:
        print("\n✓ WORKAROUND WORKS: Using HumanMessage instead of ToolMessage succeeds")
        print("  This suggests NEAR AI may not support standard OpenAI ToolMessage format")

if __name__ == "__main__":
    print("\n" + "=" * 80)
    print("NEAR AI Tool Calling Diagnostic")
    print("Testing: https://cloud-api.near.ai/v1 with model openai/gpt-oss-120b")
    print("=" * 80)
    print("\nThis script will:")
    print("1. Call a tool (get_weather)")
    print("2. Send the result back using OpenAI-standard ToolMessage format")
    print("3. Show whether NEAR AI returns a proper response or empty string")
    print("\nRunning test...\n")
    
    asyncio.run(test_issue())
    
    print("\n" + "=" * 80)
    print("To share with NEAR AI community:")
    print("  1. Run this script: python near_ai_tool_issue.py")
    print("  2. Share the output showing empty response after ToolMessage")
    print("  3. Ask if ToolMessage format is supported or if alternative format needed")
    print("=" * 80)
