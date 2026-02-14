/**
 * Token list fetching and caching from NEAR 1-Click API.
 */

export interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  defuseAssetId: string;
  contractAddress: string;
  blockchain: string;
}

// In-memory cache
let tokenCache: TokenInfo[] | null = null;
let cacheTimestamp: number | null = null;
const CACHE_DURATION_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getAvailableTokensFromApi(): Promise<TokenInfo[]> {
  // Check cache
  if (tokenCache && cacheTimestamp) {
    if (Date.now() - cacheTimestamp < CACHE_DURATION_MS) {
      return tokenCache;
    }
  }

  try {
    const response = await fetch("https://1click.chaindefuser.com/v0/tokens", {
      next: { revalidate: 21600 }, // 6 hours
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("Unexpected API response format");
    }

    const tokens: TokenInfo[] = [];
    for (const item of data) {
      if (item?.assetId && item?.symbol) {
        let symbol = item.symbol;
        if (symbol.toUpperCase() === "WNEAR" || symbol.toUpperCase() === "NEAR") {
          symbol = "NEAR";
        }

        tokens.push({
          symbol,
          name: item.name || symbol,
          decimals: item.decimals ?? 18,
          defuseAssetId: item.assetId,
          contractAddress: item.contractAddress || "",
          blockchain: item.blockchain || "near",
        });
      }
    }

    // Remove duplicates by symbol
    const seen = new Set<string>();
    const uniqueTokens: TokenInfo[] = [];
    for (const token of tokens) {
      const key = token.symbol.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueTokens.push(token);
      }
    }

    if (uniqueTokens.length === 0) {
      throw new Error("API returned empty list");
    }

    // Update cache
    tokenCache = uniqueTokens;
    cacheTimestamp = Date.now();

    return uniqueTokens;
  } catch (e) {
    // Return expired cache as fallback
    if (tokenCache) {
      return tokenCache;
    }
    throw new Error(
      `Can't get supported tokens: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

export function getTokenSymbolsList(tokens: TokenInfo[]): string[] {
  return tokens.map((t) => t.symbol);
}

export function getTokenBySymbol(
  symbol: string,
  tokens: TokenInfo[]
): TokenInfo | undefined {
  const upper = symbol.toUpperCase();
  return tokens.find((t) => t.symbol.toUpperCase() === upper);
}

export function formatTokenListForDisplay(tokens: TokenInfo[]): string {
  if (!tokens.length) return "No tokens available at the moment.";

  const byChain: Record<string, TokenInfo[]> = {};
  for (const token of tokens) {
    const chain = token.blockchain || "unknown";
    if (!byChain[chain]) byChain[chain] = [];
    byChain[chain].push(token);
  }

  const lines: string[] = [];
  for (const [chain, chainTokens] of Object.entries(byChain).sort()) {
    lines.push(`\n**${chain.charAt(0).toUpperCase() + chain.slice(1)} Tokens:**`);
    const sorted = chainTokens.slice(0, 20).sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const token of sorted) {
      lines.push(`  - ${token.symbol} - ${token.name}`);
    }
  }

  return lines.join("\n");
}
