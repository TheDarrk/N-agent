import { providers } from "near-api-js";

const RPC_URL = "https://rpc.mainnet.near.org";
const provider = new providers.JsonRpcProvider({ url: RPC_URL });

export type TokenConfig = {
    id: string; // Contract ID or 'NEAR'
    symbol: string;
    decimals: number;
    icon?: string;
};

export const POPULAR_TOKENS: TokenConfig[] = [
    { id: "NEAR", symbol: "NEAR", decimals: 24, icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png" },
    { id: "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", symbol: "USDC", decimals: 6, icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/3408.png" },
    { id: "usdt.tether-token.near", symbol: "USDT", decimals: 6, icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/825.png" },
    { id: "token.v2.ref-finance.near", symbol: "REF", decimals: 18, icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/9943.png" },
    { id: "wrap.near", symbol: "wNEAR", decimals: 24, icon: "https://s2.coinmarketcap.com/static/img/coins/64x64/6535.png" }
];

export async function getAccountBalance(accountId: string): Promise<string> {
    try {
        const account = await provider.query<any>({
            request_type: "view_account",
            finality: "final",
            account_id: accountId,
        });
        return account.amount; // In yoctoNEAR
    } catch (e) {
        console.error("Error fetching NEAR balance", e);
        return "0";
    }
}

export async function getTokenBalance(accountId: string, contractId: string): Promise<string> {
    try {
        const res = await provider.query<any>({
            request_type: "call_function",
            finality: "final",
            account_id: contractId,
            method_name: "ft_balance_of",
            args_base64: btoa(JSON.stringify({ account_id: accountId })),
        });

        // Result is an array of ASCII char codes
        const resultStr = String.fromCharCode(...(res.result as number[]));
        return JSON.parse(resultStr);
    } catch (e) {
        console.error(`Error fetching token balance for ${contractId}`, e);
        return "0";
    }
}

export function formatBalance(balance: string, decimals: number): string {
    if (!balance || balance === "0") return "0.00";
    const amount = BigInt(balance);
    const divisor = BigInt(10 ** decimals);

    // Simple formatting (integer part + 4 decimals)
    const integer = amount / divisor;
    const remainder = amount % divisor;
    const decimalStr = remainder.toString().padStart(decimals, "0").slice(0, 4);

    return `${integer}.${decimalStr}`;
}
