"""
Neptune AI v2   Autonomy Engine
Background scheduler that evaluates user strategies against live market data.
Completely separate from the existing chat flow.
"""

import asyncio
from typing import Dict, List
from datetime import datetime

from database import get_active_strategies, get_user, get_agent_logs
from market_data import get_token_prices
from autonomous_agents.strategy_agent import StrategyAgent
from autonomous_agents.risk_agent import RiskAgent
from autonomous_agents.execution_agent import ExecutionAgent
from autonomous_agents.audit_agent import AuditAgent
from notification_agent import notify_strategy_trigger


# Agent instances (singletons)
strategy_agent = StrategyAgent()
risk_agent = RiskAgent()
execution_agent = ExecutionAgent()
audit_agent = AuditAgent()


async def check_all_strategies():
    """
    Main autonomy loop   runs every 10 minutes via APScheduler.
    Evaluates all active strategies, runs them through the
    Strategy   Risk   Execution   Audit pipeline.
    """
    print(f"[AUTONOMY] Strategy check started at {datetime.utcnow().isoformat()}")

    try:
        # Get all active strategies across all users
        strategies = get_active_strategies()
        if not strategies:
            print("[AUTONOMY] No active strategies found")
            return

        print(f"[AUTONOMY] Evaluating {len(strategies)} active strategies")

        # Fetch market data once (shared across all evaluations)
        market_data = await get_token_prices()

        # Group by user
        user_strategies: Dict[str, List] = {}
        for s in strategies:
            wallet = s['user_wallet']
            if wallet not in user_strategies:
                user_strategies[wallet] = []
            user_strategies[wallet].append(s)

        # Process each user's strategies
        for wallet, user_strats in user_strategies.items():
            user = get_user(wallet)
            if not user:
                continue

            # Skip if kill switch is active or autonomy is off
            kill_switch = user.get('kill_switch', 0)
            autonomy_level = user.get('autonomy_level', 0)
            print(f"[AUTONOMY-DEBUG] User {wallet} | KS: {kill_switch} | AL: {autonomy_level}")
            
            if kill_switch or autonomy_level == 0:
                print(f"[AUTONOMY-DEBUG] Skipping user {wallet} due to Kill Switch or Autonomy=Off")
                continue

            for strategy in user_strats:
                print(f"[AUTONOMY-DEBUG] Passing strategy {strategy.get('id')} to engine...")
                await process_single_strategy(wallet, strategy, market_data, user)

    except Exception as e:
        print(f"[AUTONOMY] Error in strategy check: {e}")
        import traceback
        traceback.print_exc()

    print(f"[AUTONOMY] Strategy check completed at {datetime.utcnow().isoformat()}")


async def process_single_strategy(
    wallet: str,
    strategy: Dict,
    market_data: Dict,
    user: Dict
):
    """
    Run a single strategy through the full agent pipeline:
    Strategy   Risk   Execution   Audit
    """
    try:
        from tools import get_wallet_portfolio
        
        # Fetch the live on-chain portfolio (NEAR + FTs) instead of relying on the DB
        # The agent wallet operates on 'near' by default unless specified differently
        chain = strategy.get("trigger_condition", {}).get("chain", "near")
        live_portfolio = await get_wallet_portfolio(wallet, chain)
        
        print(f"[AUTONOMY] Live portfolio for {wallet}: {live_portfolio}")
        
        # 1. Strategy Agent evaluates
        decision = await strategy_agent.evaluate(
            user_wallet=wallet,
            strategy=strategy,
            market_data=market_data,
            portfolio=live_portfolio
        )

        if not decision['should_act']:
            print(f"[AUTONOMY] Strategy {strategy.get('id')} skipped: {decision.get('reasoning', 'No reason given')}")
            return  # Nothing to do

        # 2. Risk Agent validates
        risk_result = await risk_agent.validate(
            decision=decision,
            user_wallet=wallet,
            estimated_amount_usd=0  # Placeholder   real amount from strategy
        )

        if not risk_result['approved']:
            # Still log the blocked action via audit
            await audit_agent.log_and_store(
                user_wallet=wallet,
                decision=decision,
                risk_result=risk_result,
                execution_result={"success": False, "message": "Blocked by risk agent"},
                market_snapshot=market_data
            )
            return

        # 3. Execution Agent acts
        if user.get('autonomy_level', 0) == 1:
            # Notify only   log but don't execute
            execution_result = {
                "success": True,
                "tx_hash": None,
                "action": decision['action'],
                "message": f"Notification: {decision['action']} (auto-execute disabled)"
            }
        else:
            # Auto-execute (level 2)
            execution_result = await execution_agent.execute(
                decision=decision,
                user_wallet=wallet,
                risk_result=risk_result,
                autonomy_level="auto"
            )

        # 4. Audit Agent logs everything
        await audit_agent.log_and_store(
            user_wallet=wallet,
            decision=decision,
            risk_result=risk_result,
            execution_result=execution_result,
            market_snapshot=market_data
        )

        # 5. Notification Agent   draft and send email
        try:
            await notify_strategy_trigger(
                user_wallet=wallet,
                strategy=strategy,
                decision=decision,
                risk_result=risk_result,
                execution_result=execution_result,
                market_data=market_data
            )
        except Exception as notify_err:
            print(f"[AUTONOMY] Email notification error (non-fatal): {notify_err}")

    except Exception as e:
        print(f"[AUTONOMY] Error processing strategy {strategy.get('id')} for {wallet}: {e}")


async def get_autonomy_status() -> Dict:
    """Get the current status of the autonomy engine for the dashboard."""
    strategies = get_active_strategies()
    return {
        "active_strategies": len(strategies),
        "last_check": datetime.utcnow().isoformat(),
        "status": "running"
    }
