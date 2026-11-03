import asyncio
import sys
import os
import json
from pathlib import Path

BACKEND_DIR = Path(r"C:\Users\ankit\N-agent\ai-agent-backend")
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(str(BACKEND_DIR))

from autonomous_agents.research_agent import ResearchAgent

async def main():
    agent = ResearchAgent()
    topic = "find opportunity to invest in near like staking and yeild find best pool to yeild and best liquid stakinng option and any recent hackthon on near or any way to particpate"
    expectations = "Find high-yield staking pools, liquid staking tokens, recent hackathons to participate in with bounties"
    links = [
        "https://docs.near.org",
        "https://near.org/blog",
        "https://metapool.app"
    ]
    
    print("\n[TEST] Running Research Agent 5-Step Pipeline...")
    res = await agent.generate_research_report(
        topic=topic,
        user_expectations=expectations,
        links=links,
        date_range="1_month",
        requester="alpha_tester.near"
    )
    
    print("\n--- TEST RUN RESULTS ---")
    print(f"Title: {res.get('title')}")
    print(f"Regime: {res.get('regime')}")
    print(f"CID: {res.get('cid')}")
    cards = res.get('cot_step_cards', [])
    print(f"\nTotal CoT Cards Generated: {len(cards)}")
    for c in cards:
        print(f"\n[Card {c.get('step_number')}] {c.get('title')} | Phase: {c.get('phase')}")
        print(f"  Agent Reasoning: {c.get('agent_reasoning')[:120]}...")
        print(f"  Tags: {c.get('tags')}")
        print(f"  Bullet Points: {c.get('bullet_points')}")
        
    print("\n[STORAGE] Saved successfully and ready for frontend inspection!")

if __name__ == "__main__":
    asyncio.run(main())
