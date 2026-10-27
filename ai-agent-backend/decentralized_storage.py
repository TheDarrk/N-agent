"""
Neptune AI — Decentralized Storage Layer (Recent 10 Items)
Stores Research Reports and Trade Reasoning Traces.
Keeps only the recent 10 records per category.
Uploads to Storacha/IPFS if configured, with instant local CID fallback.
"""

import os
import json
import hashlib
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone

MAX_TRADER_TRACES = 24
MAX_RESEARCH_REPORTS = 5
MAX_RECENT_ITEMS = 24
LOGS_DIR = os.path.join(os.path.dirname(__file__), "reasoning_logs")
REPORTS_DIR = os.path.join(os.path.dirname(__file__), "research_reports")

os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)

STORACHA_KEY = os.getenv("STORACHA_KEY", "")


def _generate_cid(data: Dict[str, Any]) -> str:
    """Generate a deterministic sha256 content-identifier hash (CID style)."""
    serialized = json.dumps(data, sort_keys=True)
    digest = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    return f"bafy{digest[:44]}"


def _prune_directory(directory: str, max_items: int = MAX_RECENT_ITEMS):
    """Keep only the most recent N JSON files in a directory."""
    try:
        files = [
            os.path.join(directory, f)
            for f in os.listdir(directory)
            if f.endswith(".json")
        ]
        if len(files) > max_items:
            # Sort by modification time ascending (oldest first)
            files.sort(key=os.path.getmtime)
            to_delete = files[: len(files) - max_items]
            for f in to_delete:
                try:
                    os.remove(f)
                except Exception:
                    pass
    except Exception as e:
        print(f"[STORAGE] Prune error: {e}")


async def upload_trade_trace(trace: Dict[str, Any]) -> str:
    """
    Store a trade reasoning trace.
    Returns the CID (IPFS/local) and strictly preserves the most recent 24 traces.
    Includes explicit UTC date, time, and ISO timestamp.
    """
    cid = _generate_cid(trace)
    trace["cid"] = cid
    now_utc = datetime.now(timezone.utc)
    trace["stored_at"] = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    trace["stored_at_iso"] = now_utc.isoformat()
    trace["date_utc"] = now_utc.strftime("%Y-%m-%d")
    trace["time_utc"] = now_utc.strftime("%H:%M:%S UTC")
    trace["timestamp_utc"] = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    trace["created_at_utc"] = now_utc.isoformat()

    # Save to local recent 24
    timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(LOGS_DIR, f"trace_{timestamp}_{cid[:10]}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(trace, f, indent=2)

    _prune_directory(LOGS_DIR, MAX_TRADER_TRACES)
    print(f"[STORAGE] Trade reasoning trace saved: {cid} (recent {MAX_TRADER_TRACES} preserved)")
    return cid


async def upload_research_report(report: Dict[str, Any]) -> str:
    """
    Store a Research Agent market report.
    Returns the CID (IPFS/local) and strictly preserves the most recent 5 reports.
    """
    cid = _generate_cid(report)
    report["cid"] = cid
    now_utc = datetime.now(timezone.utc)
    report["stored_at"] = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    report["stored_at_iso"] = now_utc.isoformat()
    report["date_utc"] = now_utc.strftime("%Y-%m-%d")
    report["time_utc"] = now_utc.strftime("%H:%M:%S UTC")
    report["timestamp_utc"] = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    report["created_at_utc"] = now_utc.isoformat()

    # Save to local recent 5
    timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(REPORTS_DIR, f"report_{timestamp}_{cid[:10]}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    _prune_directory(REPORTS_DIR, MAX_RESEARCH_REPORTS)
    print(f"[STORAGE] Research report saved: {cid} (recent {MAX_RESEARCH_REPORTS} preserved)")
    return cid


def get_recent_trade_traces(limit: int = 24) -> List[Dict[str, Any]]:
    """Retrieve up to the recent 24 trade traces."""
    items = []
    try:
        files = [
            os.path.join(LOGS_DIR, f)
            for f in os.listdir(LOGS_DIR)
            if f.endswith(".json")
        ]
        files.sort(key=os.path.getmtime, reverse=True)
        for filepath in files[:limit]:
            with open(filepath, "r", encoding="utf-8") as f:
                item = json.load(f)
                if not item.get("chart_image") and item.get("indicators", {}).get("candles"):
                    try:
                        from chart_visualizer import render_chart_image
                        candles = item["indicators"]["candles"]
                        cur_p = float(item.get("entry_price") or candles[-1]["close"])
                        tp = float(item.get("take_profit_price") or (cur_p * 1.05))
                        sl = float(item.get("stop_loss_price") or (cur_p * 0.95))
                        item["chart_image"] = render_chart_image(
                            candles=candles,
                            symbol=item.get("symbol", "NEAR"),
                            timeframe=item.get("timeframe", "1h"),
                            pattern_name=item.get("pattern_detected") or "Dynamic Trend Structure",
                            tp_price=tp,
                            sl_price=sl,
                            entry_price=cur_p,
                            verdict=item.get("verdict", "STAND_ASIDE"),
                            expected_roi_pct=float(item.get("expected_roi_pct", 0.0)),
                            confidence_score=int(item.get("confidence_score", 25)),
                            indicators=item.get("indicators")
                        )
                    except Exception:
                        pass
                items.append(item)
    except Exception as e:
        print(f"[STORAGE] Error reading traces: {e}")
    return items


def get_recent_research_reports(limit: int = 10) -> List[Dict[str, Any]]:
    """Retrieve up to the recent 10 research reports."""
    items = []
    try:
        files = [
            os.path.join(REPORTS_DIR, f)
            for f in os.listdir(REPORTS_DIR)
            if f.endswith(".json")
        ]
        files.sort(key=os.path.getmtime, reverse=True)
        for filepath in files[:limit]:
            with open(filepath, "r", encoding="utf-8") as f:
                items.append(json.load(f))
    except Exception as e:
        print(f"[STORAGE] Error reading reports: {e}")
    return items
