"""
Unit tests for:
1. Multi-threaded parallel crawler in scrapper/scrapper.py (10 concurrent threads).
2. Clean professional email formatting (zero emojis, responsive cards, no AI slop, no clipped text, structured signal rendering).
3. Marketplace Buy Setup (Rebalancer/Research) vs Rental (Trader) in database/dal.py.
"""
import pytest
import os
import json
import time
import asyncio
from unittest.mock import MagicMock, patch

from notification_agent import send_agent_action_email
import database.dal as dal
try:
    from scrapper import scrapper as scrapper_module
except ImportError:
    import scrapper as scrapper_module


def test_parallel_crawler_threads():
    """Verify crawl_urls spawns concurrent thread workers for multiple seed links."""
    mock_urls = [f"https://example.com/doc{i}" for i in range(10)]
    worker_calls = []

    def mock_worker(raw_url, topic, topic_cfg, effective_min_date, max_pages_per_seed, max_depth, col, state, db_lock):
        worker_calls.append(raw_url)
        time.sleep(0.05)
        return {
            "indexed": 1,
            "skipped": 0,
            "urls_processed": [{"url": raw_url, "title": f"Doc {raw_url}", "chunks": 2, "date": "2026-01-01"}]
        }

    with patch.object(scrapper_module, "get_collection", return_value=MagicMock()), \
         patch.object(scrapper_module, "load_state", return_value={}), \
         patch.object(scrapper_module, "save_state", return_value=None), \
         patch.object(scrapper_module, "_crawl_single_seed_worker", side_effect=mock_worker):

        start_time = time.time()
        res = scrapper_module.crawl_urls(urls=mock_urls, topic="near")
        duration = time.time() - start_time

        # If sequential, 10 * 0.05s = 0.5s minimum. With 10 threads in parallel, it should finish in < 0.40s
        assert len(worker_calls) == 10
        assert res["indexed"] == 10
        assert len(res["urls_processed"]) == 10
        assert duration < 0.40, f"Expected parallel execution under 0.40s, took {duration:.2f}s"


def test_clean_professional_email_formatting():
    """Verify email HTML has zero emojis, no avatar image, clean cards, and parses structured dict signals."""
    sent_emails = []

    def mock_send_email(to_email, subject, html_body, text_body, inline_images=None):
        sent_emails.append({
            "to": to_email,
            "subject": subject,
            "html": html_body,
            "text": text_body,
            "images": inline_images
        })
        return True

    test_user = "test_email_user.near"
    dal.upsert_user(test_user, {"notification_email": "trader@neptune.fi"})

    async def _run():
        with patch("notification_agent.is_email_configured", return_value=True), \
             patch("notification_agent.send_email", side_effect=mock_send_email):

            structured_signal = {
                "action": "PARTICIPATE",
                "target_asset": "NEAR Protocol HACKATHON",
                "confidence": 92,
                "recommended_timeframe": "Submit by Nov 14, 2026",
                "key_levels_or_actions": "Primary developer incentive pool"
            }

            # 1. Test Trader Email
            await send_agent_action_email(
                user_wallet=test_user,
                agent_name="trader",
                action_type="SCAN_REPORT",
                title="Market Scan & Capital Preservation (MARKET)",
                summary="Screener evaluated qualifying DEX assets. Verdict: STAND_ASIDE.",
                metrics={
                    "Evaluated Asset": "MARKET",
                    "Pipeline Verdict": "STAND_ASIDE (Capital Preserved)",
                    "Confidence Score": "0% (Threshold: 65%)",
                    "Capital Status": "100% Liquid in Wallet",
                    "Decentralized Trace": "bafy057f675870741c9731f3ae455005b7c86f289494ec8b"
                },
                reasoning="Screener found no qualifying setups scoring >= 70 against selection rubric.",
                cid_reference="bafy057f675870741c9731f3ae455005b7c86f289494ec8b"
            )

            # 2. Test Researcher Email with structured dict signal
            await send_agent_action_email(
                user_wallet=test_user,
                agent_name="researcher",
                action_type="RESEARCH_REPORT",
                title="Research: NEAR Liquid Staking & Hackathon Opportunities",
                summary="Institutional report on staking yields and developer hackathons.",
                metrics={
                    "Topic": "NEAR Liquid Staking",
                    "Regime": "ACCUMULATION",
                    "Actionable Signal": structured_signal,
                    "Decentralized CID": "bafye92142fb74ffc90cae3b2fced5caf521b16357a043"
                },
                reasoning="Synthesized via multi-node deep research and citations retrieval.",
                cid_reference="bafye92142fb74ffc90cae3b2fced5caf521b16357a043"
            )

    asyncio.run(_run())

    assert len(sent_emails) == 2

    # Check Trader Email
    trader_mail = sent_emails[0]
    # ZERO emojis in subject or html
    for emoji in ["⚡", "🤖", "⚖️", "🔬", "🛡️"]:
        assert emoji not in trader_mail["subject"], f"Found emoji {emoji} in subject!"
        assert emoji not in trader_mail["html"], f"Found emoji {emoji} in html body!"

    # ZERO avatar images (no AI slop)
    assert 'src="cid:agent_avatar"' not in trader_mail["html"]

    # Check that CID is NOT duplicated in both metrics cards and CID section
    assert trader_mail["html"].count("bafy057f675870741c9731f3ae455005b7c86f289494ec8b") == 1

    # Check responsive card formatting
    assert "word-break: break-word" in trader_mail["html"]
    assert "STAND_ASIDE (Capital Preserved)" in trader_mail["html"]

    # Check Research Email
    research_mail = sent_emails[1]
    for emoji in ["⚡", "🤖", "⚖️", "🔬", "🛡️"]:
        assert emoji not in research_mail["subject"]
        assert emoji not in research_mail["html"]

    # Structured signal must NOT be raw stringified dict
    assert "{'action': 'PARTICIPATE'" not in research_mail["html"]
    # Should be clean parsed fields
    assert "Action:" in research_mail["html"]
    assert "PARTICIPATE" in research_mail["html"]
    assert "NEAR Protocol HACKATHON" in research_mail["html"]


def test_marketplace_buy_setup_vs_rental():
    """Verify Trader agent uses rental while Rebalancer & Researcher use Buy Setup and import settings."""
    creator = "creator_pro.near"
    buyer = "buyer_user.near"

    # 1. Publish Trader Agent Listing
    trader_listing = dal.publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="trader",
        name="Trend Alpha Trader",
        description="High Sharpe momentum strategy",
        pricing_type="profit_share",
        pricing_value=12.0,
        config_snapshot={"timeframe": "4h", "min_confidence": 75}
    )

    # 2. Publish Rebalancer Agent Listing
    reb_config = {
        "target_stables_pct": 60.0,
        "target_near_pct": 40.0,
        "drift_threshold_pct": 4.0,
        "min_stable_pct": 15.0,
        "selected_coins": ["NEAR", "USDC", "ETH"],
        "allocations": {"NEAR": 40.0, "USDC": 40.0, "ETH": 20.0},
        "cadence_days": 3
    }
    reb_listing = dal.publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="rebalancer",
        name="All-Weather Stable Rebalancer",
        description="Dynamic drift portfolio",
        pricing_type="one_time_buy",
        pricing_value=2.0,
        config_snapshot=reb_config
    )

    # 3. Publish Researcher Agent Listing
    res_config = {
        "focus_areas": ["NEAR DeFi", "Cross-Chain Bridges"],
        "source_links": ["https://docs.near.org", "https://defillama.com"],
        "report_frequency_days": 5
    }
    res_listing = dal.publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="research",
        name="DeFi Intelligence Crawler",
        description="Daily institutional briefings",
        pricing_type="one_time_buy",
        pricing_value=1.5,
        config_snapshot=res_config
    )

    # Test Listings API Representation
    agents = dal.get_marketplace_agents()
    trader_agent = next(a for a in agents if a["listing_id"] == trader_listing["listing_id"])
    reb_agent = next(a for a in agents if a["listing_id"] == reb_listing["listing_id"])
    res_agent = next(a for a in agents if a["listing_id"] == res_listing["listing_id"])

    assert trader_agent["pricing_model"] == "rental"
    assert "Profit Share" in trader_agent["fee_display"]

    assert reb_agent["pricing_model"] == "buy_setup"
    assert "One-Time" in reb_agent["fee_display"]

    assert res_agent["pricing_model"] == "buy_setup"
    assert "One-Time" in res_agent["fee_display"]

    # Test Buyer Hiring Trader (Rental Model)
    trader_res = dal.hire_marketplace_agent(subscriber_wallet=buyer, listing_id=trader_listing["listing_id"])
    assert trader_res["action_type"] == "rental_active"

    # Test Buyer Purchasing Rebalancer (Buy Setup Model)
    reb_res = dal.hire_marketplace_agent(subscriber_wallet=buyer, listing_id=reb_listing["listing_id"])
    assert reb_res["action_type"] == "setup_purchased"
    assert "purchased and implemented" in reb_res["message"]

    # Verify Buyer's Rebalancer settings were automatically updated with creator's setup
    buyer_user = dal.get_user(buyer)
    assert buyer_user["rebalancer_target_stables"] == 60.0
    assert buyer_user["rebalancer_target_near"] == 40.0
    assert buyer_user["rebalancer_drift_threshold"] == 4.0
    active_strat = dal.get_active_rebalancer_strategy(buyer)
    assert active_strat is not None
    assert "Purchased Setup" in active_strat["user_expectation_text"]
    assert active_strat["allocations"]["NEAR"] == 40.0

    # Test Buyer Purchasing Researcher (Buy Setup Model)
    res_res = dal.hire_marketplace_agent(subscriber_wallet=buyer, listing_id=res_listing["listing_id"])
    assert res_res["action_type"] == "setup_purchased"

    # Verify Buyer's Research settings were automatically updated with creator's setup
    buyer_res_user = dal.get_user(buyer)
    conn = dal.get_connection()
    row = conn.execute("SELECT focus_areas_json, source_links_json, report_frequency_days FROM research_config WHERE wallet_address = ?", (buyer,)).fetchone()
    conn.close()
    assert "NEAR DeFi" in row["focus_areas_json"]
    assert "defillama.com" in row["source_links_json"]
    assert row["report_frequency_days"] == 5
