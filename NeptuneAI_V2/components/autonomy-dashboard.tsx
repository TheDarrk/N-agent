"use client";

/**
 * Autonomy Dashboard — Human Oversight Panel for Neptune AI v2
 * Features: NLP strategy inputs, live strategy list, agent wallet binding,
 *           kill switch, autonomy level, guardrails sliders.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useWallet } from "@/providers/wallet-provider";

import {
    Shield,
    Activity,
    AlertTriangle,
    Power,
    Settings,
    Clock,
    ChevronDown,
    ChevronUp,
    ExternalLink,
    Trash2,
    Brain,
    Wallet,
    Send,
    Loader2,
    TrendingDown,
    TrendingUp,
    BarChart3,
    Link2,
    Unlink,
    Mail,
    Check,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────

interface UserSettings {
    wallet_address: string;
    autonomy_level: number;
    max_tx_amount: number;
    daily_limit: number;
    risk_profile: string;
    kill_switch: number;
    allowed_tokens: string;
    agent_wallet: string;
    notification_email: string;
}

interface Strategy {
    id: number;
    strategy_type: string;
    trigger_condition: Record<string, unknown>;
    schedule: string;
    active: number;
    last_triggered_at: string | null;
}

interface AgentLog {
    id: number;
    agent_name: string;
    trigger_type: string;
    reasoning_text: string;
    action_taken: string;
    cid_reference: string | null;
    status: string;
    created_at: string;
}

// ── API Functions ────────────────────────────────────────────────

async function fetchSettings(wallet: string): Promise<UserSettings | null> {
    try {
        const res = await fetch(`/api/settings/${wallet}`);
        if (res.ok) return res.json();
        return null;
    } catch {
        return null;
    }
}

async function updateSettings(wallet: string, settings: Partial<UserSettings>) {
    const res = await fetch(`/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, ...settings }),
    });
    return res.json();
}

async function fetchStrategies(wallet: string): Promise<Strategy[]> {
    try {
        const res = await fetch(`/api/strategies/${wallet}`);
        if (res.ok) {
            const data = await res.json();
            return data.strategies || [];
        }
        return [];
    } catch {
        return [];
    }
}

async function parseStrategy(wallet: string, type: string, text: string) {
    const res = await fetch(`/api/strategies/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, strategy_type: type, nlp_text: text }),
    });
    return res.json();
}

async function removeStrategy(id: number) {
    const res = await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    return res.json();
}

async function fetchLogs(wallet: string): Promise<AgentLog[]> {
    try {
        const res = await fetch(`/api/logs/${wallet}?limit=20`);
        if (res.ok) {
            const data = await res.json();
            return data.logs || [];
        }
        return [];
    } catch {
        return [];
    }
}

async function toggleKillSwitch(wallet: string, activate: boolean) {
    const res = await fetch(`/api/kill-switch/${wallet}?activate=${activate}`, {
        method: "POST",
    });
    return res.json();
}

async function createAgentWallet(wallet: string, chainType: string = "near") {
    const res = await fetch(`/api/agent-wallet/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, chain_type: chainType }),
    });
    return res.json();
}

async function fetchAgentKeys(wallet: string) {
    const res = await fetch(`/api/agent-wallet/keys/${wallet}`);
    const data = await res.json();
    return data.keys || [];
}

async function fetchAgentBalance(address: string, chain: string = "near") {
    const res = await fetch(`/api/agent-wallet/balance/${address}?chain=${chain}`);
    return res.json();
}

async function removeAgentWallet(wallet: string, keyId: number) {
    const res = await fetch(`/api/agent-wallet/remove`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wallet_address: wallet, key_id: keyId }),
    });
    return res.json();
}

async function activateAgentWallet(keyId: number, accountId: string, txHash: string) {
    const res = await fetch(`/api/agent-wallet/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_id: keyId, agent_account_id: accountId, tx_hash: txHash }),
    });
    return res.json();
}


// -- Storage Isolation Helper --
class PrefixedLocalStorage {
    private prefix: string;
    constructor(prefix: string) {
        this.prefix = prefix;
    }
    async get(key: string) {
        if (typeof window === "undefined") return null;
        const val = localStorage.getItem(this.prefix + key);
        console.log(`[Storage] GET ${this.prefix}${key} ->`, val ? "EXISTS" : "EMPTY");
        return val;
    }
    async set(key: string, value: string) {
        if (typeof window === "undefined") return;
        localStorage.setItem(this.prefix + key, value);
    }
    async remove(key: string) {
        if (typeof window === "undefined") return;
        localStorage.removeItem(this.prefix + key);
    }
    async clear() {
        if (typeof window === "undefined") return;
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(this.prefix)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
    }
}


// ── Strategy Input Cards ─────────────────────────────────────────


const STRATEGY_TYPES = [
    {
        type: "price_alert",
        label: "Price Alert",
        icon: TrendingDown,
        color: "text-amber-400",
        placeholder: "e.g. Alert me if BTC drops 5% or ETH surges 10%",
    },
    {
        type: "stop_loss",
        label: "Stop Loss",
        icon: AlertTriangle,
        color: "text-red-400",
        placeholder: "e.g. Sell NEAR if it drops 15% from current price",
    },
    {
        type: "rebalance",
        label: "Portfolio Rebalance",
        icon: BarChart3,
        color: "text-blue-400",
        placeholder: "e.g. Keep 50% ETH, 30% BTC, 20% NEAR — trigger at 10% drift",
    },
];

function StrategyInput({
    config,
    accountId,
    onCreated,
}: {
    config: (typeof STRATEGY_TYPES)[0];
    accountId: string;
    onCreated: () => void;
}) {
    const [text, setText] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const Icon = config.icon;

    const handleSubmit = async () => {
        if (!text.trim()) return;
        setLoading(true);
        setError("");
        setSuccess("");

        try {
            const result = await parseStrategy(accountId, config.type, text.trim());
            if (result.status === "created") {
                setSuccess(`✅ Strategy #${result.strategy_id} created!`);
                setText("");
                onCreated();
                setTimeout(() => setSuccess(""), 3000);
            } else {
                setError(result.message || "Could not parse. Try rephrasing.");
            }
        } catch {
            setError("Failed to connect. Is the backend running?");
        }
        setLoading(false);
    };

    return (
        <div className="rounded-lg border border-[hsl(225,18%,14%)] bg-zinc-800/30 p-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
                <Icon size={11} className={config.color} />
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${config.color}`}>
                    {config.label}
                </span>
            </div>
            <div className="flex gap-1">
                <input
                    type="text"
                    value={text}
                    onChange={(e) => { setText(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                    placeholder={config.placeholder}
                    className="flex-1 bg-zinc-900/60 border border-zinc-700/50 rounded-md px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
                />
                <button
                    onClick={handleSubmit}
                    disabled={loading || !text.trim()}
                    className="px-2 py-1.5 rounded-md bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:hover:bg-primary/10 transition-colors"
                >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                </button>
            </div>
            {error && <p className="text-[9px] text-red-400 mt-1">{error}</p>}
            {success && <p className="text-[9px] text-emerald-400 mt-1">{success}</p>}
        </div>
    );
}

// ── Slider Sub-Component ─────────────────────────────────────────

function SliderSetting({
    label,
    value,
    min,
    max,
    step,
    onCommit,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onCommit: (v: number) => void;
}) {
    const [localVal, setLocalVal] = useState(value);

    useEffect(() => {
        setLocalVal(value);
    }, [value]);

    return (
        <div className="space-y-1 mt-2">
            <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <span className="text-[10px] font-mono text-foreground">
                    ${localVal.toFixed(2)}
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={localVal}
                onChange={(e) => setLocalVal(Number(e.target.value))}
                onMouseUp={() => onCommit(localVal)}
                onTouchEnd={() => onCommit(localVal)}
                className="w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
            />
        </div>
    );
}

// ── Strategy Description Helper ─────────────────────────────────

function describeStrategy(s: Strategy): string {
    const c = s.trigger_condition;
    switch (s.strategy_type) {
        case "price_alert": {
            const token = String(c.token || "?").toUpperCase();
            const pct = c.threshold_pct || c.drop_pct || "?";
            const dir = c.direction || "drop";
            return `${token} ${dir}s ${pct}%`;
        }
        case "stop_loss": {
            const token = String(c.token || "?").toUpperCase();
            const pct = c.drop_pct || "?";
            return `Sell ${token} if drops ${pct}%`;
        }
        case "rebalance": {
            const targets = (c.target || {}) as Record<string, number>;
            const parts = Object.entries(targets).map(([k, v]) => `${v}% ${k.toUpperCase()}`);
            return parts.join(", ") || "Custom allocation";
        }
        default:
            return s.strategy_type;
    }
}

// ── Main Component ───────────────────────────────────────────────

type Props = { accountId: string | null };

export default function AutonomyDashboard({ accountId }: Props) {
    const { signAndSendTransaction } = useWallet();
    const [settings, setSettings] = useState<UserSettings | null>(null);
    const [strategies, setStrategies] = useState<Strategy[]>([]);
    const [logs, setLogs] = useState<AgentLog[]>([]);
    const [showLogs, setShowLogs] = useState(false);
    const [delegating, setDelegating] = useState(false);
    const [agentKeys, setAgentKeys] = useState<{ id: number; chain_type: string; public_key: string; scope: string; status: string; tx_hash: string; agent_wallet_address?: string }[]>([]);
    const [agentBalance, setAgentBalance] = useState<Record<string, string>>({});
    const [emailInput, setEmailInput] = useState("");
    const [savingEmail, setSavingEmail] = useState(false);
    const [emailSaved, setEmailSaved] = useState(false);

    // -- Separate Agent Wallet Connector (Local HotKit) --
    const [agentSourceId, setAgentSourceId] = useState<string | null>(null);
    const [isConnectingAgent, setIsConnectingAgent] = useState(false);
    const hotKitRef = useRef<any>(null);
    const unsubscribersRef = useRef<(() => void)[]>([]);

    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const syncAgentWallets = useCallback((kit: any) => {
        try {
            const walletList = kit.wallets;
            if (!walletList || !Array.isArray(walletList) || walletList.length === 0) return;
            // For now, prioritize NEAR for the agent auth flow
            const nearWallet = walletList.find((w: any) =>
                String(w.type).toLowerCase().includes("near") || w.type === 1010
            );
            const addr = nearWallet ? (nearWallet.address || nearWallet.omniAddress || nearWallet.publicKey) : null;
            if (addr) setAgentSourceId(addr);
        } catch (e) {
            console.warn("[Agent Wallet] Sync error:", e);
        }
    }, []);

    // Handle return from Web Wallet authorization
    useEffect(() => {
        const agentKeyIdStr = searchParams.get("agent_key_id");
        const agentAccId = searchParams.get("account_id");
        const allKeys = searchParams.get("all_keys");
        const pubKeyStr = searchParams.get("public_key"); // Returned by Mynearwallet

        if (agentKeyIdStr && (agentAccId || allKeys || pubKeyStr)) {
            const processWebWalletAuth = async () => {
                setDelegating(true);
                try {
                    console.log("[Agent Wallet] Returned from web wallet auth. Activating key...");
                    // We don't have a transaction hash here because the web wallet handled it,
                    // we just pass a placeholder indicating success. In a production app,
                    // the backend would verify the key exists on-chain before fully activating.
                    await activateAgentWallet(parseInt(agentKeyIdStr), agentAccId || accountId || "unknown", "web-wallet-auth");
                    alert("Agent authorized successfully via Web Wallet!");
                    await loadData();
                    // Clean up URL
                    router.replace(pathname, { scroll: false });
                } catch (e) {
                    console.error("[Agent Wallet] Web Wallet activation failed:", e);
                } finally {
                    setDelegating(false);
                }
            };
            processWebWalletAuth();
        }
    }, [searchParams, pathname, router, accountId]);


    const connectAgentWallet = useCallback(async () => {
        setIsConnectingAgent(true);
        try {
            if (!hotKitRef.current) {
                const kitModule = await import("@hot-labs/kit");
                const HotKitClass = kitModule.HotConnector || kitModule.HotKit || (kitModule as any).default;

                // We must use the local storage instance explicitly
                const isolatedStorage = new PrefixedLocalStorage("v2:agent:");

                const kit = new HotKitClass({
                    storage: isolatedStorage,
                    // DO NOT use defaultConnectors as they might be pre-initialized singletons
                    // explicitly import and and wrap them if needed, or filter.
                    // For NEAR specifically, we try to ensure it uses our storage.
                    apiKey: process.env.NEXT_PUBLIC_HOT_API_KEY || "neptune-ai-agent-v2",
                    walletConnect: {
                        projectId: process.env.NEXT_PUBLIC_HOT_API_KEY || "neptune-ai-agent-v2",
                        metadata: {
                            name: "Neptune Agent",
                            description: "Authorize Agent",
                            url: typeof window !== "undefined" ? window.location.origin : "",
                            icons: ["https://avatars.githubusercontent.com/u/100000000?s=200&v=4"],
                        }
                    }
                });
                hotKitRef.current = kit;

                kit.onConnect?.(() => syncAgentWallets(kit));
                kit.onDisconnect?.(() => {
                    setAgentSourceId(null);
                    isolatedStorage.clear();
                });
                syncAgentWallets(kit);
            }


            const kit = hotKitRef.current;
            if (kit.connect) await kit.connect();
            else if (kit.openProfile) kit.openProfile();

            syncAgentWallets(kit);
        } catch (e) {
            console.error("[Agent Wallet] Connection failed:", e);
        }
        setIsConnectingAgent(false);
    }, [syncAgentWallets]);

    const disconnectAgentWallet = useCallback(async () => {
        const kit = hotKitRef.current;
        if (kit && kit.wallets) {
            for (const wallet of kit.wallets) {
                try { await kit.disconnect?.(wallet); } catch { }
            }
        }
        // Also clear the prefixed storage to be safe
        try {
            const storage = new PrefixedLocalStorage("v2:agent:");
            await storage.clear();
        } catch (e) {
            console.error("[Agent Wallet] Storage clear error:", e);
        }
        setAgentSourceId(null);
    }, []);



    const loadData = useCallback(async () => {
        if (!accountId) return;
        try {
            const [s, strats, l] = await Promise.all([
                fetchSettings(accountId),
                fetchStrategies(accountId),
                fetchLogs(accountId),
            ]);
            if (s) {
                setSettings(s);
                if (s.notification_email) setEmailInput(s.notification_email);
            }
            setStrategies(strats);
            setLogs(l);
            // Load agent delegation keys
            const keys = await fetchAgentKeys(accountId);
            setAgentKeys(keys);
            // Fetch balance for all active agent wallets
            const activeWallets = keys.filter((k: { status: string; agent_wallet_address?: string }) => k.status === "active" && k.agent_wallet_address);
            const balMap: Record<string, string> = {};
            for (const w of activeWallets) {
                try {
                    const bal = await fetchAgentBalance(w.agent_wallet_address, w.chain_type);
                    balMap[w.chain_type] = bal.formatted || "0";
                } catch { balMap[w.chain_type] = "0"; }
            }
            setAgentBalance(balMap);
        } catch (e) {
            console.error("[Autonomy] Load error:", e);
        }
    }, [accountId]);

    useEffect(() => {
        loadData();
        // Silent polling — only log on failure
        const interval = setInterval(async () => {
            try { await loadData(); } catch { /* silent */ }
        }, 10_000);
        return () => clearInterval(interval);
    }, [loadData]);

    if (!accountId) {
        return (
            <div className="px-3 pb-4">
                <div className="rounded-xl border border-dashed border-[hsl(225,18%,14%)] bg-secondary/30 p-5 text-center">
                    <Brain size={20} className="mx-auto mb-2 text-muted-foreground" />
                    <p className="text-[10px] text-muted-foreground">
                        Connect wallet to enable<br />autonomous features
                    </p>
                </div>
            </div>
        );
    }

    const isKillSwitchOn = settings?.kill_switch === 1;
    const autonomyLevel = settings?.autonomy_level ?? 0;
    const agentWallet = settings?.agent_wallet || "";

    // ── Handlers ──────────────────────────────────────────────────

    const handleAutonomyChange = async (level: number) => {
        await updateSettings(accountId, { autonomy_level: level });
        await loadData();
    };

    const handleKillSwitch = async () => {
        await toggleKillSwitch(accountId, !isKillSwitchOn);
        await loadData();
    };

    const handleSettingChange = async (key: string, value: number | string) => {
        await updateSettings(accountId, { [key]: value });
        await loadData();
    };

    const handleRemoveStrategy = async (id: number) => {
        await removeStrategy(id);
        await loadData();
    };


    const handleCreateAgentWallet = async (chainType: string = "near") => {
        if (!accountId) return;

        // Step 1: Ensure we have a separate agent-source wallet connected
        if (!agentSourceId) {
            console.log("[Agent Wallet] No agentSourceId, connecting...");
            await connectAgentWallet();
            return;
        }

        setDelegating(true);
        console.log("[Agent Wallet] Starting authorization for:", agentSourceId);
        try {
            // Step 2: Propose the key for the agentSourceId (the separate wallet)
            const result = await createAgentWallet(agentSourceId, chainType);
            console.log("[Agent Wallet] Propose result:", result);

            if (result.sign_payload && chainType === "near") {
                const kit = hotKitRef.current;
                const wallets = kit?.wallets || [];
                console.log("[Agent Wallet] Available wallets in HotKit:", wallets.map((w: any) => w.address || w.publicKey));

                const sourceWallet = wallets.find((w: any) =>
                    (w.address || w.omniAddress || w.publicKey) === agentSourceId
                );

                if (sourceWallet) {
                    console.log("[Agent Wallet] Requesting signature from:", agentSourceId);
                    try {
                        const sendFn = sourceWallet.sendTransaction || sourceWallet.signAndSendTransaction;

                        if (!sendFn) {
                            throw new Error("Wallet instance does not support sending transactions directly.");
                        }

                        // Try to sign and send the transaction
                        const txResponse = await sendFn.call(sourceWallet, {
                            receiverId: result.sign_payload.receiverId || result.sign_payload.receiver_id,
                            actions: result.sign_payload.actions
                        });

                        console.log("[Agent Wallet] Transaction response:", txResponse);

                        const txHash = typeof txResponse === 'string'
                            ? txResponse
                            : (txResponse?.hash || txResponse?.transaction?.hash || txResponse?.transaction_outcome?.id);

                        if (txHash) {
                            console.log("[Agent Wallet] Success! Activating key with hash:", txHash);
                            await activateAgentWallet(result.key_id, agentSourceId, txHash);
                            alert("Authorization successful! Agent is now active.");
                        } else {
                            console.warn("[Agent Wallet] Transaction sent but no hash found in response", txResponse);
                        }
                    } catch (signErr: any) {
                        console.error("[Agent Wallet] Signing failed:", signErr);
                        const msg = signErr.message || "";
                        if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("denied")) {
                            alert("Authorization rejected in wallet.");
                        } else {
                            // Wallet extension likely blocked it for security reasons. Provide Web Wallet Fallback.
                            const successUrl = new URL(window.location.href);
                            successUrl.searchParams.set("agent_key_id", result.key_id.toString());
                            successUrl.searchParams.set("account_id", agentSourceId);

                            const isTestnet = agentSourceId.endsWith(".testnet");
                            const walletDomain = isTestnet ? "testnet.mynearwallet.com" : "app.mynearwallet.com";
                            const webWalletUrl = `https://${walletDomain}/login/?success_url=${encodeURIComponent(successUrl.toString())}&public_key=${result.public_key}`;

                            if (confirm(`Your browser wallet blocked the authorization for security reasons (common for agent keys).\n\nWould you like to authorize securely via the official MyNearWallet Web Interface instead?`)) {
                                window.location.href = webWalletUrl;
                            }
                        }
                    }
                } else {
                    console.error("[Agent Wallet] Source wallet instance not found for:", agentSourceId);
                    alert("Could not find the connected agent wallet. Please try reconnecting the source wallet.");
                }
            } else {
                console.warn("[Agent Wallet] No sign_payload returned or unsupported chain");
            }

            await loadData();
        } catch (e: any) {
            console.error("[Agent Wallet] Unexpected error:", e);
        } finally {
            setDelegating(false);
        }
    };



    const handleRemoveAgentWallet = async (keyId: number) => {
        if (!accountId) return;
        if (!confirm("Remove agent wallet? Any remaining funds will be inaccessible.")) return;
        try {
            await removeAgentWallet(accountId, keyId);
            setAgentBalance({});
            await loadData();
        } catch (e) {
            console.error("Remove error:", e);
        }
    };

    const handleCopyAddress = (address: string) => {
        navigator.clipboard.writeText(address);
    };

    const handleSaveEmail = async () => {
        setSavingEmail(true);
        setEmailSaved(false);
        await updateSettings(accountId, { notification_email: emailInput.trim() });
        setSavingEmail(false);
        setEmailSaved(true);
        setTimeout(() => setEmailSaved(false), 2000);
        await loadData();
    };

    // ── Render ────────────────────────────────────────────────────

    return (
        <div className="px-3 pb-4 space-y-3">
            {/* Section Header */}
            <div className="flex items-center gap-1.5 px-2 mb-1">
                <Shield size={12} className="text-emerald-400" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-emerald-400">
                    Autonomy
                </span>
            </div>

            {/* Agent Wallet */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Wallet size={12} className="text-violet-400" />
                    <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">
                        Agent Wallet
                    </span>
                </div>

                {/* Show existing active wallets */}
                {agentKeys.filter(k => k.status === "active").length > 0 && (
                    <div className="space-y-2 mb-2">
                        {agentKeys.filter(k => k.status === "active").map(k => {
                            const addr = k.agent_wallet_address || k.public_key;
                            const chainLabel = k.chain_type === "near" ? "NEAR" : k.chain_type === "evm" ? "EVM" : "Flow";
                            const shortAddr = addr.length > 16 ? `${addr.slice(0, 8)}...${addr.slice(-8)}` : addr;
                            return (
                                <div key={k.id} className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2.5">
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold">{chainLabel}</span>
                                        <button
                                            onClick={() => handleRemoveAgentWallet(k.id)}
                                            className="text-muted-foreground hover:text-red-400 transition-colors"
                                            title="Remove agent wallet"
                                        >
                                            <Trash2 size={10} />
                                        </button>
                                    </div>
                                    <p className="text-[14px] font-bold text-emerald-400 mb-1.5">{agentBalance[k.chain_type] || "0"}</p>
                                    <button
                                        onClick={() => { handleCopyAddress(addr); }}
                                        className="w-full text-left px-2 py-1.5 rounded-md bg-zinc-900/60 border border-zinc-700/30 hover:border-violet-500/30 transition-colors group flex items-center justify-between"
                                        title="Click to copy"
                                    >
                                        <p className="text-[8px] font-mono text-violet-300/80 truncate group-hover:text-violet-300">
                                            {shortAddr}
                                        </p>
                                        <ExternalLink size={8} className="text-muted-foreground group-hover:text-violet-400 flex-shrink-0 ml-1" />
                                    </button>
                                    <p className="text-[8px] text-muted-foreground mt-1.5">Send {chainLabel} tokens to this address to fund your agent</p>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Chain buttons for creating wallets */}
                {(() => {
                    const activeChains = agentKeys.filter(k => k.status === "active").map(k => k.chain_type);

                    // Show connection status of the separate Agent Source wallet
                    if (!agentSourceId) {
                        return (
                            <div className="mt-2">
                                <p className="text-[9px] text-muted-foreground mb-2">
                                    Connect a separate wallet specifically for the agent to use.
                                </p>
                                <button
                                    onClick={connectAgentWallet}
                                    disabled={isConnectingAgent}
                                    className="w-full px-2 py-2 rounded-lg bg-violet-500/10 text-violet-400 hover:bg-violet-500/20 transition-colors text-[10px] font-bold flex items-center justify-center gap-2 border border-violet-500/20"
                                >
                                    {isConnectingAgent ? <Loader2 size={12} className="animate-spin" /> : <Wallet size={12} />}
                                    CONNECT AGENT SOURCE WALLET
                                </button>
                            </div>
                        );
                    }

                    const chains = [
                        { id: "near", label: "NEAR", color: "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20" },
                        { id: "evm", label: "EVM", color: "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20" },
                        { id: "flow", label: "Flow", color: "bg-teal-500/10 text-teal-400 hover:bg-teal-500/20" },
                    ].filter(c => !activeChains.includes(c.id));

                    if (chains.length === 0) return (
                        <div className="mt-2 text-center py-2 bg-violet-500/5 rounded-lg border border-violet-500/10">
                            <p className="text-[8px] text-violet-300/60 uppercase tracking-widest font-bold">Source: {agentSourceId.slice(0, 6)}...{agentSourceId.slice(-4)}</p>
                            <button onClick={disconnectAgentWallet} className="text-[8px] text-red-400/60 hover:text-red-400 mt-1 uppercase font-bold">Disconnect Source</button>
                        </div>
                    );

                    return (
                        <div className="mt-4">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] text-muted-foreground">Connected: <span className="text-violet-300 font-mono">{agentSourceId.slice(0, 8)}...</span></p>
                                <button onClick={disconnectAgentWallet} className="text-[8px] text-red-400/60 hover:text-red-400 uppercase font-bold">Change</button>
                            </div>
                            <div className="flex gap-1.5">
                                {chains.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => handleCreateAgentWallet(c.id)}
                                        disabled={delegating}
                                        className={`flex-1 px-2 py-1.5 rounded-lg ${c.color} disabled:opacity-30 transition-colors text-[9px] font-medium flex items-center justify-center gap-1`}
                                    >
                                        {delegating ? <Loader2 size={10} className="animate-spin" /> : <Shield size={10} />}
                                        AUTHORIZE {c.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })()}

            </div>

            {/* Notification Email */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Mail size={12} className="text-cyan-400" />
                    <span className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider">
                        Notification Email
                    </span>
                </div>
                <p className="text-[9px] text-muted-foreground mb-1.5">
                    Get emailed when a strategy triggers
                </p>
                <div className="flex gap-1">
                    <input
                        type="email"
                        value={emailInput}
                        onChange={(e) => setEmailInput(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveEmail()}
                        placeholder="your@email.com"
                        className="flex-1 bg-zinc-900/60 border border-zinc-700/50 rounded-md px-2 py-1.5 text-[10px] text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-cyan-500/40"
                    />
                    <button
                        onClick={handleSaveEmail}
                        disabled={savingEmail || !emailInput.trim()}
                        className="px-2 py-1.5 rounded-md bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-30 transition-colors"
                    >
                        {savingEmail ? <Loader2 size={12} className="animate-spin" /> : emailSaved ? <Check size={12} /> : <Mail size={12} />}
                    </button>
                </div>
                {emailSaved && <p className="text-[9px] text-emerald-400 mt-1">✅ Email saved</p>}
            </div>

            {/* Kill Switch */}
            <div
                className={`mx-1 rounded-xl border p-3 transition-all ${isKillSwitchOn
                    ? "border-red-500/50 bg-red-500/10"
                    : "border-[hsl(225,18%,14%)] bg-secondary/30"
                    }`}
            >
                <button
                    onClick={handleKillSwitch}
                    className={`flex items-center justify-between w-full transition-colors ${isKillSwitchOn ? "text-red-400" : "text-muted-foreground hover:text-foreground"
                        }`}
                >
                    <div className="flex items-center gap-2">
                        <Power size={14} />
                        <span className="text-[11px] font-semibold">
                            {isKillSwitchOn ? "Kill Switch ACTIVE" : "Kill Switch"}
                        </span>
                    </div>
                    <div className={`w-8 h-4 rounded-full relative transition-colors ${isKillSwitchOn ? "bg-red-500" : "bg-zinc-700"}`}>
                        <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${isKillSwitchOn ? "translate-x-4" : "translate-x-0.5"}`} />
                    </div>
                </button>
                {isKillSwitchOn && (
                    <p className="text-[9px] text-red-400/80 mt-1.5 ml-6">All autonomous actions halted</p>
                )}
            </div>

            {/* Autonomy Level */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Activity size={12} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Autonomy Level
                    </span>
                </div>
                <div className="flex gap-1">
                    {["Off", "Notify", "Auto"].map((label, i) => (
                        <button
                            key={i}
                            onClick={() => handleAutonomyChange(i)}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-medium transition-all ${autonomyLevel === i
                                ? i === 0
                                    ? "bg-zinc-700 text-white"
                                    : i === 1
                                        ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                                        : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-zinc-800/50 text-muted-foreground hover:bg-zinc-700/50"
                                }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Guardrails */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-1">
                    <Settings size={12} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Guardrails
                    </span>
                </div>
                <SliderSetting
                    label="Max per tx"
                    value={settings?.max_tx_amount ?? 0.5}
                    min={0.01}
                    max={1}
                    step={0.01}
                    onCommit={(v) => handleSettingChange("max_tx_amount", v)}
                />
                <SliderSetting
                    label="Daily limit"
                    value={settings?.daily_limit ?? 2}
                    min={0.05}
                    max={5}
                    step={0.05}
                    onCommit={(v) => handleSettingChange("daily_limit", v)}
                />
            </div>

            {/* Strategy Setup (NLP Inputs) */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <Brain size={12} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Create Strategy
                    </span>
                </div>
                <div className="space-y-2">
                    {STRATEGY_TYPES.map((config) => (
                        <StrategyInput
                            key={config.type}
                            config={config}
                            accountId={accountId}
                            onCreated={loadData}
                        />
                    ))}
                </div>
            </div>

            {/* Active Strategies */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle size={12} className="text-muted-foreground" />
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Active Strategies ({strategies.length})
                    </span>
                </div>

                {strategies.length === 0 ? (
                    <p className="text-[9px] text-muted-foreground text-center py-2">
                        No active strategies — use the fields above or tell Neptune in chat
                    </p>
                ) : (
                    <div className="space-y-1.5">
                        {strategies.map((s) => (
                            <div
                                key={s.id}
                                className="flex items-center justify-between p-2 rounded-lg bg-zinc-800/30"
                            >
                                <div className="min-w-0">
                                    <span className="text-[10px] font-medium text-foreground capitalize">
                                        {s.strategy_type.replace("_", " ")}
                                    </span>
                                    <p className="text-[9px] text-muted-foreground truncate">
                                        {describeStrategy(s)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleRemoveStrategy(s.id)}
                                    className="text-muted-foreground hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Decision History */}
            <div className="mx-1 rounded-xl border border-[hsl(225,18%,14%)] bg-secondary/30 p-3">
                <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center justify-between w-full text-left"
                >
                    <div className="flex items-center gap-2">
                        <Clock size={12} className="text-muted-foreground" />
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            Decision History ({logs.length})
                        </span>
                    </div>
                    {showLogs ? (
                        <ChevronUp size={12} className="text-muted-foreground" />
                    ) : (
                        <ChevronDown size={12} className="text-muted-foreground" />
                    )}
                </button>

                {showLogs && (
                    <div className="mt-2 max-h-48 overflow-y-auto space-y-1.5 scrollbar-thin">
                        {logs.length === 0 ? (
                            <p className="text-[9px] text-muted-foreground text-center py-2">No decisions yet</p>
                        ) : (
                            logs.map((log) => {
                                // Human-friendly status
                                const statusMap: Record<string, { icon: string; color: string; label: string }> = {
                                    approved: { icon: "✅", color: "text-emerald-400", label: "Approved" },
                                    executed: { icon: "⚡", color: "text-blue-400", label: "Executed" },
                                    blocked: { icon: "⛔", color: "text-red-400", label: "Blocked" },
                                    archived: { icon: "📁", color: "text-zinc-400", label: "Logged" },
                                };
                                const s = statusMap[log.status] || { icon: "ℹ️", color: "text-amber-400", label: log.status };

                                // Clean up action text
                                let actionText = log.action_taken || "";
                                actionText = actionText.replace(/^Validated:\s*/i, "").replace(/^ALERT:\s*/i, "⚠️ ");

                                // Relative time
                                const diff = Date.now() - new Date(log.created_at).getTime();
                                const mins = Math.floor(diff / 60000);
                                const timeAgo = mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : `${Math.floor(mins / 60)}h ago`;

                                return (
                                    <div key={log.id} className="p-2 rounded-lg bg-zinc-800/30">
                                        <div className="flex items-center justify-between mb-0.5">
                                            <span className={`text-[9px] font-medium ${s.color} flex items-center gap-1`}>
                                                <span>{s.icon}</span> {s.label}
                                            </span>
                                            <span className="text-[8px] text-muted-foreground">{timeAgo}</span>
                                        </div>
                                        <p className="text-[9px] text-foreground/80 leading-relaxed">{actionText}</p>
                                    </div>
                                );
                            })
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
