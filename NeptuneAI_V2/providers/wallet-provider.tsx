"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { fetchAllTokens, rpcQuery } from "@/lib/near/near-utils";
import {
    NearNetwork,
    getNetwork,
    setNetwork as saveNetwork,
    syncNetworkFromBackend,
    isTestnet as checkIsTestnet,
    validateNetworkAccount,
    assertNetworkContract,
    NETWORK_CHANGE_EVENT,
} from "@/lib/near/network";
import TestnetWalletModal from "@/components/testnet-wallet-modal";
import localManifest from "@/lib/near/manifest.json";

// ─── Types ───────────────────────────────────────────────
type WalletState = {
    accountId: string | null;
    walletAddresses: Record<string, string>;
    connectedChains: string[];
    balances: Record<string, string>;
    isConnecting: boolean;
};

type WalletContextValue = WalletState & {
    network: NearNetwork;
    setNetwork: (net: NearNetwork) => void;
    isTestnet: boolean;
    connectWallet: (chainType?: number, walletId?: string) => Promise<void> | void;
    openTestnetModal?: () => void;
    disconnect: () => Promise<void>;
    signAndSendTransaction: (payload: Record<string, unknown> | Record<string, unknown>[]) => Promise<{ hash: string }>;
    signAndSendEvmTransaction: (payload: Record<string, unknown>) => Promise<{ hash: string }>;
    signAndSendGenericTransaction: (payload: Record<string, unknown>) => Promise<{ hash: string }>;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function useWallet() {
    const ctx = useContext(WalletContext);
    if (!ctx) throw new Error("useWallet must be inside WalletProvider");
    return ctx;
}

// ─── Chain type mappings ─────────────────────────────────
function walletTypeToChain(type: string | number): string {
    const t = Number(type);

    // Non-EVM Chains
    if (t === 1010) return "near";
    if (t === 1001) return "solana";
    if (t === 1111) return "ton";
    if (t === 333) return "tron";
    if (t === 1100) return "stellar";
    if (t === 4444118) return "cosmos";
    if (t === 4444119) return "gonka";
    if (t === -6) return "btc";
    if (t === -8) return "doge";
    if (t === -7) return "xrp";
    if (t === -5) return "zcash";
    if (t === -9) return "ada";
    if (t === -12) return "cardano";
    if (t === -10) return "aptos";
    if (t === -11) return "sui";
    if (t === -4) return "omni";
    if (t === -1030) return "hotcraft";
    if (t === -14) return "ltc";

    // EVM Chain IDs
    if (t === 1) return "eth";         // Ethereum Mainnet
    if (t === 11155111) return "eth";  // Ethereum Sepolia Testnet
    if (t === 56) return "bnb";        // BNB Chain
    if (t === 97) return "bnb";        // BNB Testnet
    if (t === 137) return "pol";       // Polygon
    if (t === 80002) return "pol";     // Polygon Amoy Testnet
    if (t === 42161) return "arb";     // Arbitrum One
    if (t === 421614) return "arb";    // Arbitrum Sepolia Testnet
    if (t === 8453) return "base";     // Base Mainnet
    if (t === 84532) return "base";    // Base Sepolia Testnet
    if (t === 10) return "op";         // Optimism Mainnet
    if (t === 11155420) return "op";   // Optimism Sepolia Testnet
    if (t === 534352) return "scroll"; // Scroll Mainnet
    if (t === 534351) return "scroll"; // Scroll Sepolia Testnet
    if (t === 1313161554) return "aurora"; // Aurora
    if (t === 1313161555) return "aurora"; // Aurora Testnet
    if (t === 43114) return "avax";    // Avalanche
    if (t === 43113) return "avax";    // Avalanche Fuji Testnet
    if (t === 59144) return "linea";   // Linea
    if (t === 196) return "xlayer";    // Xlayer
    if (t === 204) return "opbnb";     // opBNB
    if (t === 98881) return "ebi";     // EbiChain
    if (t === 1329) return "sei";      // Sei
    if (t === 81457) return "blast";   // Blast
    if (t === 167000) return "taiko";  // Taiko
    if (t === 5000) return "mantle";   // Mantle
    if (t === 169) return "manta";     // Manta
    if (t === 2222) return "kava";     // Kava
    if (t === 324) return "zksync";    // ZkSync
    if (t === 143) return "monad";     // Monad
    if (t === 1088) return "metis";    // Metis
    if (t === 100) return "gnosis";    // Gnosis
    if (t === 250) return "fantom";    // Fantom
    if (t === 25) return "cronos";     // Cronos
    if (t === 88888) return "chiliz";  // Chiliz
    if (t === 1284) return "moonbeam"; // Moonbeam
    if (t === 2020) return "ronin";    // Ronin
    if (t === 1135) return "lisk";     // Lisk
    if (t === 146) return "sonic";     // Sonic
    if (t === 7777777) return "zora";  // Zora
    if (t === 34443) return "mode";    // Mode
    if (t === 80094) return "bera";    // Berachain
    if (t === 130) return "unichain";  // Unichain
    if (t === 1868) return "soneium";  // Soneium
    if (t === 57073) return "ink";     // Ink
    if (t === 2741) return "ape";      // Apechain
    if (t === 36900) return "adi";     // ADI

    // Fallbacks
    const typeStr = String(type).toLowerCase();
    if (typeStr.includes("near")) return "near";
    if (typeStr.includes("evm") || typeStr.includes("eth")) return "eth";
    if (typeStr.includes("sol")) return "solana";
    if (typeStr.includes("btc") || typeStr.includes("bitcoin")) return "btc";
    if (typeStr.includes("doge")) return "doge";

    return String(type);
}

const EVM_CHAIN_KEYS = new Set([
    "eth", "bnb", "pol", "polygon", "arb", "arbitrum", "base", "op", "optimism",
    "scroll", "aurora", "avax", "avalanche", "linea", "xlayer", "opbnb", "ebi", "sei",
    "blast", "taiko", "mantle", "manta", "kava", "zksync", "monad", "metis", "gnosis",
    "fantom", "cronos", "chiliz", "moonbeam", "ronin", "lisk", "sonic", "zora", "mode",
    "bera", "berachain", "unichain", "soneium", "ink", "ape", "apechain", "adi",
    "sepolia", "amoy", "fuji"
]);

function formatBalanceManual(balance: string | bigint | number, decimals: number): string {
    const val = BigInt(balance);
    if (val === BigInt(0)) return "0";

    const div = BigInt(10 ** decimals);
    const int = val / div;
    const rem = val % div;

    let remStr = rem.toString().padStart(decimals, "0").slice(0, 8);
    return `${int}.${remStr}`.replace(/\.?0+$/, "");
}

const WALLET_STORAGE_KEY = "neptune_connected_wallet";
const ADDRESSES_STORAGE_KEY = "neptune_wallet_addresses";
const CHAINS_STORAGE_KEY = "neptune_connected_chains";
const EXPIRES_STORAGE_KEY = "neptune_wallet_expires";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function clearSavedWallet() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(WALLET_STORAGE_KEY);
    localStorage.removeItem(ADDRESSES_STORAGE_KEY);
    localStorage.removeItem(CHAINS_STORAGE_KEY);
    localStorage.removeItem(EXPIRES_STORAGE_KEY);
}

// The 24h clock starts at first connect and is not extended by later saves
function ensureWalletExpiry() {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(EXPIRES_STORAGE_KEY)) {
        localStorage.setItem(EXPIRES_STORAGE_KEY, String(Date.now() + SESSION_TTL_MS));
    }
}

// ─── Provider ────────────────────────────────────────────
export default function WalletProvider({ children }: { children: React.ReactNode }) {
    const [network, setNetworkState] = useState<NearNetwork>("testnet");
    const [isTestnetModalOpen, setIsTestnetModalOpen] = useState(false);

    const [state, setState] = useState<WalletState>(() => {
        if (typeof window === "undefined") {
            return {
                accountId: null,
                walletAddresses: {},
                connectedChains: [],
                balances: {},
                isConnecting: false,
            };
        }
        try {
            let savedWallet = localStorage.getItem(WALLET_STORAGE_KEY);
            const currentNet = getNetwork();
            if (savedWallet) {
                const expiresAt = Number(localStorage.getItem(EXPIRES_STORAGE_KEY));
                if (expiresAt && Date.now() > expiresAt) {
                    clearSavedWallet();
                    savedWallet = null;
                } else if (!expiresAt) {
                    ensureWalletExpiry();
                }
            }
            if (savedWallet) {
                const validation = validateNetworkAccount(savedWallet, currentNet);
                if (validation.valid) {
                    let savedAddrs: Record<string, string> = { near: savedWallet };
                    let savedChains: string[] = ["near"];
                    const rawAddrs = localStorage.getItem(ADDRESSES_STORAGE_KEY);
                    const rawChains = localStorage.getItem(CHAINS_STORAGE_KEY);
                    if (rawAddrs) {
                        try { savedAddrs = JSON.parse(rawAddrs); } catch {}
                    }
                    if (rawChains) {
                        try { savedChains = JSON.parse(rawChains); } catch {}
                    }
                    return {
                        accountId: savedWallet,
                        walletAddresses: savedAddrs,
                        connectedChains: savedChains,
                        balances: {},
                        isConnecting: false,
                    };
                }
            }
        } catch (e) {
            console.warn("[Wallet] Failed to load saved wallet session:", e);
        }
        return {
            accountId: null,
            walletAddresses: {},
            connectedChains: [],
            balances: {},
            isConnecting: false,
        };
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotKitRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nearConnectorRef = useRef<any>(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeWalletRef = useRef<any>(null);
    const unsubscribersRef = useRef<(() => void)[]>([]);

    // ── Dedicated NEAR Balance Fetcher (Works for both Testnet & Mainnet without HotKit) ──
    const fetchNearBalances = useCallback(async (nearAddress: string) => {
        if (!nearAddress) return;
        const newBalances: Record<string, string> = {};

        try {
            const result = (await rpcQuery({
                request_type: "view_account",
                finality: "final",
                account_id: nearAddress,
            })) as { amount: string; storage_usage?: number };

            if (result?.amount) {
                const totalYocto = BigInt(result.amount);
                const storageBytes = BigInt(result.storage_usage || 0);
                const storageCost = storageBytes * BigInt(10 ** 19);
                const availableYocto = totalYocto > storageCost ? totalYocto - storageCost : BigInt(0);

                const balance = Number(availableYocto / BigInt(10 ** 20)) / 10000;
                const fmt = balance.toFixed(5).replace(/\.?0+$/, "");
                newBalances["[NEAR] NEAR"] = fmt;
            } else {
                newBalances["[NEAR] NEAR"] = "0";
            }

            const tokens = await fetchAllTokens(nearAddress);
            tokens.forEach((t) => {
                const key = `[NEAR] ${t.symbol.toUpperCase()}`;
                newBalances[key] = t.formatted;
            });
        } catch (e: any) {
            if (e?.isNotFound) {
                newBalances["[NEAR] NEAR"] = "0";
            } else {
                console.warn("[Wallet] NEAR balance fetch notice:", e?.message || e);
            }
        }

        if (Object.keys(newBalances).length > 0) {
            setState((s) => ({
                ...s,
                balances: { ...s.balances, ...newBalances },
            }));
        }
    }, []);

    // Initialize network from backend SSOT on mount & restore background wallet connector
    useEffect(() => {
        const current = getNetwork();
        setNetworkState(current);

        // Authoritative sync from backend /api/network
        syncNetworkFromBackend().then((cfg) => {
            setNetworkState(cfg.network);
        });

        // Trigger balance fetch immediately if account was restored from localStorage
        if (state.accountId && state.walletAddresses?.near) {
            fetchNearBalances(state.walletAddresses.near);
        }

        // Silent background NearConnector initialization so active wallets can sign without re-modal
        if (state.accountId) {
            (async () => {
                try {
                    const targetNet = getNetwork();
                    const { NearConnector } = await import("@hot-labs/near-connect");
                    const nc = new NearConnector({
                        network: targetNet,
                        manifest: localManifest as any,
                    });
                    nearConnectorRef.current = nc;
                    await nc.whenManifestLoaded.catch(() => {});
                    if (Array.isArray(nc.wallets)) {
                        for (const w of nc.wallets) {
                            try {
                                const accounts = await w.getAccounts();
                                if (accounts && accounts.length > 0) {
                                    activeWalletRef.current = w;
                                    break;
                                }
                            } catch {}
                        }
                    }
                } catch (e) {
                    // Non-fatal background connector load
                }
            })();
        }

        const handleNetworkChanged = (e: Event) => {
            const customEvent = e as CustomEvent<NearNetwork>;
            if (customEvent.detail) {
                setNetworkState(customEvent.detail);
            }
        };

        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === WALLET_STORAGE_KEY) {
                const newWallet = e.newValue;
                if (!newWallet) {
                    setState({
                        accountId: null,
                        walletAddresses: {},
                        connectedChains: [],
                        balances: {},
                        isConnecting: false,
                    });
                } else {
                    const currentNet = getNetwork();
                    const validation = validateNetworkAccount(newWallet, currentNet);
                    if (validation.valid) {
                        let addrs = { near: newWallet };
                        let chs = ["near"];
                        try {
                            const rawA = localStorage.getItem(ADDRESSES_STORAGE_KEY);
                            const rawC = localStorage.getItem(CHAINS_STORAGE_KEY);
                            if (rawA) addrs = JSON.parse(rawA);
                            if (rawC) chs = JSON.parse(rawC);
                        } catch {}
                        setState({
                            accountId: newWallet,
                            walletAddresses: addrs,
                            connectedChains: chs,
                            balances: {},
                            isConnecting: false,
                        });
                        if (addrs.near) fetchNearBalances(addrs.near);
                    }
                }
            }
        };

        window.addEventListener(NETWORK_CHANGE_EVENT, handleNetworkChanged);
        window.addEventListener("storage", handleStorageChange);
        return () => {
            window.removeEventListener(NETWORK_CHANGE_EVENT, handleNetworkChanged);
            window.removeEventListener("storage", handleStorageChange);
        };
    }, [state.accountId, state.walletAddresses?.near, fetchNearBalances]);

    // Set network handler (updates state, storage, and backend)
    const setNetwork = useCallback((net: NearNetwork) => {
        setNetworkState(net);
        saveNetwork(net, state.accountId);

        // Hard Network Validation check on existing connected account
        if (state.accountId) {
            const validation = validateNetworkAccount(state.accountId, net);
            if (!validation.valid) {
                console.warn("[Wallet] Active account does not match new network:", validation.error);
                if (typeof window !== "undefined") {
                    localStorage.removeItem(WALLET_STORAGE_KEY);
                    localStorage.removeItem(ADDRESSES_STORAGE_KEY);
                    localStorage.removeItem(CHAINS_STORAGE_KEY);
                    localStorage.removeItem(EXPIRES_STORAGE_KEY);
                }
                // Clear state on network mismatch so user connects appropriate network account
                setState({
                    accountId: null,
                    walletAddresses: {},
                    connectedChains: [],
                    balances: {},
                    isConnecting: false,
                });
            }
        }
    }, [state.accountId]);

    // ── Extract addresses from HOT Kit wallets array (Mainnet mode) ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncWallets = useCallback((kit: any) => {
        try {
            const walletList = kit.wallets;
            if (!walletList || !Array.isArray(walletList) || walletList.length === 0) return;

            const addresses: Record<string, string> = {};
            const multiBalances: Record<string, string> = {};
            for (const wallet of walletList) {
                const chain = walletTypeToChain(wallet.type);
                const addr = wallet.address || wallet.omniAddress || wallet.publicKey;
                if (addr) addresses[chain] = addr;

                if (wallet.balance !== undefined && wallet.balance !== null && wallet.balance !== "") {
                    const sym = chain.toUpperCase();
                    const dec = (chain === "near" ? 24 : (["eth", "arb", "bnb", "pol", "base", "op", "linea", "scroll", "aurora", "avax"].includes(chain)) ? 18 : (chain === "solana" ? 9 : (chain === "btc" || chain === "doge" ? 8 : 18)));
                    try {
                        multiBalances[`[${sym}] ${sym}`] = formatBalanceManual(wallet.balance, dec);
                    } catch {
                        multiBalances[`[${sym}] ${sym}`] = String(wallet.balance);
                    }
                }
            }

            if (Object.keys(addresses).length === 0) return;

            const chains = Object.keys(addresses);
            const primaryId = addresses.near || addresses.eth || Object.values(addresses)[0] || "Unknown";

            // Auto-detect network from primary account if needed
            let targetNet = network;
            if (primaryId.endsWith(".near") && network !== "mainnet") {
                targetNet = "mainnet";
                setNetwork("mainnet");
            } else if (primaryId.endsWith(".testnet") && network !== "testnet") {
                targetNet = "testnet";
                setNetwork("testnet");
            }

            // Hard check: Validate primary account against network
            const validation = validateNetworkAccount(primaryId, targetNet);
            if (!validation.valid) {
                console.warn("[Wallet] HOT Kit returned account conflicting with active network:", primaryId);
                return;
            }

            if (typeof window !== "undefined") {
                localStorage.setItem(WALLET_STORAGE_KEY, primaryId);
                localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify(addresses));
                localStorage.setItem(CHAINS_STORAGE_KEY, JSON.stringify(chains));
                ensureWalletExpiry();
            }

            setState((prev) => ({
                ...prev,
                accountId: primaryId,
                walletAddresses: addresses,
                connectedChains: chains,
                balances: { ...prev.balances, ...multiBalances },
                isConnecting: false,
            }));

            // Fetch balances
            if (addresses.near) {
                fetchNearBalances(addresses.near);
            }
        } catch (e) {
            console.warn("Could not sync HOT Kit wallets:", e);
        }
    }, [network, fetchNearBalances]);

    // ── Auto-refresh balances (Polling) ──────────────────
    useEffect(() => {
        if (!state.accountId || !state.walletAddresses.near) return;

        // Fetch immediately
        fetchNearBalances(state.walletAddresses.near);

        const interval = setInterval(() => {
            if (state.walletAddresses.near) {
                fetchNearBalances(state.walletAddresses.near);
            }
        }, 8000);

        return () => clearInterval(interval);
    }, [state.accountId, state.walletAddresses.near, fetchNearBalances]);

    // ── Handle Successful Direct Account Connection ───────
    const handleDirectConnect = useCallback((directAccountId: string) => {
        // Auto-detect network from account domain if needed
        let targetNet = network;
        if (directAccountId.endsWith(".near") && network !== "mainnet") {
            targetNet = "mainnet";
            setNetwork("mainnet");
        } else if (directAccountId.endsWith(".testnet") && network !== "testnet") {
            targetNet = "testnet";
            setNetwork("testnet");
        }

        // Hard assertion check against target network
        const validation = validateNetworkAccount(directAccountId, targetNet);
        if (!validation.valid) {
            console.error(`[Wallet] Attempted to connect incompatible account for ${targetNet}:`, directAccountId);
            return;
        }

        console.log(`[Wallet] Connected to NEAR ${targetNet}:`, directAccountId);

        if (typeof window !== "undefined") {
            localStorage.setItem(WALLET_STORAGE_KEY, directAccountId);
            localStorage.setItem(ADDRESSES_STORAGE_KEY, JSON.stringify({ near: directAccountId }));
            localStorage.setItem(CHAINS_STORAGE_KEY, JSON.stringify(["near"]));
            ensureWalletExpiry();
        }

        setState({
            accountId: directAccountId,
            walletAddresses: { near: directAccountId },
            connectedChains: ["near"],
            balances: {},
            isConnecting: false,
        });

        // Trigger balance fetch immediately
        fetchNearBalances(directAccountId);
    }, [network, setNetwork, fetchNearBalances]);

    // ── Connect Wallet Entrypoint (Direct HOT Wallet Connector Modal) ─
    const connectWallet = useCallback(async (chainType?: number | unknown, walletId?: string): Promise<void> => {
        const validChainType = typeof chainType === "number" ? chainType : undefined;
        const validWalletId = typeof walletId === "string" ? walletId : undefined;

        console.log(`[Wallet] Connecting via HOT Connector (${network} mode, chainType=${validChainType || "auto"}, walletId=${validWalletId || "none"})...`);
        setState((s) => ({ ...s, isConnecting: true }));
        try {
            const targetNet = network === "testnet" ? "testnet" : "mainnet";

            // If non-NEAR multi-chain type is explicitly requested (e.g. EVM, Solana), use HOT Kit
            if (validChainType && validChainType !== 1010) {
                let HotKitClass: any;
                try {
                    const kitModule = await import("@hot-labs/kit");
                    HotKitClass = kitModule.HotConnector || kitModule.HotKit || (kitModule as any).default;
                } catch (importErr) {
                    console.warn("[Wallet] HOT Kit module dynamic load notice:", importErr);
                }

                if (HotKitClass) {
                    if (!hotKitRef.current) {
                        const rawApiKey = process.env.NEXT_PUBLIC_HOT_API_KEY || process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
                        const effectiveProjectId = (rawApiKey && rawApiKey.trim() !== "" && rawApiKey !== "neptune-ai-dev")
                            ? rawApiKey
                            : "3a8170812b534d0ff9d794f19a901d64";

                        const kit = new HotKitClass({
                            projectId: effectiveProjectId,
                            apiKey: effectiveProjectId,
                            walletConnect: {
                                projectId: effectiveProjectId,
                                metadata: {
                                    name: "Neptune AI",
                                    description: "Autonomous AI Agents on NEAR Protocol",
                                    url: typeof window !== "undefined" ? window.location.origin : "https://neptune.ai",
                                    icons: ["https://storage.herewallet.app/upload/73a44e583769f11112b0eff1f2dd2a560c05eed5f6d92f0c03484fa047c31668.png"],
                                },
                            },
                        });
                        hotKitRef.current = kit;
                        const unsubConnect = kit.onConnect?.(() => {
                            syncWallets(kit);
                            setIsTestnetModalOpen(false);
                        });
                        if (unsubConnect) unsubscribersRef.current.push(unsubConnect);
                    }
                    const kit = hotKitRef.current;
                    if (kit.connect) {
                        await kit.connect(validChainType);
                        syncWallets(kit);
                        setIsTestnetModalOpen(false);
                        return;
                    }
                }
            }

            // PRIMARY FLOW: Launch the official HOT Wallet modal directly via @hot-labs/near-connect
            const { NearConnector } = await import("@hot-labs/near-connect");
            const nc = new NearConnector({
                network: targetNet,
                manifest: localManifest as any,
            });
            nearConnectorRef.current = nc;

            await nc.whenManifestLoaded.catch(() => {});

            // Ensure testnet features are enabled for all sandbox wallets so Meteor, HOT, MyNearWallet all appear on testnet!
            if (nc.manifest?.wallets) {
                nc.manifest.wallets.forEach((w: any) => {
                    w.features = { ...(w.features || {}), testnet: true, mainnet: true };
                });
            }
            if (Array.isArray(nc.wallets)) {
                nc.wallets.forEach((w: any) => {
                    if (w.manifest) {
                        w.manifest.features = { ...(w.manifest.features || {}), testnet: true, mainnet: true };
                    }
                });
            }

            // If a specific walletId was passed (e.g. 'meteor-wallet' or 'hot-wallet'), connect directly to it.
            // If walletId is undefined, nc.connect() automatically creates & opens NearWalletsPopup (the official HOT Wallet modal)!
            const wallet = await nc.connect(validWalletId);
            activeWalletRef.current = wallet;

            const accounts = await wallet.getAccounts();
            if (accounts && accounts.length > 0) {
                const primaryAccount = accounts[0].accountId;
                handleDirectConnect(primaryAccount);
                setIsTestnetModalOpen(false);
            }
        } catch (err: any) {
            if (err?.message?.includes("rejected") || err?.message?.includes("User rejected")) {
                console.log("[Wallet] User dismissed wallet modal.");
                return;
            }
            console.warn("[Wallet] HOT Wallet connection notice:", err);
        } finally {
            setState((s) => ({ ...s, isConnecting: false }));
        }
    }, [network, handleDirectConnect, syncWallets]);

    // ── Disconnect ────────────────────────────────────────
    const disconnect = useCallback(async () => {
        try {
            if (activeWalletRef.current) {
                try {
                    await activeWalletRef.current.signOut({ network });
                } catch {}
                activeWalletRef.current = null;
            }
            if (nearConnectorRef.current) {
                try {
                    await nearConnectorRef.current.disconnect();
                } catch {}
            }
            const kit = hotKitRef.current;
            if (kit) {
                const wallets = kit.wallets;
                if (Array.isArray(wallets)) {
                    for (const wallet of wallets) {
                        try {
                            await kit.disconnect?.(wallet);
                        } catch { }
                    }
                }
            }
        } catch (err) {
            console.error("Disconnect error:", err);
        }

        for (const unsub of unsubscribersRef.current) {
            try { unsub(); } catch { }
        }
        unsubscribersRef.current = [];

        if (typeof window !== "undefined") {
            localStorage.removeItem(WALLET_STORAGE_KEY);
            localStorage.removeItem(ADDRESSES_STORAGE_KEY);
            localStorage.removeItem(CHAINS_STORAGE_KEY);
            localStorage.removeItem(EXPIRES_STORAGE_KEY);
        }

        setState({
            accountId: null,
            walletAddresses: {},
            connectedChains: [],
            balances: {},
            isConnecting: false,
        });
    }, [network]);

    // ── Sign NEAR Transaction ─────────────────────────────
    const signAndSendTransaction = useCallback(
        async (payload: Record<string, unknown> | Record<string, unknown>[]): Promise<{ hash: string }> => {
            console.log(`[Wallet] signAndSendTransaction called in [${network.toUpperCase()}] mode:`, payload);

            if (!state.accountId) throw new Error("No wallet connected. Please connect a wallet first.");

            // Hard network check on payload receiverId
            const transformTx = (tx: any) => {
                const receiver = (tx.receiverId || tx.receiver_id) as string;
                const correctedReceiver = assertNetworkContract(receiver, network);
                return {
                    ...tx,
                    receiverId: correctedReceiver,
                };
            };

            const preparedPayload = Array.isArray(payload)
                ? payload.map(transformTx)
                : transformTx(payload);

            console.log("[Wallet] Network-verified transaction payload:", preparedPayload);

            // 1. If connected via active NearConnector wallet (Meteor Wallet, HOT Wallet, MyNearWallet)
            if (activeWalletRef.current) {
                const w = activeWalletRef.current;
                try {
                    if (Array.isArray(preparedPayload) && w.signAndSendTransactions) {
                        const txs = preparedPayload.map((tx: any) => ({
                            receiverId: tx.receiverId || tx.receiver_id,
                            actions: tx.actions || [],
                        }));
                        const res = await w.signAndSendTransactions({ transactions: txs, network });
                        const lastHash = Array.isArray(res) ? (res[res.length - 1]?.transaction?.hash || res[res.length - 1]?.hash) : "batch-tx";
                        return { hash: lastHash || "batch-tx" };
                    } else if (w.signAndSendTransaction) {
                        const tx = Array.isArray(preparedPayload) ? preparedPayload[0] : preparedPayload;
                        const res = await w.signAndSendTransaction({
                            receiverId: tx.receiverId || tx.receiver_id,
                            actions: tx.actions || [],
                            network,
                        });
                        return { hash: res?.transaction?.hash || res?.transaction_outcome?.id || res?.hash || "tx-success" };
                    }
                } catch (signErr) {
                    console.warn("[Wallet] Active NearConnector sign notice:", signErr);
                    throw signErr;
                }
            }
            const kit = hotKitRef.current;
            if (kit && Array.isArray(kit.wallets)) {
                const nearWallet = (kit as any).near || kit.wallets.find(
                    (w: any) => w.type === 1010 || (w.address || w.omniAddress || w.publicKey) === state.accountId
                );
                if (nearWallet) {
                    if (Array.isArray(preparedPayload) && nearWallet.sendTransactions) {
                        const hashes = await nearWallet.sendTransactions({ transactions: preparedPayload });
                        return { hash: Array.isArray(hashes) ? hashes[hashes.length - 1] : "batch-success" };
                    } else if (nearWallet.sendTransaction) {
                        const hash = await nearWallet.sendTransaction(
                            Array.isArray(preparedPayload) ? preparedPayload[0] : preparedPayload
                        );
                        return { hash: hash || "unknown" };
                    } else if (nearWallet.signAndSendTransaction) {
                        const res = await nearWallet.signAndSendTransaction(
                            Array.isArray(preparedPayload) ? preparedPayload[0] : preparedPayload
                        );
                        return { hash: res?.transaction?.hash || res?.hash || "unknown" };
                    }
                }
            }

            // 2. If connected via injected testnet window.near
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyWin = window as any;
            if (anyWin.near && anyWin.near.signAndSendTransaction) {
                const txToSign = Array.isArray(preparedPayload) ? preparedPayload[0] : preparedPayload;
                const res = await anyWin.near.signAndSendTransaction(txToSign);
                return { hash: res?.transaction?.hash || res?.hash || "testnet-tx" };
            }

            // 3. Fallback: Submit via backend agent execution / testnet broadcaster
            try {
                const res = await fetch("/api/autonomy/execute-tx", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        account_id: state.accountId,
                        network,
                        payload: preparedPayload,
                    }),
                });
                if (res.ok) {
                    const data = await res.json();
                    return { hash: data.tx_hash || "testnet-broadcast-success" };
                }
            } catch (backendErr) {
                console.warn("[Wallet] Backend delegate broadcast notice:", backendErr);
            }

            return { hash: `testnet-${Date.now().toString(16)}` };
        },
        [state.accountId, network]
    );

    // ── Sign EVM Transaction ──────────────────────────────
    const signAndSendEvmTransaction = useCallback(
        async (payload: Record<string, unknown>): Promise<{ hash: string }> => {
            const kit = hotKitRef.current;
            if (!kit) throw new Error("EVM transactions require HOT Kit connection.");

            const wallets = Array.isArray(kit.wallets) ? kit.wallets : [];
            const reqChainId = payload.chainId ? Number(payload.chainId) : undefined;

            let evmWallet = null;
            if (reqChainId) {
                evmWallet = wallets.find((w: any) => Number(w.type) === reqChainId || Number(w.chainId) === reqChainId);
            }
            if (!evmWallet) {
                // Find any EVM-compatible wallet (type matches EVM or 0x address)
                evmWallet = wallets.find((w: any) => {
                    const chain = walletTypeToChain(w.type);
                    const addr = w.address || w.omniAddress || w.publicKey;
                    return EVM_CHAIN_KEYS.has(chain) || (typeof addr === "string" && addr.startsWith("0x"));
                });
            }

            if (!evmWallet) {
                throw new Error("No EVM wallet connected. Please connect an EVM wallet in HOT Kit.");
            }

            const sendFn = evmWallet.sendTransaction || evmWallet.signAndSendTransaction;
            if (!sendFn) {
                throw new Error("Connected EVM wallet does not support sending transactions directly.");
            }

            const res = await sendFn.call(evmWallet, payload);
            const hash = typeof res === "string" ? res : (res?.hash || res?.transaction?.hash || "unknown");
            return { hash };
        },
        []
    );

    // ── Sign Generic Chain Transaction ────────────────────
    const signAndSendGenericTransaction = useCallback(
        async (payload: Record<string, unknown>): Promise<{ hash: string }> => {
            const kit = hotKitRef.current;
            if (!kit) throw new Error("Chain transactions require HOT Kit connection.");

            const chain = (payload.chain as string || "").toLowerCase();
            const wallets = Array.isArray(kit.wallets) ? kit.wallets : [];

            let wallet = wallets.find((w: any) => walletTypeToChain(w.type) === chain);
            if (!wallet) {
                if (chain === "solana" || chain === "sol") {
                    wallet = wallets.find((w: any) => w.type === 1001 || walletTypeToChain(w.type) === "solana");
                } else if (chain === "ton") {
                    wallet = wallets.find((w: any) => w.type === 1111 || walletTypeToChain(w.type) === "ton");
                } else if (chain === "btc" || chain === "bitcoin") {
                    wallet = wallets.find((w: any) => w.type === -6 || walletTypeToChain(w.type) === "btc");
                } else if (chain === "tron" || chain === "trx") {
                    wallet = wallets.find((w: any) => w.type === 333 || walletTypeToChain(w.type) === "tron");
                } else if (chain === "stellar" || chain === "xlm") {
                    wallet = wallets.find((w: any) => w.type === 1100 || walletTypeToChain(w.type) === "stellar");
                } else if (chain === "cosmos" || chain === "atom") {
                    wallet = wallets.find((w: any) => w.type === 4444118 || walletTypeToChain(w.type) === "cosmos");
                } else if (chain === "doge") {
                    wallet = wallets.find((w: any) => w.type === -8 || walletTypeToChain(w.type) === "doge");
                }
            }

            if (!wallet) {
                throw new Error(`No ${chain.toUpperCase()} wallet connected in HOT Kit. Please connect your ${chain.toUpperCase()} wallet.`);
            }

            const sendFn = wallet.sendTransaction || wallet.signAndSendTransaction;
            if (!sendFn) {
                throw new Error(`Connected ${chain.toUpperCase()} wallet does not support sending transactions directly.`);
            }

            const res = await sendFn.call(wallet, payload);
            const hash = typeof res === "string" ? res : (res?.hash || res?.transaction?.hash || "unknown");
            return { hash };
        },
        []
    );

    return (
        <WalletContext.Provider
            value={{
                ...state,
                network,
                setNetwork,
                isTestnet: network === "testnet",
                connectWallet,
                openTestnetModal: () => setIsTestnetModalOpen(true),
                disconnect,
                signAndSendTransaction,
                signAndSendEvmTransaction,
                signAndSendGenericTransaction,
            }}
        >
            {children}
            <TestnetWalletModal
                isOpen={isTestnetModalOpen}
                onClose={() => setIsTestnetModalOpen(false)}
                network={network}
                onConnectSuccess={handleDirectConnect}
                onLaunchHotKit={() => connectWallet(network === "testnet" ? 1010 : undefined)}
                onConnectSpecificWallet={(walletId: string) => connectWallet(1010, walletId)}
            />
        </WalletContext.Provider>
    );
}