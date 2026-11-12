"""
Neptune AI   Notification Agent (4th LLM Layer)
Dedicated LLM that drafts email notifications when strategies trigger.
Each email is uniquely crafted based on the strategy type, action taken,
market conditions, and execution details.
"""

import os
from typing import Dict, Any, Optional
from datetime import datetime

from langchain_core.messages import SystemMessage, HumanMessage
from glm_transport import invoke_glm

from email_service import send_email, is_email_configured
from database import get_user


#   System Prompt for Email Drafting  

NOTIFICATION_PROMPT = """You are Neptune AI's Notification Agent. Your ONLY job is to draft premium,
stylish email notifications when a trading strategy triggers.

You receive strategy and execution context and must generate:
1. A clear **email subject line** with a relevant emoji
2. A beautifully **styled HTML email body**

**Email Design Rules:**
- Use a dark, premium design: background #0F172A, card background #1E293B, rounded corners 12px
- Accent color: #00D4AA (emerald green) for success, #F59E0B for warnings, #EF4444 for blocks
- Font: system sans-serif, clean and modern
- Structure the email as:
  1. Header with Neptune AI logo text and a status emoji (       )
  2. A brief summary sentence in large text
  3. Details card with key-value rows (Strategy, Token, Action, Result, etc.)
  4. Transaction hash link if available (shortened display)
  5. Footer with timestamp and "  Neptune AI" signature in muted text
- Use inline CSS only, no external stylesheets
- Keep it concise   professionals don't read fluff
- Make the email look like it came from a premium fintech product

**Format your response as JSON:**
```
{"subject": "...", "html": "...", "text": "..."}
```

The "text" field is a plain-text version. Return ONLY the JSON, no markdown fencing.
"""


#   Notification Functions  

async def notify_strategy_trigger(
    user_wallet: str,
    strategy: Dict[str, Any],
    decision: Dict[str, Any],
    risk_result: Dict[str, Any],
    execution_result: Dict[str, Any],
    market_data: Dict[str, Any] = None
):
    """
    Called by the autonomy engine after a strategy triggers.
    Uses a dedicated LLM to draft the email, then sends it.
    """
    # Check if user has an email set
    user = get_user(user_wallet)
    if not user:
        return

    user_email = user.get("notification_email", "")
    if not user_email:
        print(f"[NOTIFY] No email for {user_wallet}   skipping notification")
        return

    if not is_email_configured():
        print("[NOTIFY] SMTP not configured   skipping notification")
        return

    # Build context for the LLM
    strategy_type = strategy.get("strategy_type", "unknown")
    trigger_condition = strategy.get("trigger_condition", {})
    action = decision.get("action", "unknown")
    reasoning = decision.get("reasoning", "")
    risk_approved = risk_result.get("approved", False)
    risk_reason = risk_result.get("reason", "")
    tx_hash = execution_result.get("tx_hash", None)
    exec_success = execution_result.get("success", False)
    exec_message = execution_result.get("message", "")
    autonomy_level = user.get("autonomy_level", 0)
    agent_wallet = user.get("agent_wallet", "")
    timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")

    context = f"""Strategy Trigger Details:
- Wallet: {user_wallet}
- Agent Wallet: {agent_wallet or 'Not bound'}
- Strategy Type: {strategy_type}
- Strategy ID: {strategy.get('id', '?')}
- Trigger Condition: {trigger_condition}
- Autonomy Level: {'Off' if autonomy_level == 0 else 'Notify Only' if autonomy_level == 1 else 'Auto-Execute'}
- Timestamp: {timestamp}

Decision:
- Action: {action}
- Reasoning: {reasoning}

Risk Check:
- Approved: {'Yes' if risk_approved else 'No'}
- Risk Notes: {risk_reason}

Execution:
- Success: {'Yes' if exec_success else 'No'}
- Message: {exec_message}
- Transaction Hash: {tx_hash or 'N/A'}
- Network: {trigger_condition.get('network', 'NEAR')}

Market Context:
- Token: {trigger_condition.get('token', 'N/A').upper()}"""

    if market_data:
        token = trigger_condition.get("token", "").lower()
        if token in market_data:
            context += f"\n- Current Price: ${market_data[token].get('usd', 'N/A')}"

    try:
        print(f"[NOTIFY] Drafting email for {user_wallet} ({strategy_type})")

        response = await invoke_glm([
            SystemMessage(content=NOTIFICATION_PROMPT),
            HumanMessage(content=context)
        ], temperature=0.4)

        raw = response.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
            if raw.endswith("```"):
                raw = raw[:-3].strip()

        import json
        email_data = json.loads(raw)

        subject = email_data.get("subject", f"Neptune AI   Strategy Alert: {strategy_type}")
        html_body = email_data.get("html", f"<p>{exec_message}</p>")
        text_body = email_data.get("text", exec_message)

        # Send the email
        sent = send_email(
            to_email=user_email,
            subject=subject,
            html_body=html_body,
            text_body=text_body
        )

        if sent:
            print(f"[NOTIFY] [SUCCESS] Email sent to {user_email}")
        else:
            print(f"[NOTIFY] [ERROR] Email failed for {user_email}")

    except Exception as e:
        print(f"[NOTIFY] Error drafting/sending email: {e}")
        import traceback
        traceback.print_exc()

        # Fallback: send a simple email without LLM drafting
        try:
            fallback_subject = f"Neptune AI   {strategy_type.replace('_', ' ').title()} Triggered"
            fallback_html = f"""
            <div style="background:#0F172A;color:#fff;padding:24px;font-family:sans-serif;">
                <h2 style="color:#38BDF8;">Neptune AI Strategy Alert</h2>
                <p><strong>Strategy:</strong> {strategy_type.replace('_', ' ').title()}</p>
                <p><strong>Action:</strong> {action}</p>
                <p><strong>Result:</strong> {exec_message}</p>
                <p><strong>Wallet:</strong> {user_wallet}</p>
                <p><strong>Time:</strong> {timestamp}</p>
                {f'<p><strong>Tx Hash:</strong> {tx_hash}</p>' if tx_hash else ''}
                <hr style="border-color:#38BDF8;"/>
                <p style="color:#94A3B8;font-size:12px;">  Neptune AI</p>
            </div>
            """
            send_email(user_email, fallback_subject, fallback_html, exec_message)
        except Exception:
            pass  # Silent fail   don't crash the pipeline for email issues


# ═══════════════════════════════════════════════════════════════════════════════
# UNIVERSAL AGENT ACTION EMAIL DISPATCHER (Trader, Rebalancer, Researcher, Watchdog)
# ═══════════════════════════════════════════════════════════════════════════════

async def send_agent_action_email(
    user_wallet: str,
    agent_name: str,
    action_type: str,
    title: str,
    summary: str,
    metrics: Optional[Dict[str, Any]] = None,
    reasoning: str = "",
    tx_hash: Optional[str] = None,
    cid_reference: Optional[str] = None
) -> bool:
    """
    Universally sends a high-fidelity, beautifully styled HTML notification email
    to the user when any autonomous agent (Trader, Rebalancer, Researcher, Watchdog)
    performs an on-chain execution or generates an audit/intelligence report.

    Features:
    - 100% Non-blocking, fault-tolerant.
    - Resolves user's `notification_email` from core_user_wallets.
    - Silent graceful skip if SMTP credentials or email are not configured.
    """
    try:
        user = get_user(user_wallet)
        if not user:
            return False

        user_email = user.get("notification_email")
        if not user_email or not str(user_email).strip():
            # User hasn't configured an alert email
            return False

        if not is_email_configured():
            print(f"[NOTIFY] User {user_wallet} has email configured ({user_email}), but SMTP credentials are not set in .env. Skipping email.")
            return False

        now_utc = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        agent_clean = agent_name.upper().strip()

        # Accent colors by agent persona
        accent_color = "#00D4AA"  # Default Neptune Emerald
        agent_emoji = "🤖"
        avatar_key = "trader"
        if "TRADE" in agent_clean:
            accent_color = "#10B981"
            agent_emoji = "⚡"
            avatar_key = "trader"
        elif "REBALANC" in agent_clean:
            accent_color = "#06B6D4"
            agent_emoji = "⚖️"
            avatar_key = "rebalancer"
        elif "RESEARCH" in agent_clean:
            accent_color = "#8B5CF6"
            agent_emoji = "🔬"
            avatar_key = "researcher"
        elif "MODERAT" in agent_clean or "WATCHDOG" in agent_clean:
            accent_color = "#F59E0B"
            agent_emoji = "🛡️"
            avatar_key = "moderator"

        # Resolve avatar path for exact visual brand consistency across frontend and email
        base_dir = os.path.dirname(os.path.abspath(__file__))
        avatar_path = os.path.join(base_dir, "assets", "avatars", f"{avatar_key}.png")
        inline_images = {}
        if os.path.exists(avatar_path):
            inline_images["agent_avatar"] = avatar_path

        # Build metric rows
        metric_rows_html = ""
        metric_rows_text = ""
        if metrics:
            for k, v in metrics.items():
                metric_rows_html += f"""
                <tr style="border-bottom: 1px solid #1F293D;">
                    <td style="padding: 10px 14px; color: #94A3B8; font-size: 13px; font-weight: 500;">{k}</td>
                    <td style="padding: 10px 14px; color: #F1F5F9; font-size: 13px; font-weight: 600; text-align: right;">{v}</td>
                </tr>
                """
                metric_rows_text += f"  • {k}: {v}\n"

        tx_section_html = ""
        if tx_hash:
            clean_hash = tx_hash.strip()
            if clean_hash.startswith("PENDING") or "LIMIT" in clean_hash:
                tx_section_html = f"""
                <div style="margin-top: 16px; padding: 10px 14px; background: #131D31; border: 1px solid #1E293B; border-radius: 8px; text-align: center;">
                    <span style="font-size: 11px; color: #10B981; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Solver Network Trigger Status</span>
                    <div style="font-family: monospace; font-size: 12px; color: #94A3B8; margin-top: 4px;">{clean_hash}</div>
                </div>
                """
            else:
                tx_url = f"https://nearblocks.io/txns/{clean_hash}"
                tx_section_html = f"""
                <div style="margin-top: 18px; text-align: center;">
                    <a href="{tx_url}" target="_blank" style="display: inline-block; background: {accent_color}; color: #0B0F19; font-weight: 700; font-size: 13px; padding: 10px 20px; border-radius: 8px; text-decoration: none; letter-spacing: 0.3px;">
                        View Transaction on NearBlocks ↗
                    </a>
                    <div style="margin-top: 6px; font-size: 11px; color: #64748B; font-family: monospace;">
                        Tx: {clean_hash[:16]}...{clean_hash[-8:]}
                    </div>
                </div>
                """

        cid_section_html = ""
        if cid_reference:
            clean_cid = str(cid_reference).strip()
            cid_section_html = f"""
            <div style="margin-top: 12px; padding: 10px 14px; background: #131D31; border: 1px solid #1E293B; border-radius: 8px; text-align: center;">
                <span style="font-size: 11px; color: #94A3B8; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Decentralized Audit CID:</span>
                <div style="font-family: monospace; font-size: 12px; color: #38BDF8; font-weight: 600; margin-top: 4px; word-break: break-all;">{clean_cid}</div>
            </div>
            """

        reasoning_html = ""
        if reasoning:
            reasoning_html = f"""
            <div style="margin-top: 18px; background: #0B1120; border-left: 3px solid {accent_color}; padding: 12px 16px; border-radius: 4px;">
                <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px;">Agent Rationale & Evidence</div>
                <div style="color: #CBD5E1; font-size: 13px; line-height: 1.5;">{reasoning}</div>
            </div>
            """

        avatar_tag = '<img src="cid:agent_avatar" width="40" height="40" style="border-radius: 10px; display: block; border: 1px solid #334155; background: #FFFFFF; padding: 2px;" alt="' + agent_clean + '" />' if inline_images else ''

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"></head>
        <body style="margin: 0; padding: 0; background-color: #070B14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
            <div style="max-width: 580px; margin: 30px auto; background-color: #0F172A; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <!-- Header with Exact Persona Avatar -->
                <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 20px 24px; border-bottom: 1px solid #1E293B;">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
                        <tr>
                            {f'<td style="width: 46px; vertical-align: middle;">{avatar_tag}</td>' if avatar_tag else ''}
                            <td style="vertical-align: middle; padding-left: 10px;">
                                <div style="font-size: 11px; font-weight: 800; color: {accent_color}; text-transform: uppercase; letter-spacing: 1px;">
                                    {agent_emoji} NEPTUNE AI • {agent_clean} AGENT
                                </div>
                                <div style="font-size: 11px; color: #64748B;">{now_utc}</div>
                            </td>
                        </tr>
                    </table>
                    <h1 style="color: #F8FAFC; font-size: 18px; font-weight: 700; margin: 0 0 6px 0; line-height: 1.3;">
                        {title}
                    </h1>
                    <p style="color: #94A3B8; font-size: 13px; margin: 0; line-height: 1.4;">
                        {summary}
                    </p>
                </div>

                <!-- Content Card -->
                <div style="padding: 24px 26px;">
                    {f'<table style="width: 100%; border-collapse: collapse; background: #0B0F19; border-radius: 8px; overflow: hidden; border: 1px solid #1E293B;">{metric_rows_html}</table>' if metric_rows_html else ''}

                    {reasoning_html}
                    {tx_section_html}
                    {cid_section_html}
                </div>

                <!-- Footer -->
                <div style="background: #0B0F19; padding: 16px 26px; border-top: 1px solid #1E293B; text-align: center;">
                    <div style="font-size: 12px; color: #64748B;">
                        Connected Wallet: <span style="font-family: monospace; color: #94A3B8;">{user_wallet}</span>
                    </div>
                    <div style="font-size: 11px; color: #475569; margin-top: 6px;">
                        Automated alert dispatched by Neptune AI Autonomous Trading Infrastructure.
                    </div>
                </div>
            </div>
        </body>
        </html>
        """

        plain_text = f"""[NEPTUNE AI - {agent_clean} AGENT]
{title}
{summary}
Time: {now_utc}
Wallet: {user_wallet}

DETAILS:
{metric_rows_text}

RATIONALE:
{reasoning}

{f'NearBlocks Tx: https://nearblocks.io/txns/{tx_hash}' if tx_hash and not str(tx_hash).startswith('PENDING') else ''}
{f'Decentralized Audit CID: {cid_reference}' if cid_reference else ''}
"""

        clean_title = title.replace("Trader Agent: ", "").replace("Rebalancer: ", "").replace("Research: ", "").replace("Watchdog: ", "")
        subject = f"Neptune AI | {agent_emoji} {agent_clean}: {clean_title}"
        sent = send_email(
            to_email=user_email,
            subject=subject,
            html_body=html_body,
            text_body=plain_text,
            inline_images=inline_images
        )
        if sent:
            print(f"[NOTIFY: EMAIL] Successfully sent {agent_clean} alert to {user_email}")
        return sent
    except Exception as e:
        print(f"[NOTIFY: EMAIL ERROR] Non-fatal notification error: {e}")
        return False
