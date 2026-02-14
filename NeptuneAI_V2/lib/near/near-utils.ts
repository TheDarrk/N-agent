/**
 * Client-side utilities for fetching NEAR balances via RPC.
 */

import { POPULAR_TOKENS } from "./constants";

const RPC_URL = "https://rpc.mainnet.near.org";

export { POPULAR_TOKENS };

export type TokenConfig = {
  id: string;
  symbol: string;
  decimals: number;
  icon?: string;
};

async function rpcQuery(params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "v0",
      method: "query",
      params,
    }),
  });
  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || JSON.stringify(data.error));
  }
  return data.result;
}

export async function getAccountBalance(accountId: string): Promise<string> {
  try {
    const result = (await rpcQuery({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    })) as { amount: string };
    return result.amount;
  } catch (e) {
    console.error("Error fetching NEAR balance", e);
    return "0";
  }
}

export async function getTokenBalance(
  accountId: string,
  contractId: string
): Promise<string> {
  try {
    const result = (await rpcQuery({
      request_type: "call_function",
      finality: "final",
      account_id: contractId,
      method_name: "ft_balance_of",
      args_base64: btoa(JSON.stringify({ account_id: accountId })),
    })) as { result: number[] };

    const resultStr = String.fromCharCode(...result.result);
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

  const integer = amount / divisor;
  const remainder = amount % divisor;
  const decimalStr = remainder.toString().padStart(decimals, "0").slice(0, 4);

  return `${integer}.${decimalStr}`;
}

/* ── Portfolio / Token Discovery ── */

export type TokenWithBalance = {
  contractId: string;
  symbol: string;
  decimals: number;
  balance: string; // Raw balance
  formatted: string; // Human readable
};

/**
 * Fetches all tokens for an account using FastNEAR API (primary)
 * or Kitwallet likelyTokens (fallback).
 */
export async function fetchAllTokens(accountId: string): Promise<TokenWithBalance[]> {
  const tokens: TokenWithBalance[] = [];

  // 1. Try FastNEAR (Fastest, single call)
  try {
    const res = await fetch(`https://api.fastnear.com/v1/account/${accountId}/ft`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.map((t: any) => ({
          contractId: t.contract_id,
          symbol: t.symbol,
          decimals: t.decimals,
          balance: t.balance,
          formatted: formatBalance(t.balance, t.decimals),
        }));
      }
    }
  } catch (e) {
    console.warn("FastNEAR API failed, trying fallback...", e);
  }

  // 2. Fallback: Kitwallet likelyTokens + RPC
  try {
    const res = await fetch(`https://api.kitwallet.app/account/${accountId}/likelyTokensFromBlock`);
    if (!res.ok) return [];

    const data = await res.json();
    const likelyTokens: string[] = data.list || [];

    const promises = likelyTokens.map(async (contractId) => {
      try {
        const balance = await getTokenBalance(accountId, contractId);
        if (balance === "0") return null;

        // Fetch Metadata
        const metadata = (await rpcQuery({
          request_type: "call_function",
          finality: "final",
          account_id: contractId,
          method_name: "ft_metadata",
          args_base64: "e30=", // {}
        })) as { result: number[] };

        // Handle potential metadata fetch failure
        if (!metadata || !metadata.result) return null;

        const metaJson = JSON.parse(String.fromCharCode(...metadata.result));

        return {
          contractId,
          symbol: metaJson.symbol,
          decimals: metaJson.decimals,
          balance,
          formatted: formatBalance(balance, metaJson.decimals),
        };
      } catch (e) {
        // Silent fail for individual token
        return null;
      }
    });

    const results = await Promise.all(promises);
    return results.filter((t): t is TokenWithBalance => t !== null);
  } catch (e) {
    console.warn("KitWallet fallback failed:", e);
    return [];
  }
}
