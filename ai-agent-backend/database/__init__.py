"""
Neptune AI v2.1 Database Package
Exposes database connection, encryption, and the entire normalized Data Access Layer (DAL).
"""

from .connection import (
    get_connection,
    DB_PATH,
    normalize_wallet,
    is_turso_enabled,
    get_last_sync_status,
    connect_libsql_local
)
from .encryption import WalletEncryption, get_encryption
from .crypto import derive_user_key, encrypt_field, decrypt_field, encrypt_dict, decrypt_dict
from .dal import *
from .chat_db import init_chat_db, save_chat_turn, get_recent_chats, clear_chat_history
from marketplace_service import (
    build_listing_snapshot,
    create_marketplace_listing,
    get_marketplace_listings,
    get_marketplace_listing_by_id,
    update_marketplace_listing,
    delete_marketplace_listing,
    create_marketplace_order,
    get_marketplace_order,
    list_buyer_orders,
    list_seller_sales,
    expire_stale_orders,
    complete_marketplace_order,
    apply_purchased_config,
    usdt_to_base_units,
    get_token_contract
)
