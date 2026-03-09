"""
Risk Agent   Validates proposed actions against safety guardrails.
Acts as a gatekeeper before any execution.
"""

from typing import Dict, Any
from guardrails import PolicyGuardrails
from database import log_agent_action


class RiskAgent:
    """
    Evaluates proposed actions from the Strategy Agent and determines
    whether they pass all safety checks.
    """

    def __init__(self):
        self.name = "risk"

    async def validate(
        self,
        decision: Dict[str, Any],
        user_wallet: str,
        estimated_amount_usd: float = 0.0
    ) -> Dict[str, Any]:
        """
        Validate a strategy decision against user guardrails.
        Returns validation result.
        """
        result = {
            "approved": False,
            "reason": "",
            "checks": {}
        }

        try:
            guardrails = PolicyGuardrails(user_wallet)
        except ValueError as e:
            result["reason"] = f"User not found: {e}"
            return result

        # Get policy summary for logging
        policy = guardrails.get_policy_summary()
        result["checks"]["policy"] = policy

        # Kill switch check
        if guardrails.is_kill_switch_active:
            result["reason"] = "Kill switch is active"
            result["checks"]["kill_switch"] = "BLOCKED"
            await self._log_blocked(user_wallet, decision, result)
            return result
        result["checks"]["kill_switch"] = "PASS"

        # Autonomy level
        if guardrails.autonomy_level == 0:
            result["reason"] = "Autonomy is disabled"
            result["checks"]["autonomy"] = "BLOCKED   level 0"
            await self._log_blocked(user_wallet, decision, result)
            return result
        result["checks"]["autonomy"] = f"PASS   level {guardrails.autonomy_level}"

        # Transaction guardrails
        action = decision.get("action", "unknown")
        token = decision.get("details", {}).get("token", "")

        allowed, reason = guardrails.check_transaction(
            action=action,
            amount_usd=estimated_amount_usd,
            token=token
        )

        if not allowed:
            result["reason"] = reason
            result["checks"]["transaction"] = f"BLOCKED   {reason}"
            await self._log_blocked(user_wallet, decision, result)
            return result

        result["checks"]["transaction"] = f"PASS   {reason}"
        result["approved"] = True
        result["reason"] = reason

        # Log the approval
        log_agent_action(
            user_wallet=user_wallet,
            agent_name="risk",
            trigger_type="validation",
            reasoning_text=f"Approved: {reason}",
            action_taken=f"Validated: {action}",
            status="approved"
        )

        return result

    async def _log_blocked(
        self,
        user_wallet: str,
        decision: Dict,
        result: Dict
    ):
        """Log a blocked action."""
        log_agent_action(
            user_wallet=user_wallet,
            agent_name="risk",
            trigger_type="validation",
            reasoning_text=f"Blocked: {result['reason']}",
            action_taken=f"Rejected: {decision.get('action', 'unknown')}",
            status="blocked"
        )
        print(f"[RISK] Blocked action for {user_wallet}: {result['reason']}")
