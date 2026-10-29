const TICKER_PATH =
  "M0 34 L12 30 L24 33 L36 22 L48 26 L60 16 L72 20 L84 12 L96 24 L108 18 L120 28 L132 14 L144 20 L156 10 L168 22 L180 30 L200 34";

const EQ_BARS = [
  { d: 0, flag: false },
  { d: 0.3, flag: false },
  { d: 0.1, flag: false },
  { d: 0.6, flag: false },
  { d: 0.2, flag: false },
  { d: 0.8, flag: true },
  { d: 0.4, flag: false },
  { d: 0.9, flag: false },
  { d: 0.15, flag: false },
  { d: 0.55, flag: false },
  { d: 0.35, flag: false },
  { d: 0.7, flag: false },
  { d: 0.05, flag: false },
  { d: 0.5, flag: false },
  { d: 0.85, flag: false },
  { d: 0.25, flag: false }
];

const SOURCE_LINES = [
  { w: "92%", d: "0s" },
  { w: "68%", d: "0.5s" },
  { w: "80%", d: "1s" }
];

const SCENE_LABEL: Record<string, string> = {
  trader: "Watching the market",
  research: "Gathering sources",
  moderator: "Watching the chat",
  rebalancer: "Balancing your mix"
};

function TraderArt() {
  return (
    <div className="scene-ticker-frame h-full w-full overflow-hidden" aria-hidden="true">
      <div className="scene-ticker">
        {[0, 1].map((i) => (
          <svg
            key={i}
            viewBox="0 0 200 48"
            preserveAspectRatio="none"
            className="h-full flex-[0_0_50%]"
          >
            <path d={`${TICKER_PATH} L200 48 L0 48 Z`} fill="hsl(var(--glow))" fillOpacity="0.14" />
            <path
              d={TICKER_PATH}
              fill="none"
              stroke="hsl(var(--glow))"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ))}
      </div>
    </div>
  );
}

function ResearchArt() {
  return (
    <div className="flex h-full items-center gap-4" aria-hidden="true">
      <div className="scene-radar shrink-0">
        <span className="scene-radar-sweep" />
        <span className="scene-blip" style={{ top: "22%", left: "62%", animationDelay: "0.3s" }} />
        <span className="scene-blip" style={{ top: "60%", left: "30%", animationDelay: "1.1s" }} />
        <span className="scene-blip" style={{ top: "68%", left: "68%", animationDelay: "1.8s" }} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {SOURCE_LINES.map((line) => (
          <span
            key={line.d}
            className="scene-line"
            style={{ width: line.w, animationDelay: line.d }}
          />
        ))}
      </div>
    </div>
  );
}

function ModeratorArt() {
  return (
    <div className="scene-eq-frame relative flex h-full items-end justify-between gap-1" aria-hidden="true">
      {EQ_BARS.map((bar, i) => (
        <span
          key={i}
          className={bar.flag ? "scene-eq-bar scene-eq-flag" : "scene-eq-bar"}
          style={{ animationDelay: `${bar.d}s` }}
        />
      ))}
      <span className="scene-scan" />
    </div>
  );
}

function RebalancerArt() {
  return (
    <div className="flex h-full flex-col justify-center gap-2" aria-hidden="true">
      <div className="scene-split-track">
        <span className="scene-split-a" />
        <span className="scene-split-b" />
      </div>
      <div className="flex items-center justify-between text-xs font-bold text-foreground/80">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--glow))" }} />
          Stable coins
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "hsl(var(--glow) / 0.35)" }} />
          Crypto
        </span>
      </div>
    </div>
  );
}

export function AgentCardScene({ agentId, isActive }: { agentId: string; isActive: boolean }) {
  const label = isActive ? (SCENE_LABEL[agentId] ?? SCENE_LABEL.trader) : "Resting";

  return (
    <div className="scene relative rounded-2xl border p-3" style={{ borderColor: "hsl(var(--glow) / 0.25)", backgroundColor: "hsl(var(--glow) / 0.07)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isActive ? "animate-glow" : ""}`} style={{ backgroundColor: "hsl(var(--glow))" }} />
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="scene-art h-12">
        {agentId === "research" ? (
          <ResearchArt />
        ) : agentId === "moderator" ? (
          <ModeratorArt />
        ) : agentId === "rebalancer" ? (
          <RebalancerArt />
        ) : (
          <TraderArt />
        )}
      </div>
    </div>
  );
}
