/**
 * Centralized High-Availability Token & Chain Logo Registry
 * Powered by jsDelivr TrustWallet CDN & official endpoints (no 403 hotlink blocks).
 */

export const TOKEN_LOGOS: Record<string, string> = {
  // Native & Wrapped NEAR
  NEAR: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/near/info/logo.png",
  WNEAR: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/near/info/logo.png",

  // Major Stablecoins & Cryptos
  USDT: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png",
  USDC: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png",
  ETH: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/info/logo.png",
  ETHEREUM: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/info/logo.png",
  WETH: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/info/logo.png",
  BTC: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png",
  BITCOIN: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/bitcoin/info/logo.png",
  WBTC: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599/logo.png",
  SOL: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/solana/info/logo.png",
  SOLANA: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/solana/info/logo.png",

  // Chains & L2s
  ARB: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/arbitrum/info/logo.png",
  ARBITRUM: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/arbitrum/info/logo.png",
  BASE: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/base/info/logo.png",
  OP: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/optimism/info/logo.png",
  OPTIMISM: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/optimism/info/logo.png",
  POLYGON: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/polygon/info/logo.png",
  MATIC: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/polygon/info/logo.png",
  POL: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/polygon/info/logo.png",
  AVAX: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/avalanchec/info/logo.png",
  AVALANCHE: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/avalanchec/info/logo.png",
  BNB: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/binance/info/logo.png",
  BSC: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/binance/info/logo.png",
  AURORA: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/aurora/info/logo.png",
  TON: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ton/info/logo.png",
  TRX: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/tron/info/logo.png",
  TRON: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/tron/info/logo.png",
  SUI: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/sui/info/logo.png",
  APTOS: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/aptos/info/logo.png",
  APT: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/aptos/info/logo.png",
  DOGE: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/doge/info/logo.png",
  XRP: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/xrp/info/logo.png",
  CARDANO: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/cardano/info/logo.png",
  ADA: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/cardano/info/logo.png",

  // Ecosystem DeFi Tokens
  DAI: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png",
  LINK: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png",
  UNI: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984/logo.png",
  AAVE: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/ethereum/assets/0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9/logo.png",
  SWEAT: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/near/assets/sweat_welcome.near/logo.png",
  REF: "https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/near/assets/token.v2.ref-finance.near/logo.png",
  HOT: "https://storage.herewallet.app/upload/73a44e583769f11112b0eff1f2dd2a560c05eed5f6d92f0c03484fa047c31668.png",
};

export function getTokenLogoUrl(symbolOrChain: string): string | undefined {
  if (!symbolOrChain) return undefined;
  const cleaned = symbolOrChain.replace(/^(?:\[.*?\]\s*)?/, "").toUpperCase().trim();
  return TOKEN_LOGOS[cleaned];
}
