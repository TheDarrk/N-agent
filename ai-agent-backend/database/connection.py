"""
Neptune AI v2.1 — Database Connection Manager
Dual-engine architecture:
- Production / Render Free Tier: Turso libSQL embedded replica (/tmp cache with remote cloud sync)
- Local / Dev: SQLite with WAL mode, foreign keys, 30s busy timeout, and connection pooling.
"""

import os
import time
import sqlite3
import tempfile
import threading
import logging
from typing import Optional, Dict, Any, List, Union
from dotenv import load_dotenv

# Ensure environment variables from .env are loaded
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env")
if os.path.exists(env_path):
    load_dotenv(env_path, override=False)
else:
    load_dotenv(override=False)

logger = logging.getLogger("neptune.database.connection")

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "neptune_v2.db")

# Turso Cloud credentials
TURSO_DATABASE_URL = os.getenv("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN = os.getenv("TURSO_AUTH_TOKEN", "").strip()
TURSO_LOCAL_PATH = os.getenv("TURSO_LOCAL_PATH", "").strip()

try:
    import libsql
except ImportError:
    libsql = None

# Global synchronization tracking for Turso libSQL.
# EVERY write, commit and sync against the local replica file goes through this one process-wide lock,
# so two threads never write/checkpoint the replica WAL at the same moment ("database is locked").
_sync_lock = threading.RLock()
_write_lock = _sync_lock
_LOCK_RETRIES = 6
_last_sync_time: float = 0.0
_last_sync_ok: bool = True


def is_turso_enabled() -> bool:
    """Returns True if Turso credentials are provided and libsql is available."""
    url = os.getenv("TURSO_DATABASE_URL", TURSO_DATABASE_URL).strip()
    token = os.getenv("TURSO_AUTH_TOKEN", TURSO_AUTH_TOKEN).strip()
    return bool(libsql is not None and url and token)


def get_replica_local_path() -> str:
    """
    Returns the local path for the embedded libSQL replica cache.
    On Render/Linux this is /tmp/neptune_replica.db.
    """
    custom = os.getenv("TURSO_LOCAL_PATH", TURSO_LOCAL_PATH).strip()
    if custom:
        return custom
    if os.name != "nt":
        return "/tmp/neptune_replica.db"
    return os.path.join(tempfile.gettempdir(), "neptune_replica.db")


def get_last_sync_status() -> Dict[str, Any]:
    """Returns the most recent sync health and timestamp."""
    return {
        "last_sync_ok": _last_sync_ok,
        "last_sync_time": _last_sync_time
    }


def _debounced_sync(conn_raw, force: bool = False, min_interval: float = 1.0):
    """
    Debounced Turso sync throttled to at most once per `min_interval` seconds.
    Pushes committed local changes to Turso cloud and pulls remote updates.
    """
    global _last_sync_time, _last_sync_ok
    now = time.monotonic()
    # Cheap pre-check outside the lock so concurrent requests never queue behind a network sync.
    if not force and _last_sync_time and (now - _last_sync_time < min_interval):
        return
    with _sync_lock:
        if not force and _last_sync_time and (time.monotonic() - _last_sync_time < min_interval):
            return
        try:
            conn_raw.sync()
            _last_sync_time = time.monotonic()
            _last_sync_ok = True
        except Exception as e:
            _last_sync_ok = False
            logger.warning(f"[Turso sync warning] {e}")


def _is_locked_error(e: Exception) -> bool:
    msg = str(e).lower()
    return "locked" in msg or "busy" in msg


def _run_with_retry(fn, write: bool = True):
    """
    Runs fn(); writes hold the process-wide write lock. If the replica is still momentarily locked
    (e.g. a reader holds it while the WAL checkpoints), back off OUTSIDE the lock and retry
    (0.1s, 0.2s, 0.4s ... up to ~3s total) instead of failing the request.
    """
    for attempt in range(_LOCK_RETRIES + 1):
        try:
            if write:
                with _write_lock:
                    return fn()
            return fn()
        except Exception as e:
            if not _is_locked_error(e) or attempt == _LOCK_RETRIES:
                raise
            if attempt == 0:
                logger.warning(f"[Turso] replica busy, retrying write: {e}")
            time.sleep(min(1.5, 0.1 * (2 ** attempt)))


def _is_read_statement(sql: str) -> bool:
    head = (sql or "").lstrip().split(None, 1)[0].lower() if (sql or "").strip() else ""
    return head in ("select", "pragma", "explain") or (head == "with" and "insert" not in sql.lower() and "update" not in sql.lower() and "delete" not in sql.lower())


def _translate_error(e: Exception):
    """Translates libSQL ValueError constraint exceptions to sqlite3.IntegrityError."""
    msg = str(e)
    lower_msg = msg.lower()
    if "constraint failed" in lower_msg or "unique" in lower_msg or "primary key" in lower_msg or "foreign key" in lower_msg:
        raise sqlite3.IntegrityError(msg) from e
    raise e


class LibsqlRow:
    """
    Drop-in replacement for sqlite3.Row wrapping libSQL tuples.
    Supports index access, column-name access (case-insensitive), dict(row), .keys(), .get().
    """
    __slots__ = ("_cols", "_data", "_map")

    def __init__(self, cols: List[str], data: Union[tuple, list]):
        self._cols = list(cols)
        self._data = tuple(data)
        self._map = {col: i for i, col in enumerate(self._cols)}
        for i, col in enumerate(self._cols):
            self._map.setdefault(col.lower(), i)

    def __getitem__(self, item):
        if isinstance(item, int):
            return self._data[item]
        if isinstance(item, str):
            idx = self._map.get(item)
            if idx is None:
                idx = self._map.get(item.lower())
            if idx is not None:
                return self._data[idx]
            raise KeyError(item)
        raise TypeError(f"Invalid row index type: {type(item)}")

    def get(self, key: str, default: Any = None) -> Any:
        try:
            return self[key]
        except (KeyError, IndexError):
            return default

    def keys(self) -> List[str]:
        return list(self._cols)

    def values(self) -> List[Any]:
        return list(self._data)

    def items(self) -> List[tuple]:
        return [(c, self._data[i]) for i, c in enumerate(self._cols)]

    def __iter__(self):
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def __repr__(self) -> str:
        return f"<LibsqlRow {dict(zip(self._cols, self._data))}>"

    def __contains__(self, item: Any) -> bool:
        if isinstance(item, str):
            return item in self._map or item.lower() in self._map
        return item in self._data


class LibsqlCursorWrapper:
    """Wraps libSQL Cursor providing sqlite3.Row compatibility and error translation."""

    def __init__(self, raw_cursor):
        self._raw = raw_cursor

    @property
    def description(self):
        return self._raw.description

    @property
    def rowcount(self) -> int:
        return self._raw.rowcount

    @property
    def lastrowid(self):
        return self._raw.lastrowid

    def execute(self, sql: str, params: Optional[Union[tuple, list, dict]] = None):
        def _do():
            if params is not None:
                self._raw.execute(sql, params)
            else:
                self._raw.execute(sql)
        try:
            _run_with_retry(_do, write=not _is_read_statement(sql))
            return self
        except Exception as e:
            _translate_error(e)

    def executemany(self, sql: str, seq_of_parameters):
        try:
            _run_with_retry(lambda: self._raw.executemany(sql, seq_of_parameters), write=True)
            return self
        except Exception as e:
            _translate_error(e)

    def executescript(self, sql_script: str):
        try:
            _run_with_retry(lambda: self._raw.executescript(sql_script), write=True)
            return self
        except Exception as e:
            _translate_error(e)

    def fetchone(self) -> Optional[LibsqlRow]:
        if not self._raw.description:
            return None
        r = self._raw.fetchone()
        if r is None:
            return None
        desc = [d[0] for d in self._raw.description]
        return LibsqlRow(desc, r)

    def fetchall(self) -> List[LibsqlRow]:
        if not self._raw.description:
            return []
        res = self._raw.fetchall()
        if not res:
            return []
        desc = [d[0] for d in self._raw.description]
        return [LibsqlRow(desc, r) for r in res]

    def fetchmany(self, size: int = 1) -> List[LibsqlRow]:
        if not self._raw.description:
            return []
        res = self._raw.fetchmany(size)
        if not res:
            return []
        desc = [d[0] for d in self._raw.description]
        return [LibsqlRow(desc, r) for r in res]

    def close(self):
        try:
            self._raw.close()
        except Exception:
            pass

    def __iter__(self):
        while True:
            row = self.fetchone()
            if row is None:
                break
            yield row

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()


class LibsqlConnectionWrapper:
    """
    Wraps libSQL Connection for full API compatibility with sqlite3.Connection.
    Provides row_factory support, debounced sync, and transaction handling.
    """

    def __init__(self, raw_conn, is_replica: bool = False):
        self._raw_conn = raw_conn
        self._is_replica = is_replica
        self.row_factory = None  # Compatible attribute assignment

    @property
    def raw_connection(self):
        return self._raw_conn

    def cursor(self) -> LibsqlCursorWrapper:
        return LibsqlCursorWrapper(self._raw_conn.cursor())

    def execute(self, sql: str, params: Optional[Union[tuple, list, dict]] = None) -> LibsqlCursorWrapper:
        cur = self.cursor()
        cur.execute(sql, params)
        return cur

    def executemany(self, sql: str, seq_of_parameters) -> LibsqlCursorWrapper:
        cur = self.cursor()
        cur.executemany(sql, seq_of_parameters)
        return cur

    def executescript(self, sql_script: str) -> LibsqlCursorWrapper:
        cur = self.cursor()
        cur.executescript(sql_script)
        return cur

    def commit(self):
        """Commits the transaction and triggers a debounced sync if running as replica."""
        try:
            _run_with_retry(self._raw_conn.commit, write=True)
        except Exception as e:
            _translate_error(e)

        if self._is_replica:
            _debounced_sync(self._raw_conn, force=False)

    def rollback(self):
        try:
            self._raw_conn.rollback()
        except Exception:
            pass

    def sync(self, force: bool = True):
        """Forces an immediate synchronization with Turso Cloud."""
        if self._is_replica:
            _debounced_sync(self._raw_conn, force=force)

    def close(self):
        try:
            self._raw_conn.close()
        except Exception:
            pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
            return False
        else:
            self.commit()
            return False


def connect_libsql_local(db_path: str) -> LibsqlConnectionWrapper:
    """
    Creates a local libSQL connection wrapped in LibsqlConnectionWrapper.
    Used for compatibility testing of libSQL without requiring remote cloud credentials.
    """
    if libsql is None:
        raise ImportError("libsql is not installed")
    raw = libsql.connect(db_path, autocommit=True)
    return LibsqlConnectionWrapper(raw, is_replica=False)


def normalize_wallet(wallet: Optional[str]) -> str:
    """Standardized wallet normalization across entire backend."""
    if not wallet:
        return ""
    return str(wallet).strip().lower()


def get_connection(db_path: Optional[str] = None) -> Union[sqlite3.Connection, LibsqlConnectionWrapper]:
    """
    Get a database connection configured for concurrent reads and resilient writes.
    If TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are set, connects to Turso via libSQL replica.
    Otherwise, returns a standard local sqlite3 connection with WAL mode.
    """
    if is_turso_enabled():
        target_path = db_path or get_replica_local_path()
        url = os.getenv("TURSO_DATABASE_URL", TURSO_DATABASE_URL).strip()
        token = os.getenv("TURSO_AUTH_TOKEN", TURSO_AUTH_TOKEN).strip()

        # If primary replica db file was wiped, clean up any orphaned metadata files (-info, -shm, -wal)
        fresh_replica = not os.path.exists(target_path)
        if fresh_replica:
            for suffix in ["-info", "-shm", "-wal", "-meta"]:
                orphan = f"{target_path}{suffix}"
                if os.path.exists(orphan):
                    try:
                        os.remove(orphan)
                    except Exception:
                        pass

        # Concurrent threads opening the same embedded-replica file can briefly hit
        # "database is locked"; retry with a short backoff instead of failing the request.
        raw = None
        for _attempt in range(6):
            try:
                raw = libsql.connect(
                    target_path,
                    sync_url=url,
                    auth_token=token,
                    autocommit=True
                )
                break
            except ValueError as ce:
                if "locked" not in str(ce).lower() or _attempt == 5:
                    raise
                time.sleep(0.15 * (_attempt + 1))
        wrapper = LibsqlConnectionWrapper(raw, is_replica=True)

        # Pull latest state from Turso Cloud. Throttled: a blocking network sync on EVERY
        # connection serialized all API calls (each request opens several) and stalled the server.
        try:
            pull_interval = float(os.getenv("TURSO_PULL_INTERVAL_SECONDS", "15"))
        except ValueError:
            pull_interval = 15.0
        _debounced_sync(raw, force=fresh_replica, min_interval=pull_interval)

        # NOTE: do NOT run PRAGMA foreign_keys here. On an embedded replica it is forwarded to
        # Turso as a network round trip (~1s) and get_connection() runs several times per request.
        # Writes execute on the Turso primary, which enforces foreign keys by default.
        try:
            wrapper.execute("PRAGMA busy_timeout = 30000;")
        except Exception:
            pass
        return wrapper

    target_path = db_path or os.getenv("DATABASE_PATH") or os.getenv("NEPTUNE_DB_PATH") or DB_PATH
    conn = sqlite3.connect(target_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache
    return conn
