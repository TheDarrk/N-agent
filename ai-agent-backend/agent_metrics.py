"""
Neptune AI - real agent metrics (read-only, derived from the database; nothing is invented).

  compute_fleet_metrics(wallet)  -> per-agent numbers for the Agent Suite cards
  get_listing_analytics(id)      -> public analytics for a marketplace listing (last decisions / strategies / reports,
                                    the agent wallet ADDRESS, counts). Never returns keys, configs or emails.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from database.connection import get_connection, normalize_wallet

logger = logging.getLogger("neptune.metrics")


def _json(value: Any, default: Any) -> Any:
    try:
        return json.loads(value) if isinstance(value, str) else (value if value is not None else default)
    except Exception:
        return default


def _scalar(conn, sql: str, params: tuple = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0] or 0) if row else 0


# ─────────────────────────────────────────────────────────────────────────────
# Agent wallets (public address only)
# ─────────────────────────────────────────────────────────────────────────────

def get_assigned_agent_wallets(wallet: str, agent: str, conn=None) -> List[Dict[str, Any]]:
    """Public info of the agent wallet(s) assigned to `agent` for `wallet`: address / label / chain. No keys."""
    w = normalize_wallet(wallet)
    own = conn is None
    conn = conn or get_connection()
    try:
        rows = conn.execute(
            "SELECT id, chain_type, public_key, agent_account_id, label, assigned_agents_json, status "
            "FROM core_agent_wallets WHERE LOWER(wallet_address) = ? AND status = 'active'", (w,)
        ).fetchall()
    finally:
        if own:
            conn.close()
    out = []
    for r in rows:
        assigned = [str(a).lower() for a in _json(r["assigned_agents_json"], [])]
        if agent.lower() in assigned:
            out.append({
                "id": r["id"],
                "address": r["agent_account_id"] or r["public_key"] or "",
                "label": r["label"] or "Agent Wallet",
                "chain": r["chain_type"] or "near",
            })
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Suite cards
# ─────────────────────────────────────────────────────────────────────────────

def compute_fleet_metrics(wallet: str) -> Dict[str, Dict[str, Any]]:
    """Real numbers for the four suite cards. Missing data stays None/0 (the UI shows 'no data yet')."""
    w = normalize_wallet(wallet)
    conn = get_connection()
    try:
        out: Dict[str, Dict[str, Any]] = {"trader": {}, "rebalancer": {}, "research": {}, "moderator": {}}

        # trader
        last = conn.execute(
            "SELECT symbol, verdict, confidence_score, created_at FROM trader_reasoning_traces "
            "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 1", (w,)).fetchone()
        out["trader"] = {
            "decisions_count": _scalar(conn, "SELECT COUNT(*) FROM trader_reasoning_traces WHERE LOWER(wallet_address) = ?", (w,)),
            "last_decision": dict(last) if last else None,
        }

        # rebalancer
        last_s = conn.execute(
            "SELECT market_regime, overall_strategy_text, status, created_at FROM rebalancer_strategies "
            "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 1", (w,)).fetchone()
        out["rebalancer"] = {
            "strategies_count": _scalar(conn, "SELECT COUNT(*) FROM rebalancer_strategies WHERE LOWER(wallet_address) = ?", (w,)),
            "executions_count": _scalar(conn, "SELECT COUNT(*) FROM rebalancer_executions WHERE LOWER(wallet_address) = ?", (w,)),
            "executions_success": _scalar(conn, "SELECT COUNT(*) FROM rebalancer_executions WHERE LOWER(wallet_address) = ? AND terminal_status = 'SUCCESS'", (w,)),
            "last_strategy": ({"regime": last_s["market_regime"], "status": last_s["status"], "created_at": last_s["created_at"],
                               "summary": (last_s["overall_strategy_text"] or "")[:160]} if last_s else None),
        }

        # research
        last_r = conn.execute(
            "SELECT title, cid, created_at FROM research_reports WHERE LOWER(wallet_address) = ? "
            "ORDER BY created_at DESC, id DESC LIMIT 1", (w,)).fetchone()
        out["research"] = {
            "reports_generated": _scalar(conn, "SELECT COUNT(*) FROM research_reports WHERE LOWER(wallet_address) = ?", (w,)),
            "latest_report": dict(last_r) if last_r else None,
        }

        # moderator
        last_m = conn.execute(
            "SELECT overall_fleet_score, verdict, created_at FROM moderator_evaluations "
            "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 1", (w,)).fetchone()
        out["moderator"] = {
            "audits_count": _scalar(conn, "SELECT COUNT(*) FROM moderator_evaluations WHERE LOWER(wallet_address) = ?", (w,)),
            "health_score": (round(float(last_m["overall_fleet_score"]), 1) if last_m and last_m["overall_fleet_score"] is not None else None),
            "last_verdict": last_m["verdict"] if last_m else None,
            "last_audit_at": last_m["created_at"] if last_m else None,
        }
        return out
    except Exception as e:
        logger.warning("[METRICS] fleet metrics failed for %s: %s", w, e)
        return {"trader": {}, "rebalancer": {}, "research": {}, "moderator": {}}
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Marketplace listing analytics
# ─────────────────────────────────────────────────────────────────────────────

def _trader_analytics(conn, w: str) -> Dict[str, Any]:
    counts = {r["status"]: r["c"] for r in conn.execute(
        "SELECT status, COUNT(*) AS c FROM trader_active_trades WHERE LOWER(wallet_address) = ? GROUP BY status", (w,)).fetchall()}
    wins, losses = counts.get("CLOSED_TP", 0), counts.get("CLOSED_SL", 0)
    traces = conn.execute(
        "SELECT symbol, verdict, confidence_score, trace_payload_json, created_at FROM trader_reasoning_traces "
        "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 10", (w,)).fetchall()
    decisions = []
    for t in traces:
        p = _json(t["trace_payload_json"], {})
        decisions.append({
            "symbol": t["symbol"], "verdict": t["verdict"], "confidence": t["confidence_score"],
            "timeframe": p.get("timeframe"), "expected_roi_pct": p.get("expected_roi_pct") or p.get("expected_roi"),
            "entry": p.get("entry_price"), "take_profit": p.get("take_profit_price"), "stop_loss": p.get("stop_loss_price"),
            "at": t["created_at"],
        })
    trades = [dict(r) for r in conn.execute(
        "SELECT symbol, direction, status, entry_price_usd AS entry, take_profit_usd AS take_profit, stop_loss_usd AS stop_loss, "
        "confidence_score AS confidence, position_size_usd AS size_usd, created_at AS opened_at, closed_at FROM trader_active_trades "
        "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC LIMIT 10", (w,)).fetchall()]
    total_decisions = _scalar(conn, "SELECT COUNT(*) FROM trader_reasoning_traces WHERE LOWER(wallet_address) = ?", (w,))
    return {
        "metrics": {
            "trades_taken": sum(v for k, v in counts.items() if k != "DROPPED"),
            "open_trades": counts.get("OPEN", 0) + counts.get("PENDING_ENTRY", 0),
            "take_profit_hits": wins, "stop_loss_hits": losses,
            "win_rate_pct": round(wins / (wins + losses) * 100, 1) if (wins + losses) else None,
            "dropped": counts.get("DROPPED", 0),
            "decisions_total": total_decisions,
        },
        "recent_decisions": decisions,
        "recent_trades": trades,
    }


def _rebalancer_analytics(conn, w: str) -> Dict[str, Any]:
    rows = conn.execute(
        "SELECT market_regime, overall_strategy_text, allocations_json, status, cadence_days, min_stable_pct, drop_reason, created_at "
        "FROM rebalancer_strategies WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 10", (w,)).fetchall()
    strategies = [{
        "regime": r["market_regime"], "summary": (r["overall_strategy_text"] or "")[:220],
        "allocations": _json(r["allocations_json"], {}), "status": r["status"], "cadence_days": r["cadence_days"],
        "min_stable_pct": r["min_stable_pct"], "drop_reason": r["drop_reason"], "at": r["created_at"],
    } for r in rows]
    exec_counts = {r["terminal_status"] or "IN_PROGRESS": r["c"] for r in conn.execute(
        "SELECT terminal_status, COUNT(*) AS c FROM rebalancer_executions WHERE LOWER(wallet_address) = ? GROUP BY terminal_status", (w,)).fetchall()}
    swaps = [dict(r) for r in conn.execute(
        "SELECT token_in, token_out, amount_in_usd, terminal_status AS result, created_at AS at FROM rebalancer_executions "
        "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC LIMIT 10", (w,)).fetchall()]
    return {
        "metrics": {
            "strategies_total": _scalar(conn, "SELECT COUNT(*) FROM rebalancer_strategies WHERE LOWER(wallet_address) = ?", (w,)),
            "swaps_total": sum(exec_counts.values()),
            "swaps_successful": exec_counts.get("SUCCESS", 0),
            "swaps_failed_or_refunded": sum(v for k, v in exec_counts.items() if k not in ("SUCCESS", "IN_PROGRESS")),
        },
        "recent_strategies": strategies,
        "recent_swaps": swaps,
    }


def _research_analytics(conn, w: str) -> Dict[str, Any]:
    rows = conn.execute(
        "SELECT title, cid, executive_summary, sources_cited_json, signals_json, created_at FROM research_reports "
        "WHERE LOWER(wallet_address) = ? ORDER BY created_at DESC, id DESC LIMIT 3", (w,)).fetchall()
    reports = []
    for r in rows:
        sources = _json(r["sources_cited_json"], [])
        signals = _json(r["signals_json"], [])
        first = signals[0] if isinstance(signals, list) and signals else {}
        reports.append({
            "title": r["title"], "id": r["cid"], "summary": (r["executive_summary"] or "")[:320],
            "sources_count": len(sources) if isinstance(sources, list) else 0,
            "signal": (first.get("direction") or first.get("action")) if isinstance(first, dict) else None,
            "confidence": first.get("confidence") if isinstance(first, dict) else None,
            "at": r["created_at"],
        })
    total = _scalar(conn, "SELECT COUNT(*) FROM research_reports WHERE LOWER(wallet_address) = ?", (w,))
    return {
        "metrics": {
            "reports_total": total,
            "avg_sources_per_report": round(sum(x["sources_count"] for x in reports) / len(reports), 1) if reports else None,
        },
        "recent_reports": reports,
    }


def get_listing_analytics(listing_id: str) -> Optional[Dict[str, Any]]:
    """Public analytics for a marketplace listing, computed from the seller's real history."""
    conn = get_connection()
    try:
        row = conn.execute("SELECT listing_id, seller_wallet, agent_type, status FROM marketplace_listings WHERE listing_id = ?",
                           (listing_id,)).fetchone()
        if not row:
            return None
        w = normalize_wallet(row["seller_wallet"])
        agent = (row["agent_type"] or "").lower()
        base: Dict[str, Any] = {
            "listing_id": row["listing_id"], "agent_type": agent,
            "agent_wallets": get_assigned_agent_wallets(w, agent, conn),
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
        if agent == "trader":
            base.update(_trader_analytics(conn, w))
        elif agent == "rebalancer":
            base.update(_rebalancer_analytics(conn, w))
        elif agent == "research":
            base.update(_research_analytics(conn, w))
        return base
    finally:
        conn.close()


# ─────────────────────────────────────────────────────────────────────────────
# Truthful agent status (what the chat assistant must report; "switched on" is NOT "working")
# ─────────────────────────────────────────────────────────────────────────────

_SCHEDULED_AGENTS = {"trader": "trader", "rebalancer": "rebalancer", "moderator": "moderator"}
_RUN_TYPE = {"trader": "trader", "rebalancer": "rebalancer", "researcher": "research", "research": "research", "moderator": "moderator"}


def _parse_ts(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        txt = str(value).replace("Z", "+00:00")
        dt = datetime.fromisoformat(txt) if "T" in txt else datetime.strptime(txt[:19], "%Y-%m-%d %H:%M:%S")
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def get_agent_truth(wallet: str, agent: str) -> Dict[str, Any]:
    """
    The real state of one agent: the user's on/off flag, whether a schedule exists and when it fires next, what the
    last run did (or why it failed), whether it is running right now, and which wallet it uses. Includes a one-line
    VERDICT that never calls an agent 'working' just because its switch is on.
    """
    from database import get_user  # local import: avoid circular import at module load

    w = normalize_wallet(wallet)
    agent = "research" if agent in ("researcher", "research") else agent
    flag_key = {"trader": "trader_active", "rebalancer": "rebalancer_active", "research": "research_active", "moderator": "moderator_active"}[agent]
    user = get_user(w) or {}
    flag = bool(user.get(flag_key))
    kill = bool(user.get("kill_switch"))
    conn = get_connection()
    try:
        job = conn.execute(
            "SELECT next_run_at, interval_seconds FROM scheduled_jobs WHERE LOWER(wallet) = ? AND agent_type = ? AND enabled = 1 LIMIT 1",
            (w, _SCHEDULED_AGENTS.get(agent, "?"))).fetchone()
        last = conn.execute(
            "SELECT status, created_at, finished_at, error, last_heartbeat FROM agent_runs WHERE wallet = ? AND agent_type = ? "
            "ORDER BY created_at DESC LIMIT 1", (w, agent)).fetchone()
        wallets = get_assigned_agent_wallets(w, agent, conn)
    finally:
        conn.close()

    now = datetime.now(timezone.utc)
    running_now = False
    if last and last["status"] == "running":
        hb = _parse_ts(last["last_heartbeat"]) or _parse_ts(last["created_at"])
        running_now = bool(hb and (now - hb).total_seconds() < 180)
    next_run = _parse_ts(job["next_run_at"]) if job else None
    interval = int(job["interval_seconds"]) if job else None
    scheduled = job is not None

    if kill:
        verdict = "HALTED - the kill switch is on, nothing runs."
    elif running_now:
        verdict = "RUNNING NOW."
    elif not flag:
        verdict = "OFF - switched off by the user."
    elif agent in _SCHEDULED_AGENTS and not scheduled:
        verdict = "SWITCHED ON BUT NOT SCHEDULED - it will NOT run by itself until it is started or scheduled."
    elif scheduled and next_run and next_run < now and interval and (now - next_run).total_seconds() > 2 * interval:
        verdict = "SCHEDULED BUT OVERDUE - missed runs (the server may have been asleep); it runs again as soon as the poller catches up."
    elif last and last["status"] == "failed":
        verdict = f"LAST RUN FAILED: {(last['error'] or 'unknown error')[:140]}"
    elif agent == "research":
        verdict = "READY - the Researcher runs on demand (when you ask, or when the Trader/Rebalancer consult it)."
    elif scheduled and next_run:
        verdict = f"ON AND SCHEDULED - next run {next_run.strftime('%Y-%m-%d %H:%M UTC')}."
    else:
        verdict = "ON."
    if flag and not wallets and agent in ("trader", "rebalancer"):
        verdict += " NOTE: no agent wallet is assigned to it, so it cannot hold assets or trade."

    return {
        "agent": agent, "switched_on": flag, "kill_switch": kill, "scheduled": scheduled,
        "next_run_at": next_run.isoformat() if next_run else None, "every_seconds": interval,
        "running_now": running_now,
        "last_run": ({"status": last["status"], "started": last["created_at"], "finished": last["finished_at"], "error": last["error"]} if last else None),
        "agent_wallets": wallets, "verdict": verdict,
    }


def build_chat_snapshot(wallet: str) -> str:
    """
    Authoritative one-screen snapshot injected into the chat assistant's system prompt on every turn, so it never has to
    guess (or repeat a stale 'active') about the user's agents. Facts only, straight from the database.
    """
    from database import get_user, get_open_trades, count_trades_today, get_user_research_reports, get_user_reasoning_traces

    w = normalize_wallet(wallet)
    if not w:
        return "No wallet is connected: no agent data is available. Ask the user to connect a wallet."
    try:
        user = get_user(w) or {}
        lines = [f"Connected wallet: {w} | network: {user.get('near_network', 'n/a')} | kill switch: {'ON (all agents halted)' if user.get('kill_switch') else 'off'}"]
        for agent in ("trader", "rebalancer", "research", "moderator"):
            t = get_agent_truth(w, agent)
            addrs = ", ".join(x["address"] for x in t["agent_wallets"]) or "none"
            lines.append(f"- {agent.title()}: {t['verdict']} | wallet: {addrs}")
        open_trades = get_open_trades(w)
        lines.append(
            f"Trader detail: {len(open_trades)} open position(s), {count_trades_today(w)} trade(s) today of max {user.get('trader_max_trades_per_day', 'n/a')}/day, "
            f"timeframe {user.get('trader_timeframe', 'n/a')}, min confidence {user.get('trader_min_confidence', 'n/a')}%"
        )
        traces = get_user_reasoning_traces(w, limit=1)
        if traces:
            tr = traces[0]
            lines.append(f"Trader last decision: {tr.get('symbol')} {tr.get('verdict')} ({tr.get('confidence_score')}%) at {str(tr.get('created_at'))[:16]}")
        reports = get_user_research_reports(w, limit=1)
        if reports:
            lines.append(f"Researcher last report: '{reports[0].get('title')}' at {str(reports[0].get('created_at'))[:16]}")
        lines.append(f"Limits: max per trade ${user.get('max_tx_amount', 'n/a')}, daily limit ${user.get('daily_limit', 'n/a')}")
        return "\n".join(lines)
    except Exception as e:
        logger.warning("[CHAT-SNAPSHOT] unavailable: %s", e)
        return f"Wallet {w}: live snapshot unavailable right now - call agent_suite_mcp_tool get_status before stating anything about agent state."
