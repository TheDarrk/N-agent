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
            f"🤝 **Agent-to-Agent Hire Completed (Track 7):**\n"
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


AGENT_MARKET_TOOLS = [
    query_trader_status_tool,
    run_trader_scan_tool,
    query_rebalancer_status_tool,
    request_research_report_tool,
    trader_hire_research_tool,
    query_moderator_watchdog_tool,
    moderator_kill_switch_tool,
]
