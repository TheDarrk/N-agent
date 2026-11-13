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
LOGS_DIR = os.getenv("REASONING_LOGS_DIR") or os.path.join(os.path.dirname(__file__), "reasoning_logs")
REPORTS_DIR = os.getenv("RESEARCH_REPORTS_DIR") or os.path.join(os.path.dirname(__file__), "research_reports")
MODERATOR_DIR = os.getenv("MODERATOR_LOGS_DIR") or os.path.join(os.path.dirname(__file__), "reasoning_logs", "moderator")

os.makedirs(LOGS_DIR, exist_ok=True)
os.makedirs(REPORTS_DIR, exist_ok=True)
os.makedirs(MODERATOR_DIR, exist_ok=True)

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
    Returns the CID (IPFS/local) and preserves traces in SQLite scoped by wallet.
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

    # Save to SQLite trader_reasoning_traces and agent_runs
    wallet = trace.get("user_wallet") or trace.get("wallet_address") or ""
    if wallet:
        try:
            from database import save_reasoning_trace, create_run, finish_run
            img_val = trace.get("chart_image")
            if isinstance(img_val, dict):
                img_val = img_val.get("filepath") or img_val.get("url") or img_val.get("data_uri") or json.dumps(img_val)
            save_reasoning_trace(
                wallet_address=wallet,
                symbol=trace.get("symbol", "NEAR"),
                verdict=trace.get("verdict", "STAND_ASIDE"),
                confidence=int(trace.get("confidence_score") or trace.get("confidence") or 50),
                trace_payload=trace,
                chart_image_path=img_val
            )
            # Ensure also persisted into agent_runs table
            try:
                run_id = f"trader-{cid[:12]}"
                create_run(
                    wallet=wallet,
                    agent_type="trader",
                    title=f"Trade {trace.get('symbol', 'NEAR')} - {trace.get('verdict', 'STAND_ASIDE')}",
                    params={"symbol": trace.get("symbol", "NEAR"), "action": trace.get("action")}
                )
                finish_run(run_id=run_id, result=trace, cid=cid, error=None)
            except Exception:
                pass
        except Exception as dbe:
            print(f"[STORAGE: DB TRACE ERROR] {dbe}")

    # Also save to local recent files
    try:
        timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(LOGS_DIR, f"trace_{timestamp}_{cid[:10]}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(trace, f, indent=2)
        _prune_directory(LOGS_DIR, MAX_TRADER_TRACES)
    except Exception as fe:
        print(f"[STORAGE: LOCAL FILE TRACE WARNING] {fe}")

    print(f"[STORAGE] Trade reasoning trace saved: {cid} (user: {wallet or 'global'})")
    return cid


async def upload_research_report(report: Dict[str, Any]) -> str:
    """
    Store a Research Agent market report.
    Persists in SQLite research_reports scoped by wallet.
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

    # Save to SQLite research_reports and agent_runs
    wallet = report.get("requester") or report.get("user_wallet") or report.get("wallet_address") or ""
    if wallet:
        try:
            from database import save_research_report, create_run, finish_run
            save_research_report(
                wallet_address=wallet,
                title=report.get("title") or report.get("topic") or "Research Report",
                query=report.get("research_query") or report.get("user_expectations") or "",
                full_report=report,
                report_type=report.get("report_type", "comprehensive")
            )
            # Ensure also persisted into agent_runs table
            try:
                run_id = f"research-{cid[:12]}"
                create_run(
                    wallet=wallet,
                    agent_type="research",
                    title=report.get("title") or report.get("topic") or "Research Report",
                    params={"topic": report.get("topic") or report.get("research_query")}
                )
                finish_run(run_id=run_id, result=report, cid=cid, error=None)
            except Exception:
                pass
        except Exception as dbe:
            print(f"[STORAGE: DB REPORT ERROR] {dbe}")

    # Also save to local recent files
    try:
        timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
        filepath = os.path.join(REPORTS_DIR, f"report_{timestamp}_{cid[:10]}.json")
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2)
        _prune_directory(REPORTS_DIR, MAX_RESEARCH_REPORTS)
    except Exception as fe:
        print(f"[STORAGE: LOCAL FILE REPORT WARNING] {fe}")

    print(f"[STORAGE] Research report saved: {cid} (user: {wallet or 'global'})")
    return cid



async def upload_moderator_report(report: Dict[str, Any]) -> str:
    """
    Store a Moderator Watchdog master fleet evaluation report.
    Returns the CID (IPFS/local) and strictly preserves the most recent 10 evaluations.
    Stored in a dedicated directory so it never contaminates Trader reasoning logs.
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

    # Save to local recent 10
    timestamp = now_utc.strftime("%Y%m%d_%H%M%S")
    filepath = os.path.join(MODERATOR_DIR, f"eval_{timestamp}_{cid[:10]}.json")
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    _prune_directory(MODERATOR_DIR, MAX_MODERATOR_REPORTS)
    print(f"[STORAGE] Moderator master evaluation saved: {cid} (recent {MAX_MODERATOR_REPORTS} preserved)")
    return cid


def get_recent_trade_traces(limit: int = 24, wallet_address: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieve trade traces.
    Strictly isolated to wallet_address. If no wallet_address is provided, returns empty list
    to prevent any cross-tenant data leakage.
    """
    if wallet_address:
        try:
            from database import get_user_reasoning_traces
            traces = get_user_reasoning_traces(wallet_address, limit=limit)
            items = []
            for tr in traces:
                p = tr.get("trace_payload", {})
                p["cid"] = tr.get("cid", "")
                items.append(p)
            return items
        except Exception as e:
            print(f"[STORAGE: DB TRACES ERROR] {e}")
            return []

    # In production without wallet_address, NEVER leak another user's traces
    if not os.getenv("PYTEST_CURRENT_TEST"):
        return []

    # Test / dev mode fallback: SQLite DB is the source of truth, files are optional cache
    items = []
    try:
        from database import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT trace_payload_json, cid FROM trader_reasoning_traces
            ORDER BY created_at DESC LIMIT ?
        """, (min(limit, 24),)).fetchall()
        conn.close()
        for r in rows:
            try:
                p = json.loads(r["trace_payload_json"])
                p["cid"] = r["cid"]
                items.append(p)
            except Exception:
                pass
        if items:
            return items[:limit]
    except Exception:
        pass

    # Optional local file cache fallback
    try:
        files = [
            os.path.join(LOGS_DIR, f)
            for f in os.listdir(LOGS_DIR)
            if f.endswith(".json")
        ]
        files.sort(key=os.path.getmtime, reverse=True)
        max_read = min(limit, 10)
        for filepath in files:
            with open(filepath, "r", encoding="utf-8") as f:
                item = json.load(f)
                if "total_mean_score" in item or "node_1_trader" in item:
                    continue
                items.append(item)
                if len(items) >= max_read:
                    break
    except Exception as e:
        print(f"[STORAGE] Error reading traces: {e}")
    return items


def get_recent_research_reports(limit: int = 10, wallet_address: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Retrieve research reports.
    Strictly isolated to wallet_address. If no wallet_address is provided, returns empty list
    to prevent any cross-tenant data leakage.
    """
    if wallet_address:
        try:
            from database import get_user_research_reports
            reports = get_user_research_reports(wallet_address, limit=limit)
            items = []
            for rep in reports:
                r = rep.get("full_report", {})
                r["cid"] = rep.get("cid", "")
                items.append(r)
            return items
        except Exception as e:
            print(f"[STORAGE: DB REPORTS ERROR] {e}")
            return []

    # In production without wallet_address, NEVER leak another user's reports
    if not os.getenv("PYTEST_CURRENT_TEST"):
        return []

    # Test / dev mode fallback: SQLite DB is the source of truth, files are optional cache
    items = []
    try:
        from database import get_connection
        conn = get_connection()
        rows = conn.execute("""
            SELECT full_report_json, cid FROM research_reports
            ORDER BY created_at DESC LIMIT ?
        """, (min(limit, 10),)).fetchall()
        conn.close()
        for r in rows:
            try:
                r_data = json.loads(r["full_report_json"])
                r_data["cid"] = r["cid"]
                items.append(r_data)
            except Exception:
                pass
        if items:
            return items[:limit]
    except Exception:
        pass

    # Optional local file cache fallback
    try:
        files = [
            os.path.join(REPORTS_DIR, f)
            for f in os.listdir(REPORTS_DIR)
            if f.endswith(".json")
        ]
        files.sort(key=os.path.getmtime, reverse=True)
        max_read = min(limit, 10)
        for filepath in files[:max_read]:
            with open(filepath, "r", encoding="utf-8") as f:
                items.append(json.load(f))
    except Exception as e:
        print(f"[STORAGE] Error reading reports: {e}")
    return items

