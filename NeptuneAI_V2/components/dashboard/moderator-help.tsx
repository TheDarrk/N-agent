"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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
  wallet?: string | null;
  context?: Record<string, unknown>;
  onOpenChange: (open: boolean) => void;
  onRun: () => void;
  onOpenModerator: () => void;
};

const SCORES: { key: string; label: string }[] = [
  { key: "trader_score", label: "Trader" },
  { key: "rebalancer_score", label: "Portfolio" },
  { key: "research_score", label: "Research" },
];

type LiveAnswer = { answer: string; highlights: string[]; next_steps: string[]; source: string; nodes_used: string[]; as_of_utc?: string };

export default function ModeratorHelp({ open, topic, data, running, onTopic, onOpenChange, onRun, onOpenModerator, wallet, context }: Props) {
  const [live, setLive] = useState<LiveAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const reqRef = useRef(0);

  // Ask the backend: each section has its own context nodes that feed the Moderator that section's real data.
  const askBackend = React.useCallback(async (q: string) => {
    if (!wallet) return;
    const id = ++reqRef.current;
    setAsking(true);
    setAskError(null);
    try {
      const res = await fetch("/api/moderator/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_wallet: wallet, section: topic, question: q || undefined, client: context }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.detail || json.error || "The Moderator could not answer right now");
      if (id === reqRef.current) setLive(json as LiveAnswer);
    } catch (e: any) {
      if (id === reqRef.current) {
        setLive(null);
        setAskError(e?.message || "The Moderator could not answer right now");
      }
    } finally {
      if (id === reqRef.current) setAsking(false);
    }
  }, [wallet, topic, context]);

  // New topic / panel opened => ask about that section straight away
  useEffect(() => {
    if (!open) return;
    setQuestion("");
    setLive(null);
    askBackend("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topic]);

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

          <form
            onSubmit={(e) => {
              e.preventDefault();
              askBackend(question.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about this section (optional)..."
              className="min-w-0 flex-1 rounded-xl border border-border bg-secondary px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={asking || !wallet}
              className="key3d rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              Ask
            </button>
          </form>

          <article className="rounded-2xl border border-border bg-card p-4" aria-live="polite" aria-busy={asking}>
            {asking ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={15} className="animate-spin" />
                Reading your {topic} data and thinking...
              </div>
            ) : live ? (
              <>
                <h3 className="text-base font-semibold text-foreground">{HELP_TOPICS.find((t) => t.id === topic)?.label || "Moderator"}</h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/90 text-pretty">{live.answer}</p>
                {live.highlights?.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
                    {live.highlights.map((b, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true" />
                        <span className="text-pretty">{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {live.next_steps?.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">What you can do</p>
                    <ul className="mt-1.5 flex flex-col gap-1.5">
                      {live.next_steps.map((b, i) => (
                        <li key={i} className="text-sm leading-relaxed text-foreground/90">- {b}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  Based on your live {live.nodes_used?.join(", ")} data
                  {live.source === "data-only" ? " (AI explanation unavailable, showing facts only)" : ""}.
                </p>
              </>
            ) : (
              <>
                {askError && <p className="mb-2 text-xs text-amber-400">{askError}. Showing the summary from your dashboard data instead.</p>}
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
              </>
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
