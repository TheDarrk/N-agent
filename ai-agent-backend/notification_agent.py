"""
Neptune AI   Notification Agent (4th LLM Layer)
Dedicated LLM that drafts email notifications when strategies trigger.
Each email is uniquely crafted based on the strategy type, action taken,
market conditions, and execution details.
"""

import os
import html as _html
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from langchain_core.messages import SystemMessage, HumanMessage
from glm_transport import invoke_glm

from email_service import send_email, is_email_configured
from database import get_user


#   System Prompt for Email Drafting  

NOTIFICATION_PROMPT = """You are Neptune AI's Notification Agent. Your ONLY job is to draft premium,
stylish, institutional-grade email notifications when a trading strategy triggers.

You receive strategy and execution context and must generate:
1. A clear, executive **email subject line** (clean text, NO emojis)
2. A beautifully **styled HTML email body**

**Email Design Rules:**
- Zero emojis: Do NOT include any emojis (no lightning bolts, robots, warning icons, etc.). Keep it strictly institutional and clean.
- Use a dark, premium fintech design: background #0F172A, card background #1E293B, rounded corners 8px
- Accent color: #00D4AA (emerald green) for success, #F59E0B for warnings, #EF4444 for blocks
- Font: system sans-serif, clean and modern
- Structure the email as:
  1. Header with Neptune AI logo text and category
  2. A brief executive summary sentence in large text
  3. Mobile-responsive key-value cards (Strategy, Token, Action, Result, etc.) with overflow-wrap
  4. Transaction hash link if available (shortened display)
  5. Footer with timestamp and "Neptune AI Autonomous Trading Infrastructure" in muted text
- Use inline CSS only, no external stylesheets
- Keep it concise — professionals don't read fluff
- Make the email look like it came from an institutional hedge fund or prime broker fintech platform

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
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

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

        now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        agent_clean = agent_name.upper().strip()

        # Accent colors by agent persona (Institutional styling, zero emojis)
        accent_color = "#00D4AA"  # Default Neptune Emerald
        if "TRADE" in agent_clean:
            accent_color = "#10B981"
        elif "REBALANC" in agent_clean:
            accent_color = "#06B6D4"
        elif "RESEARCH" in agent_clean:
            accent_color = "#8B5CF6"
        elif "MODERAT" in agent_clean or "WATCHDOG" in agent_clean:
            accent_color = "#F59E0B"

        inline_images = {}

        # Helper to format values cleanly without raw Python dict slop
        def _format_metric_val(val: Any) -> str:
            if isinstance(val, dict):
                parts = []
                for sub_k, sub_v in val.items():
                    sub_label = str(sub_k).replace("_", " ").title()
                    parts.append(f"""
                        <div style="margin-top: 4px; padding-left: 8px; border-left: 2px solid #334155;">
                            <span style="color: #94A3B8; font-weight: 600; font-size: 11px;">{sub_label}:</span> 
                            <span style="color: #F8FAFC; font-weight: 500; font-size: 12px;">{_html.escape(str(sub_v))}</span>
                        </div>
                    """)
                return "".join(parts)
            val_str = str(val).strip()
            # "A | B | C" lists render as clean stacked lines
            if " | " in val_str and not val_str.startswith("{"):
                return "".join(
                    f'<div style="padding: 2px 0;">{_html.escape(part.strip())}</div>'
                    for part in val_str.split(" | ") if part.strip()
                )
            # If stringified dict, attempt safe JSON or ast parsing
            if val_str.startswith("{") and val_str.endswith("}"):
                try:
                    import ast
                    parsed_dict = ast.literal_eval(val_str)
                    if isinstance(parsed_dict, dict):
                        return _format_metric_val(parsed_dict)
                except Exception:
                    pass
            return _html.escape(val_str)

        # Build metric cards (mobile-responsive card layout with zero overflow clipping)
        metric_cards_html = ""
        metric_rows_text = ""
        seen_cid = str(cid_reference or "").strip()
        short_cards, long_cards = [], []
        if metrics:
            for k, v in metrics.items():
                if str(k).lower() in ("decentralized cid", "decentralized trace", "audit trace cid", "cid") and seen_cid:
                    continue
                val_rendered = _format_metric_val(v)
                raw_len = len(str(v))
                is_short = raw_len <= 28 and not isinstance(v, dict) and " | " not in str(v)
                card = f"""
                <div style="padding: 12px 14px; background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px;">
                    <div style="font-size: 10px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px;">{_html.escape(str(k))}</div>
                    <div style="font-size: 13px; font-weight: 600; color: #F1F5F9; line-height: 1.5; word-break: break-word; overflow-wrap: anywhere;">{val_rendered}</div>
                </div>"""
                (short_cards if is_short else long_cards).append(card)
                metric_rows_text += f"  - {k}: {v}\n"

        # Short values: two per row (table layout so Gmail/Outlook keep the grid); long values: full width
        for i in range(0, len(short_cards), 2):
            left = short_cards[i]
            right = short_cards[i + 1] if i + 1 < len(short_cards) else ""
            metric_cards_html += (
                '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 8px;"><tr>'
                f'<td width="50%" valign="top" style="padding-right: 4px;">{left}</td>'
                f'<td width="50%" valign="top" style="padding-left: 4px;">{right}</td>'
                '</tr></table>'
            )
        for card in long_cards:
            metric_cards_html += f'<div style="margin-bottom: 8px;">{card}</div>'

        tx_section_html = ""
        if tx_hash:
            clean_hash = tx_hash.strip()
            if clean_hash.startswith("PENDING") or "LIMIT" in clean_hash:
                tx_section_html = f"""
                <div style="margin-top: 14px; padding: 12px 14px; background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px;">
                    <span style="font-size: 11px; color: #10B981; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Solver Network Trigger Status</span>
                    <div style="font-family: ui-monospace, monospace; font-size: 12px; color: #94A3B8; margin-top: 4px; word-break: break-all;">{clean_hash}</div>
                </div>
                """
            else:
                tx_url = f"https://nearblocks.io/txns/{clean_hash}"
                tx_section_html = f"""
                <div style="margin-top: 16px; text-align: center;">
                    <a href="{tx_url}" target="_blank" style="display: inline-block; background: {accent_color}; color: #0B0F19; font-weight: 700; font-size: 12px; padding: 10px 22px; border-radius: 8px; text-decoration: none; letter-spacing: 0.5px; text-transform: uppercase;">
                        View Transaction on NearBlocks
                    </a>
                    <div style="margin-top: 6px; font-size: 11px; color: #64748B; font-family: ui-monospace, monospace; word-break: break-all;">
                        Tx: {clean_hash}
                    </div>
                </div>
                """

        cid_section_html = ""
        effective_cid = seen_cid or (str(metrics.get("Report ID") or metrics.get("Trace ID") or metrics.get("Decentralized CID") or metrics.get("Decentralized Trace") or "").strip() if metrics else "")
        if effective_cid:
            cid_section_html = f"""
            <div style="margin-top: 14px; padding: 12px 14px; background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px;">
                <div style="font-size: 11px; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 700; margin-bottom: 4px;">Record ID</div>
                <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; color: #38BDF8; font-weight: 600; word-break: break-all; overflow-wrap: anywhere; line-height: 1.4;">{effective_cid}</div>
            </div>
            """

        reasoning_html = ""
        if reasoning:
            reasoning_html = f"""
            <div style="margin-top: 14px; background: #0B0F19; border-left: 3px solid {accent_color}; padding: 12px 16px; border-radius: 0 8px 8px 0; border: 1px solid #1E293B; border-left-width: 3px;">
                <div style="font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px;">Agent Rationale &amp; Evidence</div>
                <div style="color: #CBD5E1; font-size: 13px; line-height: 1.6; word-break: break-word; overflow-wrap: anywhere;">{_html.escape(str(reasoning)).replace(chr(10), "<br>")}</div>
            </div>
            """

        app_url = os.getenv("NEPTUNE_APP_URL", "").strip()
        cta_html = ""
        if app_url:
            cta_html = f"""
            <div style="margin-top: 18px; text-align: center;">
                <a href="{_html.escape(app_url)}" target="_blank" style="display: inline-block; border: 1px solid {accent_color}; color: {accent_color}; font-weight: 700; font-size: 12px; padding: 10px 24px; border-radius: 8px; text-decoration: none; letter-spacing: 0.6px; text-transform: uppercase;">Open Neptune AI</a>
            </div>"""

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #070B14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
            <div style="max-width: 580px; margin: 24px auto; background-color: #0F172A; border: 1px solid #1E293B; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                <!-- Header (Zero emojis, clean institutional design) -->
                <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 20px 22px; border-bottom: 1px solid #1E293B;">
                    <table style="width: 100%; border-collapse: collapse; margin-bottom: 10px;">
                        <tr>
                            <td style="text-align: left; vertical-align: middle;">
                                <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: {accent_color}; margin-right: 6px;"></span>
                                <span style="font-size: 11px; font-weight: 800; color: {accent_color}; text-transform: uppercase; letter-spacing: 1.2px;">NEPTUNE AI &bull; {agent_clean} AGENT</span>
                            </td>
                            <td style="text-align: right; vertical-align: middle; font-size: 11px; color: #64748B; font-family: ui-monospace, monospace;">
                                {now_utc}
                            </td>
                        </tr>
                    </table>
                    <h1 style="color: #F8FAFC; font-size: 17px; font-weight: 700; margin: 0 0 6px 0; line-height: 1.35; word-break: break-word;">
                        {_html.escape(str(title))}
                    </h1>
                    <p style="color: #94A3B8; font-size: 13px; margin: 0; line-height: 1.5; word-break: break-word;">
                        {_html.escape(str(summary))}
                    </p>
                </div>

                <!-- Content Body with Mobile-Responsive Cards -->
                <div style="padding: 20px 22px;">
                    {metric_cards_html}
                    {reasoning_html}
                    {tx_section_html}
                    {cid_section_html}
                    {cta_html}
                </div>

                <!-- Footer -->
                <div style="background: #0B0F19; padding: 14px 22px; border-top: 1px solid #1E293B; text-align: center;">
                    <div style="font-size: 12px; color: #64748B;">
                        Connected Wallet: <span style="font-family: ui-monospace, monospace; color: #94A3B8;">{user_wallet}</span>
                    </div>
                    <div style="font-size: 11px; color: #475569; margin-top: 4px;">
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
{f'Record ID: {effective_cid}' if effective_cid else ''}
"""

        clean_title = title.replace("Trader Agent: ", "").replace("Rebalancer: ", "").replace("Research: ", "").replace("Watchdog: ", "")
        subject = f"Neptune AI | {agent_clean}: {clean_title}"
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
