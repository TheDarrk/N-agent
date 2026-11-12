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
    try:
        open_trades = get_open_trades(user_wallet)
        history = get_user_trade_history(user_wallet, limit=5)

        msg = f"📈 **Trader Agent Status for {user_wallet}:**\n\n"
        if open_trades:
            msg += f"🔥 **Active Positions ({len(open_trades)}):**\n"
            for t in open_trades:
                msg += (
                    f"- **{t['action']} {t['symbol']}** | Entry: ${t['entry_price']} | "
                    f"🎯 TP: ${t['tp_price']} | 🛑 SL: ${t['sl_price']} | "
                    f"Confidence: {t['confidence_score']}% | Expected ROI: +{t['expected_roi_pct']}%\n"
                )
        else:
            msg += "• No open positions currently active. Agent is scanning the market on schedule.\n"

        if history:
            msg += f"\n📜 **Recent Completed Trades:**\n"
            for h in history[:3]:
                msg += f"- {h['action']} {h['symbol']} ({h['status']}) @ ${h['current_price']} [Confidence: {h['confidence_score']}%]\n"

        return msg
    except Exception as e:
        return f"Error retrieving Trader Agent status: {str(e)}"


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
    try:
        result = await _trader.run_pipeline(
            user_wallet=user_wallet,
            symbol=symbol,
            force_timeframe=timeframe,
            force_min_confidence=min_confidence
        )

        if result.get("success"):
            return (
                f"✅ **Trader Agent Executed Trade:**\n"
                f"- **Pair:** {result['symbol']}\n"
                f"- **Action:** {result['action']}\n"
                f"- **Entry Price:** ${result['entry_price']}\n"
                f"- **Take Profit:** ${result['take_profit_price']}\n"
                f"- **Stop Loss:** ${result['stop_loss_price']}\n"
                f"- **Judge Confidence:** {result['confidence_score']}% (Threshold: {min_confidence}%)\n"
                f"- **Projected ROI:** +{result['expected_roi_pct']}%\n"
                f"- **Pattern:** {result.get('pattern')}\n"
                f"- **Reasoning:** {result.get('reasoning')}\n"
                f"- **Trace CID:** `{result.get('cid')}`"
            )
        else:
            return (
                f"ℹ️ **Trader Agent Evaluated {symbol} (No Trade Placed):**\n"
                f"- **Status:** {result.get('status')}\n"
                f"- **Judge Confidence:** {result.get('confidence_score', 0)}% (Required: {min_confidence}%)\n"
                f"- **Reasoning:** {result.get('reasoning', result.get('message'))}"
            )
    except Exception as e:
        return f"Error executing Trader Agent scan: {str(e)}"


@tool
async def query_rebalancer_status_tool(user_wallet: str) -> str:
    """
    Check current portfolio drift and allocation status via the Rebalancer Agent.
    
    Args:
        user_wallet: The user's account ID
    """
    try:
        status = await _rebalancer.evaluate_and_rebalance(user_wallet=user_wallet)
        msg = (
            f"⚖️ **Rebalancer Agent Status:**\n"
            f"- **Status:** {status['status']}\n"
            f"- **Portfolio Value:** ${status['total_portfolio_usd']}\n"
            f"- **Current Allocations:** {status['current_allocation']}\n"
            f"- **Target Allocations:** {status['target_allocation']}\n"
            f"- **Max Drift:** {status['max_drift_pct']}% (Threshold: {status['drift_threshold_pct']}%)\n"
            f"- **Action:** {status['action_taken']}"
        )
        return msg
    except Exception as e:
        return f"Error checking Rebalancer: {str(e)}"


@tool
async def request_research_report_tool(topic: str, user_wallet: str) -> str:
    """
    Request a specialized institutional research report from the Research Agent (0.1 NEAR fee).
    
    Args:
        topic: The research subject (e.g. "NEAR Liquid Staking Yields" or "AI Agent Microstructure")
        user_wallet: The requester wallet address
    """
    try:
        report = await _researcher.generate_research_report(topic=topic, requester=user_wallet)
        signal = report.get("actionable_signal", {})
        return (
            f"🔬 **Institutional Research Report Generated:**\n\n"
            f"**Title:** {report.get('title')}\n"
            f"**Market Regime:** {report.get('regime')}\n"
            f"**Actionable Signal:** {signal.get('action')} {signal.get('target_asset')} (Confidence: {signal.get('confidence')}%)\n"
            f"**Summary:** {report.get('summary')}\n"
            f"**Key Catalysts:** {', '.join(report.get('key_catalysts', []))}\n"
            f"**Decentralized Storage CID:** `{report.get('cid')}`\n"
            f"**Fee Settled:** {report.get('fee_paid_near')} NEAR -> {report.get('creator_account')}"
        )
    except Exception as e:
        return f"Error generating research report: {str(e)}"


@tool
async def trader_hire_research_tool(user_wallet: str, symbol: str = "NEAR") -> str:
    """
    Demonstrate Track 7 Agent-to-Agent Hiring Economy:
    The Trader Agent autonomously pays and hires the Research Agent (0.1 NEAR fee)
    to receive an actionable alpha signal.
    
    Args:
        user_wallet: The trader's wallet address
        symbol: The token for which alpha is requested
    """
    try:
        res = await _researcher.hire_by_trader_agent(trader_wallet=user_wallet, symbol=symbol)
        signal = res["signal"]
        return (
            f"🤝 **Agent-to-Agent Hire Completed:**\n"
            f"- **Payer Agent:** {res['from_agent']} ({user_wallet})\n"
            f"- **Recipient Agent:** {res['to_agent']} ({res['recipient']})\n"
            f"- **Fee Transferred:** {res['fee_transferred']}\n"
            f"- **Alpha Signal Returned:** {signal.get('action')} {signal.get('target_asset')} | Confidence: {signal.get('confidence')}%\n"
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
    try:
        data = await _moderator.get_watchdog_status(user_wallet)
        msg = (
            f"🛡️ **Moderator Watchdog Status for {user_wallet}:**\n"
            f"- **Health Score:** {data['health_score']}/100\n"
            f"- **Watchdog Status:** {data['status']}\n"
            f"- **Kill Switch Active:** {data['kill_switch_active']}\n"
            f"- **Open Positions:** {data['open_trades_count']}\n"
            f"- **Total Open Exposure:** ${data['total_open_exposure_usd']} / ${data['daily_limit_usd']} Daily Cap\n"
            f"- **Max Per Trade:** ${data['max_tx_amount_usd']}"
        )
        return msg
    except Exception as e:
        return f"Error querying Moderator Watchdog: {str(e)}"


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
      - "researcher": Institutional Deep Research Agent (reports, alpha signals, IPFS traces)
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

    # 1. STATUS
    if clean_action == "get_status":
        if clean_agent == "trader":
            open_trades = get_open_trades(user_wallet)
            pending_trades = get_pending_trades(user_wallet)
            active_str = "🟢 ACTIVE" if user.get("trader_active") else "⚪ INACTIVE"
            return (
                f"📈 **Trader Agent MCP Status ({user_wallet}):**\n"
                f"- **State:** {active_str}\n"
                f"- **Timeframe:** {user.get('trader_timeframe', '1h')}\n"
                f"- **Min Confidence:** {user.get('trader_min_confidence', 75)}%\n"
                f"- **Risk Profile:** {user.get('trader_risk_profile', 'moderate')}\n"
                f"- **Coin Mode:** {user.get('trader_coin_mode', 'auto')}\n"
                f"- **Active Positions:** {len(open_trades)}\n"
                f"- **Pending Limit Orders:** {len(pending_trades)}"
            )

        elif clean_agent == "rebalancer":
            active_str = "🟢 ACTIVE" if user.get("rebalancer_active") else "⚪ INACTIVE"
            return (
                f"⚖️ **Rebalancer Agent MCP Status ({user_wallet}):**\n"
                f"- **State:** {active_str}\n"
                f"- **Target Stables:** {user.get('rebalancer_target_stables', 70.0)}%\n"
                f"- **Target NEAR:** {user.get('rebalancer_target_near', 30.0)}%\n"
                f"- **Drift Threshold:** {user.get('rebalancer_drift_threshold', 5.0)}%\n"
                f"- **Min Stable Floor:** {user.get('min_stable_pct', 20.0)}%"
            )

        elif clean_agent == "researcher":
            return (
                f"🔬 **Research Agent MCP Status ({user_wallet}):**\n"
                f"- **Capability:** Institutional Multi-Node Research & Citation Grounding\n"
                f"- **Decentralized Storage:** IPFS Pinning Active\n"
                f"- **Agent-to-Agent Economy:** Track 7 Rental Active (0.1 NEAR)"
            )

        elif clean_agent in ("moderator", "watchdog"):
            data = await _moderator.get_watchdog_status(user_wallet)
            return (
                f"🛡️ **Watchdog MCP Status ({user_wallet}):**\n"
                f"- **Health Score:** {data.get('health_score', 100)}/100\n"
                f"- **Status:** {data.get('status', 'NOMINAL')}\n"
                f"- **Kill Switch:** {'🚨 ACTIVE' if data.get('kill_switch_active') else '🟢 Off'}\n"
                f"- **Open Positions:** {data.get('open_trades_count', 0)}\n"
                f"- **Open Exposure:** ${data.get('total_open_exposure_usd', 0.0)} / ${data.get('daily_limit_usd', 2000)} Cap"
            )

        else: # Fleet overview
            t_act = "🟢" if user.get("trader_active") else "⚪"
            r_act = "🟢" if user.get("rebalancer_active") else "⚪"
            kill = "🚨 ACTIVE" if user.get("kill_switch") else "🟢 Normal"
            return (
                f"🌐 **Neptune Agent Suite Fleet Telemetry ({user_wallet}):**\n"
                f"- {t_act} **Trader Agent:** {'Active' if user.get('trader_active') else 'Inactive'}\n"
                f"- {r_act} **Rebalancer Agent:** {'Active' if user.get('rebalancer_active') else 'Inactive'}\n"
                f"- 🔬 **Research Agent:** Ready\n"
                f"- 🛡️ **Watchdog Surveillance:** Active (Kill Switch: {kill})\n"
                f"- **Daily Spend Limit:** ${user.get('daily_limit', 2000.0)} | Max Per Trade: ${user.get('max_tx_amount', 500.0)}"
            )

    # 2. HISTORY
    elif clean_action == "get_history":
        limit = int(params.get("limit", 5))
        if clean_agent == "trader":
            trades = get_user_trade_history(user_wallet, limit=limit)
            pending = get_pending_trades(user_wallet)
            msg = f"📜 **Trader Agent History ({user_wallet}):**\n"
            if pending:
                msg += f"⏳ **Pending Limit Orders ({len(pending)}):**\n"
                for p in pending[:3]:
                    msg += f"- {p['action']} {p['symbol']} @ target ${p['entry_price']} [TP: ${p['tp_price']} | SL: ${p['sl_price']}]\n"
            if trades:
                msg += f"✅ **Recent Trades ({len(trades)}):**\n"
                for t in trades[:limit]:
                    msg += f"- {t.get('action')} {t.get('symbol')} ({t.get('status')}) @ ${t.get('entry_price_usd', t.get('entry_price', 0))} | ROI: +{t.get('expected_roi_pct', 0)}%\n"
            else:
                msg += "No trade history recorded yet."
            return msg

        elif clean_agent == "rebalancer":
            execs = get_rebalancer_executions_for_user(user_wallet, limit=limit)
            msg = f"📜 **Rebalancer History ({user_wallet}):**\n"
            if execs:
                for e in execs[:limit]:
                    msg += f"- [{e.get('created_at', '')[:16]}] {e.get('token_in', '')} -> {e.get('token_out', '')} | Amount: ${e.get('amount_in_usd', 0)} | Status: {e.get('terminal_status', e.get('state'))}\n"
            else:
                msg += "No rebalance executions recorded yet."
            return msg

        elif clean_agent == "researcher":
            from database import get_user_hires
            logs = get_agent_logs(user_wallet, limit=limit, agent_name="research")
            msg = f"📜 **Research Reports History ({user_wallet}):**\n"
            if logs:
                for l in logs:
                    msg += f"- [{l.get('created_at', '')[:16]}] {l.get('action_taken')} (CID: {l.get('cid_reference', 'N/A')})\n"
            else:
                msg += "No research reports published yet."
            return msg

        else: # Watchdog & audit logs
            logs = get_agent_logs(user_wallet, limit=limit, agent_name=clean_agent if clean_agent != "fleet" else None)
            msg = f"📜 **Agent Suite Audit Trail ({user_wallet}):**\n"
            if logs:
                for l in logs[:limit]:
                    msg += f"- [{l.get('agent_name').upper()}] {l.get('action_taken')} ({l.get('created_at', '')[:16]})\n"
            else:
                msg += "No audit events recorded yet."
            return msg

    # 3. SET ACTIVE / INACTIVE
    elif clean_action == "set_active":
        is_active = params.get("is_active", True)
        if isinstance(is_active, str):
            is_active = is_active.lower() in ("true", "1", "yes", "on")

        settings = {}
        if clean_agent in ("trader", "all", "fleet"):
            settings["trader_active"] = 1 if is_active else 0
        if clean_agent in ("rebalancer", "all", "fleet"):
            settings["rebalancer_active"] = 1 if is_active else 0
        if clean_agent in ("moderator", "watchdog", "all", "fleet"):
            settings["moderator_active"] = 1 if is_active else 0

        upsert_user(user_wallet, settings)
        status_word = "ACTIVATED 🟢" if is_active else "DEACTIVATED ⚪"
        return f"✅ **MCP Update:** {clean_agent.upper()} agent has been {status_word} for wallet `{user_wallet}`."

    # 4. CONFIGURE
    elif clean_action == "configure":
        settings = {}
        if "timeframe" in params:
            settings["trader_timeframe"] = params["timeframe"]
        if "min_confidence" in params:
            settings["trader_min_confidence"] = int(params["min_confidence"])
        if "risk_profile" in params:
            settings["trader_risk_profile"] = params["risk_profile"]
        if "coin_mode" in params:
            settings["trader_coin_mode"] = params["coin_mode"]
        if "custom_coins" in params:
            settings["trader_custom_coins"] = params["custom_coins"]
        if "target_stables" in params:
            settings["rebalancer_target_stables"] = float(params["target_stables"])
        if "target_near" in params:
            settings["rebalancer_target_near"] = float(params["target_near"])
        if "drift_threshold" in params:
            settings["rebalancer_drift_threshold"] = float(params["drift_threshold"])
        if "notification_email" in params:
            settings["notification_email"] = params["notification_email"]
        if "max_tx_amount" in params:
            settings["max_tx_amount"] = float(params["max_tx_amount"])
        if "daily_limit" in params:
            settings["daily_limit"] = float(params["daily_limit"])

        if not settings:
            return f"⚠️ **MCP Notice:** No valid configuration settings found in parameters."

        upsert_user(user_wallet, settings)
        applied_keys = ", ".join(settings.keys())
        return f"✅ **MCP Configuration Applied for {clean_agent.upper()} ({user_wallet}):**\nUpdated: `{applied_keys}`."

    # 5. TRIGGER RUN
    elif clean_action == "trigger_run":
        if clean_agent == "trader":
            symbol = params.get("symbol", "NEAR")
            tf = params.get("timeframe", "1h")
            conf = int(params.get("min_confidence", 75))
            res = await _trader.run_pipeline(user_wallet=user_wallet, symbol=symbol, force_timeframe=tf, force_min_confidence=conf)
            return f"⚡ **Trader Run Output ({symbol}):** Verdict `{res.get('verdict')}` | Status `{res.get('status')}` | ROI: +{res.get('expected_roi_pct')}%"

        elif clean_agent == "rebalancer":
            res = await _rebalancer.evaluate_and_rebalance(user_wallet=user_wallet)
            return f"⚖️ **Rebalancer Run Output:** Status `{res.get('status')}` | Max Drift: {res.get('max_drift_pct')}% | Action: {res.get('action_taken')}"

        elif clean_agent == "researcher":
            topic = params.get("topic", "NEAR DeFi Infrastructure")
            rep = await _researcher.generate_research_report(topic=topic, requester=user_wallet)
            return f"🔬 **Research Run Output:** '{rep.get('title')}' | Regime: `{rep.get('regime')}` | CID: `{rep.get('cid')}`"

        elif clean_agent in ("moderator", "watchdog"):
            data = await _moderator.get_watchdog_status(user_wallet)
            return f"🛡️ **Watchdog Run Output:** Health Score: `{data.get('health_score')}/100` | Open Exposure: `${data.get('total_open_exposure_usd')}`"

        else:
            return f"Unknown agent name '{agent_name}' for trigger_run."

    # 6. KILL SWITCH
    elif clean_action == "kill_switch":
        activate = params.get("activate", True)
        if activate:
            res = await _moderator.trigger_emergency_kill_switch(user_wallet)
            return f"🚨 **MCP KILL SWITCH ACTIVATED:** {res['message']}"
        else:
            res = await _moderator.reset_kill_switch(user_wallet)
            return f"🟢 **MCP KILL SWITCH RESET:** {res['message']}"

    return f"⚠️ **MCP Error:** Unknown action '{action}' for agent '{agent_name}'."


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
