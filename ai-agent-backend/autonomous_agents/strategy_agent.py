"""
Strategy Agent   Evaluates user-defined rules against market conditions.
Decides whether to rebalance, hedge, stop-loss, or restake.
"""

import json
from typing import Dict, Any, Optional
from database import get_active_strategies, update_strategy_triggered


class StrategyAgent:
    """
    Evaluates strategy rules against current market data.
    Does NOT execute   only decides and returns a proposed action.
    """

    def __init__(self):
        self.name = "strategy"

    async def evaluate(
        self,
        user_wallet: str,
        strategy: Dict[str, Any],
        market_data: Dict[str, float],
        portfolio: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a single strategy rule against current conditions.
        Returns a decision dict.
        """
        strategy_type = strategy.get("strategy_type", "")
        condition = strategy.get("trigger_condition", {})

        decision = {
            "should_act": False,
            "strategy_id": strategy.get("id"),
            "strategy_type": strategy_type,
            "action": None,
            "reasoning": "",
            "details": {}
        }

        if strategy_type == "price_alert":
            decision = await self._eval_price_alert(condition, market_data, decision)
        elif strategy_type == "stop_loss":
            decision = await self._eval_stop_loss(condition, market_data, portfolio, decision)
        elif strategy_type == "rebalance":
            decision = await self._eval_rebalance(condition, market_data, portfolio, decision)
        elif strategy_type == "restake":
            decision = await self._eval_restake(condition, market_data, decision)
        else:
            decision["reasoning"] = f"Unknown strategy type: {strategy_type}"

        # If triggered mark in DB
        if decision["should_act"]:
            update_strategy_triggered(strategy["id"])
            print(f"[STRATEGY] Triggered: {strategy_type} for {user_wallet} - {decision['reasoning']}")

        return decision

    async def _eval_price_alert(
        self, condition: Dict, market_data: Dict, decision: Dict
    ) -> Dict:
        """Check if a token price crossed a threshold."""
        token = condition.get("token", "").lower()
        threshold = condition.get("threshold_pct", 5.0)
        direction = condition.get("direction", "drop")  # "drop" or "surge"

        current_price = market_data.get(token, 0)
        # For simplicity, we check 24h change from cached data
        changes = market_data.get("_changes", {})
        change_pct = changes.get(token, 0)

        if direction == "drop" and change_pct <= -abs(threshold):
            decision["should_act"] = True
            decision["action"] = f"ALERT: {token.upper()} dropped {abs(change_pct):.1f}%"
            decision["reasoning"] = (
                f"{token.upper()} price dropped {abs(change_pct):.1f}% "
                f"(threshold: {threshold}%)"
            )
        elif direction == "surge" and change_pct >= abs(threshold):
            decision["should_act"] = True
            decision["action"] = f"ALERT: {token.upper()} surged {change_pct:.1f}%"
            decision["reasoning"] = (
                f"{token.upper()} price surged {change_pct:.1f}% "
                f"(threshold: {threshold}%)"
            )
        else:
            decision["reasoning"] = (
                f"{token.upper()} change {change_pct:.1f}% within threshold  {threshold}%"
            )

        decision["details"] = {
            "token": token,
            "current_change": round(change_pct, 2),
            "threshold": threshold,
            "current_price": current_price
        }
        return decision

    async def _eval_stop_loss(
        self, condition: Dict, market_data: Dict,
        portfolio: Dict, decision: Dict
    ) -> Dict:
        """Check if portfolio value dropped below stop-loss threshold."""
        token = condition.get("token", "").lower()
        drop_pct = condition.get("drop_pct", 10.0)

        changes = market_data.get("_changes", {})
        change = changes.get(token, 0)

        if change <= -abs(drop_pct):
            decision["should_act"] = True
            decision["action"] = f"STOP_LOSS: Sell {token.upper()} (dropped {abs(change):.1f}%)"
            decision["reasoning"] = (
                f"Stop-loss triggered: {token.upper()} dropped {abs(change):.1f}% "
                f"(limit: {drop_pct}%)"
            )
        else:
            decision["reasoning"] = (
                f"{token.upper()} change {change:.1f}% within stop-loss limit {drop_pct}%"
            )

        return decision

    async def _eval_rebalance(
        self, condition: Dict, market_data: Dict,
        portfolio: Dict, decision: Dict
    ) -> Dict:
        """Check if portfolio allocation drifted beyond threshold."""
        drift_threshold = condition.get("drift_pct", 15.0)
        target_allocation = condition.get("target", {})  # {"eth": 50, "btc": 30, "near": 20}

        if not portfolio or not target_allocation:
            decision["reasoning"] = "No portfolio data or target allocation available"
            return decision

        # Lowercase the target allocation keys for safety
        target_dict = {k.lower(): v for k, v in target_allocation.items()}
        print(f"[STRATEGY-DEBUG] Rebalance target: {target_dict}")
        print(f"[STRATEGY-DEBUG] Live portfolio: {portfolio}")

        # 1. Calculate true total portfolio value (across all held assets)
        total_value = 0.0
        for p_token, amount in portfolio.items():
            price = market_data.get(p_token.lower(), 0)
            token_val = float(amount) * price
            print(f"[STRATEGY-DEBUG]   {p_token.upper()}: {amount} @ ${price} = ${token_val:.2f}")
            total_value += token_val
            
        print(f"[STRATEGY-DEBUG] Total USD Value: ${total_value:.2f}")

        if total_value == 0:
            decision["reasoning"] = "Portfolio value is zero (no held assets)   cannot calculate drift"
            return decision

        max_drift = 0
        overweight_token = None
        underweight_token = None
        max_overweight_drift = 0
        max_underweight_drift = 0

        # Create a unified list of tokens involved: (held in portfolio) union (in target allocation)
        all_tokens = set([k.lower() for k in portfolio.keys()] + list(target_dict.keys()))

        for token in all_tokens:
            target_pct = target_dict.get(token, 0) # 0 if we hold it but it's not in target
            
            # Fetch case-insensitive from portfolio
            current_amount = 0
            for k, v in portfolio.items():
                if k.lower() == token:
                    current_amount = float(v)
                    break
                    
            current_value = current_amount * market_data.get(token, 0)
            actual_pct = (current_value / total_value) * 100
            drift = actual_pct - target_pct
            
            # Record absolute max drift for triggering the rule
            max_drift = max(max_drift, abs(drift))

            if drift > max_overweight_drift:
                max_overweight_drift = drift
                overweight_token = token
            elif drift < max_underweight_drift:
                max_underweight_drift = drift
                underweight_token = token

        if max_drift > drift_threshold and overweight_token and underweight_token:
            # We need to sell the overweight token to buy the underweight token.
            # Calculate how much USD value to sell: we sell enough to bring the overweight token down to its target %
            usd_to_sell = (max_overweight_drift / 100.0) * total_value
            token_price = market_data.get(overweight_token.lower(), 0)
            token_amount_to_sell = (usd_to_sell / token_price) if token_price > 0 else 0

            decision["should_act"] = True
            decision["action"] = f"REBALANCE: Portfolio drift {max_drift:.1f}%"
            decision["reasoning"] = (
                f"Portfolio drift {max_drift:.1f}% exceeds threshold {drift_threshold}%. "
                f"Trading {overweight_token.upper()} -> {underweight_token.upper()}"
            )
            decision["details"] = {
                "max_drift": round(max_drift, 2),
                "sell_token": overweight_token,
                "buy_token": underweight_token,
                "rebalance_amount": round(token_amount_to_sell, 6),
                "chain": condition.get("chain", "near")
            }
        else:
            decision["reasoning"] = (
                f"Portfolio drift {max_drift:.1f}% within threshold {drift_threshold}%"
            )
            decision["details"] = {"max_drift": round(max_drift, 2)}

        return decision

    async def _eval_restake(
        self, condition: Dict, market_data: Dict, decision: Dict
    ) -> Dict:
        """Check if restaking conditions are met."""
        min_balance = condition.get("min_balance", 10.0)
        token = condition.get("token", "near").lower()

        # Placeholder   in production, check actual staking yields
        decision["reasoning"] = f"Restake evaluation for {token.upper()}: pending implementation"
        return decision
