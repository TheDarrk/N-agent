"""
Neptune AI v2.1 — Backward Compatibility Module Shim
Exposes the database DAL for any legacy tools or scripts expecting `database.py`.
"""

from database.dal import *
from database.connection import get_connection, DB_PATH
from database.encryption import WalletEncryption, get_encryption
