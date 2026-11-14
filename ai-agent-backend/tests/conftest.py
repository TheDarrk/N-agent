import os
import sys

# Ensure ai-agent-backend is on python path
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Prevent test suite from syncing test databases with remote production Turso
# unless explicitly requested via TEST_WITH_LIVE_TURSO=1
if os.environ.get("TEST_WITH_LIVE_TURSO") != "1":
    # NOTE: on Windows `os.environ[k] = ""` DELETES the variable and python-dotenv then reloads the real credentials
    # from .env, so the old guard silently let tests write to production Turso. Use an explicit kill switch.
    os.environ["NEPTUNE_DISABLE_TURSO"] = "1"
    os.environ["TURSO_DATABASE_URL"] = " "
    os.environ["TURSO_AUTH_TOKEN"] = " "

# Direct all test database operations to an isolated test database (neptune_test.db)
# immediately at module load time so neptune_v2.db remains 100% clean and unpolluted.
TEST_DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "neptune_test.db"))
os.environ["NEPTUNE_DB_PATH"] = TEST_DB_PATH

import pytest
from database import init_db

@pytest.fixture(scope="session", autouse=True)
def isolated_test_database():
    """
    Directs all test database operations to an isolated test database (neptune_test.db)
    so the production/deployed database (neptune_v2.db) remains 100% clean and empty.
    """
    os.environ["NEPTUNE_DB_PATH"] = TEST_DB_PATH
    if os.path.exists(TEST_DB_PATH):
        try:
            os.remove(TEST_DB_PATH)
        except Exception:
            pass

    init_db(TEST_DB_PATH)

    yield TEST_DB_PATH

    # Teardown: Clean up test database file
    for ext in ["", "-wal", "-shm", "-info"]:
        p = TEST_DB_PATH + ext
        if os.path.exists(p):
            try:
                os.remove(p)
            except Exception:
                pass
