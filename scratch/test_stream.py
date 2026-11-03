import asyncio
import sys
import os
import json
from pathlib import Path

BACKEND_DIR = Path(r"C:\Users\ankit\N-agent\ai-agent-backend")
sys.path.insert(0, str(BACKEND_DIR))
os.chdir(str(BACKEND_DIR))

from autonomous_agents.research_agent import ResearchAgent

async def test_stream():
    agent = ResearchAgent()
    print("\n--- TESTING REAL STREAMING PIPELINE ---")
    async for chunk in agent.generate_research_report_stream(
        topic="give me investment tip in near",
        user_expectations="Compare native vs liquid staking yields and best pools",
        date_range="1_week",
        requester="stream_test.near"
    ):
        line = chunk.strip()
        if not line:
            continue
        data = json.loads(line)
        print(f"\n[STREAM EVENT RECEIVED] type={data.get('type')}, step_number={data.get('step_number')}")
        if data.get("card"):
            c = data["card"]
            print(f"  Title: {c.get('title')}")
            print(f"  Phase: {c.get('phase')}")
            print(f"  Reasoning: {c.get('agent_reasoning')[:130]}...")
            print(f"  Tags: {c.get('tags')}")
            print(f"  Bullets: {c.get('bullet_points')}")
        if data.get("report"):
            print(f"  [REPORT INCLUDED] Title: {data['report'].get('title')} | CID: {data['report'].get('cid')}")

if __name__ == "__main__":
    asyncio.run(test_stream())
