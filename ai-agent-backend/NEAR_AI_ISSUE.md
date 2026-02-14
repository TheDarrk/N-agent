HOT vs Defuse: Comparison & Coexistence Strategy
Key Insight: They're NOT Competitors — They Do Different Things
Defuse 1-Click (Current)	HOT Kit + HOT Pay (New)
What it is	Swap quote/execution API	Multi-chain connector + payments platform
Core function	Get swap quotes, execute token exchanges	Connect wallets, manage portfolio, accept payments
API used	1click.chaindefuser.com/v0/quote	@hot-labs/kit SDK + api.hot-labs.org REST
Scope	Token A → Token B swaps only	Wallets + balances + swaps + payments + auth
IMPORTANT

Defuse = swap engine. HOT = infrastructure layer. They naturally coexist — HOT Kit even uses NEAR Intents (same underlying infra as Defuse) for its exchange.

What Neptune AI Currently Uses Defuse For
User: 'Swap 5 NEAR for ETH'
LLM picks get_swap_quote_tool
Defuse API/v0/tokens → token list/v0/quote → swap quote
Build NEAR Intent TX
Frontend signs via wallet
Defuse Endpoint	What It Does	Used In
GET /v0/tokens	Fetch all supported tokens with chain info	
knowledge_base.py
POST /v0/quote	Get real-time swap quote with solver address	tools.py → get_swap_quote()
(manual)	Construct ft_transfer_call + mt_transfer txs	tools.py → create_near_intent_transaction()
What HOT Adds (That Defuse Can't Do)
🆕 Capabilities ONLY HOT Provides
Capability	What It Does	Agent Value
Multi-chain wallet	Connect NEAR + MetaMask + Phantom + TON + Stellar in ONE connector	Users don't need to switch wallets for cross-chain
Google Auth	Login via Google → get addresses on all chains via HOT MPC	Onboard web2 users with zero crypto knowledge
Live portfolio	kit.walletsTokens auto-updates balances across all chains	"Show my balances" tool — real data, no RPC calls
Payment links	Generate pay.hot-labs.org/?to=X&amount=Y URLs	"Create a payment link for 50 USDC" — new agent skill
Payment tracking	GET /partners/processed_payments REST API	"Has John paid me?" — check payment status
Built-in exchange UI	kit.openBridge() popup, or kit.exchange.reviewSwap() programmatic	Alternative swap execution path
🔄 Capabilities That Overlap With Defuse
Area	Defuse	HOT Kit	Verdict
Token list	/v0/tokens API	tokens.list / tokens.get()	Either works — HOT Kit has richer metadata
Swap quotes	/v0/quote API	kit.exchange.reviewSwap()	Both use NEAR Intents under the hood
Swap execution	Manual mt_transfer TX construction	kit.exchange.makeSwap(review)	HOT is simpler — no manual TX building
Recommended Coexistence Strategy
Add HOT Pay (Backend)
Payment link generation
Payment status tracking
Add HOT Kit (Frontend)
HotConnectorMulti-chain wallets
kit.exchangeSwap execution
kit.walletsTokensLive balances
Keep Defuse (Backend)
Token List API/v0/tokens
Swap Quote API/v0/quote
Phase 1: Add HOT Pay Tools (Backend only — quick win)
Keep: Defuse for token lists + swap quotes (already working)
Add: HOT Pay create_payment_link_tool and check_payment_status_tool
Effort: ~1 day
Impact: New agent capability, strong sponsorship talking point
Phase 2: HOT Kit Wallet (Frontend — when replacing mocks)
Keep: Defuse for backend swap logic
Replace: Mock wallet/signing with HotConnector
Use: kit.exchange.makeSwap() for signing instead of manual TX construction
Effort: ~2 days
Phase 3 (Optional): Migrate swap engine to HOT Kit
Replace: Defuse /v0/quote with kit.exchange.reviewSwap()
Remove: Manual 
create_near_intent_transaction()
 — HOT handles it
Effort: ~1 day
Why optional: Both use NEAR Intents, so the underlying infra is the same
New Agent Conversations HOT Enables
With HOT Pay, users can do things the agent can't do today:

User: "Create a payment link for 25 USDC"
Agent: Here's your payment link: https://pay.hot-labs.org/?to=user.near&amount=25&token=USDC
       Anyone can pay you from 30+ chains. You'll receive USDC on NEAR.
User: "Has anyone paid the invoice I created?"
Agent: [calls check_payment_status_tool]
       Yes! 1 payment received: 25 USDC from 0x1234...abcd, tx: ABC123
User: "Show my balances across all chains"
Agent: [uses kit.walletsTokens data]
       NEAR: 12.45 NEAR, 250 USDC
       Ethereum: 0.5 ETH, 1000 USDT
       Solana: 15 SOL
Sponsorship Angle Summary
To HOT team: "Neptune AI uses HOT Kit as its multi-chain infrastructure layer and HOT Pay for AI-powered crypto payments. We kept Defuse for swap quotes since both use NEAR Intents — but HOT gives us wallets, portfolio, payments, and Google Auth that Defuse can't. Neptune AI is the first AI agent showcasing HOT's full stack."


Comment
Ctrl+Alt+M
