"""
Neptune AI v2   Policy Guardrails
Enforces safety constraints on autonomous agent actions.
Separate module: does NOT touch existing chat/swap logic.
"""

from typing import Tuple, Optional, Dict, Any
from database import get_user, get_daily_spend


class PolicyGuardrails:
    """
    Validates that a proposed autonomous action is within the user's
    configured safety limits. Used by the Risk Agent before execution.
    """

    def __init__(self, user_wallet: str):
        self.user = get_user(user_wallet)
        if not self.user:
            raise ValueError(f"User {user_wallet} not found in database")

    @property
    def is_kill_switch_active(self) -> bool:
        return bool(self.user.get('kill_switch', 0))

    @property
    def autonomy_level(self) -> int:
        return self.user.get('autonomy_level', 0)

    def check_transaction(
        self,
        action: str,
        amount_usd: float,
        token: str = None
    ) -> Tuple[bool, str]:
        """
        Validate a proposed action against user guardrails.
        Returns (allowed: bool, reason: str).
        """
        # Kill switch overrides everything
        if self.is_kill_switch_active:
            return False, "Kill switch is active   all autonomous actions halted"

        # Autonomy must be enabled
        if self.autonomy_level == 0:
            return False, "Autonomy is disabled for this user"

        # Max transaction amount
        max_tx = self.user.get('max_tx_amount', 500.0)
        if amount_usd > max_tx:
            return False, (
                f"Amount ${amount_usd:.2f} exceeds max transaction limit "
                f"${max_tx:.2f}"
            )

        # Daily limit check
        daily_limit = self.user.get('daily_limit', 2000.0)
        daily_spent = get_daily_spend(self.user['wallet_address'])
        if daily_spent + amount_usd > daily_limit:
            return False, (
                f"Would exceed daily limit: ${daily_spent:.2f} spent + "
                f"${amount_usd:.2f} = ${daily_spent + amount_usd:.2f} "
                f"(limit: ${daily_limit:.2f})"
            )

        # Token whitelist (if configured)
        allowed_tokens_str = self.user.get('allowed_tokens', '')
        if allowed_tokens_str and token:
            allowed_list = [t.strip().upper() for t in allowed_tokens_str.split(',') if t.strip()]
            if allowed_list and token.upper() not in allowed_list:
                return False, f"Token {token} not in allowed list: {allowed_list}"

        return True, (
            f"APPROVED   ${amount_usd:.2f} within limits "
            f"(max_tx: ${max_tx:.2f}, daily: ${daily_limit:.2f})"
        )

    def get_policy_summary(self) -> Dict[str, Any]:
        """Return a summary of the user's current policy settings."""
        return {
            "wallet": self.user['wallet_address'],
            "autonomy_level": self.autonomy_level,
            "autonomy_mode": ["off", "notify_only", "auto_execute"][
                min(self.autonomy_level, 2)
            ],
            "max_tx_amount": self.user.get('max_tx_amount', 500.0),
            "daily_limit": self.user.get('daily_limit', 2000.0),
            "risk_profile": self.user.get('risk_profile', 'moderate'),
            "kill_switch": self.is_kill_switch_active,
            "allowed_tokens": self.user.get('allowed_tokens', ''),
        }
