"""
Neptune AI   Notification Agent (4th LLM Layer)
Dedicated LLM that drafts email notifications when strategies trigger.
Each email is uniquely crafted based on the strategy type, action taken,
market conditions, and execution details.
"""

import os
from typing import Dict, Any, Optional
from datetime import datetime

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

from email_service import send_email, is_email_configured
from database import get_user


#   Notification Agent LLM (separate client)  

api_key = os.getenv("NEAR_AI_API_KEY")

notification_llm = ChatOpenAI(
    model="openai/gpt-oss-120b",
    temperature=0.4,
    openai_api_key=api_key or "sk-missing-key",
    openai_api_base="https://cloud-api.near.ai/v1"
)


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

        response = await notification_llm.ainvoke([
            SystemMessage(content=NOTIFICATION_PROMPT),
            HumanMessage(content=context)
        ])

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
