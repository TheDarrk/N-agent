"""
Neptune AI v2.1 Database Package
Exposes database connection, encryption, and the entire normalized Data Access Layer (DAL).
"""

from .connection import get_connection, DB_PATH
from .encryption import WalletEncryption, get_encryption
from .dal import *
