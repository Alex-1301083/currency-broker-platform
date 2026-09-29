-- ============================================
-- Currency Broker Platform
-- Phase 1 Database Schema
-- PostgreSQL
-- ============================================

-- ============================================
-- USERS
-- ============================================

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(30) NOT NULL DEFAULT 'user',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT users_role_check
        CHECK (role IN ('user', 'admin'))
);

-- ============================================
-- TRADING ACCOUNTS
-- ============================================

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    account_number VARCHAR(50) UNIQUE NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'USD',

    balance NUMERIC(20, 8) NOT NULL DEFAULT 0,
    equity NUMERIC(20, 8) NOT NULL DEFAULT 0,
    margin NUMERIC(20, 8) NOT NULL DEFAULT 0,
    free_margin NUMERIC(20, 8) NOT NULL DEFAULT 0,

    leverage INTEGER NOT NULL DEFAULT 100,

    status VARCHAR(30) NOT NULL DEFAULT 'active',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT accounts_status_check
        CHECK (status IN ('active', 'suspended', 'closed')),

    CONSTRAINT accounts_leverage_check
        CHECK (leverage > 0)
);

-- ============================================
-- SYMBOLS
-- ============================================

CREATE TABLE IF NOT EXISTS symbols (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    symbol VARCHAR(30) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,

    base_currency VARCHAR(10),
    quote_currency VARCHAR(10),

    asset_type VARCHAR(30) NOT NULL DEFAULT 'forex',

    bid NUMERIC(30, 10),
    ask NUMERIC(30, 10),

    spread NUMERIC(20, 10),

    digits INTEGER NOT NULL DEFAULT 5,

    contract_size NUMERIC(20, 8) NOT NULL DEFAULT 100000,

    min_lot NUMERIC(20, 8) NOT NULL DEFAULT 0.01,
    max_lot NUMERIC(20, 8) NOT NULL DEFAULT 100,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT symbols_asset_type_check
        CHECK (
            asset_type IN (
                'forex',
                'metal',
                'crypto',
                'index',
                'commodity'
            )
        )
);

-- ============================================
-- ORDERS
-- ============================================

CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL
        REFERENCES accounts(id) ON DELETE CASCADE,

    symbol_id UUID NOT NULL
        REFERENCES symbols(id),

    side VARCHAR(10) NOT NULL,

    order_type VARCHAR(30) NOT NULL,

    volume NUMERIC(20, 8) NOT NULL,

    price NUMERIC(30, 10),

    stop_loss NUMERIC(30, 10),
    take_profit NUMERIC(30, 10),

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    filled_price NUMERIC(30, 10),
    filled_volume NUMERIC(20, 8) DEFAULT 0,

    reject_reason TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT orders_side_check
        CHECK (side IN ('buy', 'sell')),

    CONSTRAINT orders_type_check
        CHECK (
            order_type IN (
                'market',
                'limit',
                'stop',
                'stop_limit'
            )
        ),

    CONSTRAINT orders_status_check
        CHECK (
            status IN (
                'pending',
                'open',
                'filled',
                'partially_filled',
                'cancelled',
                'rejected'
            )
        ),

    CONSTRAINT orders_volume_check
        CHECK (volume > 0)
);

-- ============================================
-- POSITIONS
-- ============================================

CREATE TABLE IF NOT EXISTS positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL
        REFERENCES accounts(id) ON DELETE CASCADE,

    symbol_id UUID NOT NULL
        REFERENCES symbols(id),

    side VARCHAR(10) NOT NULL,

    volume NUMERIC(20, 8) NOT NULL,

    entry_price NUMERIC(30, 10) NOT NULL,
    current_price NUMERIC(30, 10),

    stop_loss NUMERIC(30, 10),
    take_profit NUMERIC(30, 10),

    unrealized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,

    margin_used NUMERIC(20, 8) NOT NULL DEFAULT 0,

    status VARCHAR(30) NOT NULL DEFAULT 'open',

    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,

    CONSTRAINT positions_side_check
        CHECK (side IN ('buy', 'sell')),

    CONSTRAINT positions_status_check
        CHECK (status IN ('open', 'closed')),

    CONSTRAINT positions_volume_check
        CHECK (volume > 0)
);

-- ============================================
-- TRADES / EXECUTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    order_id UUID
        REFERENCES orders(id) ON DELETE SET NULL,

    account_id UUID NOT NULL
        REFERENCES accounts(id) ON DELETE CASCADE,

    symbol_id UUID NOT NULL
        REFERENCES symbols(id),

    side VARCHAR(10) NOT NULL,

    volume NUMERIC(20, 8) NOT NULL,

    execution_price NUMERIC(30, 10) NOT NULL,

    commission NUMERIC(20, 8) NOT NULL DEFAULT 0,
    swap NUMERIC(20, 8) NOT NULL DEFAULT 0,

    realized_pnl NUMERIC(20, 8) NOT NULL DEFAULT 0,

    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT trades_side_check
        CHECK (side IN ('buy', 'sell')),

    CONSTRAINT trades_volume_check
        CHECK (volume > 0)
);

-- ============================================
-- LEDGER
-- ============================================

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL
        REFERENCES accounts(id) ON DELETE CASCADE,

    entry_type VARCHAR(50) NOT NULL,

    amount NUMERIC(20, 8) NOT NULL,

    balance_before NUMERIC(20, 8) NOT NULL,
    balance_after NUMERIC(20, 8) NOT NULL,

    reference_type VARCHAR(50),
    reference_id UUID,

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- TRANSACTIONS
-- ============================================

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID NOT NULL
        REFERENCES accounts(id) ON DELETE CASCADE,

    transaction_type VARCHAR(30) NOT NULL,

    amount NUMERIC(20, 8) NOT NULL,

    currency VARCHAR(10) NOT NULL DEFAULT 'USD',

    status VARCHAR(30) NOT NULL DEFAULT 'pending',

    external_reference VARCHAR(150),

    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT transactions_type_check
        CHECK (
            transaction_type IN (
                'deposit',
                'withdrawal',
                'adjustment'
            )
        ),

    CONSTRAINT transactions_status_check
        CHECK (
            status IN (
                'pending',
                'completed',
                'failed',
                'cancelled'
            )
        )
);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID
        REFERENCES users(id) ON DELETE SET NULL,

    action VARCHAR(100) NOT NULL,

    entity_type VARCHAR(100),
    entity_id UUID,

    ip_address INET,

    metadata JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_accounts_user_id
    ON accounts(user_id);

CREATE INDEX IF NOT EXISTS idx_orders_account_id
    ON orders(account_id);

CREATE INDEX IF NOT EXISTS idx_orders_symbol_id
    ON orders(symbol_id);

CREATE INDEX IF NOT EXISTS idx_orders_status
    ON orders(status);

CREATE INDEX IF NOT EXISTS idx_positions_account_id
    ON positions(account_id);

CREATE INDEX IF NOT EXISTS idx_positions_symbol_id
    ON positions(symbol_id);

CREATE INDEX IF NOT EXISTS idx_trades_account_id
    ON trades(account_id);

CREATE INDEX IF NOT EXISTS idx_trades_symbol_id
    ON trades(symbol_id);

CREATE INDEX IF NOT EXISTS idx_ledger_account_id
    ON ledger_entries(account_id);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id
    ON transactions(account_id);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
    ON audit_logs(user_id);

-- ============================================
-- DONE
-- ============================================

SELECT 'Database schema created successfully' AS message;