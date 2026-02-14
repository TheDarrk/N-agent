import os
from dotenv import load_dotenv
load_dotenv()

# Map NEAR_AI_API_KEY to OPENAI_API_KEY for LangChain's ChatOpenAI
# This MUST happen before importing agents
os.environ["OPENAI_API_KEY"] = os.getenv("NEAR_AI_API_KEY", "")

import asyncio
from agents import process_message

async def test_fix():
    print("--- Testing Fix for Empty Response ---")
    
    user_msg = "give me all available optinos for eth"
    
    # Empty history and IDLE state
    session_state = {"step": "IDLE"}
    user_context = {
        "account_id": "ankit.near",
        "history": []
    }
    
    try:
        print(f"User: {user_msg}")
        result = await process_message(user_msg, session_state, user_context)
        
        print(f"\nAI Response: {result['response']}")
        
        if result['response'] and not result['response'].startswith("I apologize, I encountered an issue"):
            print("\n✅ SUCCESS: LLM returned a valid response!")
        else:
            print("\n❌ FAILURE: LLM still returned an empty or error response.")
            
    except Exception as e:
        print(f"\n❌ ERROR during test: {e}")

if __name__ == "__main__":
    asyncio.run(test_fix())
