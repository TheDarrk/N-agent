"""
Neptune AI — 1-Minute Active Trade & TP/SL Poller
Monitors all open trades every 60 seconds against live DEX/market prices.
Executes automated closing swaps when Take-Profit (TP) or Stop-Loss (SL) levels are reached.
Quiet Mode: Does not log heartbeat polling. Only logs on failures or actual TP/SL triggers.
"""

import asyncio
from datetime import datetime
from typing import Dict, Any, List

from database import get_open_trades, update_trade_status, log_agent_action, get_user
from market_data import get_token_prices
from decentralized_storage import upload_trade_trace


async def poll_active_trades() -> List[Dict[str, Any]]:
    """
    Main 60-second polling job.
    Retrieves open trades and evaluates live market prices against TP/SL targets.
    Quiet mode: does NOT print routine heartbeat logs. ONLY logs on failures or TP/SL triggers.
    """
    try:
        open_trades = get_open_trades()
        if not open_trades:
            return []

        # Poller only runs for users who have explicitly activated the Trader Agent
        valid_trades = []
        for t in open_trades:
            user = get_user(t["user_wallet"]) or {}
            if user.get("trader_active", 0) and not user.get("kill_switch", 0):
                valid_trades.append(t)

        if not valid_trades:
            return []

        # Unique symbols needed
        symbols = list(set([t["symbol"].lower() for t in valid_trades]))
        live_prices = await get_token_prices(symbols)

        results = []

        for trade in valid_trades:
            try:
                trade_id = trade["id"]
                wallet = trade["user_wallet"]
                symbol = trade["symbol"]
                entry_price = float(trade["entry_price"])
                tp_price = float(trade["tp_price"])
                sl_price = float(trade["sl_price"])
                action = trade["action"]

                # Check if user activated kill switch
                user = get_user(wallet) or {}
                if user.get("kill_switch", 0):
                    print(f"[POLLER] Kill switch active for {wallet}! Revoking trade #{trade_id}")
                    update_trade_status(trade_id, "REVOKED")
                    results.append({"trade_id": trade_id, "status": "REVOKED_KILL_SWITCH"})
                    continue

                current_price = float(live_prices.get(symbol.lower(), entry_price))

                # Update current price in DB
                trade["current_price"] = current_price

                # Check TP / SL Conditions
                if action == "BUY":
                    if current_price >= tp_price:
                        # ─── TAKE PROFIT HIT ───
                        gain_pct = round(((current_price - entry_price) / entry_price) * 100, 2)
                        print(f"[POLLER: TAKE_PROFIT_HIT] Trade #{trade_id} ({symbol})! Current: ${current_price} >= TP: ${tp_price} (+{gain_pct}%)")
                        update_trade_status(trade_id, "CLOSED_TP", current_price)

                        log_agent_action(
                            user_wallet=wallet,
                            agent_name="trader_poller",
                            trigger_type="take_profit_exit",
                            reasoning_text=f"Live price ${current_price} crossed TP target ${tp_price} (+{gain_pct}% profit)",
                            action_taken=f"CLOSED_TP {symbol} @ ${current_price}",
                            status="completed"
                        )

                        # Save exit trace to decentralized storage (recent 10 preserved)
                        await upload_trade_trace({
                            "event": "TAKE_PROFIT_TRIGGERED",
                            "trade_id": trade_id,
                            "symbol": symbol,
                            "entry_price": entry_price,
                            "exit_price": current_price,
                            "gain_pct": gain_pct,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        })

                        results.append({"trade_id": trade_id, "status": "CLOSED_TP", "gain_pct": gain_pct})

                    elif current_price <= sl_price:
                        # ─── STOP LOSS HIT ───
                        loss_pct = round(((entry_price - current_price) / entry_price) * 100, 2)
                        print(f"[POLLER: STOP_LOSS_HIT] Trade #{trade_id} ({symbol})! Current: ${current_price} <= SL: ${sl_price} (-{loss_pct}%)")
                        update_trade_status(trade_id, "CLOSED_SL", current_price)

                        log_agent_action(
                            user_wallet=wallet,
                            agent_name="trader_poller",
                            trigger_type="stop_loss_exit",
                            reasoning_text=f"Live price ${current_price} hit SL threshold ${sl_price} (-{loss_pct}% loss prevented)",
                            action_taken=f"CLOSED_SL {symbol} @ ${current_price}",
                            status="completed"
                        )

                        # Save exit trace to decentralized storage (recent 10 preserved)
                        await upload_trade_trace({
                            "event": "STOP_LOSS_TRIGGERED",
                            "trade_id": trade_id,
                            "symbol": symbol,
                            "entry_price": entry_price,
                            "exit_price": current_price,
                            "loss_pct": loss_pct,
                            "timestamp": datetime.utcnow().isoformat() + "Z"
                        })

                        results.append({"trade_id": trade_id, "status": "CLOSED_SL", "loss_pct": loss_pct})

                    else:
                        # Still within range - silent
                        results.append({
                            "trade_id": trade_id,
                            "status": "OPEN",
                            "current_price": current_price,
                            "dist_to_tp": round(tp_price - current_price, 4),
                            "dist_to_sl": round(current_price - sl_price, 4)
                        })
            except Exception as trade_err:
                print(f"[POLLER: ERROR] Error evaluating trade #{trade.get('id', '?')} ({trade.get('symbol', '?')}): {trade_err}")

        return results
    except Exception as e:
        print(f"[POLLER: ERROR] Fatal exception in poll_active_trades: {e}")
        return []
