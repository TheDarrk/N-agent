"use client";

import React, { useState } from "react";

type AvatarProps = {
  size?: number;
  className?: string;
};

const AGENT_CONFIGS: Record<string, { src: string; fallbackSrc: string; alt: string }> = {
  trader: {
    src: "/images/agent-trader.png",
    fallbackSrc: "/agents/trader.svg",
    alt: "Autonomous Trader",
  },
  rebalancer: {
    src: "/images/agent-rebalancer.png",
    fallbackSrc: "/agents/rebalancer.svg",
    alt: "Portfolio Rebalancer",
  },
  research: {
    src: "/images/agent-researcher.png",
    fallbackSrc: "/agents/research.svg",
    alt: "Deep Research",
  },
  moderator: {
    src: "/images/agent-moderator.png",
    fallbackSrc: "/agents/moderator.svg",
    alt: "Moderator Watchdog",
  },
  marketplace: {
    src: "/neptune-logo.png",
    fallbackSrc: "/agents/marketplace.svg",
    alt: "Agent Marketplace",
  },
};

export function AgentLogo({
  agentId,
  size = 32,
  className = "",
}: {
  agentId: string;
  size?: number;
  className?: string;
  fallbackEmoji?: string;
}) {
  const norm = (agentId || "trader").toLowerCase();
  const config = AGENT_CONFIGS[norm] || AGENT_CONFIGS.trader;
  const [imgSrc, setImgSrc] = useState(config.src);
  const [hasError, setHasError] = useState(false);

  const handleError = () => {
    if (imgSrc !== config.fallbackSrc) {
      setImgSrc(config.fallbackSrc);
    } else {
      setHasError(true);
    }
  };

  if (hasError) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-purple-500/20 border border-primary/30 overflow-hidden ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src="/neptune-logo.png"
          alt={config.alt}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-secondary/30 ${className}`}
      style={{
        width: size,
        height: size,
      }}
    >
      <img
        src={imgSrc}
        alt={config.alt}
        width={size}
        height={size}
        onError={handleError}
        className="h-full w-full object-cover"
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
