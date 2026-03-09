# Neptune AI — What Can It Do?

## 🔄 Token Swaps (Cross-Chain)
- Swap tokens across **30+ blockchains** (NEAR, Ethereum, Base, Arbitrum, Solana, TON, etc.)
- Same-chain and cross-chain swaps via **NEAR Intents** solver network
- Live swap quotes with real-time rates
- Connect via **HOT Kit** — one EVM wallet works across all EVM chains

## 🔍 Token Discovery
- Browse all supported tokens
- Check which chains a token is available on
- Typo detection and token name validation

## 🧠 Autonomous Strategies (NEW — v2)
Neptune can now **act without you asking**:

| Strategy | What It Does |
|----------|-------------|
| **Price Alert** | Notifies you when a token drops or surges past your threshold (e.g., "Alert me if BTC drops 5%") |
| **Stop Loss** | Auto-sells a token if it drops past a dangerous level (e.g., "Sell NEAR if it drops 15%") |
| **Portfolio Rebalance** | Adjusts your portfolio when allocation drifts beyond your target (e.g., "Keep 50% ETH, 30% BTC, 20% NEAR") |
| **Restake** | Auto-restakes staking rewards (coming soon) |

**How to set up:** Open the **Autonomy** panel in the sidebar → click **+** next to Strategies → pick a template.

## 🤖 Multi-Agent Pipeline
Every autonomous decision goes through **4 specialized agents**:
1. **Strategy Agent** — Evaluates your rules against live market data (CoinGecko)
2. **Risk Agent** — Checks if the action is within your guardrails
3. **Execution Agent** — Carries out the approved action
4. **Audit Agent** — Logs everything with a verifiable reasoning trace

This runs automatically **every 10 minutes** in the background.

## 🔒 Safety Guardrails
All autonomous actions are bounded by your settings:

| Guardrail | Default | What It Does |
|-----------|---------|-------------|
| **Autonomy Level** | Off | Off / Notify Only / Auto-Execute |
| **Max Per Transaction** | $500 | No single trade exceeds this |
| **Daily Limit** | $2,000 | Total daily spend cap |
| **Token Whitelist** | All | Restrict which tokens the agent can trade |
| **Kill Switch** | Off | Instantly halt ALL autonomous actions |

## 📋 Verifiable Decision History
Every autonomous action gets logged:
- **Locally** in SQLite (fast queries)
- **On Storacha/Filecoin** (decentralized, verifiable, permanent)
- Each log has a **CID** you can use to verify the decision on IPFS

See your full history in the **Decision History** section of the sidebar.

## 💳 Payments (Coming Soon)
- Payment links via HOT Pay
- Invoice creation and tracking
- Merchant tools

## 🔐 Security
- Neptune **never** has access to your private keys
- You review and sign all transactions in your own wallet
- All swaps go through the audited NEAR Intents protocol
- Autonomous actions are bounded by **your** guardrails
- Every decision has a verifiable audit trail
- Kill switch available at all times
