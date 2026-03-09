"use client";

/**
 * Flow Wallet Provider — FCL-based wallet connection for Flow blockchain.
 * Separate from HOT Kit wallet provider. Used when the user wants to
 * interact with Flow-native features (swaps via PunchSwap, NFT transfers).
 */

import React, {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    ReactNode,
} from "react";

// FCL will be dynamically imported to avoid SSR issues
let fcl: any = null;

// ── Types ────────────────────────────────────────────────────────
interface FlowWalletState {
    address: string | null;
    balance: number;
    isConnected: boolean;
    isConnecting: boolean;
}

interface FlowWalletContextType extends FlowWalletState {
    connectFlowWallet: () => Promise<void>;
    disconnectFlow: () => void;
    signAndSendCadenceTransaction: (
        cadenceScript: string,
        args: Array<{ type: string; value: string }>
    ) => Promise<{ hash: string }>;
    signAndSendFlowEvmTransaction: (
        payload: Record<string, unknown>
    ) => Promise<{ hash: string }>;
}

const FlowWalletContext = createContext<FlowWalletContextType>({
    address: null,
    balance: 0,
    isConnected: false,
    isConnecting: false,
    connectFlowWallet: async () => { },
    disconnectFlow: () => { },
    signAndSendCadenceTransaction: async () => ({ hash: "" }),
    signAndSendFlowEvmTransaction: async () => ({ hash: "" }),
});

export const useFlowWallet = () => useContext(FlowWalletContext);

// ── FCL Configuration ────────────────────────────────────────────
async function initFCL() {
    if (fcl) return fcl;

    try {
        const fclModule = await import("@onflow/fcl");
        fcl = fclModule;

        fcl.config({
            "accessNode.api": process.env.NEXT_PUBLIC_FLOW_ACCESS_NODE || "https://rest-mainnet.onflow.org",
            "discovery.wallet": "https://fcl-discovery.onflow.org/authn",
            "app.detail.title": "Neptune AI",
            "app.detail.icon": "https://neptuneai-agent.vercel.app/favicon.ico",
            "flow.network": process.env.NEXT_PUBLIC_FLOW_NETWORK || "mainnet",
        });

        console.log("[FlowWallet] FCL initialized for mainnet");
        return fcl;
    } catch (error) {
        console.error("[FlowWallet] Failed to initialize FCL:", error);
        throw error;
    }
}

// ── Provider Component ───────────────────────────────────────────
export function FlowWalletProvider({ children }: { children: ReactNode }) {
    const [state, setState] = useState<FlowWalletState>({
        address: null,
        balance: 0,
        isConnected: false,
        isConnecting: false,
    });

    // Initialize FCL and subscribe to auth state
    useEffect(() => {
        let unsubscribe: (() => void) | null = null;

        const setup = async () => {
            try {
                const fclInstance = await initFCL();

                // Subscribe to current user
                unsubscribe = fclInstance.currentUser.subscribe((user: any) => {
                    console.log("[FlowWallet] User state changed:", user);
                    if (user.loggedIn && user.addr) {
                        setState((prev) => ({
                            ...prev,
                            address: user.addr,
                            isConnected: true,
                            isConnecting: false,
                        }));
                        // Fetch balance
                        fetchBalance(user.addr);
                    } else {
                        setState({
                            address: null,
                            balance: 0,
                            isConnected: false,
                            isConnecting: false,
                        });
                    }
                });
            } catch (error) {
                console.error("[FlowWallet] Setup error:", error);
            }
        };

        setup();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    // Fetch FLOW balance for an address
    const fetchBalance = async (address: string) => {
        try {
            const fclInstance = await initFCL();
            const account = await fclInstance.account(address);
            const balance = parseFloat(account.balance) / 1e8; // FLOW has 8 decimals in raw
            setState((prev) => ({ ...prev, balance }));
            console.log(`[FlowWallet] Balance for ${address}: ${balance} FLOW`);
        } catch (error) {
            console.error("[FlowWallet] Error fetching balance:", error);
        }
    };

    // Connect Flow Wallet (opens FCL discovery UI)
    const connectFlowWallet = useCallback(async () => {
        try {
            setState((prev) => ({ ...prev, isConnecting: true }));
            const fclInstance = await initFCL();
            await fclInstance.authenticate();
            // State update happens via currentUser subscription
        } catch (error) {
            console.error("[FlowWallet] Connection error:", error);
            setState((prev) => ({ ...prev, isConnecting: false }));
            throw error;
        }
    }, []);

    // Disconnect
    const disconnectFlow = useCallback(() => {
        if (fcl) {
            fcl.unauthenticate();
        }
        setState({
            address: null,
            balance: 0,
            isConnected: false,
            isConnecting: false,
        });
        console.log("[FlowWallet] Disconnected");
    }, []);

    // Sign and send a Cadence transaction (for NFT transfers)
    const signAndSendCadenceTransaction = useCallback(
        async (
            cadenceScript: string,
            args: Array<{ type: string; value: string }>
        ): Promise<{ hash: string }> => {
            if (!state.address) throw new Error("Flow wallet not connected");

            const fclInstance = await initFCL();
            const fclTypes = await import("@onflow/types");

            // Map arg types to FCL types
            const typeMap: Record<string, any> = {
                Address: fclTypes.Address,
                UInt64: fclTypes.UInt64,
                UInt32: fclTypes.UInt32,
                String: fclTypes.String,
                UFix64: fclTypes.UFix64,
            };

            console.log("[FlowWallet] Sending Cadence transaction");

            const transactionId = await fclInstance.mutate({
                cadence: cadenceScript,
                args: (arg: any, t: any) =>
                    args.map((a) => arg(a.value, typeMap[a.type] || fclTypes.String)),
                proposer: fclInstance.authz,
                payer: fclInstance.authz,
                authorizations: [fclInstance.authz],
                limit: 9999,
            });

            console.log("[FlowWallet] Transaction ID:", transactionId);

            // Wait for seal
            const result = await fclInstance.tx(transactionId).onceSealed();
            console.log("[FlowWallet] Transaction sealed:", result);

            return { hash: transactionId };
        },
        [state.address]
    );

    // Sign and send a Flow EVM transaction (for PunchSwap swaps)
    const signAndSendFlowEvmTransaction = useCallback(
        async (payload: Record<string, unknown>): Promise<{ hash: string }> => {
            if (!state.address) throw new Error("Flow wallet not connected");

            // Flow EVM transactions go through the EVM gateway
            // For now, this would require MetaMask or similar EVM wallet connected to Flow EVM
            // FCL doesn't natively handle EVM txs — the user needs to add Flow EVM as a custom network
            console.log("[FlowWallet] Flow EVM transaction payload:", payload);

            // TODO: Implement EVM tx signing via MetaMask connected to Flow EVM (chainId 747)
            // For now, throw a helpful error
            throw new Error(
                "Flow EVM swap signing requires MetaMask connected to Flow EVM network (chainId 747). " +
                "Please add Flow EVM as a custom network in MetaMask."
            );
        },
        [state.address]
    );

    return (
        <FlowWalletContext.Provider
            value={{
                ...state,
                connectFlowWallet,
                disconnectFlow,
                signAndSendCadenceTransaction,
                signAndSendFlowEvmTransaction,
            }}
        >
            {children}
        </FlowWalletContext.Provider>
    );
}

export default FlowWalletProvider;
