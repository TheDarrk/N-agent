"""
Neptune AI - Hyperliquid auto-funding via NEAR Intents (1-Click).

Moves USDC from the user's NEAR agent wallet straight into the user's Hyperliquid PERPS balance
(no Arbitrum bridge, no gas on another chain). Per the NEAR Intents docs the credited asset is
`1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054` (USDC, 8 decimals), the recipient is the
user's Hyperliquid 0x address and recipientType is DESTINATION_CHAIN.

Observed limits (live dry quotes): amounts below ~$6 are rejected ("Amount is too low for the destination
chain"); a $6 input credited ~$5.68 (flat 0.2 USDC fee + route cost).
"""

import os
import asyncio
import datetime
from decimal import Decimal
from typing import Any, Dict, Optional

import httpx

HL_USDC_ASSET = "1cs_v1:hypercore:hip1:0x6d1e7cde53ba9467b783cb7c530ce054"
HL_USDC_DECIMALS = 8
MIN_FUND_USD = 6.5        # 1-Click rejects smaller transfers to Hyperliquid
FEE_BUFFER = 1.08         # flat 0.2 USDC + route cost (~5% at the minimum size) + safety
NEAR_GAS_RESERVE = 0.07   # never spend the last NEAR needed for gas/storage

_locks: Dict[str, asyncio.Lock] = {}


def _headers() -> Dict[str, str]:
    key = os.getenv("ONECLICK_API_KEY") or os.getenv("ONECLICK_JWT") or ""
    h = {"Content-Type": "application/json"}
    if key:
        h["Authorization"] = f"Bearer {key}"
        h["X-API-Key"] = key
    return h


def _origin_asset(symbol: str) -> Dict[str, Any]:
    if symbol == "USDT":
        return {"asset": "nep141:usdt.tether-token.near", "decimals": 6}
    return {"asset": "nep141:wrap.near", "decimals": 24}


async def _wait_for_balance(adapter, needed_usd: float, timeout_s: int = 150) -> Dict[str, Any]:
    deadline = asyncio.get_event_loop().time() + timeout_s
    last: Dict[str, Any] = {}
    while asyncio.get_event_loop().time() < deadline:
        last = await asyncio.to_thread(adapter.check_connection)
        if last.get("ok") and float(last.get("withdrawable_usd") or 0.0) >= needed_usd * 0.98:
            return last
        await asyncio.sleep(5)
    return last


async def ensure_hyperliquid_margin(
    user_wallet: str,
    adapter,
    needed_usd: float,
    agent_wallet: str,
    force_usd: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Make sure the user's Hyperliquid account has at least `needed_usd` of free margin (1x leverage), topping it
    up from the NEAR agent wallet through 1-Click when short.  `force_usd` sends that amount regardless.

    Returns {"ok": bool, "funded": bool, ...}. Never raises.
    """
    lock = _locks.setdefault(user_wallet.lower(), asyncio.Lock())
    async with lock:
        try:
            conn = await asyncio.to_thread(adapter.check_connection)
            if not conn.get("ok"):
                return {"ok": False, "funded": False, "error": f"Cannot read Hyperliquid account: {conn.get('error')}"}
            available = float(conn.get("withdrawable_usd") or 0.0)
            needed = round(float(needed_usd) * 1.01 + 0.05, 2)

            if force_usd is None and available >= needed:
                return {"ok": True, "funded": False, "available_usd": available, "needed_usd": needed}

            shortfall = needed - available
            usd_to_send = float(force_usd) if force_usd is not None else max(MIN_FUND_USD, shortfall * FEE_BUFFER)
            if usd_to_send < MIN_FUND_USD:
                return {"ok": False, "funded": False, "error": f"Minimum transfer to Hyperliquid is about ${MIN_FUND_USD:.2f}."}

            # --- pick the origin token from the agent wallet's real balances ---
            from tools import get_wallet_portfolio, create_near_intent_transaction, poll_1click_status
            portfolio = await get_wallet_portfolio(agent_wallet)
            usdt_bal = float(portfolio.get("usdt", 0.0) or 0.0)
            near_bal = max(0.0, float(portfolio.get("near", 0.0) or 0.0) - NEAR_GAS_RESERVE)
            if usdt_bal >= usd_to_send:
                origin_symbol, origin_amount = "USDT", round(usd_to_send, 6)
            else:
                from knowledge_base import get_1click_token_price
                near_px = float(get_1click_token_price("NEAR") or 0.0)
                if near_px <= 0:  # cold token cache: fall back to the market price feed
                    try:
                        from market_data import get_token_prices
                        near_px = float((await get_token_prices(["near"])).get("near") or 0.0)
                    except Exception:
                        near_px = 0.0
                if near_px <= 0:
                    return {"ok": False, "funded": False, "error": "No live NEAR price; cannot size the funding transfer."}
                origin_symbol, origin_amount = "NEAR", round(usd_to_send / near_px, 6)
                if origin_amount > near_bal:
                    return {
                        "ok": False, "funded": False,
                        "error": f"Agent wallet {agent_wallet} has too little to fund ${usd_to_send:.2f} "
                                 f"(USDT {usdt_bal:.4f}, spendable NEAR {near_bal:.4f})."
                    }

            # --- warm the token cache (create_near_intent_transaction resolves decimals from it) ---
            try:
                from tools import get_swap_quote
                get_swap_quote(token_in=origin_symbol, token_out="USDT", amount=0.05, recipient_id=agent_wallet,
                               refund_address=agent_wallet, dry=True)
            except Exception:
                pass

            # --- live quote: origin -> Hyperliquid perps USDC, recipient = the user's Hyperliquid address ---
            from knowledge_base import get_1click_server_now
            origin = _origin_asset(origin_symbol)
            deadline = (get_1click_server_now() + datetime.timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
            payload = {
                "swapType": "EXACT_INPUT",
                "originAsset": origin["asset"],
                "destinationAsset": HL_USDC_ASSET,
                "amount": str(int(Decimal(str(origin_amount)) * Decimal(10 ** origin["decimals"]))),
                "depositType": "INTENTS",
                "refundType": "INTENTS",
                "refundTo": agent_wallet,
                "recipient": adapter.account_address,
                "recipientType": "DESTINATION_CHAIN",
                "slippageTolerance": 100,
                "dry": False,
                "deadline": deadline,
                "quoteWaitingTimeMs": 0,
            }
            async with httpx.AsyncClient(timeout=40.0) as client:
                resp = await client.post("https://1click.chaindefuser.com/v0/quote", headers=_headers(), json=payload)
            if resp.status_code not in (200, 201):
                return {"ok": False, "funded": False, "error": f"1-Click quote failed: HTTP {resp.status_code} {resp.text[:200]}"}
            quote = resp.json().get("quote", {})
            deposit_address = quote.get("depositAddress")
            if not deposit_address:
                return {"ok": False, "funded": False, "error": "1-Click returned no deposit address."}
            expected_out = float(quote.get("amountOutFormatted") or 0.0)

            # --- sign and broadcast the deposit with the user's delegated agent key ---
            tx_payload = create_near_intent_transaction(
                token_in=origin_symbol, token_out="USDC", amount=float(origin_amount), min_amount_out=0.0,
                deposit_address=deposit_address, account_id=agent_wallet,
            )
            from database import get_agent_key
            from key_manager import decrypt_private_key
            from autonomous_agents.near_submitter import submit_near_transaction
            agent_key = get_agent_key(user_wallet, "near")
            if not (agent_key and agent_key.get("encrypted_private_key")):
                return {"ok": False, "funded": False, "error": "No agent key stored; cannot sign the funding transfer."}
            pk = decrypt_private_key(agent_key["encrypted_private_key"], wallet_address=user_wallet)
            tx_hash = await submit_near_transaction(tx_payload=tx_payload, agent_address=agent_wallet, private_key=pk)
            if not tx_hash:
                return {"ok": False, "funded": False, "error": "Funding broadcast returned no transaction hash."}

            # --- wait for the swap to settle, then for the Hyperliquid balance to reflect it ---
            status = {}
            for _ in range(36):  # up to ~3 minutes
                await asyncio.sleep(5)
                status = await poll_1click_status(deposit_address=deposit_address)
                if status.get("is_success") or status.get("is_failed") or status.get("is_refunded"):
                    break
            if status.get("is_failed") or status.get("is_refunded"):
                return {"ok": False, "funded": False, "tx_hash": tx_hash,
                        "error": f"Funding swap ended as {status.get('status')} (funds refunded to the agent wallet)."}
            after = await _wait_for_balance(adapter, needed * 0.98 if force_usd is None else max(0.0, available + expected_out * 0.9))
            credited = float(after.get("withdrawable_usd") or 0.0)
            ok = bool(after.get("ok")) and credited >= (needed * 0.98 if force_usd is None else available + expected_out * 0.9)
            return {
                "ok": ok, "funded": True, "tx_hash": tx_hash, "origin": origin_symbol,
                "usd_sent": round(usd_to_send, 2), "expected_credit_usd": expected_out,
                "hyperliquid_available_usd": credited,
                "error": None if ok else "Transfer settled but the Hyperliquid balance has not reflected it yet; retry shortly.",
            }
        except Exception as exc:  # never break the trading pipeline
            return {"ok": False, "funded": False, "error": f"{type(exc).__name__}: {str(exc)[:200]}"}
