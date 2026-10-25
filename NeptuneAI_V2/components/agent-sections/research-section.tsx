"use client";

import React, { useState, useEffect } from "react";
import {
  FileText,
  Sparkles,
  ExternalLink,
  RotateCw,
  Send,
  CheckCircle2,
  Coins,
  ArrowRight,
  Layers,
  ShieldCheck
} from "lucide-react";

type Props = {
  accountId: string | null;
  onConnectWallet?: () => void;
};

interface Report {
  title: string;
  regime: string;
  summary: string;
  cid: string;
  fee_paid_near: number;
  creator_account: string;
  created_at: string;
  actionable_signal?: {
    action: string;
    target_asset: string;
    confidence: number;
  };
}

export default function ResearchSection({ accountId, onConnectWallet }: Props) {
  const [topic, setTopic] = useState("NEAR Liquid Staking Yields & DEX Liquidity");
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isHiringA2A, setIsHiringA2A] = useState(false);
  const [latestA2AResult, setLatestA2AResult] = useState<any>(null);

  const fetchReports = async () => {
    try {
      const res = await fetch("/api/research/reports");
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
      }
    } catch (e) {
      console.error("Error fetching reports:", e);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGenerate = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet(); else alert("Please connect wallet first to generate and sign research reports");
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/research/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          topic: topic,
        }),
      });
      await fetchReports();
    } catch (e) {
      console.error("Generate report error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // Demo Track 7 Agent-to-Agent Hire
  const handleA2AHire = async () => {
    if (!accountId) {
      if (onConnectWallet) onConnectWallet(); else alert("Please connect wallet first to execute agent-to-agent hire");
      return;
    }
    setIsHiringA2A(true);
    setLatestA2AResult(null);
    try {
      const res = await fetch("/api/research/hire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_wallet: accountId,
          symbol: "NEAR",
        }),
      });
      const data = await res.json();
      setLatestA2AResult(data);
      await fetchReports();
    } catch (e) {
      console.error("A2A hire error:", e);
    } finally {
      setIsHiringA2A(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 md:px-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-card border border-[hsl(225,18%,14%)] shadow-lg shadow-black/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <FileText size={20} />
            </span>
            <h1 className="text-xl font-bold tracking-tight text-foreground">
              Research Agent
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30">
              Track 7 Agent Economy
            </span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
            Produces niche on-chain market research and directional alpha signals. Decentralized reports stored with IPFS CIDs (recent 10 preserved). Can be hired directly by other trading agents.
          </p>
        </div>

        {/* Track 7 Hero Action */}
        <button
          onClick={handleA2AHire}
          disabled={isHiringA2A || !accountId}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-500 text-white font-semibold hover:opacity-90 active:scale-95 transition-all shadow-md shadow-purple-500/20 disabled:opacity-50"
        >
          {isHiringA2A ? (
            <>
              <RotateCw size={16} className="animate-spin" />
              <span>Transferring 0.1 NEAR...</span>
            </>
          ) : (
            <>
              <Coins size={16} />
              <span>Trader Agent Hires Research (0.1 NEAR)</span>
            </>
          )}
        </button>
      </div>

      {/* A2A Confirmation Banner if triggered */}
      {latestA2AResult && (
        <div className="p-5 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold text-purple-300">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <span>Track 7 Agent-to-Agent Transaction Settled on NEAR!</span>
            </div>
            <span className="text-xs font-mono text-purple-400">
              Fee: <strong>{latestA2AResult.fee_transferred}</strong>
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">From Agent</span>
              <p className="font-semibold text-foreground">{latestA2AResult.from_agent}</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">Recipient Creator</span>
              <p className="font-semibold text-foreground">{latestA2AResult.recipient}</p>
            </div>
            <div className="p-3 rounded-xl bg-secondary/50 border border-[hsl(225,18%,14%)]">
              <span className="text-[10px] text-muted-foreground uppercase">Alpha Signal</span>
              <p className="font-bold text-emerald-400">
                {latestA2AResult.signal?.action} {latestA2AResult.signal?.target_asset} ({latestA2AResult.signal?.confidence}% Conf)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Report Generator Input */}
      <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4">
        <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          Request Customized Institutional Research
        </h2>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Liquid Staking Yields on NEAR"
            className="flex-1 px-4 py-2.5 rounded-xl bg-secondary/60 border border-[hsl(225,18%,14%)] text-xs text-foreground focus:outline-none focus:border-primary/50"
          />
          <button
            onClick={handleGenerate}
            disabled={isLoading || !accountId}
            className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isLoading ? <RotateCw size={14} className="animate-spin" /> : <Send size={14} />}
            <span>Generate Report (0.1 NEAR)</span>
          </button>
        </div>
      </div>

      {/* Recent 10 Decentralized Research Reports */}
      <div className="p-5 rounded-2xl bg-card border border-[hsl(225,18%,14%)] space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-primary" />
            <h2 className="text-sm font-bold text-foreground">
              Decentralized Research Reports (Recent 10)
            </h2>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {reports.length} Reports Preserved
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reports.length > 0 ? (
            reports.map((r, i) => (
              <div
                key={r.cid || i}
                className="p-4 rounded-xl bg-secondary/30 border border-[hsl(225,18%,14%)] space-y-3 hover:border-primary/30 transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-xs font-bold text-foreground leading-snug">
                    {r.title}
                  </h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    {r.regime || "BULLISH"}
                  </span>
                </div>

                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {r.summary}
                </p>

                {r.actionable_signal && (
                  <div className="flex items-center gap-2 text-xs font-semibold text-primary">
                    <span>Signal: {r.actionable_signal.action} {r.actionable_signal.target_asset}</span>
                    <span>({r.actionable_signal.confidence}% Confidence)</span>
                  </div>
                )}

                <div className="pt-2 border-t border-[hsl(225,18%,14%)] flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-mono text-primary truncate max-w-[150px]">{r.cid}</span>
                  <span>{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="col-span-2 text-center py-6 text-xs text-muted-foreground">
              No research reports generated yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
