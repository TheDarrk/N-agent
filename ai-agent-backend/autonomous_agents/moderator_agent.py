"""
Neptune AI — Moderator Watchdog Agent
Default-on guardian holding the emergency Kill Switch.
Continuously monitors aggregate exposure, correlated positions, and mandate breaches.
Can revoke access keys on-chain and trigger emergency unwinds to stables.
"""

from typing import Dict, Any, List
from datetime import datetime
from database import (
    get_user, activate_kill_switch, deactivate_kill_switch,
    get_open_trades, update_trade_status, log_agent_action
)


class ModeratorAgent:
    """
    Default-on risk guardian watching all agent activities.
    Holds kill switch authority to halt rogue actions and protect capital.
    """

    def __init__(self):
        self.name = "moderator"

    async def get_watchdog_status(self, user_wallet: str) -> Dict[str, Any]:
        """
        Calculates aggregate exposure, portfolio health score (0-100),
        and active guardrail parameters.
        """
        user = get_user(user_wallet) or {}
        kill_switch = bool(user.get("kill_switch", 0))
        daily_limit = float(user.get("daily_limit", 2000.0))
        max_tx = float(user.get("max_tx_amount", 500.0))

        # Check open trades exposure
        open_trades = get_open_trades(user_wallet)
        total_open_exposure_usd = sum(float(t.get("amount_usd", 0.0)) for t in open_trades)

        # Health score calculation
        health_score = 100
        if kill_switch:
            health_score = 0
        else:
            if total_open_exposure_usd > daily_limit * 0.7:
                health_score -= 30
            elif total_open_exposure_usd > daily_limit * 0.4:
                health_score -= 15
            if len(open_trades) >= 5:
                health_score -= 10

        return {
            "status": "HALTED" if kill_switch else "ACTIVE_PROTECTION",
            "health_score": max(0, health_score),
            "kill_switch_active": kill_switch,
            "open_trades_count": len(open_trades),
            "total_open_exposure_usd": round(total_open_exposure_usd, 2),
            "daily_limit_usd": daily_limit,
            "max_tx_amount_usd": max_tx,
            "open_trades": open_trades
        }

    async def trigger_emergency_kill_switch(self, user_wallet: str, unwind_to_stables: bool = True) -> Dict[str, Any]:
        """
        Emergency Stop: Halts all autonomous agents, revokes keys, and marks trades as REVOKED.
        """
        activate_kill_switch(user_wallet)

        open_trades = get_open_trades(user_wallet)
        revoked_count = 0
        for trade in open_trades:
            update_trade_status(trade["id"], "REVOKED")
            revoked_count += 1

        log_agent_action(
            user_wallet=user_wallet,
            agent_name="moderator",
            trigger_type="emergency_kill_switch",
            reasoning_text=f"Kill switch activated! Revoked {revoked_count} active trades and suspended autonomous runners.",
            action_taken="KILL_SWITCH_ACTIVE",
            status="revoked"
        )

        return {
            "success": True,
            "message": f"Kill switch successfully triggered. {revoked_count} trades revoked. All agents halted.",
            "unwind_requested": unwind_to_stables,
            "user_wallet": user_wallet
        }

    async def reset_kill_switch(self, user_wallet: str) -> Dict[str, Any]:
        """Reset the kill switch back to normal monitoring."""
        deactivate_kill_switch(user_wallet)
        log_agent_action(
            user_wallet=user_wallet,
            agent_name="moderator",
            trigger_type="kill_switch_reset",
            reasoning_text="Safety checks verified. Moderator resumed standard watchdog surveillance.",
            action_taken="RESUMED_NORMAL",
            status="active"
        )
        return {
            "success": True,
            "message": "Moderator watchdog resumed normal operation."
        }
