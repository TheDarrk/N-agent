import asyncio
"""
Neptune AI — Inter-Agent Communication & Control Tools
Enables the Main Conversational Agent to interrogate, trigger,
and receive real-time telemetry from all 4 autonomous agents:
  1. Trader Agent
  2. Rebalancer Agent
  3. Research Agent
  4. Moderator Agent
"""

from typing import Optional
from langchain_core.tools import tool

from autonomous_agents.trader_agent import TraderAgent
from autonomous_agents.rebalancer_agent import RebalancerAgent
from autonomous_agents.research_agent import ResearchAgent
from autonomous_agents.moderator_agent import ModeratorAgent
from database import get_open_trades, get_user_trade_history

# Singleton instances
_trader = TraderAgent()
_rebalancer = RebalancerAgent()
_researcher = ResearchAgent()
_moderator = ModeratorAgent()


@tool
async def query_trader_status_tool(user_wallet: str) -> str:
    """
    Get live telemetry and status from the Trader Agent:
    open trades, entry prices, Take-Profit / Stop-Loss targets, and recent performance.
    
    Args:
        user_wallet: The user's account ID (e.g. user.near)
    """
    return await agent_suite_mcp_tool.ainvoke({"agent_name": "trader", "action": "get_status", "user_wallet": user_wallet})


@tool
async def run_trader_scan_tool(user_wallet: str, symbol: str = "NEAR", timeframe: str = "1h", min_confidence: int = 75) -> str:
    """
    Trigger the Trader Agent's multi-node pipeline right now for an asset:
    fetches indicators, runs RAG rules, evaluates LLM-as-a-Judge confidence & ROI %,
    calculates TP/SL, and submits order if confidence threshold is met.
    
    Args:
        user_wallet: The user's wallet address
        symbol: The token symbol to analyze (e.g. NEAR, BTC, ETH)
        timeframe: Candle interval ('1h', '2h', '4h', '1d')
        min_confidence: Minimum confidence score required to enter trade (default 75%)
    """
    # Starts a TRACKED background run (same as the app's Run button); never an untracked inline trade.
    import json
    return await agent_suite_mcp_tool.ainvoke({
        "agent_name": "trader", "action": "trigger_run", "user_wallet": user_wallet,
        "params_json": json.dumps({"symbol": symbol, "timeframe": timeframe, "min_confidence": min_confidence}),
    })


@tool
async def query_rebalancer_status_tool(user_wallet: str) -> str:
    """
    Check current portfolio drift and allocation status via the Rebalancer Agent.
    
    Args:
        user_wallet: The user's account ID
    """
    # Read-only: status never executes swaps.
    return await agent_suite_mcp_tool.ainvoke({"agent_name": "rebalancer", "action": "get_status", "user_wallet": user_wallet})


@tool
async def request_research_report_tool(topic: str, user_wallet: str) -> str:
    """
    Request a specialized institutional research report from the Research Agent (Free - 0 NEAR).
    
    Args:
        topic: The research subject (e.g. "NEAR Liquid Staking Yields" or "AI Agent Microstructure")
        user_wallet: The requester wallet address
    """
    import json
    return await agent_suite_mcp_tool.ainvoke({
        "agent_name": "researcher", "action": "trigger_run", "user_wallet": user_wallet,
        "params_json": json.dumps({"topic": topic}),
    })


@tool
async def trader_hire_research_tool(user_wallet: str, symbol: str = "NEAR") -> str:
    """
    Inter-Agent Alpha Collaboration:
    The Trader Agent consults the Research Agent (0 NEAR fee - Free)
    to receive an actionable second opinion and alpha signal.
    
    Args:
        user_wallet: The trader's wallet address
        symbol: The token for which alpha is requested
    """
    try:
        res = await _researcher.hire_by_trader_agent(trader_wallet=user_wallet, symbol=symbol)
        signal = res["signal"]
        return (
            f"🤝 **Agent-to-Agent Second Opinion Completed:**\n"
            f"- **Requesting Agent:** {res['from_agent']} ({user_wallet})\n"
            f"- **Consulted Agent:** {res['to_agent']} ({res['recipient']})\n"
            f"- **Fee:** {res['fee_transferred']}\n"
            f"- **Alpha Signal Returned:** {signal.get('action') if isinstance(signal, dict) else signal}\n"
            f"- **Report CID:** `{res['report_cid']}`"
        )
    except Exception as e:
        return f"Error executing agent-to-agent hire: {str(e)}"


@tool
async def query_moderator_watchdog_tool(user_wallet: str) -> str:
    """
    Get live risk metrics, aggregate exposure, and health score from the Moderator Agent.
    
    Args:
        user_wallet: The user's account ID
    """
    return await agent_suite_mcp_tool.ainvoke({"agent_name": "moderator", "action": "get_status", "user_wallet": user_wallet})


@tool
async def moderator_kill_switch_tool(user_wallet: str, activate: bool = True) -> str:
    """
    Activate or deactivate the master Kill Switch via the Moderator Watchdog.
    Activating immediately halts all agents, revokes keys, and protects funds.
    
    Args:
        user_wallet: The user's account ID
        activate: True to halt all agents, False to resume normal monitoring
    """
    try:
        if activate:
            res = await _moderator.trigger_emergency_kill_switch(user_wallet)
            return f"🚨 **KILL SWITCH ACTIVATED:** {res['message']}"
        else:
            res = await _moderator.reset_kill_switch(user_wallet)
            return f"🟢 **KILL SWITCH RESET:** {res['message']}"
    except Exception as e:
        return f"Error toggling kill switch: {str(e)}"


# ═══════════════════════════════════════════════════════════════════════════════
# MODEL CONTEXT PROTOCOL (MCP) — AGENT SUITE UNIFIED CONTROL & TELEMETRY
# ═══════════════════════════════════════════════════════════════════════════════

@tool
async def agent_suite_mcp_tool(
    agent_name: str,
    action: str,
    user_wallet: str,
    params_json: Optional[str] = None
) -> str:
    """
    Neptune Agent Suite Model Context Protocol (MCP) Unified Control Interface.
    Use this tool to inspect, configure, activate/deactivate, fetch history,
    or trigger runs for any of the 4 autonomous agents:
      - "trader": Autonomous Technical Trading Agent (scans, entries, TP/SL, limit orders)
      - "rebalancer": Spot Portfolio Rebalancing Agent (drift management, stablecoin preservation)
      - "researcher": Institutional Deep Research Agent (cited reports, alpha signals, second opinions)
      - "moderator": Watchdog Surveillance & Safety Agent (fleet audits, health score, kill switch)
      - "fleet": Entire multi-agent fleet overview

    Args:
        agent_name: Target agent ("trader", "rebalancer", "researcher", "moderator", or "fleet")
        action: Action to perform:
            - "get_status": Current state, telemetry, and settings
            - "get_history": Historical activity logs, executed trades, rebalances, or reports
            - "set_active": Activate or deactivate the agent (params_json='{"is_active": true/false}')
            - "configure": Update agent parameters (params_json with key/value settings)
            - "trigger_run": Manually trigger an on-demand scan or cycle
            - "kill_switch": Emergency stop or restore (params_json='{"activate": true/false}')
        user_wallet: The connected user account ID (e.g. user.near)
        params_json: Optional JSON string with parameters (e.g. '{"is_active": true}', '{"symbol": "NEAR"}')
    """
    import json
    from database import (
        get_user, upsert_user, get_open_trades, get_pending_trades,
        get_user_trade_history, get_rebalancer_executions_for_user, get_agent_logs
    )

    clean_agent = agent_name.lower().strip()
    clean_action = action.lower().strip()
    params = {}
    if params_json:
        try:
            params = json.loads(params_json) if isinstance(params_json, str) else params_json
        except Exception:
            params = {}

    user = get_user(user_wallet) or {}
    agent_key = {"researcher": "research", "research": "research", "watchdog": "moderator"}.get(clean_agent, clean_agent)

    # ---------------------------------------------------------------- 1. STATUS (truth, not just the on/off switch)
    if clean_action == "get_status":
        from agent_metrics import get_agent_truth, get_assigned_agent_wallets

        def _truth_block(agent: str) -> str:
            t = get_agent_truth(user_wallet, agent)
            lr = t["last_run"]
            lines = [f"- **Verdict:** {t['verdict']}"]
            lines.append(f"- **Switch:** {'on' if t['switched_on'] else 'off'} | **Scheduled:** "
                         f"{'yes, next run ' + str(t['next_run_at']) + ' (every ' + str(t['every_seconds']) + 's)' if t['scheduled'] else 'no'}")
            lines.append(f"- **Last run:** " + (f"{lr['status']} at {lr['started']}" + (f" - error: {str(lr['error'])[:120]}" if lr.get('error') else "") if lr else "never ran"))
            addrs = [x["address"] for x in t["agent_wallets"]]
            lines.append(f"- **Agent wallet:** {', '.join(addrs) if addrs else 'NONE assigned'}")
            return "\n".join(lines)

        if agent_key == "trader":
            open_trades = get_open_trades(user_wallet)
            pending_trades = get_pending_trades(user_wallet)
            from database import get_user_reasoning_traces
            traces = get_user_reasoning_traces(user_wallet, limit=3)
            last_dec = "; ".join(f"{t.get('symbol')} {t.get('verdict')} ({t.get('confidence_score')}%, {str(t.get('created_at'))[:16]})" for t in traces) or "no decisions yet"
            return (
                f"📈 **Trader Agent ({user_wallet}):**\n{_truth_block('trader')}\n"
                f"- **Settings:** timeframe {user.get('trader_timeframe', '1h')}, min confidence {user.get('trader_min_confidence', 75)}%, "
                f"coin mode {user.get('trader_coin_mode', 'auto')}, max {user.get('trader_max_trades_per_day', 3)} trades/day\n"
                f"- **Open positions:** {len(open_trades)} | **Pending limit orders:** {len(pending_trades)}\n"
                f"- **Last decisions:** {last_dec}"
            )

        if agent_key == "rebalancer":
            from database import get_active_rebalancer_strategy
            strat = get_active_rebalancer_strategy(user_wallet)
            try:
                drift = await asyncio.wait_for(_rebalancer.get_portfolio_drift_status(user_wallet), timeout=20)
            except Exception as e:
                drift = {"status": "UNAVAILABLE", "action_taken": str(e)[:100]}
            alloc = ", ".join(f"{k} {v}%" for k, v in (strat or {}).get("allocations", {}).items()) or "no active strategy"
            return (
                f"⚖️ **Rebalancer Agent ({user_wallet}):**\n{_truth_block('rebalancer')}\n"
                f"- **Active strategy:** {alloc} (regime {(strat or {}).get('market_regime', 'n/a')})\n"
                f"- **Drift:** {drift.get('max_drift_pct', 'n/a')}% vs limit {drift.get('drift_threshold_pct', user.get('rebalancer_drift_threshold', 5.0))}% - {drift.get('status')}\n"
                f"- **Portfolio value (agent wallet):** ${drift.get('total_portfolio_usd', 0)}\n"
                f"- **Telemetry note:** {drift.get('action_taken', '')}"
            )

        if agent_key == "research":
            from database import get_user_research_reports
            reps = get_user_research_reports(user_wallet, limit=3)
            last_reps = "; ".join(f"'{r.get('title')}' ({str(r.get('created_at'))[:16]})" for r in reps) or "no reports yet"
            return (
                f"🔬 **Research Agent ({user_wallet}):**\n{_truth_block('research')}\n"
                f"- **Recent reports:** {last_reps}\n"
                f"- **Sources:** your own links are crawled to depth 4; the system agent sources (Fear & Greed index, coin pages) to depth 2, "
                f"the same ones it uses when the Trader or Rebalancer consult it."
            )

        if agent_key == "moderator":
            data = await _moderator.get_watchdog_status(user_wallet)
            return (
                f"🛡️ **Watchdog ({user_wallet}):**\n{_truth_block('moderator')}\n"
                f"- **Fleet health:** {data.get('health_score') if data.get('has_evaluation') else 'not audited yet'}"
                f"{'/100' if data.get('has_evaluation') else ''} | verdict {data.get('verdict')}\n"
                f"- **Kill switch:** {'🚨 ACTIVE' if data.get('kill_switch_active') else 'off'}\n"
                f"- **Open exposure:** ${data.get('total_open_exposure_usd', 0.0)} of ${data.get('daily_limit_usd', 0)} daily cap"
            )

        # fleet overview: every agent's truthful verdict
        rows = []
        for ag, icon in (("trader", "📈"), ("rebalancer", "⚖️"), ("research", "🔬"), ("moderator", "🛡️")):
            t = get_agent_truth(user_wallet, ag)
            rows.append(f"- {icon} **{ag.title()}:** {t['verdict']}")
        return (
            f"🌐 **Neptune Agent Suite ({user_wallet}):**\n" + "\n".join(rows) + "\n"
            f"- **Kill switch:** {'🚨 ACTIVE' if user.get('kill_switch') else 'off'} | **Daily limit:** ${user.get('daily_limit', 'n/a')} | **Max per trade:** ${user.get('max_tx_amount', 'n/a')}"
        )

    # ---------------------------------------------------------------- 2. HISTORY
    if clean_action == "get_history":
        limit = int(params.get("limit", 5))
        if agent_key == "trader":
            trades = get_user_trade_history(user_wallet, limit=limit)
            pending = get_pending_trades(user_wallet)
            from database import get_user_reasoning_traces
            traces = get_user_reasoning_traces(user_wallet, limit=limit)
            msg = f"📜 **Trader History ({user_wallet}):**\n"
            if pending:
                msg += f"⏳ **Pending limit orders ({len(pending)}):**\n"
                for p_ in pending[:3]:
                    msg += f"- {p_.get('action')} {p_.get('symbol')} @ ${p_.get('entry_price')} [TP ${p_.get('tp_price')} | SL ${p_.get('sl_price')}]\n"
            msg += f"🧠 **Last decisions ({len(traces)}):**\n" + ("".join(f"- {str(t.get('created_at'))[:16]} {t.get('symbol')} {t.get('verdict')} ({t.get('confidence_score')}%)\n" for t in traces) or "none yet\n")
            if trades:
                msg += f"✅ **Recent trades ({len(trades)}):**\n"
                for t in trades[:limit]:
                    msg += f"- {t.get('action')} {t.get('symbol')} ({t.get('status')}) @ ${t.get('entry_price_usd', t.get('entry_price', 0))}\n"
            else:
                msg += "No trades recorded yet."
            return msg

        if agent_key == "rebalancer":
            from database import get_rebalancer_strategy_history
            execs = get_rebalancer_executions_for_user(user_wallet, limit=limit)
            strategies = get_rebalancer_strategy_history(user_wallet, limit=limit)
            msg = f"📜 **Rebalancer History ({user_wallet}):**\n🗂️ **Strategies ({len(strategies)}):**\n"
            msg += "".join(f"- #{x.get('id')} {x.get('status')} {x.get('market_regime')} {x.get('allocations')} ({str(x.get('created_at'))[:16]})\n" for x in strategies) or "none yet\n"
            msg += "🔁 **Swaps:**\n" + ("".join(f"- [{str(e.get('created_at', ''))[:16]}] {e.get('token_in')} -> {e.get('token_out')} ${e.get('amount_in_usd')} {e.get('terminal_status') or e.get('state')}\n" for e in execs) or "none yet")
            return msg

        if agent_key == "research":
            from database import get_user_research_reports
            reps = get_user_research_reports(user_wallet, limit=limit)
            msg = f"📜 **Research Reports ({user_wallet}):**\n"
            msg += "".join(f"- {str(r.get('created_at'))[:16]} '{r.get('title')}' (ID {r.get('cid')}): {str(r.get('executive_summary') or '')[:160]}\n" for r in reps) or "No reports yet."
            return msg

        logs = get_agent_logs(user_wallet, limit=limit, agent_name=agent_key if agent_key not in ("fleet", "all") else None)
        msg = f"📜 **Agent Suite Audit Trail ({user_wallet}):**\n"
        msg += "".join(f"- [{str(l.get('agent_name')).upper()}] {l.get('action_taken')} ({str(l.get('created_at', ''))[:16]})\n" for l in logs[:limit]) or "No audit events recorded yet."
        return msg

    # ---------------------------------------------------------------- 3. SET ACTIVE (switch AND schedule, so "on" really runs)
    if clean_action == "set_active":
        from database import upsert_scheduled_job, disable_job
        is_active = params.get("is_active", True)
        if isinstance(is_active, str):
            is_active = is_active.lower() in ("true", "1", "yes", "on")
        targets = ["trader", "rebalancer", "research", "moderator"] if agent_key in ("all", "fleet") else [agent_key]
        flag = {"trader": "trader_active", "rebalancer": "rebalancer_active", "research": "research_active", "moderator": "moderator_active"}
        schedule = {"trader": ("trade_poll", 3600), "rebalancer": ("rebalance_cadence", 7 * 86400), "moderator": ("fleet_deliberation", 300)}
        settings = {flag[t]: 1 if is_active else 0 for t in targets if t in flag}
        if is_active and "kill_switch" in user and user.get("kill_switch"):
            settings["kill_switch"] = 0
        upsert_user(user_wallet, settings)
        notes = []
        for t in targets:
            if t not in schedule:
                continue
            purpose, interval = schedule[t]
            job_id = f"{user_wallet.strip().lower()}:{t}:{purpose}"
            if is_active:
                upsert_scheduled_job(wallet=user_wallet, agent_type=t, purpose=purpose, interval_seconds=interval, config={}, enabled=1, job_id=job_id)
                notes.append(f"{t} scheduled every {interval // 3600 if interval >= 3600 else interval // 60}{'h' if interval >= 3600 else 'min'}")
            else:
                disable_job(job_id)
        word = "ACTIVATED 🟢" if is_active else "DEACTIVATED ⚪"
        extra = f" ({'; '.join(notes)})" if notes else ""
        return (f"✅ {agent_key.upper()} {word} for `{user_wallet}`{extra}. "
                "Call get_status to confirm what it will really do (a wallet must also be assigned for Trader/Rebalancer to trade).")

    # ---------------------------------------------------------------- 4. CONFIGURE
    if clean_action == "configure":
        settings = {}
        mapping = {
            "timeframe": ("trader_timeframe", str), "min_confidence": ("trader_min_confidence", int),
            "risk_profile": ("trader_risk_profile", str), "coin_mode": ("trader_coin_mode", str),
            "custom_coins": ("trader_custom_coins", str), "max_trades_per_day": ("trader_max_trades_per_day", int),
            "enable_researcher": ("trader_enable_researcher", lambda v: 1 if str(v).lower() in ("1", "true", "yes", "on") else 0),
            "target_stables": ("rebalancer_target_stables", float), "target_near": ("rebalancer_target_near", float),
            "drift_threshold": ("rebalancer_drift_threshold", float), "notification_email": ("notification_email", str),
            "max_tx_amount": ("max_tx_amount", float), "daily_limit": ("daily_limit", float),
        }
        for key, (col, cast) in mapping.items():
            if key in params:
                try:
                    settings[col] = cast(params[key])
                except Exception:
                    return f"⚠️ Invalid value for `{key}`: {params[key]!r}"
        applied = list(settings.keys())
        if settings:
            upsert_user(user_wallet, settings)
        if "moderator_frequency" in params:
            from database import update_moderator_frequency
            update_moderator_frequency(user_wallet, str(params["moderator_frequency"]))
            applied.append("moderator_frequency")
        if "kill_threshold" in params:
            from database import update_moderator_kill_threshold
            update_moderator_kill_threshold(user_wallet, float(params["kill_threshold"]))
            applied.append("kill_threshold")
        if not applied:
            return ("⚠️ No valid settings found. Valid keys: " + ", ".join(list(mapping.keys()) + ["moderator_frequency", "kill_threshold"]))
        return f"✅ Configuration applied for {agent_key.upper()} ({user_wallet}): `{', '.join(applied)}`. Call get_status to verify."

    # ---------------------------------------------------------------- 5. TRIGGER RUN (a tracked background run, same as the app's Run button)
    if clean_action == "trigger_run":
        import os
        import httpx
        route = {"trader": "trader", "rebalancer": "rebalancer", "research": "research", "moderator": "moderator"}.get(agent_key)
        if not route:
            return f"Unknown agent name '{agent_name}' for trigger_run."
        base = f"http://127.0.0.1:{os.getenv('PORT', '8000')}/api/{route}/start"
        if route == "trader":
            payload = {"user_wallet": user_wallet, "symbol": params.get("symbol"), "coin_mode": params.get("coin_mode") or user.get("trader_coin_mode") or "auto",
                       "timeframe": params.get("timeframe") or user.get("trader_timeframe") or "1h",
                       "min_confidence": int(params.get("min_confidence") or user.get("trader_min_confidence") or 75),
                       "custom_coins": params.get("custom_coins") or user.get("trader_custom_coins") or "",
                       "enable_researcher_plugin": bool(user.get("trader_enable_researcher", 0))}
        elif route == "rebalancer":
            from database import get_active_rebalancer_strategy
            strat = get_active_rebalancer_strategy(user_wallet) or {}
            payload = {"user_wallet": user_wallet, "selected_coins": params.get("selected_coins") or strat.get("selected_coins") or ["USDT", "NEAR"],
                       "user_expectation": params.get("user_expectation") or strat.get("user_expectation_text") or "Keep my allocation healthy",
                       "cadence_days": int(params.get("cadence_days") or strat.get("cadence_days") or 7),
                       "min_stable_pct": float(params.get("min_stable_pct") or strat.get("min_stable_pct") or 10.0),
                       "drift_threshold_pct": float(user.get("rebalancer_drift_threshold") or 5.0)}
        elif route == "research":
            from database import get_agent_ui_config
            cfg = get_agent_ui_config(user_wallet, "research")
            links = [l.strip() for l in str(params.get("links") or cfg.get("linksInput") or "").splitlines() if l.strip().startswith("http")]
            payload = {"user_wallet": user_wallet, "topic": params.get("topic") or cfg.get("topic") or "NEAR DeFi opportunities",
                       "user_expectations": params.get("user_expectations") or cfg.get("userExpectations") or "", "links": links,
                       "date_range": params.get("date_range") or cfg.get("dateRange") or "1_month"}
        else:
            payload = {"user_wallet": user_wallet}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                resp = await client.post(base, json=payload)
            data = resp.json()
            if resp.status_code != 200:
                return f"⚠️ Could not start the {agent_key} run: {data.get('detail') or data}"
            reused = " (it was already running, so I reused that run)" if data.get("reused") else ""
            return (f"⚡ **{agent_key.title()} run started**{reused} - run id `{data.get('run_id')}`. It runs in the background; "
                    f"open the {agent_key.title()} tab to watch the steps, or ask me for its status/history in a minute.")
        except Exception as e:
            return f"⚠️ Could not start the {agent_key} run right now: {str(e)[:160]}"

    # ---------------------------------------------------------------- 6. KILL SWITCH
    if clean_action == "kill_switch":
        activate = params.get("activate", True)
        if isinstance(activate, str):
            activate = activate.lower() in ("true", "1", "yes", "on")
        if activate:
            res = await _moderator.trigger_emergency_kill_switch(user_wallet)
            return f"🚨 **KILL SWITCH ACTIVATED:** {res['message']}"
        res = await _moderator.reset_kill_switch(user_wallet)
        return f"🟢 **KILL SWITCH RESET:** {res['message']}"

    return f"⚠️ Unknown action '{action}' for agent '{agent_name}'. Valid actions: get_status, get_history, set_active, configure, trigger_run, kill_switch."


@tool
async def fetch_agent_history_tool(agent_name: str, user_wallet: str, limit: int = 10) -> str:
    """
    Fetch activity history, executed trades, limit orders, or audit logs for a specific agent.
    
    Args:
        agent_name: "trader", "rebalancer", "researcher", or "moderator"
        user_wallet: Connected account address
        limit: Number of records to return (default 10)
    """
    return await agent_suite_mcp_tool.ainvoke({
        "agent_name": agent_name,
        "action": "get_history",
        "user_wallet": user_wallet,
        "params_json": f'{{"limit": {limit}}}'
    })


@tool
async def configure_agent_tool(
    agent_name: str,
    user_wallet: str,
    is_active: Optional[bool] = None,
    settings_json: Optional[str] = None
) -> str:
    """
    Configure and toggle active/inactive states for any autonomous agent in the suite.
    
    Args:
        agent_name: "trader", "rebalancer", "researcher", "moderator", or "fleet"
        user_wallet: Connected account address
        is_active: Set True to activate, False to deactivate
        settings_json: JSON string with parameters to update (e.g. '{"timeframe": "4h", "min_confidence": 80}')
    """
    import json
    merged = {}
    if settings_json:
        try:
            merged = json.loads(settings_json)
        except Exception:
            pass
    if is_active is not None:
        merged["is_active"] = is_active
        return await agent_suite_mcp_tool.ainvoke({
            "agent_name": agent_name,
            "action": "set_active",
            "user_wallet": user_wallet,
            "params_json": json.dumps(merged)
        })
    else:
        return await agent_suite_mcp_tool.ainvoke({
            "agent_name": agent_name,
            "action": "configure",
            "user_wallet": user_wallet,
            "params_json": json.dumps(merged)
        })


AGENT_MARKET_TOOLS = [
    agent_suite_mcp_tool,
    fetch_agent_history_tool,
    configure_agent_tool,
    query_trader_status_tool,
    run_trader_scan_tool,
    query_rebalancer_status_tool,
    request_research_report_tool,
    trader_hire_research_tool,
    query_moderator_watchdog_tool,
    moderator_kill_switch_tool,
]
