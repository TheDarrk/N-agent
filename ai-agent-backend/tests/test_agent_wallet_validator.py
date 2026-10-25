"""
Unit and Integration Tests for Agent Wallet Validator, Dropped Trades,
Cross-Chain Rules, and Moderator Judge Surveillance.
"""

import pytest
import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import (
    init_db, upsert_user, create_agent_wallet, assign_agent_wallets,
    validate_agent_execution_wallet, record_dropped_trade, get_dropped_trades,
    update_cross_chain_setting, get_user, get_user_agent_wallet_config,
    delete_all_user_agent_keys
)
from autonomous_agents.trader_agent import TraderAgent
from autonomous_agents.rebalancer_agent import RebalancerAgent
from autonomous_agents.moderator_agent import ModeratorAgent


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    init_db()


def test_validator_blocks_unassigned_agent():
    test_user = "unassigned_trader.testnet"
    upsert_user(test_user, {"allow_cross_chain_trades": 0})
    
    # 1. No wallet assigned to trader -> MUST BE INVALID
    res = validate_agent_execution_wallet(user_wallet=test_user, agent_id="trader")
    assert res["valid"] is False
    assert "No Agent Execution Wallet assigned" in res["reason"]


def test_validator_blocks_cross_chain_when_disabled():
    test_user = "cross_chain_test.testnet"
    delete_all_user_agent_keys(test_user)
    upsert_user(test_user, {"allow_cross_chain_trades": 0})
    
    # Create wallet and assign to trader
    w = create_agent_wallet(test_user, label="Test Near Wallet", wallet_type="implicit")
    assign_agent_wallets(test_user, {"trader": str(w["id"])})
    
    # 1. Same-chain trade -> SHOULD BE VALID
    same_chain_res = validate_agent_execution_wallet(
        user_wallet=test_user, agent_id="trader", target_chain="near", is_cross_chain=False
    )
    assert same_chain_res["valid"] is True
    assert same_chain_res["agent_wallet"] == w["agent_wallet_address"]

    # 2. Cross-chain trade -> MUST BE REJECTED because allow_cross_chain_trades == 0
    cross_res = validate_agent_execution_wallet(
        user_wallet=test_user, agent_id="trader", target_chain="ethereum", is_cross_chain=True
    )
    assert cross_res["valid"] is False
    assert "Allow Cross-Chain Trades" in cross_res["reason"]

    # 3. Enable cross-chain trades without EVM destination -> REJECTED (Missing EVM wallet)
    update_cross_chain_setting(test_user, allow=True)
    cross_res_no_evm = validate_agent_execution_wallet(
        user_wallet=test_user, agent_id="trader", target_chain="ethereum", is_cross_chain=True
    )
    assert cross_res_no_evm["valid"] is False
    assert "destination wallet" in cross_res_no_evm["reason"]

    # 4. Attach EVM wallet to multi-chain trader agent -> NOW VALID
    from database import import_agent_wallet
    evm_w = import_agent_wallet(
        user_wallet=test_user,
        public_key="0x71C8363837918a2132b12829283748291a92182b",
        agent_account_id="0x71C8363837918a2132b12829283748291a92182b",
        label="Trader Arbitrum EVM Wallet"
    )
    assign_agent_wallets(test_user, {"trader": f"{w['id']},{evm_w['id']}"})
    cross_res_enabled = validate_agent_execution_wallet(
        user_wallet=test_user, agent_id="trader", target_chain="ethereum", is_cross_chain=True
    )
    assert cross_res_enabled["valid"] is True
    assert cross_res_enabled["destination_wallet"] == "0x71C8363837918a2132b12829283748291a92182b"


def test_record_and_fetch_dropped_trades():
    test_user = "drop_test_user.testnet"
    upsert_user(test_user)
    
    drop_id = record_dropped_trade(
        user_wallet=test_user,
        agent_id="trader",
        symbol="ETH",
        amount_usd=50.0,
        reason="No Agent Execution Wallet assigned to Trader Agent",
        is_cross_chain=True,
        entry_price=3100.0,
        target_chain="ethereum"
    )
    assert drop_id > 0
    
    dropped = get_dropped_trades(test_user, limit=5)
    assert len(dropped) >= 1
    latest = dropped[0]
    assert latest["symbol"] == "ETH"
    assert latest["status"] == "DROPPED"
    assert latest["agent_id"] == "trader"
    assert "No Agent Execution Wallet" in latest["drop_reason"]


def test_rebalancer_drops_when_unassigned():
    test_user = "unassigned_rebalancer.testnet"
    upsert_user(test_user, {"kill_switch": 0})
    
    rebalancer = RebalancerAgent()
    # Force high drift so it attempts rebalance
    res = asyncio.run(rebalancer.evaluate_and_rebalance(
        user_wallet=test_user,
        target_allocation={"near": 10.0, "usdc": 90.0},
        drift_threshold_pct=1.0
    ))
    # Since no wallet is assigned, trade MUST BE DROPPED by hard validator
    assert res["success"] is False
    assert res["status"] == "DROPPED"
    assert "No Agent Execution Wallet assigned" in res["reason"]


def test_moderator_penalizes_dropped_trades():
    test_user = "watchdog_audit_user.testnet"
    upsert_user(test_user, {"kill_switch": 0, "moderator_active": 1})
    
    # Record 2 dropped trades for this user
    record_dropped_trade(
        user_wallet=test_user,
        agent_id="trader",
        symbol="SOL",
        amount_usd=60.0,
        reason="Agent wallet unassigned",
        is_cross_chain=True
    )
    record_dropped_trade(
        user_wallet=test_user,
        agent_id="rebalancer",
        symbol="NEAR->USDC",
        amount_usd=40.0,
        reason="Agent wallet pending funding",
        is_cross_chain=False
    )
    
    moderator = ModeratorAgent()
    eval_res = asyncio.run(moderator.evaluate_fleet_performance(test_user))
    
    assert eval_res["dropped_trades_count"] >= 2
    assert "dropped_trades" in eval_res
    # Health score penalized
    assert eval_res["health_score"] < 90
    assert eval_res["parameter_scores"]["execution_efficiency_uptime"]["status"] in ("DEGRADED", "BREACH", "POOR", "WARNING")
    assert any("dropped" in f.lower() or "wallet" in f.lower() or "fleet" in f.lower() for f in eval_res["key_findings"])
