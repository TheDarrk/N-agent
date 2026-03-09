"""
Audit Agent   Logs all decisions and uploads reasoning traces
to decentralized storage (Storacha/Filecoin).
"""

import json
from typing import Dict, Any, Optional
from datetime import datetime
from database import log_agent_action


class AuditAgent:
    """
    Creates structured reasoning traces for every autonomous action
    and uploads them to decentralized storage for verifiability.
    """

    def __init__(self):
        self.name = "audit"

    async def log_and_store(
        self,
        user_wallet: str,
        decision: Dict[str, Any],
        risk_result: Dict[str, Any],
        execution_result: Dict[str, Any],
        market_snapshot: Dict[str, float] = None
    ) -> Optional[str]:
        """
        Create a full reasoning trace and store it.
        Returns the CID if uploaded to decentralized storage.
        """
        reasoning_trace = self._build_trace(
            user_wallet, decision, risk_result, execution_result, market_snapshot
        )

        # Upload to decentralized storage
        cid = await self._upload_to_storage(reasoning_trace)

        # Log to local DB with CID reference
        log_agent_action(
            user_wallet=user_wallet,
            agent_name="audit",
            trigger_type="audit_trail",
            reasoning_text=json.dumps(reasoning_trace, indent=2),
            action_taken=f"Trace stored   CID: {cid or 'local_only'}",
            cid_reference=cid,
            status="archived"
        )

        print(f"[AUDIT] Reasoning trace stored for {user_wallet}   CID: {cid or 'local'}")
        return cid

    def _build_trace(
        self,
        user_wallet: str,
        decision: Dict,
        risk_result: Dict,
        execution_result: Dict,
        market_snapshot: Dict = None
    ) -> Dict[str, Any]:
        """Build a structured reasoning trace JSON."""
        return {
            "agent": "Neptune AI",
            "version": "2.0",
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "user": user_wallet,
            "trigger": {
                "type": decision.get("strategy_type", "unknown"),
                "rule": decision.get("reasoning", ""),
                "strategy_id": decision.get("strategy_id"),
            },
            "decision": {
                "strategy_agent": decision.get("action", "none"),
                "should_act": decision.get("should_act", False),
                "details": decision.get("details", {}),
            },
            "risk_evaluation": {
                "approved": risk_result.get("approved", False),
                "reason": risk_result.get("reason", ""),
                "checks": risk_result.get("checks", {}),
            },
            "execution": {
                "success": execution_result.get("success", False),
                "tx_hash": execution_result.get("tx_hash"),
                "message": execution_result.get("message", ""),
            },
            "market_snapshot": market_snapshot or {},
        }

    async def _upload_to_storage(self, trace: Dict) -> Optional[str]:
        """
        Upload reasoning trace to decentralized storage.
        Tries Storacha first, falls back to local-only.
        """
        try:
            from decentralized_storage import upload_reasoning_trace
            cid = await upload_reasoning_trace(trace)
            return cid
        except ImportError:
            # Storacha not configured yet   store locally only
            print("[AUDIT] Decentralized storage not configured   local only")
            return None
        except Exception as e:
            print(f"[AUDIT] Storage upload failed: {e}   local only")
            return None
