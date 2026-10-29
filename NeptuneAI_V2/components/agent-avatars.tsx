"use client";

import React from "react";
import Image from "next/image";

type AvatarProps = {
  size?: number;
  className?: string;
};

export function TraderAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <span
  className={`inline-flex shrink-0 items-center justify-center bg-white ${className}`}
  style={{
  width: size,
  height: size,
  borderRadius: size * 0.28,
  padding: size * 0.06,
  }}
  >
  <Image
  src="/images/agent-trader.png"
  alt="Autonomous Trader"
  width={size * 2}
  height={size * 2}
  className="h-full w-full object-contain"
  />
  </span>
  );
}

export function ModeratorAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        padding: size * 0.1,
      }}
    >
      <Image
        src="/images/agent-moderator.png"
        alt="Moderator Watchdog"
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function ResearchAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        padding: size * 0.1,
      }}
    >
      <Image
        src="/images/agent-researcher.png"
        alt="Deep Research"
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function RebalancerAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-white ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        padding: size * 0.08,
      }}
    >
      <Image
        src="/images/agent-rebalancer.png"
        alt="Portfolio Rebalancer"
        width={size * 2}
        height={size * 2}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

/**
 * Universal Agent Avatar Dispatcher
 */
export function AgentAvatar({
  agentId,
  size = 32,
  className = ""
}: {
  agentId: "trader" | "moderator" | "research" | "rebalancer" | string;
  size?: number;
  className?: string;
}) {
  const norm = agentId?.toLowerCase();
  if (norm === "trader") {
    return <TraderAgentAvatar size={size} className={className} />;
  }
  if (norm === "moderator") {
    return <ModeratorAgentAvatar size={size} className={className} />;
  }
  if (norm === "research") {
    return <ResearchAgentAvatar size={size} className={className} />;
  }
  if (norm === "rebalancer") {
    return <RebalancerAgentAvatar size={size} className={className} />;
  }
  return <TraderAgentAvatar size={size} className={className} />;
}
