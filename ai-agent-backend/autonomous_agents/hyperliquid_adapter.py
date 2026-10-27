"""
Neptune AI — Hyperliquid L1 Execution Adapter
Provides native crash-proof Bracket Orders (Primary Entry + TP Trigger + SL Trigger)
directly on Hyperliquid L1 using hyperliquid-python-sdk.
"""

import os
import math
from typing import Dict, Any, List, Optional
from eth_account import Account
from hyperliquid.exchange import Exchange
from hyperliquid.info import Info
from hyperliquid.utils import constants
from dotenv import load_dotenv

load_dotenv()


class HyperliquidAdapter:
    """
    Adapter for Hyperliquid DEX.
    Handles market info, precision formatting, and atomic Bracket Orders (normalTpsl).
    """

    def __init__(
        self,
        private_key: Optional[str] = None,
        account_address: Optional[str] = None,
        network: Optional[str] = None
    ):
        self.network = (network or os.getenv("HYPERLIQUID_NETWORK", "testnet")).lower().strip()
        self.base_url = constants.TESTNET_API_URL if self.network == "testnet" else constants.MAINNET_API_URL
        
        raw_key = private_key or os.getenv("HYPERLIQUID_PRIVATE_KEY") or os.getenv("HYPERLIQUID_AGENT_KEY") or ""
        self.private_key = raw_key.strip()
        if self.private_key and not self.private_key.startswith("0x") and len(self.private_key) == 64:
            self.private_key = "0x" + self.private_key
            
        self.account_address = account_address or os.getenv("HYPERLIQUID_ACCOUNT_ADDRESS") or None

        self._info: Optional[Info] = None
        self._exchange: Optional[Exchange] = None
        self._meta_cache: Optional[Dict[str, Any]] = None
        self._sz_decimals_cache: Dict[str, int] = {}

    @property
    def info(self) -> Info:
        if self._info is None:
            self._info = Info(self.base_url, skip_ws=True)
        return self._info

    @property
    def exchange(self) -> Optional[Exchange]:
        if self._exchange is None and self.is_configured():
            try:
                acc = Account.from_key(self.private_key)
                self._exchange = Exchange(
                    wallet=acc,
                    base_url=self.base_url,
                    account_address=self.account_address
                )
            except Exception as e:
                print(f"[HYPERLIQUID: INIT ERROR] Failed to initialize Exchange: {e}")
                self._exchange = None
        return self._exchange

    def is_configured(self) -> bool:
        """Returns True if a valid private key is available."""
        return bool(self.private_key and len(self.private_key) >= 64)

    def get_meta(self) -> Dict[str, Any]:
        """Fetches and caches metadata for perpetual markets."""
        if self._meta_cache is None:
            try:
                self._meta_cache = self.info.meta()
                for asset in self._meta_cache.get("universe", []):
                    name = asset.get("name")
                    sz_dec = asset.get("szDecimals", 2)
                    if name:
                        self._sz_decimals_cache[name.upper()] = sz_dec
            except Exception as e:
                print(f"[HYPERLIQUID: META ERROR] {e}")
                return {"universe": []}
        return self._meta_cache or {"universe": []}

    def get_sz_decimals(self, coin: str) -> int:
        """Returns allowed size decimal places for a coin."""
        c = coin.upper().strip()
        if not self._sz_decimals_cache:
            self.get_meta()
        return self._sz_decimals_cache.get(c, 2)

    def is_asset_supported(self, coin: str) -> bool:
        """Checks if perpetual contract is listed on Hyperliquid."""
        c = coin.upper().strip()
        if not self._sz_decimals_cache:
            self.get_meta()
        return c in self._sz_decimals_cache

    def get_mid_price(self, coin: str) -> Optional[float]:
        """Gets current mid-market price for coin."""
        try:
            mids = self.info.all_mids()
            val = mids.get(coin.upper().strip())
            return float(val) if val is not None else None
        except Exception as e:
            print(f"[HYPERLIQUID: PRICE ERROR] {e}")
            return None

    @staticmethod
    def round_price(px: float) -> float:
        """
        Rounds price to comply with Hyperliquid's 5 significant figure rule.
        """
        if px <= 0:
            return 0.0
        if px >= 10000:
            return round(px, 1)
        elif px >= 1000:
            return round(px, 2)
        elif px >= 100:
            return round(px, 3)
        elif px >= 10:
            return round(px, 4)
        elif px >= 1:
            return round(px, 4)
        else:
            return round(px, 5)

    def round_size(self, coin: str, sz: float) -> float:
        """Rounds position size according to coin's szDecimals."""
        dec = self.get_sz_decimals(coin)
        factor = 10 ** dec
        return math.floor(sz * factor) / factor

    def place_bracket_order(
        self,
        coin: str,
        is_buy: bool,
        amount_usd: float,
        entry_price: float,
        tp_price: float,
        sl_price: float,
        slippage_pct: float = 0.015
    ) -> Dict[str, Any]:
        """
        Places an atomic primary entry + Take Profit + Stop Loss bracket order (normalTpsl).
        Once accepted by Hyperliquid, execution of TP/SL is managed 100% on-chain by validators.
        """
        c = coin.upper().strip()
        if not self.is_configured():
            return {
                "success": False,
                "error": "Hyperliquid adapter not configured with private key."
            }

        ex = self.exchange
        if not ex:
            return {
                "success": False,
                "error": "Hyperliquid Exchange client failed to initialize."
            }

        # 1. Fetch live mid price if needed to validate entry
        live_mid = self.get_mid_price(c)
        ref_price = live_mid if live_mid else entry_price

        # 2. Compute size based on USD value and decimals
        raw_sz = amount_usd / max(0.0001, ref_price)
        sz = self.round_size(c, raw_sz)
        if sz <= 0:
            return {
                "success": False,
                "error": f"Computed position size {sz} is below minimum allowed lot size for {c}."
            }

        # 3. Format prices
        # For IOC market-like entry, apply acceptable slippage bound
        if is_buy:
            ioc_limit_px = self.round_price(ref_price * (1.0 + slippage_pct))
        else:
            ioc_limit_px = self.round_price(ref_price * (1.0 - slippage_pct))

        formatted_tp = self.round_price(tp_price)
        formatted_sl = self.round_price(sl_price)

        # 4. Construct the 3 grouped orders
        primary_order = {
            "coin": c,
            "is_buy": is_buy,
            "sz": sz,
            "limit_px": ioc_limit_px,
            "order_type": {"limit": {"tif": "Ioc"}},
            "reduce_only": False,
        }

        # Stop Loss Trigger Order
        sl_order = {
            "coin": c,
            "is_buy": not is_buy,
            "sz": sz,
            "limit_px": formatted_sl,
            "order_type": {
                "trigger": {
                    "triggerPx": formatted_sl,
                    "isMarket": True,
                    "tpsl": "sl",
                }
            },
            "reduce_only": True,
        }

        # Take Profit Trigger Order
        tp_order = {
            "coin": c,
            "is_buy": not is_buy,
            "sz": sz,
            "limit_px": formatted_tp,
            "order_type": {
                "trigger": {
                    "triggerPx": formatted_tp,
                    "isMarket": True,
                    "tpsl": "tp",
                }
            },
            "reduce_only": True,
        }

        orders_payload = [primary_order, sl_order, tp_order]

        print(f"[HYPERLIQUID: ORDER] Submitting atomic normalTpsl Bracket Order for {c}:")
        print(f"  • Entry: {'BUY' if is_buy else 'SELL'} {sz} {c} @ ${ioc_limit_px} (IOC)")
        print(f"  • Stop Loss: Trigger @ ${formatted_sl} (Market)")
        print(f"  • Take Profit: Trigger @ ${formatted_tp} (Market)")

        try:
            res = ex.bulk_orders(orders_payload, grouping="normalTpsl")
            print(f"[HYPERLIQUID: RESULT] {res}")
            is_ok = isinstance(res, dict) and res.get("status") == "ok"
            err_msg = res.get("response") if isinstance(res, dict) and not is_ok else None
            return {
                "success": is_ok,
                "error": err_msg,
                "venue": "hyperliquid",
                "network": self.network,
                "coin": c,
                "side": "BUY" if is_buy else "SELL",
                "size": sz,
                "entry_limit_price": ioc_limit_px,
                "tp_trigger_price": formatted_tp,
                "sl_trigger_price": formatted_sl,
                "raw_response": res
            }
        except Exception as e:
            print(f"[HYPERLIQUID: ORDER ERROR] Execution failed: {e}")
            return {
                "success": False,
                "error": str(e),
                "coin": c,
                "size": sz
            }

    def get_account_positions(self, address: Optional[str] = None) -> List[Dict[str, Any]]:
        """Queries active perpetual positions for the account."""
        target_addr = address or self.account_address
        if not target_addr and self.is_configured():
            try:
                target_addr = Account.from_key(self.private_key).address
            except Exception:
                pass
        if not target_addr:
            return []

        try:
            state = self.info.user_state(target_addr)
            positions = []
            for p in state.get("assetPositions", []):
                pos = p.get("position", {})
                s = float(pos.get("szi", 0))
                if abs(s) > 0:
                    positions.append({
                        "coin": pos.get("coin"),
                        "size": s,
                        "entry_price": float(pos.get("entryPx", 0)),
                        "unrealized_pnl": float(pos.get("unrealizedPnl", 0)),
                        "return_on_equity": float(pos.get("returnOnEquity", 0)),
                        "liquidation_price": float(pos.get("liquidationPx") or 0)
                    })
            return positions
        except Exception as e:
            print(f"[HYPERLIQUID: POSITIONS ERROR] {e}")
            return []
