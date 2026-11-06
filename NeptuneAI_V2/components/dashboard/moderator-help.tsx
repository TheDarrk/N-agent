"use client";

import React, { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { ModeratorAgentAvatar } from "@/components/agent-avatars";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { answerFor, HELP_TOPICS } from "./dashboard-answers";
import { pickList, pickNum, pickText, scoreToPct, type DashboardData, type HelpTopic } from "./dashboard-types";

type Props = {
  open: boolean;
  topic: HelpTopic;
  data: DashboardData;
  running: boolean;
  onTopic: (topic: HelpTopic) => void;
  onOpenChange: (open: boolean) => void;
  onRun: () => void;
  onOpenModerator: () => void;
};

const SCORES: { key: string; label: string }[] = [
  { key: "trader_score", label: "Trader" },
  { key: "rebalancer_score", label: "Portfolio" },
  { key: "research_score", label: "Research" },
];

export default function ModeratorHelp({ open, topic, data, running, onTopic, onOpenChange, onRun, onOpenModerator }: Props) {
  const answer = useMemo(() => answerFor(topic, data), [topic, data]);
  const mod = data.moderator;
  const lastRun = pickText(mod, "last_run_at");
  const conflicts = pickList(mod, "cross_agent_conflicts");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto border-border bg-background p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-5 text-left">
          <div className="flex items-center gap-3">
            <ModeratorAgentAvatar size={40} />
            <div>
              <SheetTitle className="text-lg">Ask the Moderator</SheetTitle>
              <SheetDescription className="text-sm leading-relaxed">
                Answers come from your live agent data, so they change as your agents work.
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 p-5">
          <div role="group" aria-label="Pick a question" className="flex flex-wrap gap-2">
            {HELP_TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={topic === t.id}
                onClick={() => onTopic(t.id)}
                className={`key3d rounded-lg border px-3 py-2 text-sm font-medium ${
                  topic === t.id
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : "border-border bg-secondary text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <article className="rounded-2xl border border-border bg-card p-4" aria-live="polite">
            <h3 className="text-base font-semibold text-foreground">{answer.title}</h3>
            <div className="mt-2 flex flex-col gap-2.5">
              {answer.paragraphs.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-foreground/90 text-pretty">
                  {p}
                </p>
              ))}
            </div>
            {answer.bullets.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                {answer.bullets.map((b, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                    <span className="text-pretty">{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <section aria-label="Agent scores" className="rounded-2xl border border-border bg-card p-4">
            <h3 className="text-base font-semibold text-foreground">How the Moderator scores your agents</h3>
            <div className="mt-3 flex flex-col gap-3">
              {SCORES.map((s) => {
                const pct = scoreToPct(pickNum(mod, s.key));
                return (
                  <div key={s.key}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-foreground">{s.label}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">{pct === null ? "Not scored yet" : `${Math.round(pct)}/100`}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-secondary">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct ?? 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            {conflicts.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                <p className="text-sm font-semibold text-amber-400">Agents disagree on:</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {conflicts.map((c, i) => (
                    <li key={i} className="text-sm leading-relaxed text-foreground/90">
                      {c}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={onRun}
              disabled={running}
              className="key3d flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {running ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
              {running ? "Reviewing your agents..." : "Run a fresh review"}
            </button>
            <button
              type="button"
              onClick={onOpenModerator}
              className="key3d rounded-xl border border-border bg-secondary px-4 py-3 text-sm font-semibold text-foreground"
            >
              Open the Moderator page
            </button>
            {lastRun && <p className="text-center text-xs text-muted-foreground">Last review: {new Date(lastRun).toLocaleString()}</p>}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
