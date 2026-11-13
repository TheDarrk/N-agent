# DISCOVERY_ROUND4.md — Neptune AI (N-agent) Round 4 Audit

## 1. Chat History Broken
- **Files Involved**:
  - `NeptuneAI_V2/components/chat-interface.tsx`
  - `NeptuneAI_V2/components/sidebar-chat-history.tsx`
  - `NeptuneAI_V2/app/api/chat/history/[wallet]/route.ts`
  - `ai-agent-backend/database/chat_db.py`
  - `ai-agent-backend/main.py`
- **Findings**:
  - `NeptuneAI_V2/components/chat-interface.tsx` initializes `messages` as `[]` (`useState<Message[]>([])` at line 166). It has **no** `useEffect` to fetch chat history upon mount or when `accountId` changes.
  - History was previously fetched only in `SidebarChatHistory` (`sidebar-chat-history.tsx` lines 48-71) from `/api/chat/history/[wallet]`.
  - Backend `ai-agent-backend/database/chat_db.py` stored messages in an ephemeral SQLite file `chat_history.db` (`CHAT_DB_PATH = .../chat_history.db` at line 12). This file was isolated from the primary Turso database (`neptune_v2.db`) and un-synced, causing complete data loss on every Render spin-down or redeploy.
  - The primary DB schema lacks a unified, wallet-isolated `chat_messages` table replicated via Turso libSQL.
- **Root Cause & Action**:
  - Create table `chat_messages` in `database/schema.sql` and `dal.py`.
  - Wire `/api/chat/history/{wallet}` to read and write to `neptune_v2.db` via DAL with normalized wallet addresses.
  - Update `chat-interface.tsx` to load history on mount / wallet connect, reset on wallet disconnect/change, and display "Connect wallet to see chat history" when disconnected.

---

## 2. Rebalancer useCallback Error
- **File**: `NeptuneAI_V2/components/agent-sections/rebalancer-section.tsx`
- **Lines**: Line 6:
  ```tsx
  import React, { useState, useEffect, useMemo, useRef } from "react";
  ```
- **Line 303**:
  ```tsx
  const handleStreamEvent = useCallback((ev: any) => {
  ```
- **Findings**: `useCallback` is invoked at line 303 without being imported from `"react"`, causing Turbopack runtime `ReferenceError: useCallback is not defined` when opening the rebalancer section.
- **Action**: Add `useCallback` to line 6 import in `rebalancer-section.tsx`.

---

## 3. Agent Wallet Section Options
- **File**: `NeptuneAI_V2/components/agent-wallet-manager-modal.tsx`
- **Findings**:
  - Lines 100-120: Modal offers multiple flows and creation methods:
    1. Named Subaccount (`creationMethod === "named_subaccount"`)
    2. Implicit Account (`creationMethod === "implicit"`)
    3. EVM Wallet (`creationMethod === "evm_wallet"`)
    4. Import Private Key (`isImportingView = true`)
    5. Top-up deposit modal (`topupTargetWallet`)
    6. Withdraw funds modal (`withdrawTargetWallet`)
- **Action**:
  - Streamline to ONE option only: "Add your key" (gives agent wallet key to execute trades).
  - Eliminate multi-step subaccount / implicit / EVM tab switches, aligning copy to a single direct key import flow.

---

## 4. Trader Name Discrepancy
- **Agent Suite**: `NeptuneAI_V2/components/agent-suite.tsx` line 57:
  ```tsx
  name: "Autonomous Trader Agent",
  ```
- **Trader Panel**: `NeptuneAI_V2/components/agent-sections/trader-section.tsx` line 585:
  ```tsx
  <h1 className="text-lg font-semibold tracking-tight text-foreground">Trader Agent</h1>
  ```
- **Action**: Change `Trader Agent` in `trader-section.tsx` to `Autonomous Trader Agent` to match `agent-suite.tsx`.

---

## 5. Sidebar Navigation & Tab Order
- **File**: `NeptuneAI_V2/components/chat-sidebar.tsx`
- **Current Entries (Lines 37-43)**:
  1. `wallet`: "Wallet"
  2. `fleet`: "Fleet"
  3. `activity`: "Activity"
- **Findings**:
  - Activity tab renders `SidebarAgentFeed` (`sidebar-agent-feed.tsx`).
  - Required order: Chat → Wallet → Fleet Status.
- **Action**: Remove "Activity" tab and its panel from `chat-sidebar.tsx`. Set sidebar tabs to Chat / New Chat, Wallet, and Fleet Status.

---

## 6. Scheduling Persistence Across Spin-down & Restart
- **Files**:
  - `ai-agent-backend/main.py` lines 120-215 (lifespan startup)
  - `ai-agent-backend/autonomy_engine.py`
  - `ai-agent-backend/database/schema.sql`
- **Findings**:
  - `AsyncIOScheduler()` is initialized with in-memory `MemoryJobStore` (line 126 in `main.py`).
  - No `scheduled_jobs` table exists in `schema.sql` or `dal.py`.
  - On restart / Render spin-down, all dynamically scheduled jobs are lost. Only static intervals (`check_all_strategies` every 30s, `moderator_cadence_job` every 5m) were re-registered on startup.
- **Action**:
  - Create table `scheduled_jobs` in `neptune_v2.db` with columns `(job_id, wallet, agent_type, purpose, interval_seconds, next_run_at, enabled, config_json, created_at, updated_at)`.
  - Implement DAL helpers: `upsert_scheduled_job`, `list_enabled_jobs`, `mark_job_run`, `disable_job`.
  - In `main.py` startup, query `list_enabled_jobs()`, register them in APScheduler with `next_run_time=min(stored_next_run_at, now)`, and execute overdue runs immediately.
  - Skip execution if user has been inactive for >14 days.

---

## 7. Field-Level Encryption
- **Files**:
  - `ai-agent-backend/database/encryption.py`
  - `ai-agent-backend/database/dal.py`
- **Findings**:
  - Currently, `database/encryption.py` uses AES-256-GCM only for agent wallet private keys/seeds (`core_agent_wallets.encrypted_private_key`).
  - User-scoped data columns (`agent_runs.params_json`, `result_json`, `error`, `marketplace_listings.config_json`, `marketplace_orders.config_json`, `trader_config`, `rebalancer_strategies`, and `chat_messages.content`) are stored in PLAINTEXT.
- **Action**:
  - Implement `ai-agent-backend/database/crypto.py` using HKDF-SHA256 (`FERNET_MASTER_KEY` + `SHA256(normalize_wallet(wallet))[:16]` salt) and Fernet tokens.
  - Wrap DAL read/write boundaries for user-scoped data. Require `wallet` for decryption.

---

## 8. Marketplace Purchase Flow
- **File**: `NeptuneAI_V2/components/agent-marketplace.tsx` lines 230-310, 720-800
- **Current Flow**:
  1. User clicks "Buy" → creates order (`/api/marketplace/orders`).
  2. Modal displays seller payout wallet and amount in USDT.
  3. User must manually open an external wallet, send USDT, copy the tx hash from explorer.
  4. User pastes the tx hash into `txHashInput` and clicks "Verify On-Chain".
- **Target Automated Flow**:
  1. Click "Purchase" → check if wallet connected; if not, open "Add your key" modal.
  2. Order created automatically.
  3. Transaction modal pops up pre-filled with USDT `ft_transfer` to seller.
  4. On wallet confirmation, capture tx hash automatically, call `/api/marketplace/orders/{order_id}/verify`, and auto-apply config.

---

## 9. Researcher Sub-Agent
- **File**: `ai-agent-backend/autonomous_agents/research_agent.py`
- **Findings**:
  - `ResearchAgent` has `hire_by_trader_agent()` (lines 1798-1850) and `generate_research_report()` (lines 1726-1790).
  - "Depth" in current code refers to recursive crawler traversal depth (`max_depth=4` in `crawl_urls_recursive`, lines 1557, 1747).
- **Action**:
  - Implement `run_research_subagent(wallet, topic, focus, coins, date_range_days, depth, calling_agent, parent_run_id)` callable in-process.
  - Create `autonomous_agents/default_sources.json` with seed URLs per coin (NEAR, DOGE, ETH, BTC, USDC, USDT).
  - Add 5-minute memory cache to prevent double-charging tokens.
  - Inject custom system prompts for `trader` (depth=2, short-term momentum, 200 words/coin) vs `rebalancer` (depth=1, macro regime & correlation, 300 words).

---

## 10. Fees Banners Across UI
- **Files Found**:
  - `NeptuneAI_V2/components/agent-sections/research-panel.tsx` lines 449-452: `Free (0 NEAR)`
  - `NeptuneAI_V2/components/agent-fleet-modal.tsx` lines 110-111: `Free (0 NEAR)` and `Fee: Free (0 NEAR)`
  - `NeptuneAI_V2/components/agent-sections/trader/trader-config.tsx` line 696: `(Free - 0 NEAR)`
  - `NeptuneAI_V2/components/sidebar-fleet-bar.tsx` line 98: `metricSub: ... "Free (0 NEAR)"`
  - `NeptuneAI_V2/components/agent-suite.tsx` lines 661-665: `Fee Model:` badge
- **Action**: Remove all fee banners and references across the components.

---

## 11. Agent Emojis to Logo SVGs
- **Files**:
  - `NeptuneAI_V2/components/agent-avatars.tsx`
  - `NeptuneAI_V2/public/agents/` (currently nonexistent)
- **Action**:
  - Create `NeptuneAI_V2/public/agents/`: `trader.svg`, `rebalancer.svg`, `research.svg`, `moderator.svg`, `marketplace.svg`.
  - Update `agent-avatars.tsx` to render SVG assets with graceful fallback.
