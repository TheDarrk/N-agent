import asyncio
"""
Neptune AI — Moderator Watchdog Agent (LLM-as-a-Judge Master Overseer)
Orchestrates the 4-Node Autonomous Governance Pipeline:
  - Node 1: Trader Agent Evaluator & Hallucination Auditor
  - Node 2: Rebalancer Agent Evaluator & Hallucination Auditor
  - Node 3: Deep Research Agent Evaluator & Hallucination Auditor
  - Node 4: Fleet Synthesis & Master Verdict Node
Holds the Master Kill Switch authority and logs step-by-step governance decisions for every node.
"""

import os
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from database import (
    get_user, activate_kill_switch, deactivate_kill_switch,
    get_open_trades, get_user_trade_history, get_agent_logs,
    update_trade_status, log_agent_action, get_fleet_activity,
    get_dropped_trades, get_latest_moderator_evaluation, get_moderator_cadence_info
)
from autonomous_agents.moderator_nodes import (
    TraderEvaluatorNode,
    RebalancerEvaluatorNode,
    ResearchEvaluatorNode,
    FleetSynthesisNode,
    CombinedFleetReport
)


class ModeratorAgent:
    """
    Master Risk Guardian and LLM-as-a-Judge orchestrating the 4-node fleet evaluation.
    """

    _deliberation_lock = asyncio.Lock()
    _is_running_deliberation = False
    _active_target_wallet = None

    def __init__(self):
        self.name = "moderator"
        self.trader_evaluator = TraderEvaluatorNode()
        self.rebalancer_evaluator = RebalancerEvaluatorNode()
        self.research_evaluator = ResearchEvaluatorNode()
        self.fleet_synthesizer = FleetSynthesisNode()

    async def evaluate_fleet_performance(self, user_wallet: str) -> Dict[str, Any]:
        """
        Executes the 4-Node Pipeline:
        1. Node 1: Trader evaluation & hallucination audit
        2. Node 2: Rebalancer evaluation & hallucination audit
        3. Node 3: Deep Research evaluation & source citation audit
        4. Node 4: Fleet synthesis, mean score calculation, and automated kill checks
        Concurrency Guard: If another deliberation is already running, stands aside to prevent clashes.
        Outputs step-by-step console logs to backend stdout for live verification.
        """
        if ModeratorAgent._is_running_deliberation or ModeratorAgent._deliberation_lock.locked():
            current_target = ModeratorAgent._active_target_wallet or "another wallet"
            print(f"\n[MODERATOR CONCURRENCY GUARD] Deliberation is ALREADY actively running for '{current_target}'. Standing aside for '{user_wallet}' to prevent collision/clash.")
            return await self.get_watchdog_status(user_wallet)

        async with ModeratorAgent._deliberation_lock:
            ModeratorAgent._is_running_deliberation = True
            ModeratorAgent._active_target_wallet = user_wallet
            try:
                user = get_user(user_wallet) or {}
                kill_switch = bool(user.get("kill_switch", 0))
                kill_thresh = float(user.get("moderator_kill_threshold", 50.0))

                print(f"\n{'='*75}")
                print(f"[MODERATOR WATCHDOG] 4-Node Fleet Deliberation Starting for Wallet: {user_wallet}")
                print(f"Status: {'KILL SWITCH ENGAGED' if kill_switch else 'NORMAL MONITORING'} | Kill Threshold: {kill_thresh}/80")
                print(f"{'='*75}")

                # ─── STEP 1: AUDIT TRADER AGENT ──────────────────────────────
                print(f"\n[STEP 1/4 -> NODE 1: TRADER EVALUATOR] Initiating technical & hallucination audit...")
                trader_eval = await self.trader_evaluator.evaluate(user_wallet)
                t_finding = trader_eval.findings[0] if trader_eval.findings else "Trader checks complete."
                print(f"[STEP 1/4 COMPLETE] Trader Score: {trader_eval.score}/100 | Status: {trader_eval.status} | Hallucination Severity: {trader_eval.hallucination_audit.hallucination_severity}")
                log_agent_action(
                    user_wallet=user_wallet,
                    agent_name="moderator",
                    trigger_type="node_1_trader_audit",
                    reasoning_text=f"[Node 1: Trader Audit] Score: {trader_eval.score}/100 | Indicators: {trader_eval.hallucination_audit.indicator_accuracy} | Pattern: {'Grounded' if trader_eval.hallucination_audit.pattern_grounded else 'Invalid'} | R:R Math: {'Accurate' if trader_eval.hallucination_audit.risk_reward_accurate else 'Discrepancy'} ({trader_eval.metrics.avg_risk_reward_ratio}:1) | Hallucinations: {trader_eval.hallucination_audit.hallucination_severity}. {t_finding}",
                    action_taken=f"AUDITED_TRADER_{trader_eval.status}",
                    status="completed"
                )

                # ─── STEP 2: AUDIT REBALANCER AGENT ──────────────────────────
                print(f"\n[STEP 2/4 -> NODE 2: REBALANCER EVALUATOR] Auditing portfolio drift, stables & historical config...")
                rebalancer_eval = await self.rebalancer_evaluator.evaluate(user_wallet)
                r_finding = rebalancer_eval.findings[0] if rebalancer_eval.findings else "Rebalancer checks complete."
                print(f"[STEP 2/4 COMPLETE] Rebalancer Score: {rebalancer_eval.score}/100 | Status: {rebalancer_eval.status} | Current Drift: {rebalancer_eval.metrics.current_drift_pct}% (Limit: {rebalancer_eval.metrics.drift_threshold_pct}%)")
                log_agent_action(
                    user_wallet=user_wallet,
                    agent_name="moderator",
                    trigger_type="node_2_rebalancer_audit",
                    reasoning_text=f"[Node 2: Rebalancer Audit] Score: {rebalancer_eval.score}/100 | Drift: {rebalancer_eval.metrics.current_drift_pct}% (Limit: {rebalancer_eval.metrics.drift_threshold_pct}%) | Stables: {rebalancer_eval.metrics.stablecoin_reserve_pct}% | Historical Config: {'Respected' if rebalancer_eval.hallucination_audit.user_expectation_respected else 'Violated'} | State Success: {rebalancer_eval.metrics.state_machine_success_rate}%. {r_finding}",
                    action_taken=f"AUDITED_REBALANCER_{rebalancer_eval.status}",
                    status="completed"
                )

                # ─── STEP 3: AUDIT DEEP RESEARCH AGENT ───────────────────────
                print(f"\n[STEP 3/4 -> NODE 3: RESEARCH EVALUATOR] Auditing citation grounding & source verification...")
                research_eval = await self.research_evaluator.evaluate(user_wallet)
                res_finding = research_eval.findings[0] if research_eval.findings else "Research citation checks complete."
                faith_pct = int(research_eval.hallucination_audit.faithfulness_ratio * 100)
                print(f"[STEP 3/4 COMPLETE] Research Score: {research_eval.score}/100 | Status: {research_eval.status} | Faithfulness: {faith_pct}% | Grounded Claims: {research_eval.hallucination_audit.grounded_claims_count}/{research_eval.hallucination_audit.total_claims_audited}")
                log_agent_action(
                    user_wallet=user_wallet,
                    agent_name="moderator",
                    trigger_type="node_3_research_audit",
                    reasoning_text=f"[Node 3: Research Audit] Score: {research_eval.score}/100 | Faithfulness: {faith_pct}% grounded | Citations Density: {research_eval.metrics.avg_citation_density} | Sources Verified via search_rag: {research_eval.hallucination_audit.grounded_claims_count}/{research_eval.hallucination_audit.total_claims_audited} | Hallucinations: {research_eval.hallucination_audit.hallucination_severity}. {res_finding}",
                    action_taken=f"AUDITED_RESEARCH_{research_eval.status}",
                    status="completed"
                )

                # ─── STEP 4: FLEET SYNTHESIS & MASTER VERDICT ────────────────
                print(f"\n[STEP 4/4 -> NODE 4: FLEET SYNTHESIS] Synthesizing fleet scores, checking cross-agent conflicts...")
                combined_report: CombinedFleetReport = await self.fleet_synthesizer.synthesize(
                    user_wallet=user_wallet,
                    trader_eval=trader_eval,
                    rebalancer_eval=rebalancer_eval,
                    research_eval=research_eval
                )

                killed_str = ", ".join(combined_report.killed_agents) if combined_report.killed_agents else "None"
                print(f"[STEP 4/4 COMPLETE] Fleet Mean Score: {combined_report.total_mean_score}/100 | Master Verdict: {combined_report.verdict}")
                if combined_report.killed_agents:
                    print(f"[ALERT: AGENT HALTED] Agents below kill threshold ({combined_report.user_kill_threshold}): {killed_str}")
                else:
                    print(f"[THRESHOLD CHECK] All agents above threshold ({combined_report.user_kill_threshold}). No kills triggered.")

                log_agent_action(
                    user_wallet=user_wallet,
                    agent_name="moderator",
                    trigger_type="node_4_fleet_synthesis",
                    reasoning_text=f"[Node 4: Fleet Synthesis] Fleet Total Mean Score: {combined_report.total_mean_score}/100 | Master Verdict: {combined_report.verdict} | Cannibalization: {'Detected' if combined_report.cross_agent_conflicts.cannibalization_detected else 'Zero'} | Killed Agents: {killed_str} (Threshold: {combined_report.user_kill_threshold}) | CID: {combined_report.cid}",
                    action_taken=f"FLEET_VERDICT_{combined_report.verdict}",
                    cid_reference=combined_report.cid,
                    status="completed"
                )

                print(f"\n{'='*75}")
                print(f"[MODERATOR DELIBERATION FINISHED] Verdict: {combined_report.verdict} | Fleet Mean: {combined_report.total_mean_score}/100 | CID: {combined_report.cid}")
                print(f"{'='*75}\n")

                data = combined_report.model_dump()

                # Backward compatibility with existing UI components
                data["has_evaluation"] = True
                data["health_score"] = data.get("total_mean_score")
                data["overall_performance_score"] = data.get("total_mean_score")
                data["open_trades_count"] = trader_eval.metrics.open_trades_count
                data["total_open_exposure_usd"] = trader_eval.metrics.open_exposure_usd
                data["daily_limit_usd"] = float(user.get("daily_limit") or (float(user.get("max_tx_amount", 500.0)) * int(user.get("trader_max_trades_per_day", 3))))
                data["max_tx_amount_usd"] = float(user.get("max_tx_amount", 500.0))
                data["dropped_trades_count"] = trader_eval.metrics.dropped_trades_count
                data["dropped_trades"] = get_dropped_trades(user_wallet, limit=5)
                data["fleet_summary"] = get_fleet_activity(user_wallet)
                data["is_active"] = bool(user.get("moderator_active", 0)) and not kill_switch

                # Attach recent moderator logs
                recent_logs = get_agent_logs(user_wallet, limit=20, agent_name="moderator")
                data["moderator_logs"] = recent_logs

                return data
            finally:
                ModeratorAgent._is_running_deliberation = False
                ModeratorAgent._active_target_wallet = None

    async def evaluate_fleet_stream(self, user_wallet: str):
        """
        Streams 4-Node Watchdog Deliberation in real-time as NDJSON events:
        Node 1: Trader Agent Evaluator & Audit
        Node 2: Rebalancer Agent Evaluator & Drift Audit
        Node 3: Deep Research Agent Evaluator & Citation Audit
        Node 4: Fleet Synthesizer & Master Verdict
        """
        yield json.dumps({
            "type": "start",
            "user_wallet": user_wallet,
            "message": "Initiating 4-Node Watchdog Fleet Deliberation..."
        }) + "\n"

        try:
            user = get_user(user_wallet) or {}
            kill_switch = bool(user.get("kill_switch", 0))
            kill_thresh = float(user.get("moderator_kill_threshold", 50.0))

            # Node 1: Trader
            yield json.dumps({
                "type": "step",
                "step_number": 1,
                "step_name": "Trader Agent Audit",
                "title": "Quantitative Trader Hallucination & Risk Audit",
                "status": "running",
                "message": "Auditing trader win-rate, R:R math, and reasoning traces..."
            }) + "\n"

            trader_eval = await self.trader_evaluator.evaluate(user_wallet)
            t_finding = trader_eval.findings[0] if trader_eval.findings else "Trader checks complete."
            yield json.dumps({
                "type": "step",
                "step_number": 1,
                "step_name": "Trader Agent Audit",
                "title": "Quantitative Trader Hallucination & Risk Audit",
                "status": "completed",
                "score": trader_eval.score,
                "health": trader_eval.status,
                "message": f"Trader Score: {trader_eval.score}/100 | Status: {trader_eval.status} | {t_finding}",
                "data": trader_eval.model_dump()
            }) + "\n"

            # Node 2: Rebalancer
            yield json.dumps({
                "type": "step",
                "step_number": 2,
                "step_name": "Rebalancer Agent Audit",
                "title": "Portfolio Drift & Stablecoin Floor Audit",
                "status": "running",
                "message": "Auditing portfolio drift, stablecoin floor, and rebalance execution..."
            }) + "\n"

            rebalancer_eval = await self.rebalancer_evaluator.evaluate(user_wallet)
            r_finding = rebalancer_eval.findings[0] if rebalancer_eval.findings else "Rebalancer checks complete."
            yield json.dumps({
                "type": "step",
                "step_number": 2,
                "step_name": "Rebalancer Agent Audit",
                "title": "Portfolio Drift & Stablecoin Floor Audit",
                "status": "completed",
                "score": rebalancer_eval.score,
                "health": rebalancer_eval.status,
                "message": f"Rebalancer Score: {rebalancer_eval.score}/100 | Drift: {rebalancer_eval.metrics.current_drift_pct}% (Limit: {rebalancer_eval.metrics.drift_threshold_pct}%) | {r_finding}",
                "data": rebalancer_eval.model_dump()
            }) + "\n"

            # Node 3: Deep Research
            yield json.dumps({
                "type": "step",
                "step_number": 3,
                "step_name": "Deep Research Audit",
                "title": "Citation Grounding & Fact Accuracy Audit",
                "status": "running",
                "message": "Auditing source citation grounding and fact accuracy against RAG..."
            }) + "\n"

            research_eval = await self.research_evaluator.evaluate(user_wallet)
            res_finding = research_eval.findings[0] if research_eval.findings else "Research citation checks complete."
            faith_pct = int(research_eval.hallucination_audit.faithfulness_ratio * 100)
            yield json.dumps({
                "type": "step",
                "step_number": 3,
                "step_name": "Deep Research Audit",
                "title": "Citation Grounding & Fact Accuracy Audit",
                "status": "completed",
                "score": research_eval.score,
                "health": research_eval.status,
                "message": f"Research Score: {research_eval.score}/100 | Faithfulness: {faith_pct}% | {res_finding}",
                "data": research_eval.model_dump()
            }) + "\n"

            # Node 4: Fleet Synthesis
            yield json.dumps({
                "type": "step",
                "step_number": 4,
                "step_name": "Fleet Master Synthesis",
                "title": "Cross-Agent Conflict Check & Master Verdict",
                "status": "running",
                "message": "Checking cross-agent order cannibalization and computing fleet verdict..."
            }) + "\n"

            combined_report: CombinedFleetReport = await self.fleet_synthesizer.synthesize(
                user_wallet=user_wallet,
                trader_eval=trader_eval,
                rebalancer_eval=rebalancer_eval,
                research_eval=research_eval
            )
            killed_str = ", ".join(combined_report.killed_agents) if combined_report.killed_agents else "None"
            yield json.dumps({
                "type": "step",
                "step_number": 4,
                "step_name": "Fleet Master Synthesis",
                "title": "Cross-Agent Conflict Check & Master Verdict",
                "status": "completed",
                "verdict": combined_report.verdict,
                "score": combined_report.total_mean_score,
                "message": f"Master Verdict: {combined_report.verdict} | Fleet Mean Score: {combined_report.total_mean_score}/100 | Halted: {killed_str}",
                "data": combined_report.model_dump()
            }) + "\n"

            data = combined_report.model_dump()
            data["has_evaluation"] = True
            data["health_score"] = data.get("total_mean_score")
            data["overall_performance_score"] = data.get("total_mean_score")
            data["open_trades_count"] = trader_eval.metrics.open_trades_count
            data["total_open_exposure_usd"] = trader_eval.metrics.open_exposure_usd
            data["daily_limit_usd"] = float(user.get("daily_limit") or (float(user.get("max_tx_amount", 500.0)) * int(user.get("trader_max_trades_per_day", 3))))
            data["max_tx_amount_usd"] = float(user.get("max_tx_amount", 500.0))
            data["dropped_trades_count"] = trader_eval.metrics.dropped_trades_count
            data["dropped_trades"] = get_dropped_trades(user_wallet, limit=5)
            data["fleet_summary"] = get_fleet_activity(user_wallet)
            data["is_active"] = bool(user.get("moderator_active", 0)) and not kill_switch
            data["moderator_logs"] = get_agent_logs(user_wallet, limit=20, agent_name="moderator")

            yield json.dumps({"type": "final", "result": data}) + "\n"
        except Exception as e:
            import traceback
            tb = traceback.format_exc()
            print(f"\n[MODERATOR STREAM ERROR] Deliberation failed:\n{tb}")
            yield json.dumps({
                "type": "error",
                "error": str(e),
                "message": f"Watchdog deliberation failed: {str(e)}"
            }) + "\n"

    async def get_watchdog_status(self, user_wallet: str) -> Dict[str, Any]:
        """
        Fast, non-blocking telemetry retrieval for UI queries (returns in < 5ms).
        Returns the latest persisted 4-Node evaluation from database if available,
        along with live user status flags (is_active, kill_switch, threshold).
        Does NOT trigger expensive LLM-as-a-Judge evaluations automatically on GET.
        """
        user = get_user(user_wallet) or {}
        kill_switch = bool(user.get("kill_switch", 0))
        kill_threshold = float(user.get("moderator_kill_threshold", 50.0))
        is_active = bool(user.get("moderator_active", 0)) and not kill_switch

        latest = get_latest_moderator_evaluation(user_wallet)

        cadence_info = get_moderator_cadence_info(user_wallet)

        if latest and latest.get("evaluation_data"):
            data = dict(latest["evaluation_data"])
            data["has_evaluation"] = True
            data["user_wallet"] = user_wallet
            data["is_active"] = is_active
            data["kill_switch_active"] = kill_switch
            data["user_kill_threshold"] = kill_threshold
            data["health_score"] = data.get("total_mean_score")
            data["overall_performance_score"] = data.get("total_mean_score")
            data["daily_limit_usd"] = float(user.get("daily_limit") or (float(user.get("max_tx_amount", 500.0)) * int(user.get("trader_max_trades_per_day", 3))))
            data["max_tx_amount_usd"] = float(user.get("max_tx_amount", 500.0))
            data["dropped_trades"] = get_dropped_trades(user_wallet, limit=5)
            data["fleet_summary"] = get_fleet_activity(user_wallet)
            # User configurable cadence telemetry
            data["moderator_frequency"] = cadence_info["frequency"]
            data["cadence_days"] = cadence_info["cadence_days"]
            data["last_run_at"] = cadence_info["last_run_at"]
            data["next_run_due_at"] = cadence_info["next_run_due_at"]
            data["days_remaining"] = cadence_info["days_remaining"]
            data["is_due"] = cadence_info["is_due"]
            return data

        # Standby status when zero evaluations exist - NO hardcoded fake scores
        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            "timestamp": now_iso,
            "user_wallet": user_wallet,
            "has_evaluation": False,
            "total_mean_score": None,
            "overall_performance_score": None,
            "trader_score": None,
            "rebalancer_score": None,
            "research_score": None,
            "user_kill_threshold": kill_threshold,
            "killed_agents": [],
            "kill_switch_active": kill_switch,
            "is_active": is_active,
            "verdict": "NOT_AUDITED",
            "verdict_rationale": "No fleet audit recorded yet for this wallet.",
            "daily_limit_usd": float(user.get("daily_limit") or (float(user.get("max_tx_amount", 500.0)) * int(user.get("trader_max_trades_per_day", 3)))),
            "max_tx_amount_usd": float(user.get("max_tx_amount", 500.0)),
            "total_open_exposure_usd": 0.0,
            "open_trades_count": 0,
            "dropped_trades_count": len(get_dropped_trades(user_wallet, limit=5)),
            "health_score": None,
            "dropped_trades": get_dropped_trades(user_wallet, limit=5),
            "fleet_summary": get_fleet_activity(user_wallet),
            "key_findings": [],
            "recommended_tuning": [],
            "moderator_frequency": cadence_info["frequency"],
            "cadence_days": cadence_info["cadence_days"],
            "last_run_at": cadence_info["last_run_at"],
            "next_run_due_at": cadence_info["next_run_due_at"],
            "days_remaining": cadence_info["days_remaining"],
            "is_due": cadence_info["is_due"]
        }

    async def run_cadence_check(self, user_wallet: str) -> Optional[Dict[str, Any]]:
        """
        Autonomous cadence executor:
        Checks if the agent is active and due for its configured cadence (1w, 2w, 1m).
        Only runs deliberation if the time threshold has elapsed.
        Concurrency Guard: Never activates if another analysis is already in progress.
        """
        if ModeratorAgent._is_running_deliberation or ModeratorAgent._deliberation_lock.locked():
            print(f"[MODERATOR CADENCE] Deliberation already in progress across the fleet. Skipping autonomous cadence check for '{user_wallet}' to prevent clash.")
            return None

        user = get_user(user_wallet) or {}
        is_active = bool(user.get("moderator_active", 0))
        kill_switch = bool(user.get("kill_switch", 0))

        if not is_active or kill_switch:
            return None

        cadence = get_moderator_cadence_info(user_wallet)
        if not cadence.get("is_due", False):
            days_left = cadence.get("days_remaining", 0.0)
            print(f"[MODERATOR CADENCE] Wallet {user_wallet} is on {cadence.get('frequency')} ({cadence.get('cadence_days')}d) cadence. Next run in ~{days_left:.1f} days. Standing aside.")
            return None

        print(f"[MODERATOR CADENCE] Wallet {user_wallet} is DUE for scheduled {cadence.get('frequency')} audit. Executing 4-node deliberation...")
        return await self.evaluate_fleet_performance(user_wallet)

    async def trigger_emergency_kill_switch(self, user_wallet: str, unwind_to_stables: bool = True) -> Dict[str, Any]:
        """Emergency Stop: Halts all autonomous agents, revokes keys, and marks trades as REVOKED."""
        activate_kill_switch(user_wallet)

        open_trades = get_open_trades(user_wallet)
        revoked_count = 0
        for trade in open_trades:
            update_trade_status(trade["id"], "REVOKED")
            revoked_count += 1

        print(f"\n{'='*75}")
        print(f"[MODERATOR EMERGENCY KILL SWITCH] ACTIVATED for wallet: {user_wallet}")
        print(f"Action: Revoking all {revoked_count} active trades and halting all autonomous runner loops.")
        print(f"{'='*75}\n")

        log_agent_action(
            user_wallet=user_wallet,
            agent_name="moderator",
            trigger_type="emergency_kill_switch",
            reasoning_text=f"Kill switch activated! Revoked {revoked_count} active trades and suspended autonomous runners.",
            action_taken="KILL_SWITCH_ACTIVE",
            status="revoked"
        )

        return {
            "success": True,
            "message": f"Kill switch successfully triggered. {revoked_count} trades revoked. All agents halted.",
            "unwind_requested": unwind_to_stables,
            "user_wallet": user_wallet
        }

    async def reset_kill_switch(self, user_wallet: str) -> Dict[str, Any]:
        """Reset the kill switch back to normal monitoring and restore agents."""
        deactivate_kill_switch(user_wallet, restore_agents=True)

        print(f"\n{'='*75}")
        print(f"[MODERATOR KILL SWITCH RESET] Resetting safety switch for wallet: {user_wallet}")
        print("Action: Restoring agent active states and resuming autonomous watchdog surveillance.")
        print(f"{'='*75}\n")

        log_agent_action(
            user_wallet=user_wallet,
            agent_name="moderator",
            trigger_type="kill_switch_reset",
            reasoning_text="Safety checks verified. Moderator resumed standard watchdog surveillance and restored agents.",
            action_taken="RESUMED_NORMAL",
            status="active"
        )
        return {
            "success": True,
            "message": "Kill switch deactivated. Normal autonomous monitoring resumed and agents restored.",
            "user_wallet": user_wallet
        }


# Singleton
moderator_agent = ModeratorAgent()
