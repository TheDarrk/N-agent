"""
Neptune AI v2.1 — Database Connection Manager
Configured for SQLite WAL mode, foreign keys, 30s busy timeout, and connection pooling.
"""

import os
import sqlite3
from typing import Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "neptune_v2.db")


def normalize_wallet(wallet: Optional[str]) -> str:
    """Standardized wallet normalization across entire backend."""
    if not wallet:
        return ""
    return str(wallet).strip().lower()


def get_connection(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Get a SQLite connection configured for concurrent reads and resilient writes.
    Uses row_factory=sqlite3.Row for dict-like access.
    """
    target_path = db_path or os.getenv("DATABASE_PATH") or os.getenv("NEPTUNE_DB_PATH") or DB_PATH
    conn = sqlite3.connect(target_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache
    return conn
