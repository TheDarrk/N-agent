import { getTokenMap, getPopularTokens } from "./network";

// Defuse Asset IDs map with dynamic network fallback
export const TOKEN_MAP: Record<string, string> = new Proxy(
  {},
  {
    get(_target, prop: string) {
      const activeMap = getTokenMap();
      return activeMap[prop.toUpperCase()] || activeMap[prop];
    },
    has(_target, prop: string) {
      const activeMap = getTokenMap();
      return prop.toUpperCase() in activeMap || prop in activeMap;
    },
    ownKeys() {
      return Object.keys(getTokenMap());
    },
    getOwnPropertyDescriptor(_target, prop: string) {
      const activeMap = getTokenMap();
      if (prop.toUpperCase() in activeMap || prop in activeMap) {
        return {
          enumerable: true,
          configurable: true,
          value: activeMap[prop.toUpperCase()] || activeMap[prop],
        };
      }
      return undefined;
    },
  }
);

// Decimals map for simple conversion
export const DECIMALS_MAP: Record<string, number> = {
  NEAR: 24,
  WNEAR: 24,
  ETH: 18,
  USDC: 6,
  USDT: 6,
  WBTC: 8,
  AURORA: 18,
};

// Popular tokens for wallet sidebar display (dynamically resolved based on active network)
export const POPULAR_TOKENS = new Proxy([], {
  get(_target, prop) {
    const list = getPopularTokens();
    if (prop === "length") return list.length;
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return list[Number(prop)];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (list as any)[prop];
  },
});
