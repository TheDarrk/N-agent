"""
Neptune AI — Dedicated Chat Database
Isolates recent conversational state per user wallet.
Maintains the 5 most recent human <-> AI message turns per wallet.
"""

import os
import sqlite3
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone

CHAT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chat_history.db")


def get_chat_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Get a dedicated SQLite connection for chat history with WAL mode.
    """
    target = db_path or os.getenv("NEPTUNE_CHAT_DB_PATH") or CHAT_DB_PATH
    conn = sqlite3.connect(target, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    return conn


def init_chat_db(db_path: Optional[str] = None):
    """
    Initialize the chat database schema and indices.
    """
    conn = get_chat_connection(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS wallet_chat_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wallet_address TEXT NOT NULL,
            human_message TEXT NOT NULL,
            ai_message TEXT NOT NULL,
            session_id TEXT DEFAULT '',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_chat_wallet_created 
        ON wallet_chat_history(wallet_address, id DESC);
    """)
    conn.commit()
    conn.close()
    print("[CHAT DB] Initialized wallet_chat_history table in dedicated chat_history.db")


def save_chat_turn(
    wallet_address: str,
    human_message: str,
    ai_message: str,
    session_id: str = "",
    db_path: Optional[str] = None
) -> Dict[str, Any]:
    """
    Save a conversational turn (human message + AI response) for a wallet.
    Strictly retains the 5 most recent chat turns per wallet to keep history focused.
    """
    clean_wallet = str(wallet_address or "").strip()
    if not clean_wallet:
        return {}

    conn = get_chat_connection(db_path)
    now_iso = datetime.now(timezone.utc).isoformat()
    cursor = conn.execute("""
        INSERT INTO wallet_chat_history (wallet_address, human_message, ai_message, session_id, created_at)
        VALUES (?, ?, ?, ?, ?)
    """, (clean_wallet, human_message.strip(), ai_message.strip(), str(session_id or "").strip(), now_iso))
    turn_id = cursor.lastrowid

    # Enforce retention cap: keep only the 5 most recent chat turns for this wallet
    conn.execute("""
        DELETE FROM wallet_chat_history
        WHERE wallet_address = ? AND id NOT IN (
            SELECT id FROM wallet_chat_history
            WHERE wallet_address = ?
            ORDER BY id DESC
            LIMIT 5
        )
    """, (clean_wallet, clean_wallet))

    conn.commit()
    conn.close()

    return {
        "id": turn_id,
        "wallet_address": clean_wallet,
        "human_message": human_message,
        "ai_message": ai_message,
        "session_id": session_id,
        "created_at": now_iso
    }


def get_recent_chats(
    wallet_address: str,
    limit: int = 5,
    db_path: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Fetch the most recent chat turns for a specific wallet (default: 5).
    Returns list ordered newest to oldest.
    """
    clean_wallet = str(wallet_address or "").strip()
    if not clean_wallet:
        return []

    conn = get_chat_connection(db_path)
    rows = conn.execute("""
        SELECT id, wallet_address, human_message, ai_message, session_id, created_at
        FROM wallet_chat_history
        WHERE wallet_address = ?
        ORDER BY id DESC
        LIMIT ?
    """, (clean_wallet, max(1, min(limit, 20)))).fetchall()
    conn.close()

    return [dict(r) for r in rows]


def clear_chat_history(
    wallet_address: str,
    db_path: Optional[str] = None
) -> bool:
    """
    Clear all stored chat history for a specific wallet.
    """
    clean_wallet = str(wallet_address or "").strip()
    if not clean_wallet:
        return False

    conn = get_chat_connection(db_path)
    conn.execute("DELETE FROM wallet_chat_history WHERE wallet_address = ?", (clean_wallet,))
    conn.commit()
    conn.close()
    return True
