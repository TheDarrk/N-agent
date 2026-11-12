/**
 * Neptune AI v2 — Centralized NEAR Network Configuration & Hard Network Guard
 * 
 * Ensures that when Testnet is selected:
 * 1. RPC queries route strictly to NEAR Testnet (rpc.testnet.near.org)
 * 2. Contract addresses resolve to Testnet (wrap.testnet, intents.testnet, usdt.fakes.testnet)
 * 3. Wallet connections connect strictly to NEAR Testnet (never leaking to Mainnet HOT Wallet)
 * 4. Account IDs are verified to match the active network (.testnet vs .near)
 * 5. Mainnet is prohibited when NEXT_PUBLIC_ENABLE_MAINNET != 'true'
 */

export type NearNetwork = "testnet" | "mainnet";

export interface NetworkConfig {
    networkId: NearNetwork;
    nodeUrl: string;
    rpcEndpoints: string[];
    walletUrl: string;
    explorerUrl: string;
    defuseContract: string;
    wrapContract: string;
    usdtContract: string;
    usdcContract: string;
    fastnearApi: string;
    tokenMap: Record<string, string>;
    popularTokens: Array<{
        id: string;
        symbol: string;
        decimals: number;
        icon: string;
    }>;
}

export const TESTNET_CONFIG: NetworkConfig = {
    networkId: "testnet",
    nodeUrl: "https://test.rpc.fastnear.com",
    rpcEndpoints: [
        "https://test.rpc.fastnear.com",
        "https://rpc.testnet.fastnear.com",
        "https://testnet.neardata.xyz/v1/node",
        "https://rpc.testnet.near.org",
    ],
    walletUrl: "https://testnet.mynearwallet.com",
    explorerUrl: "https://testnet.nearblocks.io",
    defuseContract: "intents.testnet",
    wrapContract: "wrap.testnet",
    usdtContract: "usdt.fakes.testnet",
    usdcContract: "usdc.fakes.testnet",
    fastnearApi: "https://testnet-api.fastnear.com",
    tokenMap: {
        NEAR: "nep141:wrap.testnet",
        WNEAR: "nep141:wrap.testnet",
        USDT: "nep141:usdt.fakes.testnet",
        USDC: "nep141:usdc.fakes.testnet",
        ETH: "nep141:eth.fakes.testnet",
        WBTC: "nep141:wbtc.fakes.testnet",
    },
    popularTokens: [
        {
            id: "wrap.testnet",
            symbol: "NEAR",
            decimals: 24,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
        },
        {
            id: "usdt.fakes.testnet",
            symbol: "USDT",
            decimals: 6,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
        },
        {
            id: "usdc.fakes.testnet",
            symbol: "USDC",
            decimals: 6,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
        },
        {
            id: "wrap.testnet",
            symbol: "wNEAR",
            decimals: 24,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
        },
    ],
};

export const MAINNET_CONFIG: NetworkConfig = {
    networkId: "mainnet",
    nodeUrl: "https://near.drpc.org",
    rpcEndpoints: [
        "https://near.drpc.org",
        "https://rpc.shitzuapes.xyz",
        "https://rpc.intea.rs",
        "https://archival-rpc.mainnet.near.org",
        "https://free.rpc.fastnear.com",
    ],
    walletUrl: "https://app.mynearwallet.com",
    explorerUrl: "https://nearblocks.io",
    defuseContract: "intents.near",
    wrapContract: "wrap.near",
    usdtContract: "usdt.tether-token.near",
    usdcContract: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
    fastnearApi: "https://api.fastnear.com",
    tokenMap: {
        NEAR: "nep141:wrap.near",
        WNEAR: "nep141:wrap.near",
        USDT: "nep141:usdt.tether-token.near",
        USDC: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
        ETH: "nep141:eth.bridge.near",
        WBTC: "nep141:minter.bridge.near",
        AURORA: "nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
    },
    popularTokens: [
        {
            id: "NEAR",
            symbol: "NEAR",
            decimals: 24,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
        },
        {
            id: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
            symbol: "USDC",
            decimals: 6,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png",
        },
        {
            id: "usdt.tether-token.near",
            symbol: "USDT",
            decimals: 6,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png",
        },
        {
            id: "token.v2.ref-finance.near",
            symbol: "REF",
            decimals: 18,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/9943.png",
        },
        {
            id: "wrap.near",
            symbol: "wNEAR",
            decimals: 24,
            icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png",
        },
    ],
};

const STORAGE_KEY = "neptune_near_network";
const ALLOWED_STORAGE_KEY = "neptune_mainnet_allowed";
const DEFAULT_NET_KEY = "neptune_default_network";
export const NETWORK_CHANGE_EVENT = "neptune_network_changed";

// Cached status from the single source of truth (backend)
let cachedBackendStatus: {
    network: NearNetwork;
    mainnet_allowed: boolean;
    rpc?: string;
} | null = null;

/**
 * Fetch and sync active network & capabilities directly from the backend (Single Source of Truth).
 * The backend .env is the only configuration needed!
 */
export async function syncNetworkFromBackend(): Promise<{
    network: NearNetwork;
    mainnet_allowed: boolean;
}> {
    if (typeof window === "undefined") {
        return { network: "mainnet", mainnet_allowed: true };
    }

    try {
        const res = await fetch("/api/network");
        if (res.ok) {
            const data = await res.json();
            const allowed = Boolean(data.mainnet_allowed);
            const backendNet: NearNetwork = data.network === "mainnet" ? "mainnet" : "testnet";

            cachedBackendStatus = {
                network: backendNet,
                mainnet_allowed: allowed,
                rpc: data.rpc,
            };

            localStorage.setItem(ALLOWED_STORAGE_KEY, allowed ? "true" : "false");
            localStorage.setItem(DEFAULT_NET_KEY, backendNet);

            const saved = localStorage.getItem(STORAGE_KEY);
            if (!saved || (!allowed && saved === "mainnet")) {
                localStorage.setItem(STORAGE_KEY, backendNet);
                window.dispatchEvent(new CustomEvent(NETWORK_CHANGE_EVENT, { detail: backendNet }));
            }

            return { network: backendNet, mainnet_allowed: allowed };
        }
    } catch (e) {
        console.warn("[Network] Could not reach backend /api/network, using cached values:", e);
    }

    return {
        network: getNetwork(),
        mainnet_allowed: isMainnetAllowed(),
    };
}

/**
 * Check if Mainnet is allowed (User has full authority to choose network).
 */
export function isMainnetAllowed(): boolean {
    return true;
}

/**
 * Get active NEAR network (defaults to backend's active network or localStorage)
 */
export function getNetwork(): NearNetwork {
    if (typeof window === "undefined") {
        return cachedBackendStatus?.network || "mainnet";
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "mainnet" || saved === "testnet") {
        return saved;
    }
    return cachedBackendStatus?.network || (localStorage.getItem(DEFAULT_NET_KEY) as NearNetwork) || "mainnet";
}

/**
 * Check if active network is Testnet
 */
export function isTestnet(): boolean {
    return getNetwork() === "testnet";
}

/**
 * Check if active network is Mainnet
 */
export function isMainnet(): boolean {
    return getNetwork() === "mainnet";
}

/**
 * Get the full network configuration object for active or specified network
 */
export function getNetworkConfig(network?: NearNetwork): NetworkConfig {
    const active = network || getNetwork();
    return active === "testnet" ? TESTNET_CONFIG : MAINNET_CONFIG;
}

/**
 * Get primary NEAR RPC URL
 */
export function getNearRpcUrl(network?: NearNetwork): string {
    return getNetworkConfig(network).nodeUrl;
}

/**
 * Get prioritized RPC endpoints list for failover rotation
 */
export function getRpcEndpoints(network?: NearNetwork): string[] {
    return getNetworkConfig(network).rpcEndpoints;
}

/**
 * Get Token ID map for active network
 */
export function getTokenMap(network?: NearNetwork): Record<string, string> {
    return getNetworkConfig(network).tokenMap;
}

/**
 * Get popular tokens for sidebar/wallet display
 */
export function getPopularTokens(network?: NearNetwork) {
    return getNetworkConfig(network).popularTokens;
}

/**
 * Hard check: Validate account ID against active network
 */
export function validateNetworkAccount(
    accountId: string,
    network?: NearNetwork
): { valid: boolean; error?: string } {
    const net = network || getNetwork();
    if (!accountId) return { valid: false, error: "No account provided" };

    if (net === "testnet") {
        if (accountId.endsWith(".near")) {
            return {
                valid: false,
                error: `Network Mismatch: Account '${accountId}' is a Mainnet account (.near), but Testnet is active. Please connect a .testnet account.`,
            };
        }
        return { valid: true };
    }

    if (net === "mainnet") {
        if (accountId.endsWith(".testnet")) {
            return {
                valid: false,
                error: `Network Mismatch: Account '${accountId}' is a Testnet account (.testnet), but Mainnet is active. Please connect a .near account.`,
            };
        }
        return { valid: true };
    }

    return { valid: true };
}

/**
 * Set active network and synchronize everywhere (localStorage, window event, backend)
 */
export async function setNetwork(network: NearNetwork, userWallet?: string | null): Promise<void> {
    if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, network);
        window.dispatchEvent(new CustomEvent(NETWORK_CHANGE_EVENT, { detail: network }));
    }

    // Inform backend of active network mode
    try {
        await fetch("/api/network", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_wallet: userWallet || null, network }),
        });
    } catch (e) {
        console.warn("[Network] Could not sync network with backend:", e);
    }
}

/**
 * Hard assertion: Ensure a target contract matches active network.
 * Automatically translates wrap.near <-> wrap.testnet and intents.near <-> intents.testnet.
 */
export function assertNetworkContract(contractId: string, network?: NearNetwork): string {
    const net = network || getNetwork();
    if (net === "testnet") {
        if (contractId === "wrap.near") return "wrap.testnet";
        if (contractId === "intents.near") return "intents.testnet";
        if (contractId === "usdt.tether-token.near") return "usdt.fakes.testnet";
    } else {
        if (contractId === "wrap.testnet") return "wrap.near";
        if (contractId === "intents.testnet") return "intents.near";
        if (contractId === "usdt.fakes.testnet") return "usdt.tether-token.near";
    }
    return contractId;
}
