-- =====================================================================
-- Neptune AI v2.1 Database Schema (18 Production Tables)
-- =====================================================================
PRAGMA foreign_keys = ON;

-- 1. CORE NAMESPACE (4 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS core_user_wallets (
    wallet_address TEXT PRIMARY KEY NOT NULL,
    network_mode TEXT NOT NULL DEFAULT 'testnet',
    kill_switch_active INTEGER NOT NULL DEFAULT 0,
    autonomy_level INTEGER NOT NULL DEFAULT 0,
    risk_profile TEXT NOT NULL DEFAULT 'moderate',
    max_transaction_usd REAL NOT NULL DEFAULT 500.0,
    daily_spending_limit_usd REAL DEFAULT NULL,
    allow_cross_chain_trades INTEGER NOT NULL DEFAULT 0,
    notification_email TEXT DEFAULT NULL,
    encrypted_master_seed TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS core_agent_wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    chain_type TEXT NOT NULL DEFAULT 'near',
    public_key TEXT NOT NULL,
    encrypted_private_key TEXT NOT NULL,
    encrypted_seed_phrase TEXT DEFAULT NULL,
    agent_account_id TEXT NOT NULL,
    label TEXT DEFAULT NULL,
    wallet_type TEXT NOT NULL DEFAULT 'implicit',
    assigned_agents_json TEXT NOT NULL DEFAULT '[]',
    scope TEXT NOT NULL DEFAULT 'function_call',
    status TEXT NOT NULL DEFAULT 'pending',
    funding_tx_hash TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core_user_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    trigger_condition_json TEXT NOT NULL,
    schedule TEXT NOT NULL DEFAULT 'every_10m',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_triggered_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS core_agent_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    reasoning_text TEXT DEFAULT NULL,
    action_taken TEXT NOT NULL,
    trade_id INTEGER DEFAULT NULL,
    tx_hash TEXT DEFAULT NULL,
    cid_reference TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    metadata_json TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- 2. TRADER AGENT NAMESPACE (3 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS trader_config (
    wallet_address TEXT PRIMARY KEY NOT NULL,
    agent_active INTEGER NOT NULL DEFAULT 0,
    assigned_wallet_id INTEGER DEFAULT NULL,
    timeframe TEXT NOT NULL DEFAULT '1h',
    min_confidence_score INTEGER NOT NULL DEFAULT 75,
    risk_profile TEXT NOT NULL DEFAULT 'moderate',
    max_trades_per_day INTEGER NOT NULL DEFAULT 3,
    max_trades_per_week INTEGER NOT NULL DEFAULT 12,
    coin_mode TEXT NOT NULL DEFAULT 'auto',
    custom_coins_json TEXT DEFAULT '[]',
    enable_research_agent INTEGER NOT NULL DEFAULT 1,
    min_volume_usd REAL DEFAULT 25000.0,
    min_price_move_pct REAL DEFAULT 2.0,
    min_atr_pct REAL DEFAULT 0.30,
    min_risk_reward REAL DEFAULT 1.5,
    rsi_overbought REAL DEFAULT 70.0,
    rsi_oversold REAL DEFAULT 30.0,
    rsi_sweet_min REAL DEFAULT 45.0,
    rsi_sweet_max REAL DEFAULT 62.0,
    pro_settings_json TEXT DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    FOREIGN KEY (assigned_wallet_id) REFERENCES core_agent_wallets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS trader_active_trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    trade_uuid TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    action TEXT NOT NULL,
    direction TEXT NOT NULL DEFAULT 'LONG',
    entry_price_usd REAL NOT NULL,
    current_price_usd REAL NOT NULL,
    take_profit_usd REAL NOT NULL,
    stop_loss_usd REAL NOT NULL,
    confidence_score INTEGER NOT NULL,
    expected_roi_pct REAL NOT NULL,
    position_size_usd REAL NOT NULL DEFAULT 50.0,
    position_size_atomic TEXT DEFAULT NULL,
    target_chain TEXT NOT NULL DEFAULT 'near',
    is_cross_chain INTEGER NOT NULL DEFAULT 0,
    execution_wallet TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'OPEN',
    drop_reason TEXT DEFAULT NULL,
    tx_hash TEXT DEFAULT NULL,
    entry_tx_hash TEXT DEFAULT NULL,
    exit_tx_hash TEXT DEFAULT NULL,
    user_config_snapshot_json TEXT DEFAULT '{}',
    decision_snapshot_json TEXT DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trader_reasoning_traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    trace_uuid TEXT UNIQUE NOT NULL,
    cid TEXT UNIQUE NOT NULL,
    symbol TEXT NOT NULL,
    verdict TEXT NOT NULL,
    confidence_score INTEGER NOT NULL,
    trace_payload_json TEXT NOT NULL,
    chart_image_path TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- 3. REBALANCER AGENT NAMESPACE (4 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS rebalancer_config (
    wallet_address TEXT PRIMARY KEY NOT NULL,
    agent_active INTEGER NOT NULL DEFAULT 0,
    assigned_wallet_id INTEGER DEFAULT NULL,
    target_stables_pct REAL NOT NULL DEFAULT 70.0,
    target_near_pct REAL NOT NULL DEFAULT 30.0,
    drift_threshold_pct REAL NOT NULL DEFAULT 5.0,
    min_stable_pct REAL NOT NULL DEFAULT 10.0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    FOREIGN KEY (assigned_wallet_id) REFERENCES core_agent_wallets(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rebalancer_strategies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    selected_coins_json TEXT NOT NULL,
    user_expectation_text TEXT DEFAULT NULL,
    cadence_days INTEGER NOT NULL DEFAULT 7,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    allocations_json TEXT NOT NULL,
    tp_sl_rules_json TEXT DEFAULT '[]',
    market_regime TEXT DEFAULT NULL,
    overall_strategy_text TEXT DEFAULT NULL,
    raw_pydantic_output_json TEXT DEFAULT '{}',
    drop_reason TEXT DEFAULT NULL,
    min_stable_pct REAL NOT NULL DEFAULT 10.0,
    user_config_snapshot_json TEXT DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_at TIMESTAMP DEFAULT NULL,
    dropped_at TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rebalancer_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    strategy_id INTEGER DEFAULT NULL,
    execution_uuid TEXT UNIQUE NOT NULL,
    idempotency_key TEXT UNIQUE NOT NULL,
    state TEXT NOT NULL,
    token_in TEXT NOT NULL,
    token_out TEXT NOT NULL,
    amount_in_usd REAL NOT NULL DEFAULT 0.0,
    amount_in_atomic TEXT NOT NULL DEFAULT '0',
    amount_out_expected_atomic TEXT NOT NULL DEFAULT '0',
    amount_out_actual_atomic TEXT DEFAULT NULL,
    slippage_tolerance_bps INTEGER NOT NULL DEFAULT 50,
    estimated_slippage_bps INTEGER DEFAULT 0,
    deposit_address TEXT DEFAULT NULL,
    quote_id TEXT DEFAULT NULL,
    signature_proof TEXT DEFAULT NULL,
    deposit_tx_hash TEXT DEFAULT NULL,
    near_tx_hashes_json TEXT DEFAULT '[]',
    terminal_status TEXT DEFAULT NULL,
    refund_reason TEXT DEFAULT NULL,
    refund_tx_hash TEXT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    FOREIGN KEY (strategy_id) REFERENCES rebalancer_strategies(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    snapshot_data_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- 4. RESEARCH AGENT NAMESPACE (2 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS research_config (
    wallet_address TEXT PRIMARY KEY NOT NULL,
    agent_active INTEGER NOT NULL DEFAULT 0,
    report_frequency_days INTEGER NOT NULL DEFAULT 7,
    focus_areas_json TEXT DEFAULT '["NEAR", "DeFi", "Yield"]',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS research_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    report_uuid TEXT UNIQUE NOT NULL,
    cid TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    research_query TEXT NOT NULL,
    report_type TEXT NOT NULL DEFAULT 'comprehensive',
    executive_summary TEXT DEFAULT NULL,
    key_findings_json TEXT DEFAULT '[]',
    opportunities_json TEXT DEFAULT '[]',
    reasoning_trace_json TEXT DEFAULT '[]',
    sources_cited_json TEXT DEFAULT '[]',
    signals_json TEXT DEFAULT '[]',
    hired_by_agent TEXT DEFAULT NULL,
    payment_tx_hash TEXT DEFAULT NULL,
    full_report_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- 5. MODERATOR AGENT NAMESPACE (2 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS moderator_config (
    wallet_address TEXT PRIMARY KEY NOT NULL,
    agent_active INTEGER NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL DEFAULT '1w',
    kill_threshold_score REAL NOT NULL DEFAULT 50.0,
    last_evaluation_at TIMESTAMP DEFAULT NULL,
    activated_at TIMESTAMP DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS moderator_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT NOT NULL,
    evaluation_uuid TEXT UNIQUE NOT NULL,
    cid TEXT UNIQUE NOT NULL,
    overall_fleet_score REAL NOT NULL,
    trader_score REAL NOT NULL,
    rebalancer_score REAL NOT NULL,
    research_score REAL NOT NULL,
    kill_threshold REAL NOT NULL,
    triggered_kill_switch INTEGER NOT NULL DEFAULT 0,
    killed_agents_json TEXT DEFAULT '[]',
    verdict TEXT NOT NULL,
    reasoning_text TEXT NOT NULL,
    evaluation_data_json TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_address) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- 6. MARKETPLACE NAMESPACE (3 Tables)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS marketplace_listings (
    listing_id      TEXT PRIMARY KEY,
    seller_wallet   TEXT NOT NULL,
    payout_wallet   TEXT NOT NULL,
    agent_type      TEXT NOT NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    price_usdt      TEXT NOT NULL,
    config_json     TEXT NOT NULL,
    public_stats_json TEXT,
    status          TEXT NOT NULL DEFAULT 'active',
    sales_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS marketplace_orders (
    order_id        TEXT PRIMARY KEY,
    listing_id      TEXT NOT NULL,
    buyer_wallet    TEXT NOT NULL,
    seller_wallet   TEXT NOT NULL,
    payout_wallet   TEXT NOT NULL,
    amount_usdt     TEXT NOT NULL,
    amount_base_units TEXT NOT NULL,
    token_contract  TEXT NOT NULL,
    config_json     TEXT NOT NULL,
    status          TEXT NOT NULL,
    tx_hash         TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at      TEXT NOT NULL,
    verified_at     TEXT,
    failure_reason  TEXT,
    apply_status    TEXT DEFAULT NULL,
    apply_error     TEXT DEFAULT NULL,
    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(listing_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS marketplace_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hire_id TEXT UNIQUE NOT NULL,
    subscription_uuid TEXT UNIQUE NOT NULL,
    listing_id TEXT NOT NULL,
    creator_wallet TEXT NOT NULL,
    subscriber_wallet TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    pricing_type TEXT NOT NULL,
    pricing_value REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    total_mirrored_trades INTEGER NOT NULL DEFAULT 0,
    last_action_at TIMESTAMP DEFAULT NULL,
    subscribed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP DEFAULT NULL,
    FOREIGN KEY (listing_id) REFERENCES marketplace_listings(listing_id) ON DELETE CASCADE,
    FOREIGN KEY (creator_wallet) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_wallet) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    UNIQUE(listing_id, subscriber_wallet)
);

CREATE TABLE IF NOT EXISTS marketplace_trade_mirrors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hire_id TEXT NOT NULL,
    creator_wallet TEXT NOT NULL,
    subscriber_wallet TEXT NOT NULL,
    original_trade_id INTEGER NOT NULL,
    mirrored_trade_id INTEGER NOT NULL,
    mirror_status TEXT NOT NULL DEFAULT 'SUCCESS',
    mirror_tx_hash TEXT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hire_id) REFERENCES marketplace_subscriptions(hire_id) ON DELETE CASCADE,
    FOREIGN KEY (creator_wallet) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_wallet) REFERENCES core_user_wallets(wallet_address) ON DELETE CASCADE
);

-- =====================================================================
-- PERFORMANCE & ISOLATION INDEXES
-- =====================================================================
CREATE INDEX IF NOT EXISTS idx_core_kill_switch ON core_user_wallets(kill_switch_active);
CREATE INDEX IF NOT EXISTS idx_core_network ON core_user_wallets(network_mode);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_user ON core_agent_wallets(wallet_address);
CREATE INDEX IF NOT EXISTS idx_agent_wallets_status ON core_agent_wallets(status);
CREATE INDEX IF NOT EXISTS idx_user_strategies_wallet ON core_user_strategies(wallet_address, is_active);
CREATE INDEX IF NOT EXISTS idx_audit_log_wallet ON core_agent_audit_log(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_agent ON core_agent_audit_log(wallet_address, agent_name);
CREATE INDEX IF NOT EXISTS idx_trader_trades_wallet ON trader_active_trades(wallet_address, status);
CREATE INDEX IF NOT EXISTS idx_trader_trades_open ON trader_active_trades(status) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_trader_traces_wallet ON trader_reasoning_traces(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_rebalancer_strat_wallet ON rebalancer_strategies(wallet_address, status);
CREATE INDEX IF NOT EXISTS idx_rebalancer_exec_wallet ON rebalancer_executions(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_portfolio_snap_wallet ON portfolio_snapshots(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_research_reports_wallet ON research_reports(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_moderator_eval_wallet ON moderator_evaluations(wallet_address, created_at);
CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_txhash ON marketplace_orders(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_buyer ON marketplace_orders(buyer_wallet, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_subs_user ON marketplace_subscriptions(subscriber_wallet, status);

-- =====================================================================
-- BACKWARD-COMPATIBILITY VIEWS & TRIGGERS
-- =====================================================================
CREATE VIEW IF NOT EXISTS agent_keys AS 
SELECT 
    id, 
    wallet_address as user_wallet, 
    public_key, 
    encrypted_private_key as private_key_encrypted, 
    agent_account_id, 
    chain_type, 
    wallet_type, 
    label, 
    status, 
    0 as derivation_index, 
    CASE WHEN status = 'active' THEN 1 ELSE 0 END as is_active, 
    NULL as last_used_at, 
    created_at, 
    created_at as updated_at 
FROM core_agent_wallets;

CREATE TRIGGER IF NOT EXISTS trg_agent_keys_update 
INSTEAD OF UPDATE ON agent_keys 
BEGIN 
    UPDATE core_agent_wallets 
    SET chain_type = COALESCE(NEW.chain_type, chain_type),
        status = COALESCE(NEW.status, status),
        label = COALESCE(NEW.label, label)
    WHERE id = OLD.id; 
END;

CREATE VIEW IF NOT EXISTS users AS
SELECT 
    u.wallet_address,
    u.risk_profile,
    u.max_transaction_usd as max_tx_amount,
    u.kill_switch_active as kill_switch,
    u.allow_cross_chain_trades,
    u.created_at,
    u.updated_at,
    COALESCE(t.agent_active, 1) as trader_active,
    COALESCE(t.timeframe, '1h') as trader_timeframe,
    COALESCE(t.min_confidence_score, 75) as trader_min_confidence,
    COALESCE(t.coin_mode, 'auto') as trader_coin_mode,
    COALESCE(t.enable_research_agent, 1) as trader_enable_researcher,
    COALESCE(r.agent_active, 0) as rebalancer_active,
    COALESCE(res.agent_active, 0) as researcher_active,
    COALESCE(m.agent_active, 0) as moderator_active,
    COALESCE(m.frequency, '1w') as moderator_frequency
FROM core_user_wallets u
LEFT JOIN trader_config t ON u.wallet_address = t.wallet_address
LEFT JOIN rebalancer_config r ON u.wallet_address = r.wallet_address
LEFT JOIN research_config res ON u.wallet_address = res.wallet_address
LEFT JOIN moderator_config m ON u.wallet_address = m.wallet_address;


-- ============================================================================
-- AGENT RUNS & EVENT STREAMING TABLES (Resilient Decoupled Pipeline)
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_runs (
  run_id        TEXT PRIMARY KEY,
  wallet        TEXT NOT NULL,
  agent_type    TEXT NOT NULL,
  status        TEXT NOT NULL,
  title         TEXT,
  params_json   TEXT,
  result_json   TEXT,
  cid           TEXT,
  error         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_wallet_type ON agent_runs(wallet, agent_type, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_run_events (
  run_id        TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  event_json    TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (run_id, seq)
);
