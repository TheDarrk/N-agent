"""
Neptune AI — 10-Area Comprehensive Web3 Research Benchmark & Test Harness
Tests 10 distinct crypto domains covering:
  1. NEAR Liquid Staking & DeFi Yields
  2. Cross-Chain Intents & Chain Signatures (MPC)
  3. Ethereum L2 Rollups & Data Availability
  4. Solana High-Throughput DeFi & Liquid Staking
  5. Zero-Knowledge Proofs & zkEVM/zkVM Infrastructure
  6. Real World Assets (RWA) & Tokenized Treasuries
  7. AI Agent-to-Agent Economy & Compute Networks
  8. Web3 Developer Grants, Bounties & Hackathons
  9. Decentralized Stablecoins & Delta-Neutral Yields
  10. Restaking & Shared Security (AVS)
"""

import sys
import os
import re
import json
import asyncio
from pathlib import Path
from typing import Dict, Any, List

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(WORKSPACE_ROOT))

from autonomous_agents.research_agent import ResearchAgent, IntentAnalysis
from autonomous_agents.research_crawler_tool import ResearchCrawlerTool

TEST_SETS = [
    {
        "id": 1,
        "domain": "NEAR Liquid Staking & DeFi Yields",
        "topic": "NEAR Ecosystem Yields: Liquid Staking (stNEAR, LiNEAR) vs Native Validator Delegation & DeFi Lending",
        "user_expectations": "Compare native delegation APY (~9-11%) against liquid staking (Meta Pool stNEAR, LiNEAR) and secondary lending on Burrow/Ref Finance. Identify lockups, fees, and slashing.",
        "links": [
            "https://docs.near.org/concepts/basics/staking",
            "https://metapool.app",
            "https://docs.ref.finance"
        ],
        "date_range": "1_month",
        "expected_mechanisms": ["liquid staking", "proof-of-stake delegation", "DeFi lending", "liquidity pools"],
        "critical_keywords": ["stnear", "linear", "apy", "validator", "burrow", "ref", "stake", "yield", "unbonding"]
    },
    {
        "id": 2,
        "domain": "Cross-Chain Intents & Chain Signatures (Account Aggregation)",
        "topic": "Cross-Chain Intent Protocols & NEAR Chain Signatures (MPC Multichain Execution)",
        "user_expectations": "Explain how MPC key derivation allows a single NEAR account to sign transactions on Bitcoin, Ethereum, and Cosmos without bridges. Evaluate latency, threshold cryptography, and security trade-offs.",
        "links": [
            "https://docs.near.org/build/chain-abstraction/chain-signatures",
            "https://near.org/blog/unlocking-web3-usability-with-chain-signatures"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["chain signatures", "MPC cryptography", "cross-chain intents", "multichain account abstraction"],
        "critical_keywords": ["chain signature", "mpc", "key derivation", "multichain", "bitcoin", "ethereum", "threshold"]
    },
    {
        "id": 3,
        "domain": "Ethereum Layer-2 Rollups & Modular Data Availability",
        "topic": "Ethereum L2 Rollup Scaling: Optimistic vs ZK Rollups with Modular Data Availability (Celestia & EigenDA)",
        "user_expectations": "Analyze transaction cost reduction, blob space (EIP-4844), proof verification latency, and security trade-offs between Celestia modular DA and native Ethereum blob storage.",
        "links": [
            "https://ethereum.org/en/developers/docs/scaling/",
            "https://docs.celestia.org/learn/how-celestia-works/data-availability-layer"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["optimistic rollups", "zk-rollups", "modular data availability", "blob transactions"],
        "critical_keywords": ["rollup", "blob", "data availability", "celestia", "eip-4844", "proof", "l2", "scaling"]
    },
    {
        "id": 4,
        "domain": "Solana High-Throughput DeFi & Liquid Staking",
        "topic": "Solana DeFi Ecosystem: MEV-Boosted Liquid Staking (JitoSOL, Marinade) & DEX AMM Liquidity",
        "user_expectations": "Analyze Jito MEV tips distribution to stakers, Marinade stake auction marketplace, validator commission limits, and instant unstake liquidity pools on Raydium/Orca.",
        "links": [
            "https://solana.com/staking",
            "https://www.jito.network"
        ],
        "date_range": "1_month",
        "expected_mechanisms": ["MEV liquid staking", "proof-of-stake delegation", "AMM DEX liquidity"],
        "critical_keywords": ["jito", "solana", "mev", "marinade", "stake", "validator", "unbonding", "apy"]
    },
    {
        "id": 5,
        "domain": "Zero-Knowledge Proofs & zkEVM / zkVM Infrastructure",
        "topic": "Zero-Knowledge Virtual Machines (zkVM vs zkEVM): Proving Architectures, Verification Costs, and State Validation",
        "user_expectations": "Evaluate STARK vs SNARK proof generation performance, on-chain verification gas costs, RISC-V general execution (RISC Zero) vs EVM opcode equivalence.",
        "links": [
            "https://ethereum.org/en/developers/docs/scaling/zk-rollups/",
            "https://dev.risczero.com/api/zkvm"
        ],
        "date_range": "6_months",
        "expected_mechanisms": ["zero-knowledge proofs", "zkVM execution", "state validation", "proof verification"],
        "critical_keywords": ["zk", "snark", "stark", "proof", "verifier", "gas", "risc", "rollup"]
    },
    {
        "id": 6,
        "domain": "Real World Assets (RWA) & Tokenized Treasuries",
        "topic": "Tokenized US Treasuries & Real World Assets (RWA): Institutional Yields, Regulatory Compliance, and Settlement",
        "user_expectations": "Compare tokenized Treasury products (Ondo USDY/OUSG, Centrifuge) regarding KYC/AML whitelisting, bankruptcy remoteness, daily yield pass-through, and secondary liquidity.",
        "links": [
            "https://ondo.finance",
            "https://centrifuge.io"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["tokenized securities", "real world assets", "on-chain treasury yields", "institutional compliance"],
        "critical_keywords": ["treasury", "rwa", "yield", "compliance", "accredited", "settlement", "redemption", "ondo"]
    },
    {
        "id": 7,
        "domain": "AI Agent-to-Agent Economy & Decentralized Compute",
        "topic": "Autonomous AI Agents in Web3: Agent-to-Agent Micropayments, Incentive Alignment, and Decentralized Inference",
        "user_expectations": "Explore how autonomous LLM agents discover peers, settle research/trade fees via smart contracts, and access decentralized GPU compute networks (Bittensor, Akash, NEAR AI).",
        "links": [
            "https://near.ai",
            "https://docs.bittensor.com"
        ],
        "date_range": "1_month",
        "expected_mechanisms": ["agent-to-agent micropayments", "decentralized AI inference", "autonomous compute subnets"],
        "critical_keywords": ["agent", "inference", "compute", "micropayment", "subnet", "bittensor", "near ai"]
    },
    {
        "id": 8,
        "domain": "Web3 Developer Grants, Bounties & Hackathons",
        "topic": "Web3 Developer Capital: Ecosystem Grants, Hackathon Prize Pools, and Retroactive Funding Pathways",
        "user_expectations": "Find active developer grant guidelines (NEAR DevHub, Gitcoin rounds), hackathon tracks, prize pools, submission deadlines, and evaluation milestones.",
        "links": [
            "https://gov.near.org",
            "https://dev.near.org",
            "https://gitcoin.co"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["developer grants", "hackathons and bounties", "retroactive public goods funding"],
        "critical_keywords": ["grant", "hackathon", "prize", "bounty", "developer", "milestone", "funding", "devhub"]
    },
    {
        "id": 9,
        "domain": "Decentralized Stablecoins & Delta-Neutral Yields",
        "topic": "Decentralized Stablecoin Architectures: Overcollateralized vs Synthetic Delta-Neutral (Ethena USDe) Mechanics & Depeg Vectors",
        "user_expectations": "Examine Ethena USDe synthetic dollar mechanics (stETH long + perps short basis trade), negative funding rate risks, and traditional CDP collateral liquidation (MakerDAO/Sky DAI).",
        "links": [
            "https://docs.ethena.fi",
            "https://makerdao.com"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["synthetic stablecoins", "delta-neutral basis trade", "collateralized debt positions", "liquidation risk"],
        "critical_keywords": ["ethena", "usde", "funding rate", "basis", "stablecoin", "depeg", "collateral", "hedging"]
    },
    {
        "id": 10,
        "domain": "Restaking & Shared Security Infrastructure",
        "topic": "Restaking Ecosystems: Actively Validated Services (AVS), Shared Security Pools, and Slashing Cascades",
        "user_expectations": "Assess EigenLayer restaking mechanics, dual-token staking, node operator requirements, and correlated slashing risks across multiple AVS protocols.",
        "links": [
            "https://docs.eigenlayer.xyz",
            "https://ethereum.org/en/staking/"
        ],
        "date_range": "3_months",
        "expected_mechanisms": ["restaking", "actively validated services (AVS)", "pooled security", "slashing propagation"],
        "critical_keywords": ["eigenlayer", "restaking", "avs", "slashing", "operator", "ethereum", "security"]
    }
]


async def run_benchmark():
    agent = ResearchAgent()
    print("=" * 80)
    print("NEPTUNE AI — 10-AREA COMPREHENSIVE WEB3 BENCHMARK")
    print(f"Timestamp: {asyncio.get_event_loop().time()}")
    print("=" * 80)

    results = []

    for t in TEST_SETS:
        tid = t["id"]
        domain = t["domain"]
        topic = t["topic"]
        expectations = t["user_expectations"]
        links = t["links"]
        dr = t["date_range"]
        exp_mechs = t["expected_mechanisms"]
        crit_keys = t["critical_keywords"]

        print(f"\n[{tid}/10] Testing: {domain}")
        print(f"  Topic: {topic}")
        print(f"  Links: {links}")

        # Pre-crawl seed links (depth 4)
        print("  -> Pre-crawling seed links to depth 4...")
        try:
            crawl_res = await asyncio.to_thread(
                agent.crawler_tool.crawl_custom_sources,
                urls=links,
                topic="near",
                date_range=dr,
                max_depth=4
            )
            indexed_cnt = crawl_res.get("indexed", 0)
            print(f"  -> Crawl finished. Indexed: {indexed_cnt} pages.")
        except Exception as e:
            indexed_cnt = 0
            print(f"  -> Crawl notice: {e}")

        # Node 1: Intent Analysis
        print("  -> Running Node 1 Intent Analysis...")
        intent = await agent.step_1_intent_analysis(topic, expectations, dr)
        detected_mechs = intent.detected_crypto_mechanisms
        print(f"  -> Node 1 Detected Mechanisms: {detected_mechs}")

        # Node 2: Relentless Retrieval Agent
        print("  -> Running Node 2 Relentless Retrieval Agent...")
        tool_calls_logged = []

        async def log_tool(tool_name, args, thought):
            tool_calls_logged.append({"tool": tool_name, "args": args, "thought": thought})

        selection, selected_chunks, calls_used = await agent.step_2_retrieval_agent(
            intent=intent,
            links=links,
            date_range=dr,
            on_tool_call=log_tool
        )
        print(f"  -> Node 2 Completed: {calls_used} calls used. Selected {len(selected_chunks)} chunks.")

        # Evaluate Context Quality
        all_text = " ".join((c.get("text", "") + " " + c.get("title", "")).lower() for c in selected_chunks)
        urls_found = list(dict.fromkeys(c.get("url", "") for c in selected_chunks if c.get("url")))

        # Check keyword hits
        caught_keywords = [k for k in crit_keys if k.lower() in all_text]
        missed_keywords = [k for k in crit_keys if k.lower() not in all_text]

        # Check mechanism coverage
        caught_mechs = []
        missed_mechs = []
        for m in detected_mechs:
            words = [w for w in re.findall(r"[a-z]{4,}", m.lower()) if w not in {"with", "from", "current", "pools", "tokens"}]
            if any(w in all_text for w in words):
                caught_mechs.append(m)
            else:
                missed_mechs.append(m)

        mech_coverage_pct = round((len(caught_mechs) / max(len(detected_mechs), 1)) * 100, 1)

        # Average distance (lower = better semantic relevance)
        distances = [c.get("distance") for c in selected_chunks if c.get("distance") is not None]
        avg_dist = round(sum(distances) / len(distances), 3) if distances else 0.0

        # Assessment & Gaps
        catches_summary = f"{len(caught_keywords)}/{len(crit_keys)} critical domain terms caught; {len(urls_found)} unique sources referenced."
        misses_summary = f"Missed terms: {missed_keywords[:4]}" if missed_keywords else "No major domain terms missed."
        needs_improvement = []
        if len(selected_chunks) < 10:
            needs_improvement.append("Increase chunk depth for broader coverage")
        if missed_mechs:
            needs_improvement.append(f"Autonomous queries for {missed_mechs[:2]} should be sharper")
        if not needs_improvement:
            needs_improvement.append("RAG context is dense, highly grounded, and comprehensive")

        res_record = {
            "id": tid,
            "domain": domain,
            "topic": topic,
            "pages_indexed": indexed_cnt,
            "node1_mechanisms": detected_mechs,
            "retrieval_calls_used": calls_used,
            "selected_chunks_count": len(selected_chunks),
            "unique_sources_count": len(urls_found),
            "avg_vector_distance": avg_dist,
            "mechanism_coverage_pct": mech_coverage_pct,
            "caught_keywords": caught_keywords,
            "missed_keywords": missed_keywords,
            "caught_mechanisms": caught_mechs,
            "missed_mechanisms": missed_mechs,
            "coverage_gaps": selection.coverage_gaps,
            "catches": catches_summary,
            "misses": misses_summary,
            "needs_improvement": "; ".join(needs_improvement),
            "tool_calls_trace": tool_calls_logged
        }
        results.append(res_record)
        print(f"  -> Coverage: {mech_coverage_pct}% | Chunks: {len(selected_chunks)} | Avg Dist: {avg_dist}")

    # Save results to JSON
    out_path = WORKSPACE_ROOT / "tests" / "benchmark_10_results.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"\n[BENCHMARK FINISHED] Results saved to: {out_path}")
    return results


if __name__ == "__main__":
    asyncio.run(run_benchmark())
