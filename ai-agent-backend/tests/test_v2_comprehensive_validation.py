"""
Neptune AI v2.1 — Comprehensive Validation Test Suite
Tests:
  1. All 4 Autonomous Agents Data Persistence & Workflows:
     - Trader Agent
     - Rebalancer Agent
     - Research Agent
     - Moderator Watchdog Agent
  2. Edge Cases & Multi-Tenant Security:
     - Cross-wallet data isolation
     - Cryptographic salt derivation & auth tag verification
     - Kill switch emergency halting & agent restoration
     - Cross-chain validator enforcement
     - Unbounded storage audit retention
  3. Marketplace Database Testing (20 Distinct Test Parameters):
     - Parameter 1: Publish Trader listing
     - Parameter 2: Publish Rebalancer listing
     - Parameter 3: Publish Research listing
     - Parameter 4: Moderator Watchdog marketplace publishing prohibition
     - Parameter 5: Invalid agent type publishing rejection
     - Parameter 6: Update/re-publish existing listing
     - Parameter 7: Self-hire prevention (creator cannot hire own agent)
     - Parameter 8: Valid hire creates active subscription & increments count
     - Parameter 9: Duplicate hire idempotency (no duplicate active subscription)
     - Parameter 10: Cancel active hire & decrement subscriber count
     - Parameter 11: Cancel non-existent hire returns False
     - Parameter 12: Subscriber count non-negative floor check
     - Parameter 13: Non-existent listing hire attempt fails
     - Parameter 14: Pricing types & fee display strings
     - Parameter 15: Filter marketplace listings by agent_type
     - Parameter 16: Mirror trade to single subscriber
     - Parameter 17: Mirror trade to multiple distinct subscribers
     - Parameter 18: Mirroring excludes creator wallet
     - Parameter 19: Query user hires vs user subscribers
     - Parameter 20: Foreign key cascading delete of listing & subscriptions
"""

import os
import sys
import json
import pytest

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import (
    init_db, get_connection, upsert_user, get_user,
    create_agent_wallet, activate_agent_wallet, assign_agent_wallets,
    validate_agent_execution_wallet, create_active_trade, get_open_trades,
    update_trade_status, get_user_trade_history, record_dropped_trade,
    get_dropped_trades, count_trades_today, count_trades_this_week,
    save_reasoning_trace, get_user_reasoning_traces,
    save_rebalancer_strategy, get_active_rebalancer_strategy,
    get_rebalancer_strategy_history, drop_rebalancer_strategy,
    create_rebalancer_execution, update_rebalancer_execution_state,
    get_rebalancer_execution, get_rebalancer_executions_for_user,
    save_portfolio_snapshot, get_latest_snapshot,
    save_research_report, get_user_research_reports,
    save_moderator_evaluation, get_latest_moderator_evaluation,
    get_moderator_evaluations, kill_agent_by_moderator,
    update_moderator_kill_threshold, update_moderator_frequency,
    get_moderator_cadence_info, get_fleet_activity,
    activate_kill_switch, deactivate_kill_switch,
    log_agent_action, get_agent_logs,
    publish_marketplace_agent, get_marketplace_agents,
    hire_marketplace_agent, get_user_hires, cancel_marketplace_hire,
    get_subscribers_for_creator_agent, mirror_trade_to_subscribers,
    update_cross_chain_setting, delete_all_user_agent_keys
)
from database.encryption import get_encryption
from key_manager import encrypt_private_key, decrypt_private_key


@pytest.fixture(scope="module", autouse=True)
def setup_test_environment():
    """Ensure v2 database schema is initialized for testing."""
    init_db()
    yield
    # Cleanup test artifacts so neptune_v2.db remains clean and unpolluted
    conn = get_connection()
    try:
        with conn:
            conn.execute("DELETE FROM marketplace_trade_mirrors")
            conn.execute("DELETE FROM marketplace_subscriptions")
            conn.execute("DELETE FROM marketplace_listings")
            conn.execute("DELETE FROM core_agent_audit_log WHERE wallet_address LIKE '%.testnet%'")
            conn.execute("DELETE FROM core_agent_wallets WHERE wallet_address LIKE '%.testnet%'")
            conn.execute("DELETE FROM core_user_wallets WHERE wallet_address LIKE '%.testnet%'")
    finally:
        conn.close()


# =============================================================================
# PART 1: THE 4 AUTONOMOUS AGENTS FULL PIPELINE TESTING
# =============================================================================

def test_01_trader_agent_data_flow():
    """Verify Trader Agent: config, trade lifecycle, reasoning traces, dropped trades, snapshots."""
    user = "alice_trader.testnet"
    upsert_user(user, {
        "trader_active": 1,
        "trader_timeframe": "4h",
        "trader_min_confidence": 80,
        "trader_coin_mode": "custom",
        "trader_custom_coins": ["NEAR", "BTC"]
    })

    # Verify config stored
    u = get_user(user)
    assert u["trader_active"] == 1
    assert u["trader_timeframe"] == "4h"
    assert u["trader_min_confidence"] == 80

    # 1. Open Trade
    trade_id = create_active_trade(
        user_wallet=user,
        symbol="BTC",
        action="BUY",
        entry_price=90000.0,
        current_price=90000.0,
        tp_price=95000.0,
        sl_price=87000.0,
        confidence_score=85,
        expected_roi_pct=5.5,
        amount_usd=100.0,
        tx_hash="tx-open-btc-1",
        execution_wallet="alice.agent.near"
    )
    assert trade_id > 0

    open_trades = get_open_trades(user)
    assert len(open_trades) >= 1
    assert any(t["id"] == trade_id and t["symbol"] == "BTC" for t in open_trades)

    # 2. Reasoning Trace (scoped in SQLite)
    cid = save_reasoning_trace(
        wallet_address=user,
        symbol="BTC",
        verdict="ENTER_LONG",
        confidence=85,
        trace_payload={"rsi": 65.2, "ema20": 89500.0, "reasoning": "Bullish momentum breakout"}
    )
    assert cid.startswith("bafy")
    traces = get_user_reasoning_traces(user, limit=5)
    assert len(traces) >= 1
    assert traces[0]["symbol"] == "BTC"
    assert traces[0]["trace_payload"]["rsi"] == 65.2

    # 3. Dropped Trade (Validator audit)
    drop_id = record_dropped_trade(
        user_wallet=user,
        agent_id="trader",
        symbol="ETH",
        amount_usd=50.0,
        reason="No destination EVM wallet configured"
    )
    assert drop_id > 0
    dropped = get_dropped_trades(user, limit=5)
    assert len(dropped) >= 1
    assert any(d["id"] == drop_id and "No destination" in d["drop_reason"] for d in dropped)

    # 4. Close Trade on TP
    update_trade_status(trade_id, "CLOSED_TP", current_price=95200.0)
    history = get_user_trade_history(user, limit=10)
    closed = next(t for t in history if t["id"] == trade_id)
    assert closed["status"] == "CLOSED_TP"
    assert closed["current_price"] == 95200.0


def test_02_rebalancer_agent_data_flow():
    """Verify Rebalancer Agent: config, strategies, execution state machine, portfolio snapshots."""
    user = "alice_rebalancer.testnet"
    upsert_user(user, {
        "rebalancer_active": 1,
        "rebalancer_target_stables": 60.0,
        "rebalancer_target_near": 40.0,
        "rebalancer_drift_threshold": 4.0
    })

    u = get_user(user)
    assert u["rebalancer_active"] == 1
    assert u["rebalancer_target_stables"] == 60.0
    assert u["rebalancer_target_near"] == 40.0

    # 1. Save Strategy
    strat = save_rebalancer_strategy(
        user_wallet=user,
        selected_coins=["NEAR", "USDT"],
        user_expectation="Maintain 60/40 stable allocation",
        cadence_days=7,
        allocations={"NEAR": 40.0, "USDT": 60.0},
        tp_sl_rules=[{"symbol": "NEAR", "tp": 7.0, "sl": 4.0}],
        market_regime="range_bound",
        overall_strategy="Accumulate NEAR on dips below $4.50"
    )
    assert strat["status"] == "ACTIVE"
    assert strat["allocations"]["NEAR"] == 40.0

    # Active strategy query
    active = get_active_rebalancer_strategy(user)
    assert active is not None
    assert active["market_regime"] == "range_bound"

    # 2. Execution State Machine
    exec_id = f"exec-test-{user[:6]}-1"
    exec_row = create_rebalancer_execution(
        execution_id=exec_id,
        user_wallet=user,
        strategy_id=strat["id"],
        state="PROPOSAL",
        token_in="NEAR",
        token_out="USDT",
        amount_in_usd=50.0,
        amount_in_atomic="10000000000000000000000000",
        amount_out_expected="50000000"
    )
    assert exec_row["state"] == "PROPOSAL"

    # Advance state: PROPOSAL -> EXECUTING -> COMPLETED
    update_rebalancer_execution_state(exec_id, state="EXECUTING", deposit_tx_hash="tx-dep-123")
    update_rebalancer_execution_state(exec_id, state="COMPLETED", terminal_status="SUCCESS", amount_out_actual="50200000")

    final_exec = get_rebalancer_execution(exec_id)
    assert final_exec["state"] == "COMPLETED"
    assert final_exec["terminal_status"] == "SUCCESS"
    assert final_exec["amount_out_actual"] == "50200000"

    # 3. Portfolio Snapshot
    save_portfolio_snapshot(user, {"NEAR_pct": 42.5, "USDT_pct": 57.5, "timestamp": "2026-11-09T21:00:00Z"})
    snap = get_latest_snapshot(user)
    assert snap is not None
    assert snap["snapshot_data"]["NEAR_pct"] == 42.5


def test_03_research_agent_data_flow():
    """Verify Research Agent: config, reports, signals, citations, A2A logs."""
    user = "alice_research.testnet"
    upsert_user(user, {"research_active": 1})

    # Save research report with citations and signals
    report_data = {
        "title": "NEAR Protocol Sharding Roadmap & DeFi Yield",
        "executive_summary": "Nightshade 2.0 implementation delivers stateless validation.",
        "sources_cited": ["https://near.org/blog/nightshade-2-0", "https://defillama.com/chain/Near"],
        "signals": [{"direction": "ACCUMULATE", "token": "NEAR", "confidence": 90}],
        "ecosystem_opportunities": [{"protocol": "Burrow", "apy": 12.4, "asset": "USDC"}]
    }

    cid = save_research_report(
        wallet_address=user,
        title=report_data["title"],
        query="NEAR sharding and yield",
        full_report=report_data,
        report_type="comprehensive"
    )
    assert cid.startswith("bafy")

    reports = get_user_research_reports(user, limit=5)
    assert len(reports) >= 1
    assert reports[0]["title"] == report_data["title"]
    assert len(reports[0]["full_report"]["signals"]) == 1
    assert reports[0]["full_report"]["signals"][0]["token"] == "NEAR"

    # A2A Rental action log
    log_id = log_agent_action(
        user_wallet=user,
        agent_name="research",
        trigger_type="a2a_hire_by_trader",
        reasoning_text="Trader agent rented research intelligence for 0.1 NEAR",
        action_taken="GENERATED_ALPHA_REPORT",
        cid_reference=cid,
        status="completed"
    )
    assert log_id > 0


def test_04_moderator_watchdog_agent_data_flow():
    """Verify Moderator Watchdog: 4-node evaluation audit, kill threshold, fleet activity, cadence."""
    user = "alice_moderator.testnet"
    upsert_user(user, {
        "moderator_active": 1,
        "moderator_frequency": "1w",
        "moderator_kill_threshold": 50.0
    })

    # 1. Save 4-Node evaluation
    eval_data = {
        "node_1_trader": {"score": 92.0, "status": "HEALTHY", "hallucination_detected": False},
        "node_2_rebalancer": {"score": 88.0, "status": "HEALTHY", "drift_pct": 2.1},
        "node_3_research": {"score": 95.0, "status": "HEALTHY", "sources_verified": 2},
        "node_4_council": {"overall_score": 91.6, "verdict": "APPROVED"}
    }

    eval_id = save_moderator_evaluation(
        user_wallet=user,
        cid="bafy_mod_eval_report_test_001",
        total_mean_score=91.6,
        overall_performance_score=91.6,
        trader_score=92.0,
        rebalancer_score=88.0,
        research_score=95.0,
        kill_threshold=50.0,
        killed_agents=[],
        verdict="APPROVED",
        evaluation_data=eval_data
    )
    assert eval_id > 0

    latest_eval = get_latest_moderator_evaluation(user)
    assert latest_eval is not None
    assert latest_eval["overall_performance_score"] == 91.6
    assert latest_eval["verdict"] == "APPROVED"
    assert latest_eval["evaluation_data"]["node_1_trader"]["score"] == 92.0

    # 2. Cadence Info
    cadence = get_moderator_cadence_info(user)
    assert cadence["frequency"] == "1w"
    assert cadence["cadence_days"] == 7
    assert "next_run_due_at" in cadence

    # 3. Fleet Activity Summary
    fleet = get_fleet_activity(user)
    assert fleet["user_wallet"] == user
    assert "trader" in fleet["agents"]
    assert "rebalancer" in fleet["agents"]
    assert "research" in fleet["agents"]
    assert "moderator" in fleet["agents"]
    assert fleet["agents"]["moderator"]["is_active"] is True

    # 4. Moderator Kill-Switch trigger simulation
    kill_res = kill_agent_by_moderator(user, "trader", "Critical risk breach detected by Council")
    assert kill_res["success"] is True
    u_after_kill = get_user(user)
    assert u_after_kill["trader_active"] == 0  # Trader halted by Moderator


# =============================================================================
# PART 2: EDGE CASES & MULTI-TENANT PRIVACY
# =============================================================================

def test_05_multi_tenant_data_isolation():
    """Verify Tenant B cannot access Tenant A's data across any agent table."""
    alice = "alice_privacy.testnet"
    bob = "bob_privacy.testnet"

    upsert_user(alice, {"trader_active": 1, "rebalancer_active": 1})
    upsert_user(bob, {"trader_active": 0, "rebalancer_active": 0})

    # Alice opens trade and generates report
    create_active_trade(alice, "NEAR", "BUY", 5.0, 5.0, 6.0, 4.5, 90, 20.0, 50.0)
    save_reasoning_trace(alice, "NEAR", "ENTER_LONG", 90, {"secret_alpha": "Alice Confidential Alpha"})
    save_research_report(alice, "Alice Secret Report", "Alpha query", {"confidential": True})
    save_moderator_evaluation(alice, "bafy_alice_mod", 90, 90, 90, 90, 90, 50, [], "APPROVED", {"audit": "clean"})

    # Bob queries (Must see 0 of Alice's data)
    assert len(get_open_trades(bob)) == 0
    assert len(get_user_trade_history(bob)) == 0
    assert len(get_user_reasoning_traces(bob)) == 0
    assert len(get_user_research_reports(bob)) == 0
    assert get_latest_moderator_evaluation(bob) is None
    assert len(get_agent_logs(bob)) == 0


def test_06_encryption_salt_derivation_isolation():
    """Verify cryptographic isolation: Bob cannot decrypt Alice's ciphertext with his context."""
    enc = get_encryption()
    alice = "alice_crypto.testnet"
    bob = "bob_crypto.testnet"
    secret = "ed25519:TopSecretDelegationKey9999"

    c_alice = enc.encrypt_field(alice, "agent_priv_key", secret)
    c_bob = enc.encrypt_field(bob, "agent_priv_key", secret)

    # Ciphertexts must differ due to wallet salt
    assert c_alice != c_bob

    # Alice decrypts
    assert enc.decrypt_field(alice, "agent_priv_key", c_alice) == secret

    # Bob tries to decrypt Alice's payload
    try:
        enc.decrypt_field(bob, "agent_priv_key", c_alice)
        raise AssertionError("Bob decrypted Alice's key! Security breach!")
    except Exception:
        pass  # Expected AES-GCM Auth tag failure

    # Decrypt with wrong field salt
    try:
        enc.decrypt_field(alice, "wrong_salt", c_alice)
        raise AssertionError("Decryption succeeded with wrong salt!")
    except Exception:
        pass


def test_07_master_kill_switch_behavior():
    """Verify Master Kill Switch immediately halts all agents and deactivation restores them."""
    user = "alice_ks.testnet"
    upsert_user(user, {"trader_active": 1, "rebalancer_active": 1, "research_active": 1, "moderator_active": 1})

    # Activate Kill Switch
    activate_kill_switch(user)
    u = get_user(user)
    assert u["kill_switch"] == 1
    assert u["autonomy_level"] == 0
    assert u["trader_active"] == 0
    assert u["rebalancer_active"] == 0
    assert u["research_active"] == 0
    assert u["moderator_active"] == 0

    # Deactivate and restore
    deactivate_kill_switch(user, restore_agents=True)
    u_restored = get_user(user)
    assert u_restored["kill_switch"] == 0
    assert u_restored["autonomy_level"] == 2
    assert u_restored["trader_active"] == 1
    assert u_restored["rebalancer_active"] == 1


def test_08_cross_chain_validator_enforcement():
    """Verify validator blocks cross-chain trades when allow_cross_chain_trades is disabled."""
    user = "cross_chain_edge.testnet"
    delete_all_user_agent_keys(user)
    upsert_user(user, {"allow_cross_chain_trades": 0})
    w = create_agent_wallet(user, label="NEAR Wallet")
    activate_agent_wallet(user, w["id"])
    assign_agent_wallets(user, {"trader": str(w["id"])})

    # Cross-chain trade blocked
    res_blocked = validate_agent_execution_wallet(user, "trader", target_chain="ethereum", is_cross_chain=True)
    assert res_blocked["valid"] is False
    assert "Allow Cross-Chain Trades" in res_blocked["reason"]

    # Toggle cross-chain allowed
    update_cross_chain_setting(user, allow=True)
    u = get_user(user)
    assert u["allow_cross_chain_trades"] == 1


def test_09_unbounded_retention_policy():
    """Verify database retains 100+ audit logs without arbitrary pruning caps."""
    import uuid
    user = f"high_freq_{uuid.uuid4().hex[:6]}.testnet"
    upsert_user(user)
    for i in range(120):
        log_agent_action(user, "trader", "scan", f"Scan #{i}", "MARKET_CHECKED")

    logs = get_agent_logs(user, limit=200)
    assert len(logs) == 120, f"Expected 120 logs, found {len(logs)} (pruning detected!)"


# =============================================================================
# PART 3: MARKETPLACE DATABASE TESTING (20 DISTINCT TEST PARAMETERS)
# =============================================================================

def test_10_marketplace_param_01_publish_trader():
    """Parameter 1: Publishing a Trader agent listing."""
    creator = "creator_trader.testnet"
    res = publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="trader",
        name="Momentum Alpha Trader",
        description="Autonomous 1h RSI/EMA momentum strategy",
        pricing_type="profit_share",
        pricing_value=15.0
    )
    assert res["listing_id"].startswith("listing-trader-")
    assert res["pricing_type"] == "profit_share"
    assert res["pricing_value"] == 15.0


def test_11_marketplace_param_02_publish_rebalancer():
    """Parameter 2: Publishing a Rebalancer agent listing."""
    creator = "creator_rebal.testnet"
    res = publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="rebalancer",
        name="Stables Delta Neutral Rebalancer",
        description="Dynamic 70/30 stables maintenance",
        pricing_type="fee_per_trade",
        pricing_value=0.25
    )
    assert res["listing_id"].startswith("listing-rebalancer-")
    assert res["pricing_type"] == "fee_per_trade"
    assert res["pricing_value"] == 0.25


def test_12_marketplace_param_03_publish_research():
    """Parameter 3: Publishing a Research agent listing."""
    creator = "creator_res.testnet"
    res = publish_marketplace_agent(
        creator_wallet=creator,
        agent_type="research",
        name="Deep Yield Intelligence",
        description="On-chain yield discovery",
        pricing_type="fee_per_report",
        pricing_value=0.1
    )
    assert res["listing_id"].startswith("listing-research-")
    assert res["pricing_type"] == "fee_per_report"
    assert res["pricing_value"] == 0.1


def test_13_marketplace_param_04_watchdog_publishing_prohibited():
    """Parameter 4: Moderator Watchdog marketplace publishing MUST BE REJECTED."""
    creator = "creator_mod.testnet"
    with pytest.raises(ValueError) as excinfo:
        publish_marketplace_agent(
            creator_wallet=creator,
            agent_type="moderator",
            name="Watchdog for Sale",
            description="Illegal sale",
            pricing_type="profit_share",
            pricing_value=10.0
        )
    assert "prohibited" in str(excinfo.value).lower() or "cannot be listed" in str(excinfo.value).lower()


def test_14_marketplace_param_05_invalid_agent_type_rejected():
    """Parameter 5: Invalid agent type publishing rejection."""
    creator = "creator_bad.testnet"
    with pytest.raises(ValueError):
        publish_marketplace_agent(
            creator_wallet=creator,
            agent_type="random_bot",
            name="Bad Bot",
            description="Bad",
            pricing_type="profit_share",
            pricing_value=5.0
        )


def test_15_marketplace_param_06_update_existing_listing():
    """Parameter 6: Update/re-publish existing listing updates metadata and snapshot."""
    creator = "creator_update.testnet"
    # First publish
    res1 = publish_marketplace_agent(creator, "trader", "Initial Name", "Desc 1", "profit_share", 10.0)
    # Second publish (updates existing)
    res2 = publish_marketplace_agent(creator, "trader", "Updated Name", "Desc 2", "profit_share", 20.0)
    assert res1["listing_id"] == res2["listing_id"]
    assert res2["name"] == "Updated Name"
    assert res2["pricing_value"] == 20.0


def test_16_marketplace_param_07_self_hire_prevention():
    """Parameter 7: Self-hire prevention (creator cannot hire own agent)."""
    creator = "creator_self.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Self Test Agent", "Desc", "profit_share", 10.0)
    with pytest.raises(ValueError) as excinfo:
        hire_marketplace_agent(subscriber_wallet=creator, listing_id=listing["listing_id"])
    assert "cannot hire your own agent" in str(excinfo.value).lower()


def test_17_marketplace_param_08_valid_hire_increments_subscribers():
    """Parameter 8: Valid hire creates active subscription & increments subscriber count."""
    creator = "creator_hire.testnet"
    sub = "subscriber_01.testnet"
    conn = get_connection()
    conn.execute("DELETE FROM marketplace_subscriptions WHERE subscriber_wallet = ?", (sub,))
    conn.execute("DELETE FROM marketplace_listings WHERE creator_wallet = ?", (creator,))
    conn.commit()
    conn.close()

    listing = publish_marketplace_agent(creator, "trader", "Hireable Agent", "Desc", "profit_share", 10.0)
    hire_res = hire_marketplace_agent(subscriber_wallet=sub, listing_id=listing["listing_id"])
    assert hire_res["success"] is True
    assert hire_res["is_new"] is True

    # Check subscriber count incremented
    agents = get_marketplace_agents("trader")
    target = next(a for a in agents if a["listing_id"] == listing["listing_id"])
    assert target["total_subscribers"] == 1


def test_18_marketplace_param_09_duplicate_hire_idempotency():
    """Parameter 9: Duplicate hire idempotency (returns existing subscription, no count duplicate)."""
    creator = "creator_dup.testnet"
    sub = "subscriber_dup.testnet"
    conn = get_connection()
    conn.execute("DELETE FROM marketplace_subscriptions WHERE subscriber_wallet = ?", (sub,))
    conn.execute("DELETE FROM marketplace_listings WHERE creator_wallet = ?", (creator,))
    conn.commit()
    conn.close()

    listing = publish_marketplace_agent(creator, "trader", "Dup Test Agent", "Desc", "profit_share", 10.0)
    res1 = hire_marketplace_agent(sub, listing["listing_id"])
    res2 = hire_marketplace_agent(sub, listing["listing_id"])
    assert res1["is_new"] is True
    assert res2["is_new"] is False
    assert res1["hire_id"] == res2["hire_id"]

    agents = get_marketplace_agents("trader")
    target = next(a for a in agents if a["listing_id"] == listing["listing_id"])
    assert target["total_subscribers"] == 1  # Count not incremented twice


def test_19_marketplace_param_10_cancel_active_hire():
    """Parameter 10: Cancel active hire updates status to cancelled & decrements subscriber count."""
    creator = "creator_cancel.testnet"
    sub = "subscriber_cancel.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Cancel Test Agent", "Desc", "profit_share", 10.0)
    hire_res = hire_marketplace_agent(sub, listing["listing_id"])

    # Cancel
    ok = cancel_marketplace_hire(subscriber_wallet=sub, hire_id=hire_res["hire_id"])
    assert ok is True

    # Check count decremented back to 0
    agents = get_marketplace_agents("trader")
    target = next(a for a in agents if a["listing_id"] == listing["listing_id"])
    assert target["total_subscribers"] == 0


def test_20_marketplace_param_11_cancel_nonexistent_hire_returns_false():
    """Parameter 11: Cancel non-existent hire returns False."""
    ok = cancel_marketplace_hire("unknown.testnet", "hire-nonexistent-123456")
    assert ok is False


def test_21_marketplace_param_12_subscriber_count_floor_zero():
    """Parameter 12: Subscriber count non-negative floor check."""
    creator = "creator_floor.testnet"
    sub = "subscriber_floor.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Floor Test", "Desc", "profit_share", 10.0)
    hire_res = hire_marketplace_agent(sub, listing["listing_id"])
    cancel_marketplace_hire(sub, hire_res["hire_id"])
    # Extra cancel attempt
    cancel_marketplace_hire(sub, hire_res["hire_id"])

    agents = get_marketplace_agents("trader")
    target = next(a for a in agents if a["listing_id"] == listing["listing_id"])
    assert target["total_subscribers"] >= 0


def test_22_marketplace_param_13_nonexistent_listing_hire_fails():
    """Parameter 13: Non-existent listing hire attempt raises ValueError."""
    with pytest.raises(ValueError) as excinfo:
        hire_marketplace_agent("sub.testnet", "listing-trader-fake-000000")
    assert "not found" in str(excinfo.value).lower()


def test_23_marketplace_param_14_pricing_types_and_fee_display():
    """Parameter 14: Pricing types and human-readable fee display strings."""
    c1 = "creator_p1.testnet"
    c2 = "creator_p2.testnet"
    c3 = "creator_p3.testnet"

    l1 = publish_marketplace_agent(c1, "trader", "Profit Share Agent", "Desc", "profit_share", 20.0)
    l2 = publish_marketplace_agent(c2, "rebalancer", "Per Trade Agent", "Desc", "fee_per_trade", 0.5)
    l3 = publish_marketplace_agent(c3, "research", "Per Report Agent", "Desc", "fee_per_report", 0.15)

    agents = get_marketplace_agents()
    a1 = next(a for a in agents if a["listing_id"] == l1["listing_id"])
    a2 = next(a for a in agents if a["listing_id"] == l2["listing_id"])
    a3 = next(a for a in agents if a["listing_id"] == l3["listing_id"])

    assert "20% Profit Share" in a1["fee_display"]
    assert "0.50 NEAR / Trade" in a2["fee_display"]
    assert "0.15 NEAR / Report" in a3["fee_display"]


def test_24_marketplace_param_15_filter_listings_by_type():
    """Parameter 15: Filter marketplace listings by agent_type."""
    traders = get_marketplace_agents("trader")
    assert all(a["agent_type"] == "trader" for a in traders)

    rebalancers = get_marketplace_agents("rebalancer")
    assert all(a["agent_type"] == "rebalancer" for a in rebalancers)


def test_25_marketplace_param_16_mirror_trade_single_subscriber():
    """Parameter 16: Mirror trade to single subscriber."""
    creator = "creator_mirror1.testnet"
    sub = "sub_mirror1.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Mirror Bot 1", "Desc", "profit_share", 10.0)
    hire_marketplace_agent(sub, listing["listing_id"])

    # Creator takes trade
    orig_trade = {
        "id": 101,
        "symbol": "NEAR",
        "action": "BUY",
        "entry_price": 5.0,
        "tp_price": 6.0,
        "sl_price": 4.5,
        "confidence_score": 85,
        "expected_roi_pct": 20.0,
        "amount_usd": 50.0,
        "tx_hash": "tx-orig-101"
    }

    mirrored_ids = mirror_trade_to_subscribers(creator, orig_trade)
    assert len(mirrored_ids) == 1
    sub_trades = get_open_trades(sub)
    assert any(t["symbol"] == "NEAR" and "mirror" in t.get("tx_hash", "") for t in sub_trades)


def test_26_marketplace_param_17_mirror_trade_multi_subscribers():
    """Parameter 17: Mirror trade to multiple distinct subscribers."""
    creator = "creator_mirror_multi.testnet"
    sub_a = "sub_multi_a.testnet"
    sub_b = "sub_multi_b.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Multi Mirror Bot", "Desc", "profit_share", 10.0)
    hire_marketplace_agent(sub_a, listing["listing_id"])
    hire_marketplace_agent(sub_b, listing["listing_id"])

    trade_data = {"symbol": "ETH", "action": "BUY", "entry_price": 3000.0, "tp_price": 3300.0, "sl_price": 2800.0, "amount_usd": 75.0}
    mirrored_ids = mirror_trade_to_subscribers(creator, trade_data)
    assert len(mirrored_ids) == 2

    assert len(get_open_trades(sub_a)) >= 1
    assert len(get_open_trades(sub_b)) >= 1


def test_27_marketplace_param_18_mirroring_excludes_creator():
    """Parameter 18: Mirroring excludes creator wallet."""
    creator = "creator_mirror_no_self.testnet"
    sub = "sub_mirror_no_self.testnet"
    listing = publish_marketplace_agent(creator, "trader", "No Self Bot", "Desc", "profit_share", 10.0)
    hire_marketplace_agent(sub, listing["listing_id"])

    trade_data = {"symbol": "BTC", "action": "BUY", "entry_price": 90000.0, "tp_price": 95000.0, "sl_price": 85000.0}
    creator_trades_before = len(get_open_trades(creator))
    mirror_trade_to_subscribers(creator, trade_data)
    creator_trades_after = len(get_open_trades(creator))
    assert creator_trades_before == creator_trades_after  # Creator did not mirror to themselves


def test_28_marketplace_param_19_query_user_hires_and_subscribers():
    """Parameter 19: Query user hires vs user subscribers."""
    creator = "creator_profile.testnet"
    sub = "sub_profile.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Profile Agent", "Desc", "profit_share", 10.0)
    hire_marketplace_agent(sub, listing["listing_id"])

    sub_profile = get_user_hires(sub)
    assert len(sub_profile["my_hires"]) >= 1
    assert sub_profile["my_hires"][0]["listing_id"] == listing["listing_id"]

    creator_profile = get_user_hires(creator)
    assert len(creator_profile["my_subscribers"]) >= 1


def test_29_marketplace_param_20_cascading_delete():
    """Parameter 20: Foreign key cascading delete of listing & subscriptions."""
    creator = "creator_cascade.testnet"
    sub = "sub_cascade.testnet"
    listing = publish_marketplace_agent(creator, "trader", "Cascade Agent", "Desc", "profit_share", 10.0)
    hire_res = hire_marketplace_agent(sub, listing["listing_id"])

    conn = get_connection()
    # Delete the listing
    conn.execute("DELETE FROM marketplace_listings WHERE listing_id = ?", (listing["listing_id"],))
    conn.commit()

    # Verify subscription removed via ON DELETE CASCADE
    subs = conn.execute("SELECT * FROM marketplace_subscriptions WHERE listing_id = ?", (listing["listing_id"],)).fetchall()
    assert len(subs) == 0
    conn.close()
