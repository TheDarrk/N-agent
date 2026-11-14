"""
Neptune AI — Agent History Store (database only).

Trader reasoning traces and research reports are saved ONLY in the database (Turso), scoped by
wallet. Nothing is written to disk (Render's disk is ephemeral and counts against memory).
Every record gets a short readable ID (e.g. TRC-9F2A41C07B, RSH-0B7E33D1AA) used as its `cid`
field everywhere in the API/UI.
"""

import json
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from database.dal import new_record_id


def _stamp(record: Dict[str, Any], record_id: str) -> None:
    """Adds the ID and explicit UTC date/time fields the UI displays."""
    now_utc = datetime.now(timezone.utc)
    record["cid"] = record_id
    record["stored_at"] = now_utc.strftime("%Y-%m-%d %H:%M:%S UTC")
    record["stored_at_iso"] = now_utc.isoformat()
    record["date_utc"] = now_utc.strftime("%Y-%m-%d")
    record["time_utc"] = now_utc.strftime("%H:%M:%S UTC")
    record["timestamp_utc"] = record["stored_at"]
    record["created_at_utc"] = now_utc.isoformat()


async def record_trade_trace(trace: Dict[str, Any]) -> str:
    """Save a trader reasoning trace in the DB and return its ID."""
    record_id = new_record_id("TRC")
    _stamp(trace, record_id)

    wallet = trace.get("user_wallet") or trace.get("wallet_address") or ""
    if wallet:
        try:
            from database import save_reasoning_trace
            img_val = trace.get("chart_image")
            if isinstance(img_val, dict):
                # the chart itself stays inside the trace payload (data_uri); only keep a short marker here
                img_val = img_val.get("filename") or "inline"
            save_reasoning_trace(
                wallet_address=wallet,
                symbol=trace.get("symbol", "NEAR"),
                verdict=trace.get("verdict", "STAND_ASIDE"),
                confidence=int(trace.get("confidence_score") or trace.get("confidence") or 50),
                trace_payload=trace,
                chart_image_path=img_val,
                record_id=record_id,
            )
        except Exception as dbe:
            print(f"[HISTORY: DB TRACE ERROR] {dbe}")
    print(f"[HISTORY] Trade trace saved: {record_id} (user: {wallet or 'none'})")
    return record_id


async def record_research_report(report: Dict[str, Any]) -> str:
    """Save a research report in the DB and return its ID."""
    record_id = new_record_id("RSH")
    _stamp(report, record_id)

    wallet = report.get("requester") or report.get("user_wallet") or report.get("wallet_address") or ""
    if wallet:
        try:
            from database import save_research_report
            save_research_report(
                wallet_address=wallet,
                title=report.get("title") or report.get("topic") or "Research Report",
                query=report.get("research_query") or report.get("user_expectations") or "",
                full_report=report,
                report_type=report.get("report_type", "comprehensive"),
                record_id=record_id,
            )
        except Exception as dbe:
            print(f"[HISTORY: DB REPORT ERROR] {dbe}")
    print(f"[HISTORY] Research report saved: {record_id} (user: {wallet or 'none'})")
    return record_id


def get_recent_trade_traces(limit: int = 24, wallet_address: Optional[str] = None) -> List[Dict[str, Any]]:
    """Recent traces for ONE wallet (never returns another tenant's data)."""
    if not wallet_address:
        return []
    try:
        from database import get_user_reasoning_traces
        items = []
        for tr in get_user_reasoning_traces(wallet_address, limit=limit):
            p = tr.get("trace_payload", {}) or {}
            p["cid"] = tr.get("cid", p.get("cid", ""))
            items.append(p)
        return items
    except Exception as e:
        print(f"[HISTORY: DB TRACES ERROR] {e}")
        return []


def get_recent_research_reports(limit: int = 10, wallet_address: Optional[str] = None) -> List[Dict[str, Any]]:
    """Recent research reports for ONE wallet (never returns another tenant's data)."""
    if not wallet_address:
        return []
    try:
        from database import get_user_research_reports
        items = []
        for rep in get_user_research_reports(wallet_address, limit=limit):
            r = rep.get("full_report", {}) or {}
            r["cid"] = rep.get("cid", r.get("cid", ""))
            items.append(r)
        return items
    except Exception as e:
        print(f"[HISTORY: DB REPORTS ERROR] {e}")
        return []
