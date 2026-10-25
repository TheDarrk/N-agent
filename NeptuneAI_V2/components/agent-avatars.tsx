"use client";

import React from "react";

type AvatarProps = {
  size?: number;
  className?: string;
};

/**
 * Quantitative Trader Agent Avatar (SVG):
 * Futuristic neon cyan cybernetic core with geometric candlestick matrices,
 * neural trend vectors, and algorithmic momentum circuit rings.
 */
export function TraderAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="traderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#06b6d4" />
          <stop offset="50%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id="candleUp" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <radialGradient id="traderGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Cybernetic Glow Field */}
      <circle cx="24" cy="24" r="23" fill="url(#traderGlow)" />

      {/* Outer Hexagonal Shield Ring */}
      <path
        d="M24 3L42 13.5V34.5L24 45L6 34.5V13.5L24 3Z"
        stroke="url(#traderGrad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#050e1f"
        fillOpacity="0.9"
      />

      {/* Circuit Nodes */}
      <circle cx="24" cy="3" r="1.5" fill="#06b6d4" />
      <circle cx="42" cy="13.5" r="1.5" fill="#3b82f6" />
      <circle cx="42" cy="34.5" r="1.5" fill="#8b5cf6" />
      <circle cx="24" cy="45" r="1.5" fill="#06b6d4" />
      <circle cx="6" cy="34.5" r="1.5" fill="#3b82f6" />
      <circle cx="6" cy="13.5" r="1.5" fill="#8b5cf6" />

      {/* Inner Technical Grid Lines */}
      <line x1="12" y1="24" x2="36" y2="24" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />
      <line x1="24" y1="12" x2="24" y2="36" stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" />

      {/* Candlestick 1 (Bearish Wick & Body) */}
      <line x1="16" y1="18" x2="16" y2="30" stroke="#06b6d4" strokeWidth="1" />
      <rect x="14.5" y="20" width="3" height="6" rx="0.8" fill="#0e7490" stroke="#06b6d4" strokeWidth="0.8" />

      {/* Candlestick 2 (Bullish Momentum Breakout) */}
      <line x1="24" y1="14" x2="24" y2="34" stroke="#22c55e" strokeWidth="1.2" />
      <rect x="22" y="17" width="4" height="10" rx="1" fill="url(#candleUp)" stroke="#4ade80" strokeWidth="0.8" />

      {/* Candlestick 3 (Higher High) */}
      <line x1="32" y1="12" x2="32" y2="28" stroke="#38bdf8" strokeWidth="1" />
      <rect x="30.5" y="15" width="3" height="7" rx="0.8" fill="#0284c7" stroke="#38bdf8" strokeWidth="0.8" />

      {/* Dynamic Exponential Trend Curve */}
      <path
        d="M13 28C17 27 20 22 24 20C28 18 31 15 35 12"
        stroke="#38bdf8"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Target Arrow Head */}
      <path d="M32 12H35V15" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Moderator Watchdog Agent Avatar (SVG):
 * Futuristic digital justice sentinel with an all-seeing cybernetic laser iris,
 * cryptographic scale balance, and defensive impenetrable matrix armor.
 */
export function ModeratorAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="modGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#f43f5e" />
        </linearGradient>
        <radialGradient id="modGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Cybernetic Glow Field */}
      <circle cx="24" cy="24" r="23" fill="url(#modGlow)" />

      {/* Outer Aegis Fortress Shield */}
      <path
        d="M24 4L39 9.5V23C39 33 32 41 24 44C16 41 9 33 9 23V9.5L24 4Z"
        stroke="url(#modGrad)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="#120520"
        fillOpacity="0.9"
      />

      {/* Inner Defensive Shield Crest */}
      <path
        d="M24 8L35 12.5V22C35 30 29.5 36.5 24 39.5C18.5 36.5 13 30 13 22V12.5L24 8Z"
        stroke="#581c87"
        strokeWidth="1"
        fill="#1e0c38"
        fillOpacity="0.5"
      />

      {/* Central Beam of Justice / Pillar */}
      <line x1="24" y1="12" x2="24" y2="33" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="24" cy="12" r="2.5" fill="#f43f5e" />

      {/* Balanced Crossbar Beam */}
      <line x1="15" y1="18" x2="33" y2="18" stroke="#e879f9" strokeWidth="1.5" strokeLinecap="round" />

      {/* Left Pan (Risk Vector) */}
      <line x1="17" y1="18" x2="15" y2="25" stroke="#a855f7" strokeWidth="0.8" />
      <line x1="17" y1="18" x2="19" y2="25" stroke="#a855f7" strokeWidth="0.8" />
      <path d="M14 25C14 27.5 20 27.5 20 25H14Z" fill="#7e22ce" stroke="#c084fc" strokeWidth="0.8" />

      {/* Right Pan (Capital Guard Vector) */}
      <line x1="31" y1="18" x2="29" y2="25" stroke="#a855f7" strokeWidth="0.8" />
      <line x1="31" y1="18" x2="33" y2="25" stroke="#a855f7" strokeWidth="0.8" />
      <path d="M28 25C28 27.5 34 27.5 34 25H28Z" fill="#7e22ce" stroke="#c084fc" strokeWidth="0.8" />

      {/* Sentinel Eye Core at Center Pivot */}
      <circle cx="24" cy="24" r="3" fill="#f43f5e" />
      <circle cx="24" cy="24" r="1.2" fill="#ffffff" />
    </svg>
  );
}

/**
 * Deep Research & Alpha Agent Avatar (SVG):
 * Futuristic cybernetic intelligence prism with floating quantum data shards,
 * holographic orbital lens, and neural analysis matrix.
 */
export function ResearchAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="resGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="50%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <radialGradient id="resGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Quantum Glow Field */}
      <circle cx="24" cy="24" r="23" fill="url(#resGlow)" />

      {/* Outer Diamond Matrix Portal */}
      <rect
        x="24"
        y="4"
        width="28.28"
        height="28.28"
        rx="6"
        transform="rotate(45 24 4)"
        stroke="url(#resGrad)"
        strokeWidth="1.8"
        fill="#041b16"
        fillOpacity="0.9"
      />

      {/* Concentric Scanner Rings */}
      <circle cx="24" cy="24" r="12" stroke="#065f46" strokeWidth="1" strokeDasharray="3 3" />
      <circle cx="24" cy="24" r="8" stroke="#10b981" strokeWidth="1" />

      {/* Analytical Reticle / Crosshair */}
      <line x1="24" y1="11" x2="24" y2="15" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="24" y1="33" x2="24" y2="37" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="11" y1="24" x2="15" y2="24" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="33" y1="24" x2="37" y2="24" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" />

      {/* Floating Alpha Shards */}
      <rect x="22.5" y="22.5" width="3" height="3" transform="rotate(45 24 24)" fill="#34d399" />
      <circle cx="18" cy="18" r="1.5" fill="#6ee7b7" />
      <circle cx="30" cy="18" r="1.5" fill="#38bdf8" />
      <circle cx="30" cy="30" r="1.5" fill="#6ee7b7" />
      <circle cx="18" cy="30" r="1.5" fill="#38bdf8" />

      {/* Data Transmission Rays */}
      <line x1="19" y1="19" x2="22" y2="22" stroke="#059669" strokeWidth="0.8" />
      <line x1="29" y1="19" x2="26" y2="22" stroke="#059669" strokeWidth="0.8" />
      <line x1="29" y1="29" x2="26" y2="26" stroke="#059669" strokeWidth="0.8" />
      <line x1="19" y1="29" x2="22" y2="26" stroke="#059669" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * Portfolio Rebalancer Agent Avatar (SVG):
 * Dynamic cybernetic dual-flux equilibrium gyroscope with orbital token rings,
 * dual flux arrows, and continuous rebalance calibration nodes.
 */
export function RebalancerAgentAvatar({ size = 32, className = "" }: AvatarProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="rebGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#ea580c" />
          <stop offset="100%" stopColor="#e11d48" />
        </linearGradient>
        <radialGradient id="rebGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Dynamic Glow Field */}
      <circle cx="24" cy="24" r="23" fill="url(#rebGlow)" />

      {/* Outer Gyroscopic Chamber */}
      <circle
        cx="24"
        cy="24"
        r="20"
        stroke="url(#rebGrad)"
        strokeWidth="1.8"
        fill="#1c0f04"
        fillOpacity="0.9"
      />

      {/* Primary Orbital Rotation Path (Clockwise Flux) */}
      <path
        d="M24 10C31.7 10 38 16.3 38 24C38 31.7 31.7 38 24 38"
        stroke="#f59e0b"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arrow Top */}
      <path d="M22 7L25 10L22 13" stroke="#f59e0b" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Secondary Orbital Rotation Path (Counter-Clockwise Flux) */}
      <path
        d="M24 38C16.3 38 10 31.7 10 24C10 16.3 16.3 10 24 10"
        stroke="#ea580c"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {/* Arrow Bottom */}
      <path d="M26 41L23 38L26 35" stroke="#ea580c" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />

      {/* Center 70/30 Equilibrium Core */}
      <circle cx="24" cy="24" r="6" fill="#78350f" stroke="#fbbf24" strokeWidth="1.2" />

      {/* Dual Token Satellites */}
      {/* Token A (NEAR Node) */}
      <circle cx="36" cy="18" r="3.2" fill="#000000" stroke="#00EC97" strokeWidth="1.2" />
      <circle cx="36" cy="18" r="1.2" fill="#00EC97" />

      {/* Token B (Stables Node) */}
      <circle cx="12" cy="30" r="3.2" fill="#000000" stroke="#2775CA" strokeWidth="1.2" />
      <circle cx="12" cy="30" r="1.2" fill="#2775CA" />

      {/* Center Pivot Point */}
      <circle cx="24" cy="24" r="2" fill="#ffffff" />
    </svg>
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
