import {
  computeStats,
  fmtPct,
  fmtUsd,
  pickList,
  pickNum,
  pickText,
  type DashboardData,
  type HelpTopic,
} from "./dashboard-types";

export const HELP_TOPICS: { id: HelpTopic; label: string }[] = [
  { id: "overview", label: "Give me the big picture" },
  { id: "profit", label: "How am I doing on profit?" },
  { id: "risk", label: "Is my risk too high?" },
  { id: "change", label: "What should I change?" },
  { id: "drift", label: "What is drift?" },
  { id: "research", label: "What did research find?" },
];

export interface HelpAnswer {
  title: string;
  paragraphs: string[];
  bullets: string[];
}

export function answerFor(topic: HelpTopic, data: DashboardData): HelpAnswer {
  const mod = data.moderator;
  const stats = computeStats(data.trades);

  if (topic === "profit") {
    const paragraphs: string[] = [];
    if (stats.fills.length === 0) {
      paragraphs.push("There are no trades yet, so there is no profit or loss to measure. Once the Trader places its first trade it will show here.");
    } else {
      paragraphs.push(
        `Your trades are ${stats.totalPnl >= 0 ? "up" : "down"} ${fmtUsd(Math.abs(stats.totalPnl))} in total: ${fmtUsd(stats.realizedPnl)} already locked in from closed trades and ${fmtUsd(stats.unrealizedPnl)} still moving on open ones.`,
      );
      if (stats.winRate !== null) {
        paragraphs.push(`${stats.winRate.toFixed(0)}% of your closed trades made money (${stats.wins} wins, ${stats.losses} losses).`);
      }
    }
    const bullets: string[] = [];
    if (stats.best) bullets.push(`Best trade: ${stats.best.symbol} at ${fmtUsd(stats.best.pnl)} (${fmtPct(stats.best.pct)}).`);
    if (stats.worst) bullets.push(`Weakest trade: ${stats.worst.symbol} at ${fmtUsd(stats.worst.pnl)} (${fmtPct(stats.worst.pct)}).`);
    const missed = pickText(mod, "what_was_missed");
    if (missed) bullets.push(`Moderator says the Trader missed: ${missed}`);
    return { title: "How your profit looks", paragraphs, bullets };
  }

  if (topic === "risk") {
    const exposure = pickNum(mod, "total_open_exposure_usd") ?? stats.exposure;
    const limit = pickNum(mod, "daily_limit_usd");
    const paragraphs = [
      `You currently have ${fmtUsd(exposure)} in open trades${limit ? ` against a daily limit of ${fmtUsd(limit)}` : ""}.`,
    ];
    if (limit && limit > 0) {
      const used = (exposure / limit) * 100;
      paragraphs.push(
        used >= 80
          ? `That is ${used.toFixed(0)}% of your limit, which is close to the cap. The Trader will stop opening new trades when it reaches it.`
          : `That is ${used.toFixed(0)}% of your limit, so there is still room before the safety cap applies.`,
      );
    }
    const bullets: string[] = [];
    if (data.drift?.max_drift_pct !== undefined) {
      bullets.push(`Your portfolio is ${data.drift.max_drift_pct.toFixed(1)}% away from its target mix.`);
    }
    bullets.push(data.fleet?.kill_switch_active ? "The kill switch is ON, so every agent is stopped." : "The kill switch is off. You can stop all agents at any time from the Moderator page.");
    const killed = pickList(mod, "killed_agents");
    if (killed.length) bullets.push(`Agents the Moderator has stopped: ${killed.join(", ")}.`);
    return { title: "Your risk right now", paragraphs, bullets };
  }

  if (topic === "change") {
    const tuning = pickList(mod, "recommended_tuning");
    const paragraphs = tuning.length
      ? ["These are the Moderator's latest suggestions. Nothing changes until you apply them on the agent's own page."]
      : ["The Moderator has no tuning suggestions yet. Run a fresh review to get some."];
    const bullets = [...tuning];
    const missed = pickText(mod, "what_was_missed");
    if (missed) bullets.push(`Gap noticed: ${missed}`);
    return { title: "What to change", paragraphs, bullets };
  }

  if (topic === "drift") {
    const paragraphs = [
      "Drift is how far your portfolio has moved from the mix you asked for. If you wanted 50% in one coin and it grew to 60%, your drift is 10%.",
      "The Portfolio agent steps in to rebalance when drift passes the limit you set, so a small drift is normal and not a problem.",
    ];
    const bullets: string[] = [];
    if (data.drift?.max_drift_pct !== undefined) bullets.push(`Right now your biggest gap is ${data.drift.max_drift_pct.toFixed(1)}%.`);
    if (data.drift?.total_portfolio_usd !== undefined) bullets.push(`Total portfolio value: ${fmtUsd(data.drift.total_portfolio_usd)}.`);
    if (data.drift?.action_taken) bullets.push(`Last action: ${data.drift.action_taken}`);
    return { title: "What drift means", paragraphs, bullets };
  }

  if (topic === "research") {
    const latest = data.reports[0];
    if (!latest) {
      return {
        title: "Latest research",
        paragraphs: ["No reports yet. Open the Research agent and run a report to see its signal here."],
        bullets: [],
      };
    }
    const paragraphs = [latest.title];
    if (latest.summary) paragraphs.push(latest.summary);
    const bullets: string[] = [];
    if (latest.regime) bullets.push(`Market mood: ${latest.regime}.`);
    if (latest.actionable_signal) {
      const s = latest.actionable_signal;
      bullets.push(`Signal: ${s.action} ${s.target_asset} with ${Math.round(s.confidence)}% confidence${s.recommended_timeframe ? ` over ${s.recommended_timeframe}` : ""}.`);
    }
    return { title: "Latest research", paragraphs, bullets };
  }

  const verdict = pickText(mod, "verdict");
  const rationale = pickText(mod, "verdict_rationale");
  const summary = pickText(mod, "fleet_summary");
  const paragraphs: string[] = [];
  if (verdict) paragraphs.push(`Overall verdict: ${verdict}.`);
  if (rationale) paragraphs.push(rationale);
  if (summary) paragraphs.push(summary);
  if (paragraphs.length === 0) {
    paragraphs.push("The Moderator has not reviewed your agents yet. Press Run a fresh review to get its first read.");
  }
  const bullets = [...pickList(mod, "strengths").map((s) => `Going well: ${s}`), ...pickList(mod, "key_findings")];
  return { title: "The big picture", paragraphs, bullets };
}
