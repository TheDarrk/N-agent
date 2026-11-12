"""
Neptune AI — 1-Minute Active Trade & TP/SL Poller
NOTE: Deactivated as Defuse 1-Click / NEAR Intents trades settle immediately on-chain.
Retained as an inert no-op to maintain interface compatibility with external callers or tests.
"""

from typing import Dict, Any, List


async def poll_active_trades() -> List[Dict[str, Any]]:
    """
    Main 60-second polling job.
    Deactivated: Defuse 1-Click / NEAR Intents trades settle immediately on-chain.
    """
    return []
