"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { fetchAllTokens, rpcQuery } from "@/lib/near/near-utils";

// ─── Types ───────────────────────────────────────────────
type WalletState = {
    accountId: string | null;
    walletAddresses: Record<string, string>;
    connectedChains: string[];
    balances: Record<string, string>;
    isConnecting: boolean;
};

type WalletContextValue = WalletState & {
    connectWallet: () => void;
    disconnect: () => Promise<void>;
    signAndSendTransaction: (payload: Record<string, unknown>) => Promise<{ hash: string }>;
    signAndSendEvmTransaction: (payload: Record<string, unknown>) => Promise<{ hash: string }>;
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
    if (t === 56) return "bnb";        // BNB Chain
    if (t === 97) return "bnb";        // BNB Testnet
    if (t === 137) return "pol";       // Polygon
    if (t === 42161) return "arb";     // Arbitrum
    if (t === 1313161554) return "aurora"; // Aurora
    if (t === 43114) return "avax";    // Avalanche
    if (t === 59144) return "linea";   // Linea
    if (t === 196) return "xlayer";    // Xlayer
    if (t === 8453) return "base";     // Base
    if (t === 204) return "opbnb";     // opBNB
    if (t === 10) return "op";         // Optimism
    if (t === 534352) return "scroll"; // Scroll
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

// ─── Provider ────────────────────────────────────────────
export default function WalletProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = useState<WalletState>({
        accountId: null,
        walletAddresses: {},
        connectedChains: [],
        balances: {},
        isConnecting: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hotKitRef = useRef<any>(null);
    const unsubscribersRef = useRef<(() => void)[]>([]);

    // ── Extract addresses from HOT Kit wallets array ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const syncWallets = useCallback((kit: any) => {
        try {
            // kit.wallets is OmniWallet[] (an array)
            const walletList = kit.wallets;
            if (!walletList || !Array.isArray(walletList) || walletList.length === 0) return;

            const addresses: Record<string, string> = {};
            for (const wallet of walletList) {
                const chain = walletTypeToChain(wallet.type);
                const addr = wallet.address || wallet.omniAddress || wallet.publicKey;
                if (addr) addresses[chain] = addr;
            }

            if (Object.keys(addresses).length === 0) return;

            const chains = Object.keys(addresses);
            const primaryId = addresses.near || addresses.eth || Object.values(addresses)[0] || "Unknown";

            setState((prev) => ({
                ...prev,
                accountId: primaryId,
                walletAddresses: addresses,
                connectedChains: chains,
                isConnecting: false,
            }));

            // Fetch balances after syncing wallets
            fetchBalancesFromKit(kit, addresses);
        } catch (e) {
            console.warn("Could not sync HOT Kit wallets:", e);
        }
    }, []);

    // ── Fetch balances using HOT Kit + RPC fallback ──
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchBalancesFromKit = useCallback(async (kit: any, addresses: Record<string, string>) => {
        const newBalances: Record<string, string> = {};

        // Try NEAR balance via RPC (most reliable)
        if (addresses.near) {
            try {
                const result = await rpcQuery({
                    request_type: "view_account",
                    finality: "final",
                    account_id: addresses.near,
                }) as { amount: string };

                if (result?.amount) {
                    const yocto = result.amount;
                    // Keep native NEAR key lowercase 'near' for existing ChatSidebar styling
                    const balance = Number(BigInt(yocto) / BigInt(10 ** 20)) / 10000; // Divide by 10^24
                    const fmt = balance.toFixed(5).replace(/\.?0+$/, "");
                    // newBalances.near = fmt; // Removed to avoid duplicate display
                    newBalances["[NEAR] NEAR"] = fmt;
                }

                // Fetch FTs via helper (FastNEAR/Kitwallet)
                const tokens = await fetchAllTokens(addresses.near);
                tokens.forEach((t) => {
                    // Use symbol as key (e.g. USDC, REF)
                    const key = `[NEAR] ${t.symbol.toUpperCase()}`;
                    newBalances[key] = t.formatted;
                });
            } catch (e) {
                console.warn("NEAR balance fetch failed:", e);
            }
        }

        // 2. Fetch Multi-Chain balances from HotKit (tokens.walletsTokens)
        try {
            if (kit.walletsTokens) {
                const kitTokens = kit.walletsTokens; // Getter that computes balances
                console.log("[Balance Debug] FULL HotKit Token List:", kitTokens);
                kitTokens.forEach((t: any) => {
                    if (t.token && t.balance) {
                        const symbol = t.token.symbol;
                        // Log raw balance for debugging user issues
                        // console.log(`[Balance Debug] ${symbol}: raw=${t.balance}, decimals=${t.token.decimals}`);

                        // Use manual formatting to avoid scientific notation for small balances
                        const formatted = formatBalanceManual(t.balance, t.token.decimals);


                        // Resolve chain label using our mapper (handles numeric IDs like 8453 -> "base")
                        let chainLabel: string;
                        let displaySymbol = symbol.toUpperCase();

                        // Special handling for Wrapped NEAR on Omni/Hot chain (-4)
                        if (t.token.chain_id === -4 && (t.token.address === 'nep141:wrap.near' || t.token.omniAddress === 'nep141:wrap.near')) {
                            chainLabel = "NEAR";
                            displaySymbol = "wNEAR";
                        } else if (t.token.chain_id) {
                            chainLabel = walletTypeToChain(t.token.chain_id).toUpperCase();
                        } else {
                            // Fallback to existing logic if chain_id is missing, but use our mapper if possible
                            chainLabel = walletTypeToChain(t.token.chain || "unknown").toUpperCase();
                        }

                        // Edge case fix for BSC/BNB consistency
                        if (chainLabel === "BSC") chainLabel = "BNB";

                        // Avoid overwriting NEAR if we have a robust native fetch, OR overwrite if kit is trusted.
                        const key = `[${chainLabel}] ${displaySymbol}`;
                        newBalances[key] = formatted;
                    }
                });
            }
        } catch (e) {
            console.warn("HotKit balance sync failed:", e);
        }

        if (Object.keys(newBalances).length > 0) {
            setState((s) => ({
                ...s,
                balances: { ...s.balances, ...newBalances },
            }));
        }
    }, []);

    function formatBalanceManual(balance: string | bigint | number, decimals: number): string {
        const val = BigInt(balance);
        if (val === 0n) return "0";

        const div = BigInt(10 ** decimals);
        const int = val / div;
        const rem = val % div;

        // Use up to 8 decimal places for accuracy with small balances
        let remStr = rem.toString().padStart(decimals, '0').slice(0, 8);
        return `${int}.${remStr}`.replace(/\.?0+$/, "");
    }

    // ── Auto-refresh balances (Polling) ──────────────────
    useEffect(() => {
        if (!state.accountId || Object.keys(state.walletAddresses).length === 0) return;

        const kit = hotKitRef.current;
        if (!kit) return;

        // Initial fetch
        // fetchBalancesFromKit(kit, state.walletAddresses);

        const interval = setInterval(() => {
            fetchBalancesFromKit(kit, state.walletAddresses);
        }, 3000);

        return () => clearInterval(interval);
    }, [state.accountId, state.walletAddresses, fetchBalancesFromKit]);

    // ── Connect via HOT Kit ──────────────────────────────
    const connectWallet = useCallback(() => {
        (async () => {
            setState((s) => ({ ...s, isConnecting: true }));
            try {
                // Dynamic import
                let HotKitClass: any;
                let defaultConnectors: any;
                try {
                    const kitModule = await import("@hot-labs/kit");
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    HotKitClass = kitModule.HotConnector || kitModule.HotKit || (kitModule as any).default;
                    const defaultsModule = await import("@hot-labs/kit/defaults");
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    defaultConnectors = defaultsModule.defaultConnectors || (defaultsModule as any).default;
                } catch (importErr) {
                    console.warn("HOT Kit not available:", importErr);
                    setState((s) => ({ ...s, isConnecting: false }));
                    return;
                }

                if (!hotKitRef.current) {
                    // Filter out any undefined connectors and log them
                    const safeConnectors = (Array.isArray(defaultConnectors) ? defaultConnectors : [])
                        .filter((c: any) => !!c);

                    console.log("[Wallet] Initializing HOT Kit with connectors:", safeConnectors);

                    const kit = new HotKitClass({
                        connectors: safeConnectors,
                        apiKey: process.env.NEXT_PUBLIC_HOT_API_KEY || "neptune-ai-dev",
                        walletConnect: {
                            projectId: process.env.NEXT_PUBLIC_HOT_API_KEY || "neptune-ai-dev", // Ideally needs a Reown (WalletConnect) Project ID
                            metadata: {
                                name: "Neptune AI",
                                description: "Multi-chain AI Agent",
                                url: typeof window !== "undefined" ? window.location.origin : "",
                                icons: ["https://avatars.githubusercontent.com/u/100000000?s=200&v=4"], // Generic icon for now
                            }
                        }
                    });
                    hotKitRef.current = kit;

                    // Listen for connect/disconnect events
                    const unsubConnect = kit.onConnect?.((payload: any) => {
                        console.log("[HOT Kit] Wallet connected:", payload?.wallet?.address);
                        syncWallets(kit);
                    });

                    const unsubDisconnect = kit.onDisconnect?.((payload: any) => {
                        console.log("[HOT Kit] Wallet disconnected:", payload?.wallet?.address);
                        syncWallets(kit);
                    });

                    if (unsubConnect) unsubscribersRef.current.push(unsubConnect);
                    if (unsubDisconnect) unsubscribersRef.current.push(unsubDisconnect);

                    // Check if already connected (e.g., restored session)
                    syncWallets(kit);
                }

                // Trigger HOT Kit auth UI
                const kit = hotKitRef.current;

                // Explicitly call connect() to open the wallet picker/connector
                if (kit.connect) {
                    await kit.connect();
                } else if (kit.openProfile) {
                    // Fallback for older versions if connect() is missing
                    kit.openProfile();
                }

                // Sync wallets after connect returns
                syncWallets(kit);
            } catch (err) {
                console.error("HOT Kit connection failed:", err);
                setState((s) => ({ ...s, isConnecting: false }));
            }
        })();
    }, [syncWallets]);

    // ── Disconnect ────────────────────────────────────────
    const disconnect = useCallback(async () => {
        try {
            const kit = hotKitRef.current;
            if (kit) {
                // Disconnect all wallets
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

        // Cleanup event listeners
        for (const unsub of unsubscribersRef.current) {
            try { unsub(); } catch { }
        }
        unsubscribersRef.current = [];

        setState({
            accountId: null,
            walletAddresses: {},
            connectedChains: [],
            balances: {},
            isConnecting: false,
        });
    }, []);

    // ── Sign Transaction (via HOT Kit NearWallet) ────────
    // ── Sign Transaction (via HOT Kit NearWallet) ────────
    const signAndSendTransaction = useCallback(
        async (payload: Record<string, unknown> | Record<string, unknown>[]): Promise<{ hash: string }> => {
            console.log("[Wallet] signAndSendTransaction payload:", payload);

            if (!state.accountId) throw new Error("No wallet connected");

            const kit = hotKitRef.current;
            if (!kit) throw new Error("HOT Kit not initialized");

            // Dynamic lookup: Find the wallet instance matching the active accountId
            const nearWallet = Array.isArray(kit.wallets)
                ? kit.wallets.find((w: any) => (w.address || w.omniAddress || w.publicKey) === state.accountId)
                : null;

            if (!nearWallet) {
                console.error("Wallet not found for account:", state.accountId);
                throw new Error("Active wallet instance not found. Please reconnect.");
            }

            // Helper to process a single transaction object
            const processTransaction = (tx: any) => {
                const rawActions = Array.isArray(tx.actions) ? tx.actions : [];
                const actions = rawActions.map((action: any) => {
                    if (action.type === 'FunctionCall' && action.params) {
                        const { args, ...rest } = action.params;
                        let encodedArgs = args;

                        // If args is an object, serialize to Base64 JSON
                        if (typeof args === 'object' && args !== null) {
                            try {
                                const jsonString = JSON.stringify(args);
                                if (typeof window !== 'undefined' && window.btoa) {
                                    encodedArgs = window.btoa(jsonString);
                                } else {
                                    encodedArgs = Buffer.from(jsonString).toString('base64');
                                }
                            } catch (e) {
                                console.warn("Failed to serialize args:", e);
                            }
                        }

                        return {
                            type: 'FunctionCall',
                            params: {
                                ...rest,
                                args: encodedArgs,
                            }
                        };
                    }
                    return action;
                });

                return {
                    receiverId: (tx.receiverId || tx.receiver_id) as string || "v1.comet.near", // Fallback only if missing
                    actions: actions,
                };
            };

            let hash: string = "unknown";

            try {
                if (Array.isArray(payload)) {
                    // Handle Batch Transactions
                    const txs = payload.map(processTransaction);
                    console.log("[Wallet] Sending batch transactions:", txs);

                    if (nearWallet.sendTransactions) {
                        console.log(`[Wallet] Requesting batch signature for ${txs.length} transactions...`);
                        const hashes = await nearWallet.sendTransactions({ transactions: txs });

                        console.log("[Wallet] Batch execution result hashes:", hashes);

                        // Check if we got back as many hashes as transactions
                        if (Array.isArray(hashes) && hashes.length !== txs.length) {
                            console.warn(`[Wallet] WARNING: Requested ${txs.length} txs but got ${hashes.length} hashes. Partial execution.`);
                            throw new Error(`Batch transaction incomplete: ${hashes.length}/${txs.length} executed. Please check your wallet history.`);
                        }

                        hash = Array.isArray(hashes) ? hashes[hashes.length - 1] : "batch-success";
                    } else if (nearWallet.sendTransaction) {
                        // Fallback: Send one by one (less ideal, user signs multiple times)
                        console.warn("Wallet doesn't support batch transactions, sending sequentially");
                        const executedHashes = [];
                        for (const tx of txs) {
                            console.log(`[Wallet] Sending sequential tx to ${tx.receiverId}...`);
                            const result = await nearWallet.sendTransaction(tx);
                            executedHashes.push(result);
                        }
                        hash = executedHashes[executedHashes.length - 1];
                    } else {
                        throw new Error("Wallet signing method not available");
                    }
                } else {
                    // Handle Single Transaction
                    const txParams = processTransaction(payload);
                    console.log("[Wallet] Sending single transaction:", txParams);

                    if (nearWallet.sendTransaction) {
                        hash = await nearWallet.sendTransaction(txParams);
                    } else if (nearWallet.sendTransactions) {
                        const hashes = await nearWallet.sendTransactions({ transactions: [txParams] });
                        hash = hashes[0] || "unknown";
                    } else {
                        throw new Error("Wallet signing method not available");
                    }
                }
            } catch (e) {
                console.error("[Wallet] Transaction failed:", e);
                throw e; // Re-throw to show error in UI
            }

            return { hash: hash || "unknown" };
        },
        [state.accountId]
    );

    // ── Sign EVM Transaction (via HOT Kit EVM Wallet) ────────
    const signAndSendEvmTransaction = useCallback(
        async (payload: Record<string, unknown>): Promise<{ hash: string }> => {
            console.log("[Wallet] signAndSendEvmTransaction payload:", payload);

            const kit = hotKitRef.current;
            if (!kit) throw new Error("HOT Kit not initialized");

            // Find the EVM wallet from kit.wallets (WalletType.EVM = 1)
            const evmWallet = Array.isArray(kit.wallets)
                ? kit.wallets.find((w: any) => w.type === 1 || w.type === 'evm')
                : null;

            if (!evmWallet) {
                throw new Error("No EVM wallet connected. Please connect an Ethereum wallet.");
            }

            console.log("[Wallet] Found EVM wallet:", evmWallet.address);

            try {
                // Construct the transaction request for HOT Kit EVM wallet
                const txRequest: Record<string, unknown> = {
                    chainId: payload.chainId,
                    from: payload.from || evmWallet.address,
                    to: payload.to,
                    value: payload.value ? BigInt(payload.value as string) : BigInt(0),
                };

                console.log("[Wallet] Sending EVM transaction:", txRequest);

                // EvmWallet.sendTransaction handles chain switching automatically
                const hash = await evmWallet.sendTransaction(txRequest);

                console.log("[Wallet] EVM transaction sent, hash:", hash);
                return { hash: hash || "unknown" };
            } catch (e) {
                console.error("[Wallet] EVM Transaction failed:", e);
                throw e;
            }
        },
        []
    );

    // ── Cleanup on unmount ───────────────────────────────
    useEffect(() => {
        return () => {
            for (const unsub of unsubscribersRef.current) {
                try { unsub(); } catch { }
            }
        };
    }, []);

    return (
        <WalletContext.Provider
            value={{
                ...state,
                connectWallet,
                disconnect,
                signAndSendTransaction,
                signAndSendEvmTransaction,
            }}
        >
            {children}
        </WalletContext.Provider>
    );
}
