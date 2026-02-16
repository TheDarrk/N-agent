"use client";

import React, { useState, useCallback } from "react";
import { ArrowRight, ArrowDownUp, CheckCircle2, Sparkles, Copy, Check, ExternalLink } from "lucide-react";

type Message = {
  id: string;
  role: "user" | "ai";
  content: string;
  action?: string;
  payload?: Record<string, unknown>;
};

type Props = {
  message: Message;
  onSignAction: (payload: Record<string, unknown>) => void;
  index: number;
};

/* ── Chain logo map ── */
const CHAIN_LOGOS: Record<string, string> = {
  NEAR: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
  ETH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  ETHEREUM: "https://s2.coinmarketcap.com/static/img/coins/64x64/1027.png",
  BTC: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  BITCOIN: "https://s2.coinmarketcap.com/static/img/coins/64x64/1.png",
  AURORA: "https://s2.coinmarketcap.com/static/img/coins/64x64/14803.png",
  SOL: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  SOLANA: "https://s2.coinmarketcap.com/static/img/coins/64x64/5426.png",
  BASE: "https://s2.coinmarketcap.com/static/img/coins/64x64/32531.png",
  POLYGON: "https://s2.coinmarketcap.com/static/img/coins/64x64/3890.png",
  MATIC: "https://s2.coinmarketcap.com/static/img/coins/64x64/3890.png",
  BSC: "https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png",
  BNB: "https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png",
  ARBITRUM: "https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png",
  ARB: "https://s2.coinmarketcap.com/static/img/coins/64x64/11841.png",
  OP: "https://s2.coinmarketcap.com/static/img/coins/64x64/11840.png",
  OPTIMISM: "https://s2.coinmarketcap.com/static/img/coins/64x64/11840.png",
  AVAX: "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png",
  AVALANCHE: "https://s2.coinmarketcap.com/static/img/coins/64x64/5805.png",
  APTOS: "https://s2.coinmarketcap.com/static/img/coins/64x64/21794.png",
  APT: "https://s2.coinmarketcap.com/static/img/coins/64x64/21794.png",
  SUI: "https://s2.coinmarketcap.com/static/img/coins/64x64/20947.png",
  ASTER: "https://s2.coinmarketcap.com/static/img/coins/64x64/12885.png",
  ASTAR: "https://s2.coinmarketcap.com/static/img/coins/64x64/12885.png",
  BCH: "https://s2.coinmarketcap.com/static/img/coins/64x64/1831.png",
  BERA: "https://s2.coinmarketcap.com/static/img/coins/64x64/24647.png",
  CARDANO: "https://s2.coinmarketcap.com/static/img/coins/64x64/2010.png",
  ADA: "https://s2.coinmarketcap.com/static/img/coins/64x64/2010.png",
  ADI: "https://s2.coinmarketcap.com/static/img/coins/64x64/2010.png",
  ALEO: "https://s2.coinmarketcap.com/static/img/coins/64x64/28929.png",
  DOGE: "https://s2.coinmarketcap.com/static/img/coins/64x64/74.png",
  XRP: "https://s2.coinmarketcap.com/static/img/coins/64x64/52.png",
  TON: "https://s2.coinmarketcap.com/static/img/coins/64x64/11419.png",
  TRX: "https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png",
  TRON: "https://s2.coinmarketcap.com/static/img/coins/64x64/1958.png",
};

/* ── Copyable Link Component ── */
function CopyableLink({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [url]);

  return (
    <span className="flex flex-col items-start gap-1 my-1.5">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/8 border border-primary/15 text-primary text-[12px] font-mono hover:bg-primary/15 hover:border-primary/30 transition-all group break-all"
      >
        <ExternalLink size={11} className="flex-shrink-0 opacity-50 group-hover:opacity-100 transition-opacity" />
        <span className="break-all">{label || url}</span>
      </a>
      <button
        onClick={handleCopy}
        className="p-1 rounded-md text-muted-foreground hover:text-primary bg-secondary/40 hover:bg-primary/10 border border-transparent hover:border-primary/15 transition-all active:scale-90"
        title={copied ? "Copied!" : "Copy link"}
      >
        {copied ? (
          <Check size={11} className="text-emerald-400" />
        ) : (
          <Copy size={11} />
        )}
      </button>
    </span>
  );
}

/* ── Render chain tokens as inline badges with logo ── */
function renderChainToken(text: string): React.ReactNode[] {
  // Clean up patterns like "CHAINNAME ( [CHAIN] )" → just "[CHAIN] CHAINNAME"
  // Also handle "CHAINNAME( [CHAIN] )" and "(chain [CHAIN] )"
  let cleaned = text.replace(
    /([A-Za-z]+)\s*\(\s*(?:chain\s*)?\[([A-Za-z]+)\]\s*\)/g,
    "[$2] $1"
  );
  // Also clean standalone parenthesized chain refs like "( [CHAIN] )"
  cleaned = cleaned.replace(/\(\s*\[([A-Za-z]+)\]\s*\)/g, "[$1]");

  // Match [CHAIN] TOKEN or standalone [CHAIN]
  const regex = /\[([A-Za-z]+)\]\s*([A-Za-z0-9]*)/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(cleaned)) !== null) {
    if (match.index > last) {
      parts.push(cleaned.slice(last, match.index));
    }
    const chain = match[1].toUpperCase();
    const token = match[2] || "";
    const logo = CHAIN_LOGOS[chain] || CHAIN_LOGOS[token.toUpperCase()];
    parts.push(
      <span
        key={`ct-${match.index}`}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-primary/8 border border-primary/15 font-mono text-[11px] font-semibold align-middle mx-0.5 hover:bg-primary/12 transition-colors"
      >
        {logo && (
          <img
            src={logo}
            alt={chain}
            width={14}
            height={14}
            className="rounded-full flex-shrink-0"
            crossOrigin="anonymous"
          />
        )}
        <span className="text-muted-foreground/70 text-[10px] uppercase tracking-wider">{chain}</span>
        {token && <span className="text-primary">{token}</span>}
      </span>
    );
    last = match.index + match[0].length;
  }

  if (last < cleaned.length) {
    parts.push(cleaned.slice(last));
  }
  return parts.length > 0 ? parts : [text];
}

/* ── Render inline markdown (bold, code, chain tokens, links) ── */
function renderInline(text: string): React.ReactNode[] {
  // Pre-clean: remove stray parentheses around inline code and chain tokens
  // "( `wallet.near` )" → "`wallet.near`"
  // "( [NEAR] USDC )" → "[NEAR] USDC"
  let text_ = text.replace(/\(\s*`([^`]+)`\s*\)/g, "`$1`");
  text_ = text_.replace(/\(\s*(\[[A-Za-z]+\]\s*[A-Za-z0-9]*)\s*\)/g, "$1");
  text = text_;

  // Pass 0: detect URLs first and split around them
  const urlRegex = /(https?:\/\/[^\s,)]+)/g;
  const urlParts: React.ReactNode[] = [];
  let uLast = 0;
  let uMatch: RegExpExecArray | null;

  while ((uMatch = urlRegex.exec(text)) !== null) {
    if (uMatch.index > uLast) {
      urlParts.push(text.slice(uLast, uMatch.index));
    }
    urlParts.push(<CopyableLink key={`link-${uMatch.index}`} url={uMatch[1]} />);
    uLast = uMatch.index + uMatch[0].length;
  }
  if (uLast < text.length) urlParts.push(text.slice(uLast));

  // Process remaining string segments through bold, code, chain tokens
  const result: React.ReactNode[] = [];
  for (const part of urlParts) {
    if (typeof part !== "string") {
      result.push(part);
      continue;
    }

    // Bold pass (**text**)
    const boldRegex = /\*\*(.+?)\*\*/g;
    const segments: React.ReactNode[] = [];
    let last = 0;
    let match: RegExpExecArray | null;

    while ((match = boldRegex.exec(part)) !== null) {
      if (match.index > last) {
        segments.push(...renderChainToken(part.slice(last, match.index)));
      }
      segments.push(
        <strong key={`b-${match.index}`} className="font-semibold text-foreground">
          {renderChainToken(match[1])}
        </strong>
      );
      last = match.index + match[0].length;
    }
    if (last < part.length) {
      segments.push(...renderChainToken(part.slice(last)));
    }

    // Inline code pass (`text`)
    for (const seg of segments) {
      if (typeof seg !== "string") {
        result.push(seg);
        continue;
      }
      const codeRegex = /`([^`]+)`/g;
      let cLast = 0;
      let cMatch: RegExpExecArray | null;
      while ((cMatch = codeRegex.exec(seg)) !== null) {
        if (cMatch.index > cLast) result.push(seg.slice(cLast, cMatch.index));
        const codeContent = cMatch[1];
        // Detect tx hashes (long alphanumeric, 30+ chars, no spaces/dots)
        const isTxHash = /^[A-Za-z0-9]{30,}$/.test(codeContent);
        if (isTxHash) {
          result.push(
            <CopyableLink
              key={`tx-${cMatch.index}`}
              url={`https://nearblocks.io/txns/${codeContent}`}
              label={`${codeContent.slice(0, 8)}...${codeContent.slice(-8)}`}
            />
          );
        } else {
          result.push(
            <code
              key={`c-${cMatch.index}`}
              className="px-1.5 py-0.5 rounded-md bg-secondary/80 text-primary text-[11px] font-mono border border-primary/10"
            >
              {codeContent}
            </code>
          );
        }
        cLast = cMatch.index + cMatch[0].length;
      }
      if (cLast < seg.length) result.push(seg.slice(cLast));
    }
  }

  return result;
}

/* ── Render a table cell that might be a bare chain like [NEAR] ── */
function renderTableCell(cell: string): React.ReactNode {
  const trimmed = cell.trim();
  // Check if cell is a bare chain reference like "[NEAR]" or "[ETH]"
  const bareChain = trimmed.match(/^\[([A-Za-z]+)\]$/);
  if (bareChain) {
    const chain = bareChain[1].toUpperCase();
    const logo = CHAIN_LOGOS[chain];
    return (
      <span className="inline-flex items-center gap-1.5">
        {logo && (
          <img src={logo} alt={chain} width={16} height={16} className="rounded-full" crossOrigin="anonymous" />
        )}
        <span className="font-semibold text-foreground">{chain}</span>
      </span>
    );
  }
  return <span className="flex items-center gap-1 flex-wrap">{renderInline(trimmed)}</span>;
}

/* ── Markdown Table Component ── */
function MarkdownTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-3 rounded-xl border border-primary/10 overflow-hidden bg-secondary/20">
      <table className="w-full text-[12px]">
        <thead>
          <tr className="border-b border-primary/10 bg-primary/5">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-3 py-2 text-left text-[10px] uppercase tracking-wider font-semibold text-primary/80"
              >
                {h.trim()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className="border-b border-primary/5 last:border-0 hover:bg-primary/5 transition-colors"
            >
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2.5 text-foreground/85">
                  {renderTableCell(cell)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Glowing Bullet Point ── */
function GlowBullet({ delay = 0 }: { delay?: number }) {
  return (
    <span className="relative flex-shrink-0 mt-[7px]">
      <span
        className="block w-2 h-2 rounded-full bg-primary bullet-glow"
        style={{ animationDelay: `${delay}ms` }}
      />
      <span
        className="absolute inset-0 w-2 h-2 rounded-full bg-primary/40 bullet-pulse"
        style={{ animationDelay: `${delay}ms` }}
      />
    </span>
  );
}

/* ── Parse full markdown into block elements ── */
function MarkdownContent({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Headings (#### → h4, ### → h3, ## → h2)
    if (line.startsWith("#### ")) {
      elements.push(
        <h4 key={i} className="text-[13px] font-semibold text-foreground/90 mt-5 mb-2 flex items-center gap-2">
          <span className="w-0.5 h-3.5 rounded-full bg-primary/40" />
          {renderInline(line.slice(5))}
        </h4>
      );
      i++;
      continue;
    }
    if (line.startsWith("### ")) {
      elements.push(
        <h3 key={i} className="text-[13px] font-bold text-foreground mt-6 mb-2.5 flex items-center gap-2">
          <span className="w-1 h-4 rounded-full bg-primary/60" />
          {renderInline(line.slice(4))}
        </h3>
      );
      i++;
      continue;
    }
    if (line.startsWith("## ")) {
      elements.push(
        <h2 key={i} className="text-[14px] font-bold text-foreground mt-6 mb-2.5 flex items-center gap-2">
          <Sparkles size={12} className="text-primary/60" />
          {renderInline(line.slice(3))}
        </h2>
      );
      i++;
      continue;
    }

    // Markdown table detection
    if (line.includes("|") && i + 1 < lines.length && lines[i + 1]?.match(/^\|?\s*[-:]+[-|:\s]+$/)) {
      const headerCells = line.split("|").filter((c) => c.trim() !== "");
      i += 2; // skip header + separator
      const tableRows: string[][] = [];
      while (i < lines.length && lines[i].includes("|")) {
        const cells = lines[i].split("|").filter((c) => c.trim() !== "");
        if (cells.length > 0) tableRows.push(cells);
        i++;
      }
      elements.push(<MarkdownTable key={`table-${i}`} headers={headerCells} rows={tableRows} />);
      continue;
    }

    // Raw pipe table without separator (fallback)
    if (line.startsWith("|") && line.endsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].match(/^\|?\s*[-:]+[-|:\s]+$/)) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      if (tableLines.length > 0) {
        const headers = tableLines[0].split("|").filter((c) => c.trim() !== "");
        const rows = tableLines.slice(1).map((l) => l.split("|").filter((c) => c.trim() !== ""));
        elements.push(<MarkdownTable key={`ptable-${i}`} headers={headers} rows={rows} />);
      }
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^(\d+)\.\s+(.+)/);
    if (olMatch) {
      const items: React.ReactNode[] = [];
      let itemIdx = 0;
      while (i < lines.length) {
        const m = lines[i].match(/^(\d+)\.\s+(.+)/);
        if (!m) break;
        items.push(
          <li key={i} className="flex gap-3 text-[13px] leading-relaxed text-foreground/90 py-0.5">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/12 border border-primary/20 text-primary text-[10px] font-bold flex items-center justify-center mt-0.5">
              {m[1]}
            </span>
            <span className="flex-1">{renderInline(m[2])}</span>
          </li>
        );
        itemIdx++;
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="space-y-3 my-4">
          {items}
        </ol>
      );
      continue;
    }

    // Unordered list (bullet)
    if (line.startsWith("- ") || line.startsWith("* ") || line.match(/^[•●]\s/)) {
      const items: React.ReactNode[] = [];
      let bulletIdx = 0;
      // Detect if this is a chain listing (most items have → with chain tokens)
      const chainListPattern = /\*\*([A-Z]+)\*\*\s*[→\->]+\s*(.+)/;
      let isChainList = false;
      {
        let peek = i;
        let chainCount = 0;
        while (peek < lines.length && (lines[peek].startsWith("- ") || lines[peek].startsWith("* ") || lines[peek].match(/^[•●]\s/))) {
          const c = lines[peek].replace(/^[-*•●]\s+/, "");
          if (chainListPattern.test(c)) chainCount++;
          peek++;
        }
        isChainList = chainCount >= 3;
      }

      while (
        i < lines.length &&
        (lines[i].startsWith("- ") || lines[i].startsWith("* ") || lines[i].match(/^[•●]\s/))
      ) {
        const content = lines[i].replace(/^[-*•●]\s+/, "");
        const chainMatch = content.match(chainListPattern);

        if (isChainList && chainMatch) {
          const chainName = chainMatch[1].toUpperCase();
          const tokensStr = chainMatch[2];
          // Extract token names from badges like [ARB] ETH, [ARB] GMX or plain TOKEN, TOKEN
          const tokenNames = tokensStr
            .replace(/\[[A-Za-z]+\]\s*/g, "")
            .split(/[,•·]\s*/)
            .map(t => t.trim())
            .filter(Boolean);
          const logo = CHAIN_LOGOS[chainName];

          items.push(
            <li key={i} className="rounded-lg border border-primary/8 bg-secondary/20 p-3 hover:bg-secondary/30 transition-colors">
              <div className="flex items-center gap-2 mb-2">
                {logo ? (
                  <img src={logo} alt={chainName} width={18} height={18} className="rounded-full" crossOrigin="anonymous" />
                ) : (
                  <span className="w-[18px] h-[18px] rounded-full bg-primary/20 flex-shrink-0" />
                )}
                <span className="text-[13px] font-bold text-foreground">{chainName}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tokenNames.map((token, ti) => (
                  <span
                    key={ti}
                    className="px-2 py-0.5 rounded-md bg-primary/6 border border-primary/10 text-[11px] font-mono font-medium text-foreground/75"
                  >
                    {token}
                  </span>
                ))}
              </div>
            </li>
          );
        } else {
          items.push(
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground/90">
              <GlowBullet delay={bulletIdx * 200} />
              <span className="flex-1">{renderInline(content)}</span>
            </li>
          );
        }
        bulletIdx++;
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className={isChainList ? "grid gap-2.5 my-4" : "space-y-3 my-4"}>
          {items}
        </ul>
      );
      continue;
    }

    // Horizontal rule
    if (line.match(/^[-_*]{3,}$/)) {
      elements.push(
        <div key={i} className="my-5 border-t border-primary/10" />
      );
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="my-4 pl-3 border-l-2 border-primary/30 text-[13px] text-foreground/70 italic"
        >
          {quoteLines.map((ql, qi) => (
            <p key={qi}>{renderInline(ql)}</p>
          ))}
        </blockquote>
      );
      continue;
    }

    // Empty line = spacing
    if (line.trim() === "") {
      elements.push(<div key={i} className="h-3" />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <p key={i} className="text-[13px] leading-[1.75] text-foreground/90">
        {renderInline(line)}
      </p>
    );
    i++;
  }

  return <div className="space-y-1.5">{elements}</div>;
}

export default function ChatMessage({ message, onSignAction, index }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className="mb-5 animate-fade-in"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      {isUser ? (
        <div className="flex justify-end">
          <div className="max-w-[80%]">
            <div className="px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary text-primary-foreground">
              <p className="text-[13px] leading-relaxed">{message.content}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 max-w-[88%]">
          <div className="flex-shrink-0 mt-0.5">
            <img
              src="/neptune-logo.png"
              alt="Neptune AI"
              width={36}
              height={36}
              className="rounded-lg"
            />
          </div>
          <div className="flex-1 space-y-3">
            <div className="px-4 py-3.5 rounded-2xl rounded-tl-sm bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/10">
              <MarkdownContent text={message.content} />
            </div>

            {/* Swap Quote Card */}
            {message.action === "CONFIRM_QUOTE" && message.payload && (
              <div className="rounded-xl border border-primary/20 bg-card overflow-hidden shadow-lg shadow-primary/5">
                <div className="px-4 py-2.5 bg-primary/8 border-b border-primary/15 flex items-center gap-2">
                  <ArrowDownUp size={13} className="text-primary" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                    Swap Preview
                  </span>
                </div>

                <div className="p-4">
                  <div className="flex items-stretch gap-3">
                    <div className="flex-1 p-3 rounded-lg bg-secondary/50 border border-primary/5">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">From</p>
                      <p className="font-mono text-xl font-bold text-foreground">
                        {String(message.payload.amount)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {String(message.payload.in)}
                      </p>
                    </div>

                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20">
                        <ArrowRight size={14} className="text-primary" />
                      </div>
                    </div>

                    <div className="flex-1 p-3 rounded-lg bg-secondary/50 border border-emerald-500/10">
                      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">To</p>
                      <p className="font-mono text-xl font-bold text-emerald-400">
                        ~{String(message.payload.est_out)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {String(message.payload.out)}
                      </p>
                    </div>
                  </div>

                  {!!message.payload.price_impact && (
                    <div className="mt-3 pt-3 border-t border-[hsl(225,18%,14%)] flex items-center justify-between">
                      <span className="text-[11px] text-muted-foreground">Price Impact</span>
                      <span className="text-[11px] font-mono text-foreground">
                        {String(message.payload.price_impact)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Sign Transaction Button */}
            {(message.action === "SIGN_TRANSACTION" || message.action === "SIGN_EVM_TRANSACTION") && message.payload && (
              <button
                onClick={() => onSignAction(message.payload!)}
                className="group flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-all active:scale-[0.97] shadow-lg shadow-primary/20"
              >
                <CheckCircle2 size={15} />
                {message.action === "SIGN_EVM_TRANSACTION"
                  ? "Sign EVM Transaction"
                  : "Sign & Execute Transaction"}
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
