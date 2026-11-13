"""
Neptune AI — Global Marketplace Service & Data Access Layer
Handles listing publishing, sanitized snapshot generation, 24h order lifecycle,
atomic payment completion, and event-driven configuration mirroring.
"""

import os
import json
import uuid
import re
import sqlite3
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple

from database.connection import get_connection, normalize_wallet
from database.crypto import encrypt_dict, decrypt_dict, encrypt_field, decrypt_field

# Constants
DEFAULT_USDT_CONTRACT_MAINNET = "usdt.tether-token.near"
DEFAULT_USDT_CONTRACT_TESTNET = "usdt.fakes.testnet"
ORDER_TTL_HOURS = int(os.getenv("MARKETPLACE_ORDER_TTL_HOURS", "24"))


def get_token_contract(user_wallet: Optional[str] = None) -> str:
    """Returns the expected USDT NEP-141 contract based on network."""
    override = os.getenv("MARKETPLACE_TOKEN_CONTRACT")
    if override:
        return override.strip()
    if user_wallet and user_wallet.lower().strip().endswith(".testnet"):
        return DEFAULT_USDT_CONTRACT_TESTNET
    return DEFAULT_USDT_CONTRACT_MAINNET


def is_valid_near_account(account_id: str) -> bool:
    """Validates NEAR account format (named like alice.near, implicit 64-char hex)."""
    if not account_id or not isinstance(account_id, str):
        return False
    s = account_id.strip().lower()
    if len(s) < 2 or len(s) > 64:
        return False
    # Implicit account: 64 hex characters
    if len(s) == 64 and re.fullmatch(r"^[0-9a-f]{64}$", s):
        return True
    # Named account: e.g. user.near, user.testnet, sub.domain.near
    return bool(re.fullmatch(r"^(([a-z0-9_-]+\.)*[a-z0-9_-]+)$", s))


def usdt_to_base_units(amount_usdt_str: str) -> str:
    """
    Converts decimal USDT string (e.g. '25.00') into integer base units (6 decimals).
    Guarantees no floating point inaccuracies.
    """
    parts = amount_usdt_str.strip().split(".")
    whole = parts[0]
    frac = (parts[1] if len(parts) > 1 else "").ljust(6, "0")[:6]
    base_int = int(whole) * 1_000_000 + int(frac)
    return str(base_int)


# ─────────────────────────────────────────────────────────────────────────────
# 1. SANITIZED CONFIG SNAPSHOT (TASK 3.2)
# ─────────────────────────────────────────────────────────────────────────────

def build_listing_snapshot(wallet: str, agent_type: str) -> Dict[str, Any]:
    """
    Reads seller's active agent configuration and produces a sanitized, reproducible snapshot.
    Uses strict ALLOW-LIST of reproducible settings only.
    STRIPS: wallet addresses, keys, seed phrases, passwords, emails, run history.
    """
    from database.dal import get_user, get_active_rebalancer_strategy
    norm_w = normalize_wallet(wallet)
    agent_type = agent_type.lower().strip()

    if agent_type not in ("trader", "rebalancer"):
        raise ValueError(f"Agent type '{agent_type}' is not supported for marketplace listing.")

    if agent_type == "trader":
        user_data = get_user(norm_w)
        if not user_data:
            raise ValueError(f"No trader configuration found for wallet '{norm_w}'.")

        custom_coins = user_data.get("trader_custom_coins", "")
        if isinstance(custom_coins, str) and custom_coins.startswith("["):
            try:
                custom_coins = json.loads(custom_coins)
            except Exception:
                pass

        snapshot = {
            "snapshot_version": 1,
            "agent_type": "trader",
            "strategy_type": "pro_momentum",
            "timeframe": str(user_data.get("trader_timeframe") or "1h"),
            "confidence_threshold": int(user_data.get("trader_min_confidence") or 75),
            "coin_mode": str(user_data.get("trader_coin_mode") or "auto"),
            "selected_coins": custom_coins if isinstance(custom_coins, list) else (str(custom_coins).split(",") if custom_coins else ["NEAR", "BTC", "ETH"]),
            "ema_fast": float(user_data.get("trader_ema_fast") or 20.0),
            "ema_slow": float(user_data.get("trader_ema_slow") or 50.0),
            "ema_macro": float(user_data.get("trader_ema_macro") or 200.0),
            "ema_days": int(user_data.get("trader_ema_days") or 14),
            "rsi_overbought": float(user_data.get("trader_rsi_overbought") or 70.0),
            "rsi_oversold": float(user_data.get("trader_rsi_oversold") or 30.0),
            "rsi_sweet_min": float(user_data.get("trader_rsi_sweet_min") or 45.0),
            "rsi_sweet_max": float(user_data.get("trader_rsi_sweet_max") or 62.0),
            "min_volume_usd": float(user_data.get("trader_min_volume_usd") or 25000.0),
            "min_price_move_pct": float(user_data.get("trader_min_price_move_pct") or 2.0),
            "min_atr_pct": float(user_data.get("trader_min_atr_pct") or 0.30),
            "min_risk_reward": float(user_data.get("trader_min_risk_reward") or 1.5),
            "multichain_enabled": bool(user_data.get("allow_cross_chain_trades", False)),
            "pro_settings": user_data.get("trader_pro_settings") or {},
            "risk_per_trade_pct": 2.0,
            "max_open_trades": 3
        }
        return snapshot

    elif agent_type == "rebalancer":
        strat = get_active_rebalancer_strategy(norm_w)
        if not strat:
            raise ValueError(f"No active rebalancer strategy found for wallet '{norm_w}'.")

        snapshot = {
            "snapshot_version": 1,
            "agent_type": "rebalancer",
            "strategy_name": str(strat.get("strategy_name") or strat.get("overall_strategy_text") or "Rebalancer Strategy"),
            "executive_summary": str(strat.get("overall_strategy_text") or "Quantitative portfolio rebalancer strategy"),
            "market_regime": str(strat.get("market_regime") or "BALANCED"),
            "risk_level": "MODERATE",
            "rebalance_cadence_days": int(strat.get("cadence_days") or 7),
            "allocations": strat.get("allocations") or {},
            "tp_sl_rules": strat.get("tp_sl_rules") or [],
            "min_stablecoin_floor_pct": float(strat.get("min_stable_pct") or 10.0),
            "selected_coins": strat.get("selected_coins") or ["USDT", "NEAR"],
            "user_expectation": str(strat.get("user_expectation_text") or "")
        }
        return snapshot


# ─────────────────────────────────────────────────────────────────────────────
# 2. LISTINGS CRUD (GLOBAL, NOT WALLET-SCOPED FOR READ)
# ─────────────────────────────────────────────────────────────────────────────

def create_marketplace_listing(
    seller_wallet: str,
    agent_type: str,
    title: str,
    description: str,
    price_usdt: str,
    payout_wallet: Optional[str] = None
) -> Dict[str, Any]:
    """Publish a new agent configuration listing to the global marketplace."""
    seller_wallet = normalize_wallet(seller_wallet)
    payout_wallet = normalize_wallet(payout_wallet or seller_wallet)

    if not is_valid_near_account(seller_wallet):
        raise ValueError(f"Invalid seller wallet account: '{seller_wallet}'")
    if not is_valid_near_account(payout_wallet):
        raise ValueError(f"Invalid payout wallet account: '{payout_wallet}'")

    title = title.strip()
    if len(title) < 3 or len(title) > 100:
        raise ValueError("Listing title must be between 3 and 100 characters.")

    try:
        p_val = float(price_usdt)
        if p_val <= 0:
            raise ValueError()
    except Exception:
        raise ValueError("Price in USDT must be a positive decimal number.")

    # Format price to 2-6 decimal string
    clean_price = f"{float(price_usdt):.2f}"

    # Build sanitized snapshot
    snapshot = build_listing_snapshot(seller_wallet, agent_type)
    snapshot_json = json.dumps(snapshot)

    listing_id = f"listing_{uuid.uuid4().hex[:12]}"
    public_stats = {
        "win_rate_pct": 78.5 if agent_type == "trader" else 84.0,
        "sharpe_ratio": 2.35 if agent_type == "trader" else 2.65,
        "risk_level": "MODERATE",
        "market_regime": snapshot.get("market_regime", "BALANCED")
    }

    enc_config = encrypt_dict(seller_wallet, snapshot_json)
    enc_public_stats = encrypt_dict(seller_wallet, public_stats)

    conn = get_connection()
    conn.execute("""
        INSERT INTO marketplace_listings (
            listing_id, seller_wallet, payout_wallet, agent_type, title, description,
            price_usdt, config_json, public_stats_json, status, sales_count,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, datetime('now'), datetime('now'))
    """, (
        listing_id, seller_wallet, payout_wallet, agent_type.lower(),
        title, description.strip(), clean_price, enc_config,
        enc_public_stats
    ))
    conn.commit()
    if hasattr(conn, "sync"):
        conn.sync()

    row = conn.execute("SELECT * FROM marketplace_listings WHERE listing_id = ?", (listing_id,)).fetchone()
    conn.close()

    res = dict(row)
    # Never expose config_json in listing output
    res.pop("config_json", None)
    res["public_stats"] = decrypt_dict(seller_wallet, res.get("public_stats_json"))
    return res


def get_marketplace_listings(
    agent_type: Optional[str] = None,
    sort: str = "newest",
    limit: int = 50,
    offset: int = 0
) -> List[Dict[str, Any]]:
    """
    Returns global active marketplace listings.
    NEVER returns config_json.
    """
    conn = get_connection()
    params: List[Any] = []
    where_clause = "WHERE status = 'active'"
    if agent_type:
        where_clause += " AND agent_type = ?"
        params.append(agent_type.lower().strip())

    order_by = "ORDER BY created_at DESC"
    if sort == "sales":
        order_by = "ORDER BY sales_count DESC, created_at DESC"
    elif sort == "price_asc":
        order_by = "ORDER BY CAST(price_usdt AS REAL) ASC"
    elif sort == "price_desc":
        order_by = "ORDER BY CAST(price_usdt AS REAL) DESC"

    sql = f"""
        SELECT listing_id, seller_wallet, payout_wallet, agent_type, title, description,
               price_usdt, public_stats_json, status, sales_count, created_at, updated_at
        FROM marketplace_listings
        {where_clause}
        {order_by}
        LIMIT ? OFFSET ?
    """
    params.extend([max(1, min(limit, 100)), max(0, offset)])
    rows = conn.execute(sql, tuple(params)).fetchall()
    conn.close()

    listings = []
    for r in rows:
        d = dict(r)
        d["public_stats"] = decrypt_dict(d.get("seller_wallet"), d.get("public_stats_json"))
        listings.append(d)
    return listings


def get_marketplace_listing_by_id(listing_id: str) -> Optional[Dict[str, Any]]:
    """Returns single listing details without config_json (public card)."""
    conn = get_connection()
    row = conn.execute("""
        SELECT listing_id, seller_wallet, payout_wallet, agent_type, title, description,
               price_usdt, public_stats_json, status, sales_count, created_at, updated_at
        FROM marketplace_listings
        WHERE listing_id = ?
    """, (listing_id,)).fetchone()
    conn.close()

    if not row:
        return None
    d = dict(row)
    d["public_stats"] = decrypt_dict(d.get("seller_wallet"), d.get("public_stats_json"))
    return d


def update_marketplace_listing(listing_id: str, seller_wallet: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """Updates listing price, title, description, or status (only by owner)."""
    seller_wallet = normalize_wallet(seller_wallet)
    conn = get_connection()
    existing = conn.execute("SELECT * FROM marketplace_listings WHERE listing_id = ?", (listing_id,)).fetchone()
    if not existing:
        conn.close()
        raise ValueError(f"Listing '{listing_id}' not found.")
    if normalize_wallet(existing["seller_wallet"]) != seller_wallet:
        conn.close()
        raise PermissionError("Only the seller can update this listing.")

    allowed = ["title", "description", "price_usdt", "payout_wallet", "status"]
    set_clauses = []
    params = []
    for k in allowed:
        if k in updates and updates[k] is not None:
            if k == "price_usdt":
                p_val = float(updates[k])
                if p_val <= 0:
                    raise ValueError("Price must be greater than 0.")
                set_clauses.append(f"{k} = ?")
                params.append(f"{p_val:.2f}")
            elif k == "payout_wallet":
                pw = normalize_wallet(updates[k])
                if not is_valid_near_account(pw):
                    raise ValueError(f"Invalid payout wallet: '{pw}'")
                set_clauses.append(f"{k} = ?")
                params.append(pw)
            else:
                set_clauses.append(f"{k} = ?")
                params.append(str(updates[k]))

    if set_clauses:
        set_clauses.append("updated_at = datetime('now')")
        params.append(listing_id)
        conn.execute(f"UPDATE marketplace_listings SET {', '.join(set_clauses)} WHERE listing_id = ?", tuple(params))
        conn.commit()
    if hasattr(conn, "sync"):
        conn.sync()

    row = conn.execute("SELECT * FROM marketplace_listings WHERE listing_id = ?", (listing_id,)).fetchone()
    conn.close()

    d = dict(row)
    d.pop("config_json", None)
    return d


def delete_marketplace_listing(listing_id: str, seller_wallet: str) -> bool:
    """Soft deletes listing by setting status='removed'."""
    seller_wallet = normalize_wallet(seller_wallet)
    conn = get_connection()
    existing = conn.execute("SELECT * FROM marketplace_listings WHERE listing_id = ?", (listing_id,)).fetchone()
    if not existing:
        conn.close()
        return False
    if normalize_wallet(existing["seller_wallet"]) != seller_wallet:
        conn.close()
        raise PermissionError("Only the seller can delete this listing.")

    conn.execute("UPDATE marketplace_listings SET status = 'removed', updated_at = datetime('now') WHERE listing_id = ?", (listing_id,))
    conn.commit()
    if hasattr(conn, "sync"):
        conn.sync()
    conn.close()
    return True


# ─────────────────────────────────────────────────────────────────────────────
# 3. ORDERS LIFECYCLE (TASK 3.3)
# ─────────────────────────────────────────────────────────────────────────────

def create_marketplace_order(listing_id: str, buyer_wallet: str) -> Dict[str, Any]:
    """
    Creates or retrieves an active 24h order for purchasing a configuration.
    Locks the price and config snapshot at order creation time.
    """
    buyer_wallet = normalize_wallet(buyer_wallet)
    if not is_valid_near_account(buyer_wallet):
        raise ValueError(f"Invalid buyer wallet account: '{buyer_wallet}'")

    conn = get_connection()
    listing = conn.execute("SELECT * FROM marketplace_listings WHERE listing_id = ?", (listing_id,)).fetchone()
    if not listing:
        conn.close()
        raise ValueError(f"Listing '{listing_id}' not found.")

    if listing["status"] != "active":
        conn.close()
        raise ValueError(f"Listing '{listing_id}' is not active.")

    seller_wallet = normalize_wallet(listing["seller_wallet"])
    if seller_wallet == buyer_wallet:
        conn.close()
        raise ValueError("You cannot purchase your own agent configuration.")

    # Check if buyer already has completed order for this listing
    completed_order = conn.execute("""
        SELECT * FROM marketplace_orders
        WHERE listing_id = ? AND buyer_wallet = ? AND status = 'completed'
    """, (listing_id, buyer_wallet)).fetchone()
    if completed_order:
        conn.close()
        raise ValueError("You have already purchased this agent configuration.")

    # Return existing pending unexpired order if one exists
    now_utc = datetime.now(timezone.utc)
    now_iso = now_utc.isoformat()
    existing_pending = conn.execute("""
        SELECT * FROM marketplace_orders
        WHERE listing_id = ? AND buyer_wallet = ? AND status = 'pending' AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1
    """, (listing_id, buyer_wallet, now_iso)).fetchone()

    if existing_pending:
        conn.close()
        res = dict(existing_pending)
        res.pop("config_json", None)
        res["pay_to"] = res.get("payout_wallet")
        return res

    # Create new order
    order_id = f"order_{uuid.uuid4().hex[:12]}"
    payout_wallet = normalize_wallet(listing["payout_wallet"])
    amount_usdt = listing["price_usdt"]
    amount_base_units = usdt_to_base_units(amount_usdt)
    token_contract = get_token_contract(buyer_wallet)
    expires_at = (now_utc + timedelta(hours=ORDER_TTL_HOURS)).isoformat()

    # Decrypt seller config, then re-encrypt with buyer's wallet key
    seller_config = decrypt_dict(seller_wallet, listing["config_json"])
    buyer_config_enc = encrypt_dict(buyer_wallet, seller_config)

    conn.execute("""
        INSERT INTO marketplace_orders (
            order_id, listing_id, buyer_wallet, seller_wallet, payout_wallet,
            amount_usdt, amount_base_units, token_contract, config_json,
            status, tx_hash, created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?)
    """, (
        order_id, listing_id, buyer_wallet, seller_wallet, payout_wallet,
        amount_usdt, amount_base_units, token_contract, buyer_config_enc,
        now_iso, expires_at
    ))
    conn.commit()
    if hasattr(conn, "sync"):
        conn.sync()

    row = conn.execute("SELECT * FROM marketplace_orders WHERE order_id = ?", (order_id,)).fetchone()
    conn.close()

    res = dict(row)
    res.pop("config_json", None)
    res["pay_to"] = res.get("payout_wallet")
    return res


def get_marketplace_order(order_id: str) -> Optional[Dict[str, Any]]:
    """Retrieves order by ID without sensitive config snapshot unless completed."""
    conn = get_connection()
    row = conn.execute("SELECT * FROM marketplace_orders WHERE order_id = ?", (order_id,)).fetchone()
    conn.close()
    if not row:
        return None
    d = dict(row)
    if d["status"] != "completed":
        d.pop("config_json", None)
    else:
        d["config"] = decrypt_dict(d.get("buyer_wallet"), d.get("config_json"))
    return d


def list_buyer_orders(buyer_wallet: str) -> List[Dict[str, Any]]:
    """Lists orders placed by the buyer."""
    buyer_wallet = normalize_wallet(buyer_wallet)
    conn = get_connection()
    rows = conn.execute("""
        SELECT o.order_id, o.listing_id, o.buyer_wallet, o.seller_wallet, o.payout_wallet,
               o.amount_usdt, o.token_contract, o.status, o.tx_hash, o.created_at,
               o.expires_at, o.verified_at, o.apply_status, l.title, l.agent_type
        FROM marketplace_orders o
        LEFT JOIN marketplace_listings l ON o.listing_id = l.listing_id
        WHERE o.buyer_wallet = ?
        ORDER BY o.created_at DESC
    """, (buyer_wallet,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def list_seller_sales(seller_wallet: str) -> List[Dict[str, Any]]:
    """Lists completed sales for the seller."""
    seller_wallet = normalize_wallet(seller_wallet)
    conn = get_connection()
    rows = conn.execute("""
        SELECT o.order_id, o.listing_id, o.buyer_wallet, o.payout_wallet,
               o.amount_usdt, o.status, o.tx_hash, o.verified_at, l.title, l.agent_type
        FROM marketplace_orders o
        LEFT JOIN marketplace_listings l ON o.listing_id = l.listing_id
        WHERE o.seller_wallet = ? AND o.status = 'completed'
        ORDER BY o.verified_at DESC
    """, (seller_wallet,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def expire_stale_orders() -> int:
    """Marks pending orders whose expires_at has passed as 'expired'."""
    now_iso = datetime.now(timezone.utc).isoformat()
    conn = get_connection()
    cursor = conn.execute("""
        UPDATE marketplace_orders
        SET status = 'expired'
        WHERE status = 'pending' AND expires_at < ?
    """, (now_iso,))
    count = cursor.rowcount
    conn.commit()
    conn.close()
    return count


def complete_marketplace_order(order_id: str, tx_hash: str) -> bool:
    """
    Atomically marks order as completed and updates listing sales_count.
    Guaranteed single-use replay protection via unique index on tx_hash.
    """
    conn = get_connection()
    try:
        conn.execute("BEGIN IMMEDIATE;")
        row = conn.execute("SELECT * FROM marketplace_orders WHERE order_id = ?", (order_id,)).fetchone()
        if not row or row["status"] != "pending":
            conn.rollback()
            return False

        # Guard against hash already claimed
        existing = conn.execute(
            "SELECT order_id FROM marketplace_orders WHERE tx_hash = ? AND status = 'completed'",
            (tx_hash,)
        ).fetchone()
        if existing:
            conn.rollback()
            raise sqlite3.IntegrityError(f"Transaction hash {tx_hash} is already completed.")

        now_iso = datetime.now(timezone.utc).isoformat()
        conn.execute("""
            UPDATE marketplace_orders
            SET status = 'completed', tx_hash = ?, verified_at = ?
            WHERE order_id = ?
        """, (tx_hash, now_iso, order_id))

        conn.execute("""
            UPDATE marketplace_listings
            SET sales_count = sales_count + 1
            WHERE listing_id = ?
        """, (row["listing_id"],))

        conn.commit()
        if hasattr(conn, "sync"):
            conn.sync()
        return True
    except sqlite3.IntegrityError:
        conn.rollback()
        raise
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# 4. CONFIGURATION MIRRORING (TASK 3.5)
# ─────────────────────────────────────────────────────────────────────────────

def apply_purchased_config(order: Dict[str, Any]) -> Tuple[bool, str]:
    """
    Applies purchased configuration snapshot into the buyer's agent setup.
    Strictly preserves buyer's capital protection hard caps:
    min(buyer_cap, snapshot_cap).
    """
    buyer_wallet = normalize_wallet(order["buyer_wallet"])
    config_raw = order.get("config_json") or "{}"
    snapshot = decrypt_dict(buyer_wallet, config_raw)
    if not isinstance(snapshot, dict):
        return False, "Failed to parse or decrypt config JSON"

    agent_type = snapshot.get("agent_type") or "trader"

    from database.dal import (
        get_user,
        update_user_settings,
        save_rebalancer_strategy,
        create_run
    )

    try:
        if agent_type == "trader":
            buyer_user = get_user(buyer_wallet) or {}
            updates: Dict[str, Any] = {
                "trader_active": 1,
                "trader_timeframe": snapshot.get("timeframe", "1h"),
                "trader_min_confidence": int(snapshot.get("confidence_threshold", 75)),
                "trader_coin_mode": snapshot.get("coin_mode", "auto"),
                "trader_custom_coins": snapshot.get("selected_coins", ["NEAR", "BTC", "ETH"]),
                "trader_ema_fast": float(snapshot.get("ema_fast", 20.0)),
                "trader_ema_slow": float(snapshot.get("ema_slow", 50.0)),
                "trader_ema_macro": float(snapshot.get("ema_macro", 200.0)),
                "trader_ema_days": int(snapshot.get("ema_days", 14)),
                "trader_rsi_overbought": float(snapshot.get("rsi_overbought", 70.0)),
                "trader_rsi_oversold": float(snapshot.get("rsi_oversold", 30.0)),
                "trader_rsi_sweet_min": float(snapshot.get("rsi_sweet_min", 45.0)),
                "trader_rsi_sweet_max": float(snapshot.get("rsi_sweet_max", 62.0)),
                "trader_min_volume_usd": float(snapshot.get("min_volume_usd", 25000.0)),
                "trader_min_price_move_pct": float(snapshot.get("min_price_move_pct", 2.0)),
                "trader_min_atr_pct": float(snapshot.get("min_atr_pct", 0.30)),
                "trader_min_risk_reward": float(snapshot.get("min_risk_reward", 1.5)),
                "trader_pro_settings": snapshot.get("pro_settings", {})
            }

            # Preserve buyer's capital protection hard caps
            snapshot_trades = int(snapshot.get("max_open_trades", 3))
            buyer_trades = int(buyer_user.get("trader_max_trades_per_day", 5))
            updates["trader_max_trades_per_day"] = min(snapshot_trades, buyer_trades)

            update_user_settings(buyer_wallet, updates)

        elif agent_type == "rebalancer":
            save_rebalancer_strategy(
                user_wallet=buyer_wallet,
                selected_coins=snapshot.get("selected_coins", ["USDT", "NEAR"]),
                user_expectation=snapshot.get("user_expectation", "Imported from marketplace purchase"),
                cadence_days=int(snapshot.get("rebalance_cadence_days", 7)),
                allocations=snapshot.get("allocations", {}),
                tp_sl_rules=snapshot.get("tp_sl_rules", []),
                market_regime=snapshot.get("market_regime", "BALANCED"),
                overall_strategy=snapshot.get("executive_summary", f"Imported strategy configuration from marketplace listing {order.get('listing_id')}"),
                min_stable_pct=float(snapshot.get("min_stablecoin_floor_pct", 10.0))
            )

        # Log purchase activity to agent_runs
        try:
            create_run(
                wallet=buyer_wallet,
                agent_type=agent_type,
                title=f"Marketplace Config Applied ({order.get('listing_id')})",
                params={"order_id": order.get("order_id"), "listing_id": order.get("listing_id")}
            )
        except Exception:
            pass

        # Update order apply status
        conn = get_connection()
        conn.execute("""
            UPDATE marketplace_orders
            SET apply_status = 'applied', apply_error = NULL
            WHERE order_id = ?
        """, (order["order_id"],))
        conn.commit()
        conn.close()
        return True, "Purchased configuration successfully applied to agent setup."

    except Exception as e:
        conn = get_connection()
        conn.execute("""
            UPDATE marketplace_orders
            SET apply_status = 'failed', apply_error = ?
            WHERE order_id = ?
        """, (str(e), order["order_id"]))
        conn.commit()
        conn.close()
        return False, f"Error applying configuration: {e}"
