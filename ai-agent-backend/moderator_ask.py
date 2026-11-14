"""
Neptune AI - "Ask the Moderator" (dashboard).

One CONTEXT NODE per dashboard section. Each node reads that section's real data (database + live market) so the
Moderator is fed exactly what the user is looking at, then the Moderator LLM answers ONLY from that context.
If the LLM is unreachable, a deterministic answer is built from the same context (never an error, never invented facts).

Sections:  overview | profit | risk | change | trader | drift | rebalancer | research | market | wallets |
           marketplace | activity | history
"""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from database.connection import normalize_wallet

logger = logging.getLogger("neptune.moderator_ask")

SECTION_NODES: Dict[str, List[str]] = {
    "overview":    ["fleet", "risk", "trader", "rebalancer", "research", "moderator", "activity"],
    "profit":      ["fleet", "trader", "risk", "market"],
    "risk":        ["fleet", "risk", "trader", "rebalancer", "moderator"],
    "change":      ["fleet", "risk", "trader", "rebalancer", "research", "moderator", "activity"],
    "trader":      ["fleet", "trader", "risk", "market", "wallets"],
    "drift":       ["fleet", "rebalancer", "wallets", "risk"],
    "rebalancer":  ["fleet", "rebalancer", "wallets", "risk", "market"],
    "research":    ["fleet", "research"],
    "market":      ["fleet", "market", "trader", "rebalancer"],
    "wallets":     ["fleet", "wallets", "risk"],
    "marketplace": ["fleet", "marketplace", "wallets"],
    "activity":    ["fleet", "activity", "history"],
    "history":     ["fleet", "history", "activity", "trader", "rebalancer", "research", "moderator"],
}

MAX_STR = 400


def _clip(v: Any, n: int = MAX_STR) -> Any:
    if isinstance(v, str):
        return v if len(v) <= n else v[:n] + "..."
    return v


def _trim(obj: Any, depth: int = 0) -> Any:
    """Keep the prompt bounded without dropping fields: clip long strings, cap list length."""
    if isinstance(obj, dict):
        return {k: _trim(v, depth + 1) for k, v in obj.items() if k not in ("chart_image", "ascii_chart", "data_uri", "full_report", "trace_payload")}
    if isinstance(obj, list):
        return [_trim(v, depth + 1) for v in obj[:12]]
    return _clip(obj)


# ─────────────────────────────────────────────────────────────────────────────
# CONTEXT NODES (each returns plain JSON-able data; each is isolated so one failure never blocks the answer)
# ─────────────────────────────────────────────────────────────────────────────

async def node_fleet(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    """Status of every agent as the system truly sees it (active flags, schedule, last activity)."""
    from database import get_fleet_activity, list_enabled_jobs

    fleet = await asyncio.to_thread(get_fleet_activity, w)
    jobs = await asyncio.to_thread(list_enabled_jobs)
    mine = [j for j in jobs if normalize_wallet(j.get("wallet")) == w]
    schedule = {j["agent_type"]: {"next_run_at": j["next_run_at"], "every_seconds": j["interval_seconds"]} for j in mine}
    agents = {}
    for key, a in (fleet.get("agents") or {}).items():
        agents[key] = {
            "flag_active": a.get("is_active"), "status": a.get("status"),
            "scheduled": key in schedule, "schedule": schedule.get(key),
            **{k: v for k, v in a.items() if k in (
                "open_trades", "total_trades", "take_profit_hits", "today_trades", "max_trades_day", "timeframe", "min_confidence",
                "coin_mode", "decisions_count", "last_decision", "strategies_count", "executions_count", "executions_success",
                "last_strategy", "reports_generated", "latest_report", "health_score", "audits_count", "last_verdict", "last_audit_at",
                "drift_threshold", "target_allocation", "dropped_trades_count")},
        }
    return {
        "network": fleet.get("near_network"), "kill_switch_active": fleet.get("kill_switch_active"),
        "agents": agents,
        "note": "flag_active=true only means the user switched the agent on; scheduled/next_run_at and last_* show whether it really ran.",
    }


async def node_risk(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import get_user, get_open_trades, count_trades_today

    user = await asyncio.to_thread(get_user, w) or {}
    open_trades = await asyncio.to_thread(get_open_trades, w)
    exposure = sum(float(t.get("position_size_usd") or 0) for t in open_trades)
    today = await asyncio.to_thread(count_trades_today, w)
    return {
        "kill_switch": bool(user.get("kill_switch")), "autonomy_level": user.get("autonomy_level"),
        "max_tx_usd": user.get("max_tx_amount"), "daily_limit_usd": user.get("daily_limit"),
        "open_exposure_usd": round(exposure, 2), "open_positions": len(open_trades),
        "trades_today": today, "max_trades_per_day": user.get("trader_max_trades_per_day"),
        "moderator_kill_threshold": user.get("moderator_kill_threshold"),
        "cross_chain_allowed": bool(user.get("allow_cross_chain_trades")),
    }


async def node_trader(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import get_user, get_open_trades, get_user_trade_history, get_dropped_trades, get_user_reasoning_traces

    user = await asyncio.to_thread(get_user, w) or {}
    open_trades = await asyncio.to_thread(get_open_trades, w)
    history = await asyncio.to_thread(get_user_trade_history, w, 10)
    dropped = await asyncio.to_thread(get_dropped_trades, w, 5)
    traces = await asyncio.to_thread(get_user_reasoning_traces, w, 10)

    def trade(t):
        return {k: t.get(k) for k in ("symbol", "direction", "status", "entry_price_usd", "current_price_usd", "take_profit_usd",
                                      "stop_loss_usd", "confidence_score", "position_size_usd", "expected_roi_pct", "created_at", "closed_at", "drop_reason")}

    decisions = []
    for tr in traces:
        p = tr.get("trace_payload") or {}
        decisions.append({
            "symbol": tr.get("symbol"), "verdict": tr.get("verdict"), "confidence": tr.get("confidence_score"),
            "at": tr.get("created_at"), "stage": p.get("stage"), "halt_cause": _clip(p.get("halt_cause"), 240),
            "reasoning": _clip(p.get("reasoning"), 300), "entry": p.get("entry_price"), "tp": p.get("take_profit_price"),
            "sl": p.get("stop_loss_price"), "timeframe": p.get("timeframe"),
        })
    return {
        "settings": {
            "active_flag": bool(user.get("trader_active")), "timeframe": user.get("trader_timeframe"),
            "min_confidence": user.get("trader_min_confidence"), "coin_mode": user.get("trader_coin_mode"),
            "custom_coins": user.get("trader_custom_coins"), "researcher_enabled": bool(user.get("trader_enable_researcher")),
            "max_trades_per_day": user.get("trader_max_trades_per_day"), "max_trades_per_week": user.get("trader_max_trades_per_week"),
            "min_risk_reward": user.get("trader_min_risk_reward"),
        },
        "open_positions": [trade(t) for t in open_trades[:10]],
        "recent_trades": [trade(t) for t in history[:10]],
        "dropped_trades": [trade(t) for t in (dropped or [])[:5]],
        "last_10_decisions": decisions,
    }


async def node_rebalancer(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import get_user, get_active_rebalancer_strategy, get_rebalancer_strategy_history, get_rebalancer_executions_for_user
    from autonomous_agents.rebalancer_agent import RebalancerAgent

    user = await asyncio.to_thread(get_user, w) or {}
    strat = await asyncio.to_thread(get_active_rebalancer_strategy, w)
    hist = await asyncio.to_thread(get_rebalancer_strategy_history, w, 5)
    execs = await asyncio.to_thread(get_rebalancer_executions_for_user, w, 5)
    try:
        drift = await asyncio.wait_for(RebalancerAgent().get_portfolio_drift_status(w), timeout=20)
        drift = {k: drift.get(k) for k in ("status", "max_drift_pct", "drift_threshold_pct", "current_allocation", "target_allocation",
                                           "total_portfolio_usd", "action_taken", "agent_wallet", "wallet_required", "unpriced_tokens")}
    except Exception as e:
        drift = {"status": "UNAVAILABLE", "reason": str(e)[:160]}
    return {
        "settings": {"active_flag": bool(user.get("rebalancer_active")), "drift_threshold_pct": user.get("rebalancer_drift_threshold"),
                     "min_stable_pct": user.get("min_stable_pct")},
        "drift_telemetry": drift,
        "active_strategy": ({k: strat.get(k) for k in ("id", "market_regime", "allocations", "cadence_days", "min_stable_pct", "created_at", "overall_strategy_text")}
                            if strat else None),
        "previous_strategies": [{k: h.get(k) for k in ("id", "status", "market_regime", "allocations", "created_at", "drop_reason")} for h in (hist or [])[:5]],
        "recent_swaps": [{k: e.get(k) for k in ("token_in", "token_out", "amount_in_usd", "state", "terminal_status", "refund_reason", "error_message", "created_at")}
                         for e in (execs or [])[:5]],
    }


async def node_research(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import get_user_research_reports, get_agent_ui_config, list_runs

    reports = await asyncio.to_thread(get_user_research_reports, w, 3)
    cfg = await asyncio.to_thread(get_agent_ui_config, w, "research")
    runs = await asyncio.to_thread(list_runs, w, "research", 3)
    out_reports = []
    for r in reports:
        full = r.get("full_report") or {}
        sig = (full.get("signals") or [{}])[0] if isinstance(full.get("signals"), list) and full.get("signals") else {}
        out_reports.append({
            "title": r.get("title"), "at": r.get("created_at"), "summary": _clip(r.get("executive_summary"), 500),
            "key_findings": [_clip(x, 200) for x in (full.get("key_findings") or [])[:5]],
            "signal": sig.get("direction") or sig.get("action"), "confidence": sig.get("confidence"),
            "sources_count": len(full.get("sources_cited") or []), "risk_factors": _clip(full.get("risk_factors"), 300),
        })
    return {
        "recent_reports": out_reports,
        "configured_topic": cfg.get("topic"), "configured_links": _clip(cfg.get("linksInput"), 300),
        "recent_runs": [{"status": r.get("status"), "at": r.get("created_at"), "error": _clip(r.get("error"), 200)} for r in runs],
    }


async def node_moderator(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from autonomous_agents.moderator_agent import ModeratorAgent

    st = await ModeratorAgent().get_watchdog_status(w)
    keys = ("has_evaluation", "verdict", "total_mean_score", "trader_score", "rebalancer_score", "research_score", "killed_agents",
            "key_findings", "recommended_tuning", "verdict_rationale", "is_due", "last_run_at", "next_run_due_at", "moderator_frequency",
            "report_created_at", "cross_agent_conflicts")
    out = {k: st.get(k) for k in keys if k in st}
    out["audit_history"] = [{"verdict": h.get("verdict"), "score": h.get("total_mean_score"), "at": h.get("created_at")} for h in (st.get("history") or [])[:5]]
    return out


async def node_activity(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import get_agent_logs

    logs = await asyncio.to_thread(get_agent_logs, w, 20)
    return {"last_20_agent_actions": [{"agent": l.get("agent_name"), "trigger": l.get("trigger_type"), "action": l.get("action_taken"),
                                       "status": l.get("status"), "at": l.get("created_at"), "why": _clip(l.get("reasoning_text"), 220)} for l in logs]}


async def node_history(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from database import list_runs

    out: Dict[str, Any] = {}
    for agent in ("trader", "rebalancer", "research", "moderator"):
        runs = await asyncio.to_thread(list_runs, w, agent, 5)
        out[agent] = [{"status": r.get("status"), "title": r.get("title"), "at": r.get("created_at"), "finished": r.get("finished_at"),
                       "error": _clip(r.get("error"), 160)} for r in runs]
    return {"recent_runs_per_agent": out}


async def node_wallets(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from agent_metrics import get_assigned_agent_wallets
    from database import get_user_agent_wallet_config

    cfg = await asyncio.to_thread(get_user_agent_wallet_config, w)
    pool = [{"id": x.get("id"), "address": x.get("agent_wallet_address"), "label": x.get("label"), "chain": x.get("chain_type"),
             "status": x.get("status"), "assigned_to": x.get("assigned_agents")} for x in cfg.get("wallets", [])]
    assigned = {}
    for agent in ("trader", "rebalancer", "research", "moderator"):
        assigned[agent] = [a["address"] for a in await asyncio.to_thread(get_assigned_agent_wallets, w, agent)]
    return {"main_wallet": w, "agent_wallet_pool": pool, "assigned_by_agent": assigned,
            "note": "An agent with an empty assigned list has no wallet and cannot hold assets or trade."}


async def node_market(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    """Live market: prices for what the user is looking at / what the agents hold, plus market-wide sentiment."""
    from market_data import get_token_prices

    symbols = [str(s).upper() for s in (client.get("symbols") or [])][:8]
    selected = str(client.get("selected_symbol") or "").upper()
    if selected and selected not in symbols:
        symbols.insert(0, selected)
    if not symbols:
        symbols = ["NEAR", "BTC", "ETH"]
    out: Dict[str, Any] = {"chart_view": {"selected_symbol": selected or None, "interval": client.get("interval"), "range": client.get("range")}}
    try:
        prices = await asyncio.wait_for(get_token_prices([s.lower() for s in symbols]), timeout=10)
        out["live_prices_usd"] = {k: v for k, v in (prices or {}).items() if k.upper() in symbols}
    except Exception as e:
        out["live_prices_usd"] = {"error": f"price feed unavailable: {str(e)[:100]}"}

    def _sentiment():
        from market_sentiment import get_crypto_fear_and_greed_index, get_token_market_sentiment
        d = {"fear_greed": get_crypto_fear_and_greed_index(), "coins": {}}
        for s in symbols[:4]:
            try:
                d["coins"][s] = get_token_market_sentiment(s)
            except Exception:
                pass
        return d

    try:
        out["sentiment"] = await asyncio.wait_for(asyncio.to_thread(_sentiment), timeout=12)
    except Exception as e:
        out["sentiment"] = {"error": f"sentiment unavailable: {str(e)[:100]}"}
    return out


async def node_marketplace(w: str, client: Dict[str, Any]) -> Dict[str, Any]:
    from marketplace_service import get_marketplace_listings, list_buyer_orders
    from agent_metrics import get_listing_analytics

    mine = await asyncio.to_thread(get_marketplace_listings, None, "newest", 20, 0, w)
    listings = []
    for l in mine[:5]:
        a = await asyncio.to_thread(get_listing_analytics, l["listing_id"])
        listings.append({"title": l.get("title"), "agent": l.get("agent_type"), "price_usdt": l.get("price_usdt"), "sales": l.get("sales_count"),
                         "can_edit": l.get("can_edit"), "metrics": (a or {}).get("metrics")})
    orders = await asyncio.to_thread(list_buyer_orders, w)
    return {"my_listings": listings,
            "my_purchases": [{"title": o.get("title"), "agent": o.get("agent_type"), "status": o.get("status"), "applied": o.get("apply_status"),
                              "amount_usdt": o.get("amount_usdt")} for o in orders[:8]]}


NODES: Dict[str, Callable[[str, Dict[str, Any]], Awaitable[Dict[str, Any]]]] = {
    "fleet": node_fleet, "risk": node_risk, "trader": node_trader, "rebalancer": node_rebalancer, "research": node_research,
    "moderator": node_moderator, "activity": node_activity, "history": node_history, "wallets": node_wallets,
    "market": node_market, "marketplace": node_marketplace,
}


async def build_context(section: str, wallet: str, client: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Run the section's nodes in parallel; a failing node is reported as unavailable instead of failing the answer."""
    w = normalize_wallet(wallet)
    client = client or {}
    names = SECTION_NODES.get(section, SECTION_NODES["overview"])
    t0 = time.monotonic()

    async def run(name: str):
        try:
            return name, await asyncio.wait_for(NODES[name](w, client), timeout=25)
        except Exception as e:
            logger.warning("[ASK-MODERATOR] node %s failed: %s", name, e)
            return name, {"unavailable": True, "reason": str(e)[:160]}

    results = await asyncio.gather(*(run(n) for n in names))
    ctx = {name: _trim(data) for name, data in results}
    logger.info("[ASK-MODERATOR] section=%s nodes=%s built in %.1fs", section, names, time.monotonic() - t0)
    return {"section": section, "wallet": w, "as_of_utc": datetime.now(timezone.utc).isoformat(), "dashboard_view": _trim(client), "context": ctx}


# ─────────────────────────────────────────────────────────────────────────────
# Answering
# ─────────────────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are the Neptune Moderator, the user's watchdog over their AI agents (Trader, Rebalancer, Researcher).
You are answering a question asked from one section of the user's dashboard. You are given CONTEXT built from the user's real data
(database + live market) for exactly that section.

RULES
- Answer ONLY from the context. If something is missing or marked unavailable, say it is not available - never guess or invent numbers.
- An agent is truly working only if the context shows it ran (recent decisions/strategies/runs/schedule). "flag_active" alone means the
  user switched it on; if there is no schedule or no recent activity, say so plainly.
- Use plain language a non-expert understands, quote concrete numbers from the context, and name the agent you are talking about.
- Keep it short: a direct answer, then what matters most. Finish with practical next steps the user can do in the app.

Return ONLY JSON: {"answer": "2-5 sentences", "highlights": ["short fact with number", "..."], "next_steps": ["action", "..."]}"""


def _fallback_answer(section: str, bundle: Dict[str, Any], question: str) -> Dict[str, Any]:
    """Deterministic answer from the same context when the LLM is unreachable."""
    ctx = bundle.get("context", {})
    hl: List[str] = []
    steps: List[str] = []
    fleet = ctx.get("fleet", {})
    for key, a in (fleet.get("agents") or {}).items():
        if a.get("flag_active") and not a.get("scheduled") and key in ("trader", "rebalancer"):
            hl.append(f"{key.title()} is switched on but has no schedule, so nothing will run automatically.")
            steps.append(f"Open the {key.title()} and press Save and Run to schedule it.")
    tr = ctx.get("trader", {})
    if tr:
        hl.append(f"Trader: {len(tr.get('open_positions', []))} open position(s), {len(tr.get('last_10_decisions', []))} recent decision(s).")
    rb = ctx.get("rebalancer", {})
    d = rb.get("drift_telemetry", {}) if rb else {}
    if d.get("status") == "NO_WALLET":
        hl.append("The Rebalancer has no wallet assigned, so its drift cannot be measured.")
        steps.append("Assign an agent wallet to the Rebalancer.")
    elif d.get("max_drift_pct") is not None:
        hl.append(f"Rebalancer drift is {d['max_drift_pct']}% against a {d.get('drift_threshold_pct')}% limit ({d.get('status')}).")
    rs = ctx.get("research", {})
    if rs:
        hl.append(f"Researcher: {len(rs.get('recent_reports', []))} recent report(s).")
    risk = ctx.get("risk", {})
    if risk:
        hl.append(f"Risk: ${risk.get('open_exposure_usd', 0)} open exposure, kill switch {'ON' if risk.get('kill_switch') else 'off'}.")
    answer = "The AI explanation is unavailable right now, so here are the facts from your live data: " + (" ".join(hl[:3]) if hl else "no data recorded yet for this section.")
    return {"answer": answer, "highlights": hl[:6], "next_steps": steps[:4]}


async def ask_moderator(wallet: str, section: str, question: str, client: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    section = section if section in SECTION_NODES else "overview"
    bundle = await build_context(section, wallet, client)
    q = (question or "").strip() or {
        "overview": "Give me the big picture of how my agents are doing.", "profit": "How am I doing on profit?",
        "risk": "Is my risk too high?", "change": "What should I change?", "drift": "Explain my portfolio drift.",
        "research": "What did research find?", "market": "What is the market telling me right now?",
    }.get(section, f"Explain the {section} section for me.")
    user_prompt = f"QUESTION: {q}\n\nCONTEXT (real data, section={section}):\n{json.dumps(bundle, indent=2, default=str)[:24000]}"
    source = "moderator"
    try:
        from autonomous_agents.moderator_nodes import call_judge_llm
        result = await asyncio.wait_for(call_judge_llm(SYSTEM_PROMPT, user_prompt, max_tokens=1200, temperature=0.2), timeout=90)
        out = {"answer": str(result.get("answer") or "").strip(), "highlights": list(result.get("highlights") or [])[:8],
               "next_steps": list(result.get("next_steps") or [])[:6]}
        if not out["answer"]:
            raise ValueError("empty answer")
    except Exception as e:
        logger.warning("[ASK-MODERATOR] LLM unavailable (%s); using deterministic answer", e)
        out = _fallback_answer(section, bundle, q)
        source = "data-only"
    return {**out, "section": section, "question": q, "source": source, "nodes_used": SECTION_NODES[section], "as_of_utc": bundle["as_of_utc"]}
