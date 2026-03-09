"""
Neptune AI v2   SQLite Persistence Layer
Separate module: does NOT touch existing chat/swap logic.
Provides structured storage for autonomy features.
"""

import sqlite3
import json
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

# Database file lives alongside the backend
DB_PATH = os.path.join(os.path.dirname(__file__), "neptune.db")


def get_connection() -> sqlite3.Connection:
    """Get a SQLite connection with row_factory for dict-like access."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")  # Better concurrent reads
    return conn


def init_db():
    """Create all tables if they don't exist. Safe to call multiple times."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        -- Users & their autonomy preferences
        CREATE TABLE IF NOT EXISTS users (
            wallet_address TEXT PRIMARY KEY,
            autonomy_level INTEGER DEFAULT 0,
            max_tx_amount REAL DEFAULT 500.0,
            daily_limit REAL DEFAULT 2000.0,
            risk_profile TEXT DEFAULT 'moderate',
            allowed_tokens TEXT DEFAULT '',
            kill_switch INTEGER DEFAULT 0,
            agent_wallet TEXT DEFAULT '',
            notification_email TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- User-defined strategy rules
        CREATE TABLE IF NOT EXISTS strategies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_wallet TEXT NOT NULL,
            strategy_type TEXT NOT NULL,
            trigger_condition TEXT NOT NULL,
            schedule TEXT DEFAULT 'every_10m',
            active INTEGER DEFAULT 1,
            last_triggered_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_wallet) REFERENCES users(wallet_address)
        );

        -- Every autonomous decision logged
        CREATE TABLE IF NOT EXISTS agent_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_wallet TEXT NOT NULL,
            agent_name TEXT NOT NULL,
            trigger_type TEXT NOT NULL,
            reasoning_text TEXT,
            action_taken TEXT,
            tx_hash TEXT,
            cid_reference TEXT,
            status TEXT DEFAULT 'pending',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Portfolio snapshots for drift detection
        CREATE TABLE IF NOT EXISTS portfolio_snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_wallet TEXT NOT NULL,
            snapshot_data TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        -- Agent delegation keys (encrypted keypairs for autonomous signing)
        CREATE TABLE IF NOT EXISTS agent_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_wallet TEXT NOT NULL,
            chain_type TEXT NOT NULL,
            public_key TEXT NOT NULL,
            encrypted_private_key TEXT NOT NULL,
            agent_account_id TEXT DEFAULT '',  -- The account the agent is authorized to sign for
            scope TEXT DEFAULT 'function_call',
            status TEXT DEFAULT 'pending',
            tx_hash TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """);

    conn.commit()

    # Migration: add new columns if missing (for existing databases)
    migrations = [
        "ALTER TABLE users ADD COLUMN agent_wallet TEXT DEFAULT ''",
        "ALTER TABLE users ADD COLUMN notification_email TEXT DEFAULT ''",
        "ALTER TABLE agent_keys ADD COLUMN agent_account_id TEXT DEFAULT ''",
    ]
    for migration in migrations:
        try:
            cursor.execute(migration)
            conn.commit()
        except sqlite3.OperationalError:
            pass  # Column already exists

    conn.close()
    print("[DB] Neptune database initialized")


def clear_user_agent_wallet(wallet_address: str):
    """Clear the agent_wallet field for a user."""
    conn = get_connection()
    conn.execute(
        "UPDATE users SET agent_wallet = '', updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?",
        (wallet_address,)
    )
    conn.commit()
    conn.close()
    print(f"[DB] Agent wallet cleared for {wallet_address}")

def get_user(wallet_address: str) -> Optional[Dict[str, Any]]:
    """Get user by wallet address."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM users WHERE wallet_address = ?", (wallet_address,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_user(wallet_address: str, settings: Dict[str, Any] = None) -> Dict[str, Any]:
    """Create or update a user. Returns the user dict."""
    conn = get_connection()
    existing = conn.execute(
        "SELECT * FROM users WHERE wallet_address = ?", (wallet_address,)
    ).fetchone()

    if existing:
        if settings:
            allowed_keys = [
                'autonomy_level', 'max_tx_amount', 'daily_limit',
                'risk_profile', 'allowed_tokens', 'kill_switch',
                'agent_wallet', 'notification_email'
            ]
            updates = {k: v for k, v in settings.items() if k in allowed_keys}
            if updates:
                set_clause = ", ".join(f"{k} = ?" for k in updates.keys())
                values = list(updates.values()) + [wallet_address]
                conn.execute(
                    f"UPDATE users SET {set_clause}, updated_at = CURRENT_TIMESTAMP "
                    f"WHERE wallet_address = ?",
                    values
                )
                conn.commit()
    else:
        conn.execute(
            "INSERT INTO users (wallet_address) VALUES (?)", (wallet_address,)
        )
        conn.commit()
        if settings:
            return upsert_user(wallet_address, settings)  # Apply settings after insert

    row = conn.execute(
        "SELECT * FROM users WHERE wallet_address = ?", (wallet_address,)
    ).fetchone()
    conn.close()
    return dict(row) if row else {}


# -- Strategy CRUD ------------------------------------------------

def add_strategy(
    user_wallet: str,
    strategy_type: str,
    trigger_condition: Dict[str, Any],
    schedule: str = "every_10m"
) -> int:
    """Add a new strategy rule. Returns the strategy ID."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO strategies (user_wallet, strategy_type, trigger_condition, schedule) "
        "VALUES (?, ?, ?, ?)",
        (user_wallet, strategy_type, json.dumps(trigger_condition), schedule)
    )
    conn.commit()
    strategy_id = cursor.lastrowid
    conn.close()
    return strategy_id


def get_active_strategies(user_wallet: str = None) -> List[Dict[str, Any]]:
    """Get active strategies, optionally filtered by user."""
    conn = get_connection()
    if user_wallet:
        rows = conn.execute(
            "SELECT * FROM strategies WHERE user_wallet = ? AND active = 1",
            (user_wallet,)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM strategies WHERE active = 1"
        ).fetchall()
    conn.close()
    results = []
    for row in rows:
        d = dict(row)
        d['trigger_condition'] = json.loads(d['trigger_condition'])
        results.append(d)
    return results


def deactivate_strategy(strategy_id: int) -> bool:
    """Deactivate a strategy. Returns True if found."""
    conn = get_connection()
    cursor = conn.execute(
        "UPDATE strategies SET active = 0 WHERE id = ?", (strategy_id,)
    )
    conn.commit()
    found = cursor.rowcount > 0
    conn.close()
    return found


def update_strategy_triggered(strategy_id: int):
    """Mark a strategy as last triggered now."""
    conn = get_connection()
    conn.execute(
        "UPDATE strategies SET last_triggered_at = CURRENT_TIMESTAMP WHERE id = ?",
        (strategy_id,)
    )
    conn.commit()
    conn.close()


# -- Agent Logs ----------------------------------------------------

def log_agent_action(
    user_wallet: str,
    agent_name: str,
    trigger_type: str,
    reasoning_text: str,
    action_taken: str,
    tx_hash: str = None,
    cid_reference: str = None,
    status: str = "completed"
) -> int:
    """Log an autonomous agent action. Returns the log ID."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO agent_logs "
        "(user_wallet, agent_name, trigger_type, reasoning_text, action_taken, "
        "tx_hash, cid_reference, status) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (user_wallet, agent_name, trigger_type, reasoning_text,
         action_taken, tx_hash, cid_reference, status)
    )
    conn.commit()
    log_id = cursor.lastrowid
    conn.close()
    return log_id


def get_agent_logs(
    user_wallet: str,
    limit: int = 50,
    agent_name: str = None
) -> List[Dict[str, Any]]:
    """Get agent decision logs for a user."""
    conn = get_connection()
    query = "SELECT * FROM agent_logs WHERE user_wallet = ?"
    params = [user_wallet]
    if agent_name:
        query += " AND agent_name = ?"
        params.append(agent_name)
    query += " ORDER BY created_at DESC LIMIT ?"
    params.append(limit)

    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_daily_spend(user_wallet: str) -> float:
    """Get total spend for today (for daily limit enforcement)."""
    conn = get_connection()
    today = datetime.utcnow().strftime("%Y-%m-%d")
    row = conn.execute(
        "SELECT COUNT(*) as tx_count FROM agent_logs "
        "WHERE user_wallet = ? AND status = 'completed' "
        "AND DATE(created_at) = ?",
        (user_wallet, today)
    ).fetchone()
    conn.close()
    # In production, we'd track actual USD amounts. For now, count transactions.
    return float(row['tx_count']) if row else 0.0


# -- Portfolio Snapshots ------------------------------------------

def save_portfolio_snapshot(user_wallet: str, snapshot: Dict[str, Any]):
    """Save a portfolio snapshot for drift comparison."""
    conn = get_connection()
    conn.execute(
        "INSERT INTO portfolio_snapshots (user_wallet, snapshot_data) VALUES (?, ?)",
        (user_wallet, json.dumps(snapshot))
    )
    conn.commit()
    conn.close()


def get_latest_snapshot(user_wallet: str) -> Optional[Dict[str, Any]]:
    """Get the most recent portfolio snapshot."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM portfolio_snapshots WHERE user_wallet = ? "
        "ORDER BY created_at DESC LIMIT 1",
        (user_wallet,)
    ).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d['snapshot_data'] = json.loads(d['snapshot_data'])
        return d
    return None


# -- Kill Switch --------------------------------------------------

def activate_kill_switch(user_wallet: str):
    """Emergency stop   deactivate all strategies and set kill_switch flag."""
    conn = get_connection()
    conn.execute(
        "UPDATE users SET kill_switch = 1, autonomy_level = 0, "
        "updated_at = CURRENT_TIMESTAMP WHERE wallet_address = ?",
        (user_wallet,)
    )
    conn.execute(
        "UPDATE strategies SET active = 0 WHERE user_wallet = ?",
        (user_wallet,)
    )
    conn.commit()
    conn.close()
    print(f"[DB] Kill switch activated for {user_wallet}")


def deactivate_kill_switch(user_wallet: str):
    """Reset kill switch (does NOT re-enable strategies   user must do that)."""
    conn = get_connection()
    conn.execute(
        "UPDATE users SET kill_switch = 0, updated_at = CURRENT_TIMESTAMP "
        "WHERE wallet_address = ?",
        (user_wallet,)
    )
    conn.commit()
    conn.close()
    print(f"[DB] Kill switch deactivated for {user_wallet}")


# -- Agent Key CRUD -----------------------------------------------

def save_agent_key(user_wallet: str, chain_type: str, public_key: str,
                   encrypted_private_key: str, scope: str = "function_call",
                   agent_account_id: str = "") -> int:
    """Store a new agent delegation key. Returns the key ID."""
    conn = get_connection()
    cursor = conn.execute(
        "INSERT INTO agent_keys (user_wallet, chain_type, public_key, "
        "encrypted_private_key, agent_account_id, scope, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
        (user_wallet, chain_type, public_key, encrypted_private_key, agent_account_id, scope)
    )
    key_id = cursor.lastrowid
    conn.commit()
    conn.close()
    print(f"[DB] Saved agent key #{key_id} for {user_wallet} ({chain_type}) (Account: {agent_account_id})")
    return key_id


def get_agent_key(user_wallet: str, chain_type: str) -> dict | None:
    """Get the active agent key for a user + chain."""
    conn = get_connection()
    row = conn.execute(
        "SELECT * FROM agent_keys WHERE user_wallet = ? AND chain_type = ? "
        "AND status = 'active' ORDER BY created_at DESC LIMIT 1",
        (user_wallet, chain_type)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def get_all_agent_keys(user_wallet: str) -> list:
    """Get all agent keys for a user (all chains)."""
    conn = get_connection()
    rows = conn.execute(
        "SELECT id, user_wallet, chain_type, public_key, agent_account_id, scope, status, tx_hash, "
        "created_at FROM agent_keys WHERE user_wallet = ? ORDER BY created_at DESC",
        (user_wallet,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def update_agent_key_status(key_id: int, status: str, tx_hash: str = "", agent_account_id: str = None):
    """Update agent key status (pending -> active, or active -> revoked)."""
    conn = get_connection()
    if agent_account_id is not None:
        conn.execute(
            "UPDATE agent_keys SET status = ?, tx_hash = ?, agent_account_id = ? WHERE id = ?",
            (status, tx_hash, agent_account_id, key_id)
        )
    else:
        conn.execute(
            "UPDATE agent_keys SET status = ?, tx_hash = ? WHERE id = ?",
            (status, tx_hash, key_id)
        )
    conn.commit()
    conn.close()
    print(f"[DB] Agent key #{key_id} -> {status} (Account: {agent_account_id})")


def delete_agent_key(key_id: int):
    """Delete an agent key."""
    conn = get_connection()
    conn.execute("DELETE FROM agent_keys WHERE id = ?", (key_id,))
    conn.commit()
    conn.close()
    print(f"[DB] Agent key #{key_id} deleted")


def delete_all_user_agent_keys(user_wallet: str):
    """Delete all agent keys for a user."""
    conn = get_connection()
    conn.execute("DELETE FROM agent_keys WHERE user_wallet = ?", (user_wallet,))
    conn.commit()
    conn.close()
    print(f"[DB] All agent keys deleted for {user_wallet}")
