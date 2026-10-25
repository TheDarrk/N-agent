/**
 * Client-side utilities for fetching NEAR balances via RPC.
 */

import { POPULAR_TOKENS } from "./constants";
import { getRpcEndpoints, getNetworkConfig, isTestnet } from "./network";

export { POPULAR_TOKENS };

export type TokenConfig = {
  id: string;
  symbol: string;
  decimals: number;
  icon?: string;
};

// Simple sleep helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function rpcQuery(params: Record<string, unknown>): Promise<any> {
  let lastError: any = null;
  const endpoints = getRpcEndpoints();

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "v0",
          method: "query",
          params,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          lastError = new Error(`429 Too Many Requests on ${url}`);
          continue;
        }
        lastError = new Error(`HTTP error ${response.status} on ${url}`);
        continue;
      }

      const data = await response.json();
      if (data.error) {
        const causeName = data.error?.cause?.name || "";
        const errDataStr = typeof data.error?.data === "string" ? data.error.data : JSON.stringify(data.error);

        // Deterministic chain state (account/contract does not exist) - NOT an RPC network outage
        if (
          causeName === "UNKNOWN_ACCOUNT" ||
          causeName === "CodeDoesNotExist" ||
          errDataStr.includes("does not exist") ||
          errDataStr.includes("CodeDoesNotExist") ||
          errDataStr.includes("MethodNotFound")
        ) {
          const notFoundErr = new Error(`Resource not found: ${errDataStr}`);
          (notFoundErr as any).isNotFound = true;
          throw notFoundErr;
        }

        lastError = new Error(data.error.message || JSON.stringify(data.error));
        continue;
      }

      return data.result;
    } catch (e: any) {
      if (e?.isNotFound) {
        throw e;
      }
      lastError = e;
    }
  }

  if (lastError?.isNotFound) {
    throw lastError;
  }

  console.warn("[RPC] Query degraded across active endpoints:", endpoints, lastError?.message || lastError);
  throw lastError || new Error("All RPC endpoints failed");
}

export async function getAccountBalance(accountId: string): Promise<string> {
  if (!accountId) return "0";
  try {
    const result = (await rpcQuery({
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    })) as { amount: string };
    return result?.amount || "0";
  } catch (e: any) {
    if (e?.isNotFound) {
      return "0";
    }
    console.warn("[RPC] Could not fetch NEAR balance for", accountId, e?.message || e);
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
    // Return "0" if account doesn't have token or contract missing
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
 * or Kitwallet / Testnet tokens fallback.
 */
export async function fetchAllTokens(accountId: string): Promise<TokenWithBalance[]> {
  const config = getNetworkConfig();

  // 1. Try FastNEAR for the active network
  try {
    const res = await fetch(`${config.fastnearApi}/v1/account/${accountId}/ft`);
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
    console.warn("[FastNEAR] API failed, using fallback...", e);
  }

  // 2. Testnet specific known tokens check (wrap.testnet, usdt.fakes.testnet, usdc.fakes.testnet)
  if (isTestnet()) {
    const testnetTokens = [
      { contractId: "wrap.testnet", symbol: "wNEAR", decimals: 24 },
      { contractId: "usdt.fakes.testnet", symbol: "USDT", decimals: 6 },
      { contractId: "usdc.fakes.testnet", symbol: "USDC", decimals: 6 },
    ];

    const results = await Promise.all(
      testnetTokens.map(async (t) => {
        try {
          const raw = await getTokenBalance(accountId, t.contractId);
          if (raw && raw !== "0") {
            return {
              contractId: t.contractId,
              symbol: t.symbol,
              decimals: t.decimals,
              balance: raw,
              formatted: formatBalance(raw, t.decimals),
            };
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    return results.filter((t): t is TokenWithBalance => t !== null);
  }

  // 3. Fallback for mainnet: Kitwallet likelyTokens + RPC
  try {
    const res = await fetch(`https://api.kitwallet.app/account/${accountId}/likelyTokensFromBlock`);
    if (!res.ok) return [];

    const data = await res.json();
    const likelyTokens: string[] = data.list || [];

    const promises = likelyTokens.map(async (contractId) => {
      try {
        const balance = await getTokenBalance(accountId, contractId);
        if (balance === "0") return null;

        const metadata = (await rpcQuery({
          request_type: "call_function",
          finality: "final",
          account_id: contractId,
          method_name: "ft_metadata",
          args_base64: "e30=", // {}
        })) as { result: number[] };

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
