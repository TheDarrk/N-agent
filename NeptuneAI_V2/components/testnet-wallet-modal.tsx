"use client";

import React, { useState } from "react";
import {
    X,
    ShieldCheck,
    AlertCircle,
    ArrowRight,
    Zap,
    RefreshCw,
    Flame,
    ExternalLink
} from "lucide-react";
import { validateNetworkAccount, NearNetwork } from "@/lib/near/network";

interface TestnetWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    network?: NearNetwork;
    onConnectSuccess?: (accountId: string) => void;
    onLaunchHotKit?: () => Promise<void> | void;
    onConnectSpecificWallet?: (walletId: string) => Promise<void> | void;
}

export default function TestnetWalletModal({
    isOpen,
    onClose,
    network = "testnet",
    onConnectSuccess,
    onLaunchHotKit,
}: TestnetWalletModalProps) {
    const isMain = network === "mainnet";
    const [connectingHot, setConnectingHot] = useState(false);
    const [accountIdInput, setAccountIdInput] = useState("");
    const [connectingDirect, setConnectingDirect] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleOpenHotKitModal = async () => {
        setError(null);
        setConnectingHot(true);
        try {
            if (onLaunchHotKit) {
                await onLaunchHotKit();
                onClose();
            } else {
                setError("HOT Wallet Kit launcher not ready.");
            }
        } catch (e: any) {
            console.warn("[Modal] HOT Kit launcher error:", e);
            if (!e?.message?.includes("rejected")) {
                setError(e?.message || "Failed to launch HOT Wallet modal. You can enter your account ID directly below.");
            }
        } finally {
            setConnectingHot(false);
        }
    };

    const handleDirectConnect = (presetId?: string) => {
        const idToConnect = (presetId || accountIdInput).trim().toLowerCase();
        setError(null);

        if (!idToConnect) {
            setError(`Please enter a NEAR ${isMain ? "Mainnet (.near)" : "Testnet (.testnet)"} account ID.`);
            return;
        }

        const validation = validateNetworkAccount(idToConnect, network);
        if (!validation.valid) {
            setError(validation.error || `Invalid ${network} account ID.`);
            return;
        }

        if (isMain) {
            if (!idToConnect.endsWith(".near") && idToConnect.length !== 64) {
                setError("Mainnet account must end with '.near' or be a 64-character implicit account ID.");
                return;
            }
        } else {
            if (!idToConnect.endsWith(".testnet") && idToConnect.length !== 64) {
                setError("Testnet account must end with '.testnet' or be a 64-character implicit account ID.");
                return;
            }
        }

        setConnectingDirect(true);
        setTimeout(() => {
            setConnectingDirect(false);
            onConnectSuccess?.(idToConnect);
            onClose();
        }, 300);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-sm animate-in fade-in-0">
            <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-border pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
                            <Flame size={20} className="fill-orange-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground text-sm tracking-tight">Connect Wallet</h3>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border ${
                                    isMain
                                        ? "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                }`}>
                                    {isMain ? "MAINNET" : "TESTNET"}
                                </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">HOT Wallet Kit &amp; Multi-Chain Integration</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Network Notice */}
                <div className={`p-3 rounded-xl border text-[11px] flex items-start gap-2.5 ${
                    isMain
                        ? "bg-cyan-500/5 border-cyan-500/20 text-cyan-300"
                        : "bg-emerald-500/5 border-emerald-500/20 text-emerald-300"
                }`}>
                    <span className={`w-2 h-2 rounded-full mt-1 shrink-0 animate-pulse ${
                        isMain ? "bg-cyan-400" : "bg-emerald-400"
                    }`} />
                    <div>
                        {isMain ? (
                            <>
                                <span className="font-semibold">Mainnet Mode Active:</span> Multi-chain intents, swaps, and agent execution route live through NEAR Mainnet (<code className="text-cyan-400">wrap.near</code> &amp; Defuse contracts).
                            </>
                        ) : (
                            <>
                                <span className="font-semibold">Testnet Mode Enforced:</span> All intents, swaps, and agent keys route exclusively through NEAR Testnet (<code className="text-emerald-400">wrap.testnet</code> &amp; <code className="text-emerald-400">intents.testnet</code>).
                            </>
                        )}
                    </div>
                </div>

                {/* ═══ SECTION 1: HOT Wallet Kit Modal Launcher (Official) ═══ */}
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/30 space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0">
                            <Flame size={22} className="text-orange-400 fill-orange-400" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-foreground">HOT Wallet Kit (Official Modal)</h4>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">DIRECT</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Open the HOT Wallet modal to select <span className="font-semibold text-foreground">Meteor Wallet</span>, <span className="font-semibold text-foreground">HOT Wallet</span>, <span className="font-semibold text-foreground">MyNearWallet</span>, Nightly, or Ethereum wallets directly.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleOpenHotKitModal}
                        disabled={connectingHot}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 text-white font-bold text-xs transition-all shadow-md shadow-orange-500/25 disabled:opacity-50"
                    >
                        {connectingHot ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Opening HOT Wallet Modal...</span>
                            </>
                        ) : (
                            <>
                                <Flame size={15} className="fill-white" />
                                <span>Open HOT Wallet Modal</span>
                                <ArrowRight size={14} className="ml-0.5 opacity-80" />
                            </>
                        )}
                    </button>
                </div>

                {/* ── Divider ── */}
                <div className="relative flex items-center justify-center">
                    <div className="border-t border-border w-full" />
                    <span className="bg-card px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider absolute">
                        {isMain ? "OR DIRECT MAINNET ACCOUNT" : "OR DIRECT TESTNET ACCOUNT"}
                    </span>
                </div>

                {/* ═══ SECTION 2: Direct Account ID ═══ */}
                <div className="space-y-2.5 pt-1">
                    <label className="text-xs font-medium text-foreground block">
                        Enter your <span className={isMain ? "text-cyan-400 font-mono" : "text-emerald-400 font-mono"}>
                            {isMain ? ".near" : ".testnet"}
                        </span> Account ID
                    </label>
                    <input
                        type="text"
                        value={accountIdInput}
                        onChange={(e) => {
                            setAccountIdInput(e.target.value);
                            setError(null);
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") handleDirectConnect();
                        }}
                        placeholder={isMain ? "e.g. yourname.near or 64-char implicit address" : "e.g. testagen.testnet or youraccount.testnet"}
                        className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500/50"
                    />

                    {/* Quick test preset for testnet only */}
                    {!isMain && (
                        <div className="p-2.5 rounded-lg bg-secondary/30 border border-border flex items-center justify-between">
                            <span className="text-[11px] text-muted-foreground">Quick test with delegated account:</span>
                            <button
                                onClick={() => handleDirectConnect("testagen.testnet")}
                                className="text-[11px] font-mono text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                            >
                                <span>testagen.testnet</span>
                                <Zap size={11} />
                            </button>
                        </div>
                    )}

                    <button
                        onClick={() => handleDirectConnect()}
                        disabled={connectingDirect}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md disabled:opacity-50 ${
                            isMain
                                ? "bg-cyan-500 hover:bg-cyan-600 text-cyan-950 shadow-cyan-500/15"
                                : "bg-emerald-500 hover:bg-emerald-600 text-emerald-950 shadow-emerald-500/15"
                        }`}
                    >
                        {connectingDirect ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <ShieldCheck size={14} />
                        )}
                        <span>{isMain ? "Connect Direct Mainnet Account" : "Connect Direct Testnet Account"}</span>
                    </button>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-[11px] text-red-400 flex items-start gap-2">
                        <AlertCircle size={14} className="shrink-0 mt-0.5" />
                        <span>{error}</span>
                    </div>
                )}
            </div>
        </div>
    );
}
