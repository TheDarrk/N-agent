"use client";

import React, { useState } from "react";

type AvatarProps = {
  size?: number;
  className?: string;
  fallbackEmoji?: string;
};

const AGENT_CONFIGS: Record<string, { src: string; alt: string; emoji: string }> = {
  trader: { src: "/agents/trader.svg", alt: "Autonomous Trader", emoji: "📈" },
  rebalancer: { src: "/agents/rebalancer.svg", alt: "Portfolio Rebalancer", emoji: "⚖️" },
  research: { src: "/agents/research.svg", alt: "Deep Research", emoji: "🔬" },
  moderator: { src: "/agents/moderator.svg", alt: "Moderator Watchdog", emoji: "🛡️" },
  marketplace: { src: "/agents/marketplace.svg", alt: "Agent Marketplace", emoji: "🏪" },
};

export function AgentLogo({
  agentId,
  size = 32,
  className = "",
  fallbackEmoji
}: {
  agentId: string;
  size?: number;
  className?: string;
  fallbackEmoji?: string;
}) {
  const norm = (agentId || "trader").toLowerCase();
  const config = AGENT_CONFIGS[norm] || AGENT_CONFIGS.trader;
  const emoji = fallbackEmoji || config.emoji;
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center select-none ${className}`}
        style={{
          width: size,
          height: size,
          fontSize: Math.max(12, Math.floor(size * 0.65)),
          lineHeight: 1,
        }}
        role="img"
        aria-label={config.alt}
      >
        {emoji}
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        src={config.src}
        alt={config.alt}
        width={size}
        height={size}
        onError={() => setHasError(true)}
        className="h-full w-full object-contain"
        loading="lazy"
      />
    </span>
  );
}

export function TraderAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return <AgentLogo agentId="trader" size={size} className={className} />;
}

export function ModeratorAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return <AgentLogo agentId="moderator" size={size} className={className} />;
}

export function ResearchAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return <AgentLogo agentId="research" size={size} className={className} />;
}

export function RebalancerAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return <AgentLogo agentId="rebalancer" size={size} className={className} />;
}

export function MarketplaceAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return <AgentLogo agentId="marketplace" size={size} className={className} />;
}

/**
 * Universal Agent Avatar Dispatcher
 */
export function AgentAvatar({
  agentId,
  size = 32,
  className = ""
}: {
  agentId: "trader" | "moderator" | "research" | "rebalancer" | "marketplace" | string;
  size?: number;
  className?: string;
}) {
  const norm = agentId?.toLowerCase();
  return <AgentLogo agentId={norm} size={size} className={className} />;
}
