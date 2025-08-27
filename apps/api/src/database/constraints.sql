-- Database constraints for Aussie Markets Ledger System
-- These constraints ensure the integrity of the double-entry ledger system

-- Function to check that transaction entries sum to zero
CREATE OR REPLACE FUNCTION check_transaction_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Check if the sum of all entries for this transaction_id equals zero
    IF (
        SELECT COALESCE(SUM(amount_cents), 0)
        FROM ledger_entries
        WHERE transaction_id = NEW.transaction_id
    ) != 0 THEN
        RAISE EXCEPTION 'Transaction entries must sum to zero. Transaction ID: %', NEW.transaction_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce transaction balance on INSERT
DROP TRIGGER IF EXISTS enforce_transaction_balance ON ledger_entries;
CREATE TRIGGER enforce_transaction_balance
    AFTER INSERT ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION check_transaction_balance();

-- Function to prevent modification of ledger entries (immutability)
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are immutable and cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

-- Triggers to prevent UPDATE and DELETE on ledger entries
DROP TRIGGER IF EXISTS prevent_ledger_update ON ledger_entries;
CREATE TRIGGER prevent_ledger_update
    BEFORE UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

DROP TRIGGER IF EXISTS prevent_ledger_delete ON ledger_entries;
CREATE TRIGGER prevent_ledger_delete
    BEFORE DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

-- Index for efficient transaction balance checking
CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction_amount 
ON ledger_entries (transaction_id, amount_cents);

-- Partial index for active accounts
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_active 
ON wallet_accounts (user_id, account_type) WHERE status = 'ACTIVE';

-- Index for efficient ledger queries by timestamp
CREATE INDEX IF NOT EXISTS idx_ledger_entries_timestamp_desc 
ON ledger_entries (timestamp DESC);

-- Index for efficient account balance queries
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_timestamp 
ON ledger_entries (account_id, timestamp DESC);

-- Constraint to ensure account balances don't go negative (optional safeguard)
ALTER TABLE wallet_accounts 
ADD CONSTRAINT chk_available_balance_non_negative 
CHECK (available_cents >= 0);

-- Constraint to ensure pending balance is non-negative
ALTER TABLE wallet_accounts 
ADD CONSTRAINT chk_pending_balance_non_negative 
CHECK (pending_cents >= 0);

-- Unique constraint on idempotency keys within scope and time window
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_key_scope_active
ON idempotency_keys (key, scope) WHERE expires_at > NOW();

-- Function to clean up expired idempotency keys
CREATE OR REPLACE FUNCTION cleanup_expired_idempotency_keys()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM idempotency_keys WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION check_transaction_balance() IS 'Ensures all ledger entries for a transaction sum to zero (double-entry requirement)';
COMMENT ON FUNCTION prevent_ledger_modification() IS 'Prevents modification or deletion of ledger entries to maintain immutability';
COMMENT ON FUNCTION cleanup_expired_idempotency_keys() IS 'Removes expired idempotency keys to keep the table clean';

COMMENT ON TRIGGER enforce_transaction_balance ON ledger_entries IS 'Validates that transaction entries balance to zero';
COMMENT ON TRIGGER prevent_ledger_update ON ledger_entries IS 'Prevents updates to immutable ledger entries';
COMMENT ON TRIGGER prevent_ledger_delete ON ledger_entries IS 'Prevents deletion of immutable ledger entries';
