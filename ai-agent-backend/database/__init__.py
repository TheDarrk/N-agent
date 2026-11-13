"""
Neptune AI v2.1 Database Package
Exposes database connection, encryption, and the entire normalized Data Access Layer (DAL).
"""

from .connection import get_connection, DB_PATH, normalize_wallet
from .encryption import WalletEncryption, get_encryption
from .dal import *
from .chat_db import init_chat_db, save_chat_turn, get_recent_chats, clear_chat_history
