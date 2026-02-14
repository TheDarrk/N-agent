// Defuse Asset IDs map
export const TOKEN_MAP: Record<string, string> = {
  NEAR: "nep141:wrap.near",
  ETH: "nep141:eth.bridge.near",
  USDC: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1",
  USDT: "nep141:usdt.tether-token.near",
  WBTC: "nep141:minter.bridge.near",
  AURORA:
    "nep141:aaaaaa20d9e0e2461697782ef11675f668207961.factory.bridge.near",
};

// Decimals map for simple conversion
export const DECIMALS_MAP: Record<string, number> = {
  NEAR: 24,
  ETH: 18,
  USDC: 6,
  USDT: 6,
  WBTC: 8,
  AURORA: 18,
};

// Popular tokens for wallet sidebar display
export const POPULAR_TOKENS = [
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
];
