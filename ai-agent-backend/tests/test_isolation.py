"""Safety net: the test suite must NEVER talk to the real (cloud) Turso database."""
from database.connection import is_turso_enabled, get_connection


def test_tests_never_use_cloud_turso():
    assert is_turso_enabled() is False, "tests would write to the production database (check conftest guard)"
    conn = get_connection()
    try:
        # a plain local sqlite connection, not a libsql replica wrapper
        assert conn.__class__.__module__.startswith("sqlite3")
    finally:
        conn.close()
