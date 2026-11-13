# Discovery Findings & System Architecture Audit

**Repository**: `TheDarrk/N-agent`  
**Backend**: `ai-agent-backend/` (FastAPI, SQLite, APScheduler, NEAR AI Cloud, model `z-ai/glm-5.3-flash`)  
**Frontend**: `NeptuneAI_V2/` (Next.js 14, deployed on Vercel, proxies to backend via `/api/[...path]`)  

---

## Answers to Part A Questions (Q1 - Q7)

### Q1. Storage & Persistence
- **SQLite Database Path**:
  - Defined in `ai-agent-backend/database/connection.py`:
    `DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "neptune_v2.db")`
    Resolves by default to: `C:\Users\ankit\N-agent\ai-agent-backend\neptune_v2.db`
  - Chat database defined in `ai-agent-backend/database/chat_db.py`:
    `CHAT_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "chat_history.db")`
- **Reasoning Logs Path**:
  - `ai-agent-backend/reasoning_logs` and `ai-agent-backend/research_reports`
  - Defined in `decentralized_storage.py` as `LOGS_DIR` and `REPORTS_DIR`.
- **Hosting Environment & Ephemeral Disk**:
  - When hosted on cloud container platforms (such as Render, Railway, Fly.io, or VPS container setups), the local container filesystem is ephemeral unless a persistent disk volume is mounted.
  - Currently, `decentralized_storage.py` does not check for environment variable paths, and `connection.py` checks `NEPTUNE_DB_PATH` but it was not standardized or documented in `.env.example`.
  - On every container redeploy or restart without a persistent volume mount, SQLite and the JSON trace directories are completely wiped, causing historical agent runs and reports to disappear.

### Q2. Result Persistence in Streaming Pipeline
- **Inside the streaming generator**:
  - In `research_agent.py` (`generate_research_report_stream`), `upload_research_report` is called from `step_3_report_synthesis` inside the stream generator.
  - In `rebalancer_agent.py` (`generate_strategy_stream`), `save_rebalancer_strategy` is called at line 923, near the end of the generator.
  - In `trader_agent.py` (`run_pipeline_stream`), `upload_trade_trace` is called throughout and at the end of the generator.
- **Root Cause of Lost Runs (R1)**:
  - When a user refreshes the page, switches browser tabs, or navigates away, the HTTP client connection disconnects.
  - Starlette/FastAPI raises `asyncio.CancelledError` on the active generator coroutine.
  - Because the generator is cancelled mid-execution, any subsequent `save_*` or `upload_*` database writes never execute.

### Q3. Frontend-to-Backend Proxy & Vercel Timeouts
- **Proxy Structure**:
  - Frontend components call `/api/...`, which is caught by Next.js catch-all route handler `NeptuneAI_V2/app/api/[...path]/route.ts`.
  - The handler proxies requests to `process.env.BACKEND_URL` (`http://127.0.0.1:8000`).
- **Missing Timeout Configurations (R7)**:
  - `NeptuneAI_V2/app/api/[...path]/route.ts` lacks `export const maxDuration = 300`, `export const dynamic = "force-dynamic"`, and `export const runtime = "nodejs"`.
  - On Vercel, serverless function executions time out at 10 to 60 seconds (default 10-15s on Hobby).
  - When the proxy times out and closes the socket, the backend cancels the streaming task (triggering R1).

### Q4. Frontend Result Storage
- **State vs. Storage (R2)**:
  - In `rebalancer-section.tsx`: The generated strategy was kept strictly in React `useState<ActiveStrategy | null>(null)`. When the user switches dashboard tabs in `autonomy-dashboard.tsx`, the component unmounts and all state is permanently lost.
  - In `research-panel.tsx`: The report was kept in state and partially cached in `localStorage` under `neptune_latest_research_${accountId}`, but active in-progress runs had no backend run ID or reconnect/replay mechanism.
  - In `trader-section.tsx`: Traces were loaded from state and `localStorage`, but active scans were lost on tab switch.

### Q5. History Lookup Key & Case-Sensitivity (R3)
- Lookup uses `wallet_address` / `user_wallet`.
- Neither `database/dal.py` nor `main.py` consistently normalized wallet strings (`strip().lower()`).
- SQLite string matching (`WHERE wallet_address = ?`) is case-sensitive by default without `COLLATE NOCASE`. An account querying with `User.near` vs `user.near` misses previously stored records.

### Q6. Rebalancer LLM Call & Parser Failure (J1 - J6)
- **Call Mechanism**:
  - `rebalancer_agent.py` uses `httpx.AsyncClient` posting to `${self.base_url}/chat/completions`.
  - Model: `z-ai/glm-5.3-flash`, `max_tokens: 4096`.
  - In `_call_llm_json`: Lines 290-299 built `resp_format = {"type": "json_schema", ...}`, but **never included `resp_format` in the `payload` dict sent to the provider**!
  - `strict_json_schema = RebalancerStrategySchema.model_json_schema()` was passed, which emits Pydantic V2 `$defs`, `$ref`, `title`, and lacks `additionalProperties: false`.
- **Parsing Deficiencies**:
  - `_extract_json` only attempted raw `json.loads(raw)` and a naive regex pattern.
  - It failed whenever the LLM returned markdown text, `<think>...</think>` tokens, trailing commas, single quotes, or `NaN`.
  - When parsing returned `None`, it threw `ValueError("Failed to parse JSON strategy from LLM output: ...")`.

### Q7. Marketplace Architecture
- **Current State**:
  - Endpoints: `GET /api/marketplace/agents`, `POST /api/marketplace/publish`, `POST /api/marketplace/hire`, `GET /api/marketplace/hires/{user_wallet}`, `POST /api/marketplace/hire/cancel`.
  - Schema: `marketplace_listings`, `marketplace_subscriptions`, `marketplace_trade_mirrors`.
  - Mode: "Rent an agent" with profit-sharing or native NEAR per trade.
- **Target State (Part 3)**:
  - One global `marketplace_listings` table (publicly accessible, config sanitized and hidden from cards).
  - `marketplace_orders` table locking pricing in USDT (`usdt.tether-token.near`, 6 decimals).
  - Buyer pays seller's payout wallet and inputs NEAR transaction hash.
  - Backend verifies tx hash strictly on-chain via NEAR JSON-RPC (`EXPERIMENTAL_tx_status`), checking signer, recipient, NEP-141 contract, amount, execution status, and timestamp window.
  - Single-use replay protection via DB unique index.
  - Verified payment automatically mirrors and applies sanitized config to the buyer's agent setup.

---

## Root Causes Summary & Matrix

| # | Root Cause | Confirmed | Evidence / Details |
|---|---|---|---|
| R1 | In-stream pipeline execution | YES | Generator cancellation on disconnect kills pipeline before DB persistence |
| R2 | Ephemeral React state | YES | Component unmounting on tab switch wipes `useState` |
| R3 | Wallet case mismatch | YES | No `.strip().lower()` normalization in DAL or API endpoints |
| R4 | Pruning deletes older runs | YES | `_prune_directory` in `decentralized_storage.py` deletes older JSON files (capped at 5 reports, 24 traces) |
| R5 | Ephemeral host disk | YES | No persistent volume configuration in backend deployment configs |
| R6 | Deterministic CID collisions | YES | `cid TEXT UNIQUE NOT NULL` with `INSERT OR REPLACE` in `schema.sql` causes cross-wallet or repeated-run overwrites |
| R7 | Next.js proxy timeout | YES | `[...path]/route.ts` lacks `maxDuration` and `runtime` directives, killing long streams |
| J1-J6 | Rebalancer JSON parse errors | YES | `resp_format` omitted from request payload, raw Pydantic `$defs` in schema, lack of tolerant extraction (`json-repair`, think-tag removal), no graceful deterministic fallback |
