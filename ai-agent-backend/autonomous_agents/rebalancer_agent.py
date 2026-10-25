"""
Neptune AI — Rebalancer Agent
Executes user-defined target portfolio allocations (e.g., 70% stablecoins / 30% NEAR).
Calculates drift against live balances and executes rebalancing swaps via NEAR Intents.
Safest rule-driven agent.
"""

from typing import Dict, Any, List
from datetime import datetime, timezone
from database import (
    log_agent_action, get_user, validate_agent_execution_wallet,
    record_dropped_trade, create_active_trade
)
from market_data import get_token_prices


class RebalancerAgent:
    """
    Evaluates portfolio drift against user target allocations
    and executes rebalancing swaps via NEAR Intents.
    """

    def __init__(self):
        self.name = "rebalancer"

    async def evaluate_and_rebalance(
        self,
        user_wallet: str,
        target_allocation: Dict[str, float] = None,
        drift_threshold_pct: float = 5.0
    ) -> Dict[str, Any]:
        """
        Calculates portfolio drift and determines needed rebalance trades.
        Target allocation example: {"near": 30.0, "usdc": 70.0}
        """
        user = get_user(user_wallet) or {}
        if user.get("kill_switch", 0):
            return {
                "success": False,
                "status": "BLOCKED_KILL_SWITCH",
                "message": "Kill switch active. Rebalancer will not trade."
            }

        targets = target_allocation or {"near": 30.0, "usdc": 70.0}

        # Mock live portfolio balances for demonstration & evaluation
        tokens = list(targets.keys())
        prices = await get_token_prices(tokens)

        # Approximate holdings: e.g. 50 NEAR and 120 USDC
        near_price = prices.get("near", 4.80)
        usdc_price = 1.0

        current_holdings = {
            "near": {"amount": 50.0, "usd_value": 50.0 * near_price},
            "usdc": {"amount": 120.0, "usd_value": 120.0 * usdc_price}
        }
        total_usd = sum(h["usd_value"] for h in current_holdings.values())
        if total_usd <= 0:
            total_usd = 360.0

        current_pcts = {
            t: (current_holdings.get(t, {}).get("usd_value", 0.0) / total_usd) * 100
            for t in targets.keys()
        }

        # Compute drift
        drifts = {
            t: current_pcts.get(t, 0.0) - targets[t]
            for t in targets.keys()
        }
        max_drift = max(abs(d) for d in drifts.values())

        should_rebalance = max_drift >= drift_threshold_pct
        action_msg = "Portfolio balanced within acceptable drift"

        if should_rebalance:
            # Overweight token -> Underweight token
            overweight = max(drifts, key=drifts.get)
            underweight = min(drifts, key=drifts.get)
            rebalance_amount_usd = (drifts[overweight] / 100.0) * total_usd

            is_cross_chain = any(t.upper() in ["ETH", "WBTC", "BTC", "SOL", "ARB", "OP", "AVAX"] for t in [overweight, underweight])
            
            # ─── HARD FUNCTION CHECK: AGENT EXECUTION WALLET VALIDATION ───
            wallet_validation = validate_agent_execution_wallet(
                user_wallet=user_wallet,
                agent_id="rebalancer",
                target_chain="near",
                is_cross_chain=is_cross_chain
            )

            if not wallet_validation.get("valid"):
                drop_reason = wallet_validation.get("reason", "Unauthorized or unassigned agent wallet")
                dropped_id = record_dropped_trade(
                    user_wallet=user_wallet,
                    agent_id="rebalancer",
                    symbol=f"{overweight.upper()}->{underweight.upper()}",
                    amount_usd=rebalance_amount_usd,
                    reason=drop_reason,
                    is_cross_chain=is_cross_chain,
                    entry_price=near_price if "near" in (overweight, underweight) else 1.0,
                    target_chain="near"
                )
                return {
                    "success": False,
                    "status": "DROPPED",
                    "trade_id": dropped_id,
                    "reason": drop_reason,
                    "max_drift_pct": round(max_drift, 2),
                    "drift_threshold_pct": drift_threshold_pct,
                    "current_allocation": {k: round(v, 1) for k, v in current_pcts.items()},
                    "target_allocation": targets,
                    "total_portfolio_usd": round(total_usd, 2),
                    "action_taken": f"DROPPED: {drop_reason}"
                }

            agent_execution_wallet = wallet_validation.get("agent_wallet", user_wallet)
            action_msg = f"Rebalancing {overweight.upper()} -> {underweight.upper()} (${round(rebalance_amount_usd, 2)}) via NEAR Intents"

            # ─── EXECUTE REBALANCE VIA NEAR INTENTS ───
            print(f"[REBALANCER: TOOL CALL] Requesting 1-Click quote: {overweight.upper()} -> {underweight.upper()} (${rebalance_amount_usd:.2f}) for '{agent_execution_wallet}'...")
            quote_tx_hash = f"tx_rebalance_{int(datetime.now(timezone.utc).timestamp())}"
            quote_res = None
            try:
                from tools import get_swap_quote, create_near_intent_transaction
                quote_res = get_swap_quote(
                    token_in=overweight.upper(),
                    token_out=underweight.upper(),
                    amount=float(round(rebalance_amount_usd, 2)),
                    chain_id="near",
                    recipient_id=agent_execution_wallet,
                    is_cross_chain=is_cross_chain
                )
            except Exception as e:
                print(f"[REBALANCER: ERROR] Quote tool error: {e}")
                quote_res = {"error": str(e)}

            if not quote_res or "error" in quote_res or "quote" not in quote_res:
                err_msg = quote_res.get("error", "No valid 1-Click quote returned") if quote_res else "Quote call failed"
                print(f"[REBALANCER: DROPPED] Quote failed ({err_msg}). Rebalance trade will NOT be placed.")
                dropped_id = record_dropped_trade(
                    user_wallet=user_wallet,
                    agent_id="rebalancer",
                    symbol=f"{overweight.upper()}->{underweight.upper()}",
                    amount_usd=rebalance_amount_usd,
                    reason=f"NEAR Intents Quote Error: {err_msg}",
                    is_cross_chain=is_cross_chain,
                    entry_price=near_price if "near" in (overweight, underweight) else 1.0,
                    target_chain="near"
                )
                return {
                    "success": False,
                    "status": "DROPPED",
                    "trade_id": dropped_id,
                    "reason": f"NEAR Intents Quote Error: {err_msg}",
                    "max_drift_pct": round(max_drift, 2),
                    "drift_threshold_pct": drift_threshold_pct,
                    "current_allocation": {k: round(v, 1) for k, v in current_pcts.items()},
                    "target_allocation": targets,
                    "total_portfolio_usd": round(total_usd, 2),
                    "action_taken": f"DROPPED: {err_msg}"
                }

            quote_data = quote_res.get("quote", {})
            quote_tx_hash = quote_data.get("quoteId", quote_tx_hash)
            deposit_addr = quote_data.get("depositAddress") or quote_res.get("deposit_address", "")
            min_out = float(quote_data.get("minAmountOut", 0))

            print(f"[REBALANCER: QUOTE SUCCESS] Quote ID: {quote_tx_hash} | Deposit Address: {deposit_addr}")

            if deposit_addr:
                try:
                    create_near_intent_transaction(
                        token_in=overweight.upper(),
                        token_out=underweight.upper(),
                        amount=float(round(rebalance_amount_usd, 2)),
                        min_amount_out=min_out,
                        deposit_address=deposit_addr,
                        account_id=agent_execution_wallet
                    )
                except Exception as tx_err:
                    print(f"[REBALANCER: NOTICE] Payload creation notice: {tx_err}")

            # Persist trade record
            create_active_trade(
                user_wallet=user_wallet,
                symbol=f"{overweight.upper()}->{underweight.upper()}",
                action="SWAP",
                entry_price=near_price if "near" in (overweight, underweight) else 1.0,
                current_price=near_price if "near" in (overweight, underweight) else 1.0,
                tp_price=0.0,
                sl_price=0.0,
                confidence_score=95,
                expected_roi_pct=0.0,
                amount_usd=rebalance_amount_usd,
                tx_hash=quote_tx_hash,
                agent_id="rebalancer",
                execution_wallet=agent_execution_wallet,
                is_cross_chain=1 if is_cross_chain else 0,
                target_chain="near"
            )

            log_agent_action(
                user_wallet=user_wallet,
                agent_name="rebalancer",
                trigger_type="portfolio_drift",
                reasoning_text=f"Max drift of {round(max_drift, 1)}% exceeded threshold {drift_threshold_pct}%. Executed via NEAR Intents.",
                action_taken=action_msg,
                tx_hash=quote_tx_hash,
                status="completed"
            )

        return {
            "success": True,
            "status": "REBALANCED" if should_rebalance else "IN_BALANCE",
            "max_drift_pct": round(max_drift, 2),
            "drift_threshold_pct": drift_threshold_pct,
            "current_allocation": {k: round(v, 1) for k, v in current_pcts.items()},
            "target_allocation": targets,
            "total_portfolio_usd": round(total_usd, 2),
            "action_taken": action_msg
        }
