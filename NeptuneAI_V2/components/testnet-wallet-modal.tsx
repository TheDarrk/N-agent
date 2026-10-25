"use client";

import React, { useState } from "react";
import {
    X,
    ShieldCheck,
    AlertCircle,
    ArrowRight,
    Zap,
    Key,
    CheckCircle2,
    RefreshCw,
    Flame,
    Cpu,
    Wallet
} from "lucide-react";
import { validateNetworkAccount } from "@/lib/near/network";

interface TestnetWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConnectSuccess?: (accountId: string) => void;
    onLaunchHotKit?: () => void;
}

export default function TestnetWalletModal({
    isOpen,
    onClose,
    onConnectSuccess,
    onLaunchHotKit,
}: TestnetWalletModalProps) {
    const [connectingHot, setConnectingHot] = useState(false);
    const [accountIdInput, setAccountIdInput] = useState("");
    const [connectingDirect, setConnectingDirect] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!isOpen) return null;

    const handleConnectWithHotKit = () => {
        setError(null);
        setConnectingHot(true);
        try {
            if (onLaunchHotKit) {
                onLaunchHotKit();
                onClose();
            } else {
                setError("HOT Wallet Kit launcher not ready.");
            }
        } catch (e: any) {
            setError(e?.message || "Failed to launch HOT Wallet Kit");
        } finally {
            setConnectingHot(false);
        }
    };

    const handleDirectConnect = (presetId?: string) => {
        const idToConnect = (presetId || accountIdInput).trim().toLowerCase();
        setError(null);

        if (!idToConnect) {
            setError("Please enter a NEAR Testnet account ID.");
            return;
        }

        const validation = validateNetworkAccount(idToConnect, "testnet");
        if (!validation.valid) {
            setError(validation.error || "Invalid testnet account ID.");
            return;
        }

        if (!idToConnect.endsWith(".testnet") && idToConnect.length !== 64) {
            setError("Testnet account must end with '.testnet' or be a 64-character implicit account ID.");
            return;
        }

        setConnectingDirect(true);
        setTimeout(() => {
            setConnectingDirect(false);
            onConnectSuccess?.(idToConnect);
            onClose();
        }, 300);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in-0">
            <div className="relative w-full max-w-md rounded-2xl border border-[hsl(225,18%,18%)] bg-card/95 p-6 shadow-2xl backdrop-blur-xl transition-all space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-[hsl(225,18%,14%)] pb-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-center text-orange-400">
                            <Flame size={18} className="fill-orange-400" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="font-semibold text-foreground text-sm tracking-tight">Connect Wallet</h3>
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                                    TESTNET
                                </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">Multi-Chain &amp; HOT Wallet Kit Integration</p>
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
                <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-[11px] text-emerald-300 flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 mt-1 shrink-0 animate-pulse" />
                    <div>
                        <span className="font-semibold">Testnet Mode Enforced:</span> All intents, swaps, and agent keys route exclusively through NEAR Testnet (<code className="text-emerald-400">wrap.testnet</code> &amp; <code className="text-emerald-400">intents.testnet</code>).
                    </div>
                </div>

                {/* ═══ SECTION 1: HOT Wallet Kit (1st / Recommended) ═══ */}
                <div className="p-4 rounded-xl bg-orange-500/10 border border-orange-500/25 space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/30 flex items-center justify-center shrink-0">
                            <Flame size={20} className="text-orange-400 fill-orange-400" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                                <h4 className="text-xs font-bold text-foreground">HOT Wallet Kit (Multi-Chain)</h4>
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">1ST OPTION</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Connect NEAR, Arbitrum, Ethereum, Base, Solana, or TON. The AI chat agent accesses all connected chains to trade across networks.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={handleConnectWithHotKit}
                        disabled={connectingHot}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-98 text-white font-bold text-xs transition-all shadow-md shadow-orange-500/20 disabled:opacity-50"
                    >
                        {connectingHot ? (
                            <>
                                <RefreshCw size={14} className="animate-spin" />
                                <span>Opening HOT Kit...</span>
                            </>
                        ) : (
                            <>
                                <Flame size={14} className="fill-white" />
                                <span>Connect via HOT Wallet Kit</span>
                            </>
                        )}
                    </button>
                </div>

                {/* ── Divider ── */}
                <div className="relative flex items-center justify-center">
                    <div className="border-t border-[hsl(225,18%,14%)] w-full" />
                    <span className="bg-card px-2 text-[10px] uppercase font-bold text-muted-foreground tracking-wider absolute">
                        OR DIRECT TESTNET ACCOUNT
                    </span>
                </div>

                {/* ═══ SECTION 2: Our Custom Testnet Connect (Below HOT Kit) ═══ */}
                <div className="space-y-2.5 pt-1">
                    <label className="text-xs font-medium text-foreground block">
                        Enter your <span className="text-emerald-400 font-mono">.testnet</span> Account ID
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
                        placeholder="e.g. testagen.testnet or youraccount.testnet"
                        className="w-full rounded-xl bg-background border border-[hsl(225,18%,16%)] px-3.5 py-2 text-xs font-mono text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-emerald-500/50"
                    />

                    {/* Quick test preset */}
                    <div className="p-2.5 rounded-lg bg-secondary/30 border border-[hsl(225,18%,14%)] flex items-center justify-between">
                        <span className="text-[11px] text-muted-foreground">Quick test with delegated account:</span>
                        <button
                            onClick={() => handleDirectConnect("testagen.testnet")}
                            className="text-[11px] font-mono text-emerald-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                            <span>testagen.testnet</span>
                            <Zap size={11} />
                        </button>
                    </div>

                    <button
                        onClick={() => handleDirectConnect()}
                        disabled={connectingDirect}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:scale-98 text-emerald-950 font-bold text-xs transition-all shadow-md shadow-emerald-500/15 disabled:opacity-50"
                    >
                        {connectingDirect ? (
                            <RefreshCw size={14} className="animate-spin" />
                        ) : (
                            <ShieldCheck size={14} />
                        )}
                        <span>Connect Direct Testnet Account</span>
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
