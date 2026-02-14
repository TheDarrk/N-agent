"""
Test LangChain with NEAR AI to identify empty response issue.
"""
import os
import asyncio
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage

load_dotenv()

# Initialize NEAR AI LLM
llm = ChatOpenAI(
    model="openai/gpt-oss-120b",
    temperature=0.3,
    openai_api_key=os.getenv("NEAR_AI_API_KEY"),
    openai_api_base="https://cloud-api.near.ai/v1"
)

# Define a simple test tool
@tool
def get_weather(location: str) -> str:
    """Get the weather for a location."""
    return f"The weather in {location} is sunny, 22°C"

# Bind tool to LLM
llm_with_tools = llm.bind_tools([get_weather])

async def test_langchain():
    print("=" * 60)
    print("LangChain + NEAR AI Tool Calling Test")
    print("=" * 60)
    
    # Test 1: Basic response (no tools)
    print("\n--- TEST 1: Basic Response ---")
    try:
        messages = [HumanMessage(content="Say hello")]
        response = await llm.ainvoke(messages)
        print(f"✓ Response: {response.content}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 2: Tool calling
    print("\n--- TEST 2: Tool Calling ---")
    try:
        messages = [HumanMessage(content="What's the weather in Paris?")]
        response = await llm_with_tools.ainvoke(messages)
        print(f"Has tool_calls: {bool(response.tool_calls)}")
        if response.tool_calls:
            print(f"✓ Tool calls detected: {response.tool_calls}")
        else:
            print(f"Content: {response.content}")
    except Exception as e:
        print(f"✗ Error: {e}")
    
    # Test 3: Execute tool and send result back (LangChain ToolMessage format)
    print("\n--- TEST 3: Tool Result with ToolMessage (LangChain standard) ---")
    try:
        messages = [HumanMessage(content="What's the weather in Paris?")]
        
        # Get initial response with tool call
        response = await llm_with_tools.ainvoke(messages)
        print(f"Step 1 - LLM wants to call: {response.tool_calls[0]['name'] if response.tool_calls else 'no tools'}")
        
        if response.tool_calls:
            # Execute tool
            tool_call = response.tool_calls[0]
            tool_result = await get_weather.ainvoke(tool_call['args'])
            print(f"Step 2 - Tool result: {tool_result}")
            
            # Create conversation with ToolMessage (standard LangChain format)
            messages.append(response)  # Add AI's tool call request
            messages.append(ToolMessage(
                content=tool_result,
                tool_call_id=tool_call['id']
            ))
            
            # Get final response
            print("Step 3 - Sending ToolMessage to LLM...")
            final_response = await llm.ainvoke(messages)
            
            print(f"Response type: {type(final_response)}")
            print(f"Has content: {bool(final_response.content)}")
            print(f"Content: '{final_response.content}'")
            
            if not final_response.content:
                print("✗ EMPTY RESPONSE!")
            else:
                print(f"✓ Success: {final_response.content}")
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
    
    # Test 4: Execute tool and send result back as HumanMessage (workaround)
    print("\n--- TEST 4: Tool Result with HumanMessage (workaround) ---")
    try:
        messages = [HumanMessage(content="What's the weather in London?")]
        
        # Get initial response with tool call
        response = await llm_with_tools.ainvoke(messages)
        
        if response.tool_calls:
            # Execute tool
            tool_call = response.tool_calls[0]
            tool_result = await get_weather.ainvoke(tool_call['args'])
            print(f"Tool result: {tool_result}")
            
            # Create conversation with HumanMessage instead of ToolMessage
            messages.append(HumanMessage(
                content=f"Tool '{tool_call['name']}' returned: {tool_result}"
            ))
            
            # Get final response
            print("Sending HumanMessage to LLM...")
            final_response = await llm.ainvoke(messages)
            
            print(f"Response type: {type(final_response)}")
            print(f"Has content: {bool(final_response.content)}")
            print(f"Content: '{final_response.content}'")
            
            if not final_response.content:
                print("✗ EMPTY RESPONSE!")
            else:
                print(f"✓ Success: {final_response.content[:100]}...")
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "=" * 60)
    print("DIAGNOSIS:")
    print("- If Test 3 fails (ToolMessage) but Test 4 works (HumanMessage)")
    print("  → NEAR AI doesn't support ToolMessage format properly")
    print("- If both fail → Deeper API compatibility issue")
    print("- If both work → Our agent code has a different issue")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(test_langchain())
