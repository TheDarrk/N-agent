"use client";

import React, { useCallback, useEffect, useState } from "react";
import { CheckCircle2, AlertCircle, RefreshCw, KeyRound, Trash2, PlugZap } from "lucide-react";

type PublicConfig = {
  configured: boolean;
  account_address: string;
  network: "mainnet" | "testnet";
  has_key: boolean;
};

type Props = { accountId: string | null };

/**
 * Per-user Hyperliquid (near.com perps) credentials.
 * The user adds THEIR OWN account address + API wallet key; the key is stored encrypted on the server
 * and is never returned to the browser. Trades run at 1x leverage only.
 */
export default function HyperliquidSettings({ accountId }: Props) {
  const [cfg, setCfg] = useState<PublicConfig | null>(null);
  const [accountAddress, setAccountAddress] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [network, setNetwork] = useState<"mainnet" | "testnet">("mainnet");
  const [busy, setBusy] = useState<"save" | "test" | "remove" | "fund" | null>(null);
  const [fundAmount, setFundAmount] = useState("12");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    try {
      const res = await fetch(`/api/hyperliquid/config/${encodeURIComponent(accountId)}`);
      if (!res.ok) return;
      const data: PublicConfig = await res.json();
      setCfg(data);
      setAccountAddress(data.account_address || "");
      setNetwork(data.network || "mainnet");
    } catch {}
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!accountId) return null;

  const save = async () => {
    setBusy("save");
    setMsg(null);
    try {
      const res = await fetch(`/api/hyperliquid/config/${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_address: accountAddress.trim(), api_private_key: apiKey.trim(), network }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Could not save Hyperliquid settings");
      setApiKey("");
      setCfg(data);
      setMsg({ ok: true, text: "Saved. Your key is stored encrypted and is never shown again." });
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Save failed" });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    setMsg(null);
    try {
      const res = await fetch(`/api/hyperliquid/test/${encodeURIComponent(accountId)}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Test failed");
      if (data.ok) {
        const equity = Number(data.account_value_usd ?? 0).toFixed(2);
        setMsg({
          ok: !data.warning,
          text: `Connected (${data.network}). Account value $${equity}. ${data.warning || "Ready to trade at 1x."}`,
        });
      } else {
        setMsg({ ok: false, text: data.error || "Could not read the account with these credentials." });
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Test failed" });
    } finally {
      setBusy(null);
    }
  };

  const fund = async () => {
    const amt = Number(fundAmount);
    if (!Number.isFinite(amt) || amt < 6.5) {
      setMsg({ ok: false, text: "Minimum transfer is about $6.50." });
      return;
    }
    if (!confirm(`Move about $${amt.toFixed(2)} from your NEAR agent wallet into your Hyperliquid account? This is a real transfer.`)) return;
    setBusy("fund");
    setMsg(null);
    try {
      const res = await fetch(`/api/hyperliquid/fund/${encodeURIComponent(accountId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount_usd: amt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Funding failed");
      setMsg(
        data.ok
          ? { ok: true, text: `Funded. Hyperliquid free margin is now about $${Number(data.hyperliquid_available_usd ?? 0).toFixed(2)}.` }
          : { ok: false, text: data.error || "Funding did not complete." }
      );
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || "Funding failed" });
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!confirm("Remove your saved Hyperliquid credentials? The agent will go back to spot-only trading.")) return;
    setBusy("remove");
    try {
      await fetch(`/api/hyperliquid/config/${encodeURIComponent(accountId)}`, { method: "DELETE" });
      setApiKey("");
      setAccountAddress("");
      setMsg({ ok: true, text: "Credentials removed." });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const canSave = accountAddress.trim().length === 42 && (apiKey.trim().length > 0 || cfg?.has_key);

  return (
    <div className="rounded-2xl border border-border bg-secondary/20 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <KeyRound size={15} className="text-primary" />
            Hyperliquid perps (near.com) — optional
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
            Add your own Hyperliquid API wallet to let the Trader place one-shot buy/sell orders with built-in take-profit and
            stop-loss, with no watcher needed. Orders use <strong>1x leverage only</strong>. Hyperliquid&apos;s minimum order is $10.
          </p>
        </div>
        <span
          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            cfg?.configured
              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              : "bg-secondary text-muted-foreground border-border"
          }`}
        >
          {cfg?.configured ? "CONFIGURED" : "NOT SET"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Hyperliquid account address</label>
          <input
            value={accountAddress}
            onChange={(e) => setAccountAddress(e.target.value)}
            placeholder="0x… (the account that holds your USDC)"
            spellCheck={false}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-background border border-border text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="space-y-1 md:col-span-2">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">
            API wallet private key {cfg?.has_key ? "(saved — leave blank to keep)" : ""}
          </label>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={cfg?.has_key ? "••••••••••••••••" : "64-character hex key from Hyperliquid → API"}
            spellCheck={false}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono bg-background border border-border text-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-muted-foreground uppercase">Network</label>
          <select
            value={network}
            onChange={(e) => setNetwork(e.target.value as "mainnet" | "testnet")}
            className="w-full px-2.5 py-1.5 rounded-lg text-xs font-medium bg-background border border-border text-foreground focus:outline-none"
          >
            <option value="mainnet">Mainnet (real funds)</option>
            <option value="testnet">Testnet</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={save}
          disabled={!canSave || busy !== null}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy === "save" ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          Save securely
        </button>
        <button
          onClick={test}
          disabled={!cfg?.configured || busy !== null}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-secondary disabled:opacity-50"
        >
          {busy === "test" ? <RefreshCw size={12} className="animate-spin" /> : <PlugZap size={12} />}
          Test connection
        </button>
        {cfg?.configured && (
          <span className="flex items-center gap-1.5">
            <input
              value={fundAmount}
              onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              aria-label="Amount in USD to move from the NEAR agent wallet"
              className="w-16 px-2 py-1.5 rounded-lg text-xs font-mono bg-background border border-border text-foreground focus:outline-none"
            />
            <button
              onClick={fund}
              disabled={busy !== null}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border text-foreground hover:bg-secondary disabled:opacity-50"
              title="Moves USDC from your NEAR agent wallet into your Hyperliquid perps balance via NEAR Intents"
            >
              {busy === "fund" ? "Funding…" : "Fund from NEAR ($)"}
            </button>
          </span>
        )}
        {cfg?.configured && (
          <button
            onClick={remove}
            disabled={busy !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-400 hover:bg-rose-500/10 disabled:opacity-50"
          >
            <Trash2 size={12} />
            Remove
          </button>
        )}
        {msg && (
          <span
            role="status"
            className={`flex items-center gap-1.5 text-[11px] font-medium ${msg.ok ? "text-emerald-400" : "text-rose-400"}`}
          >
            {msg.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
