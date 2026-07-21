-- =====================================================================
-- Migration 0001 — DOWN (rollback of Phase 0 additive changes)
-- Reverses D-1/D-5/D-6/D-8. Safe on a fresh/dev DB; in production these
-- objects hold data — review before running.
-- =====================================================================

BEGIN;

DROP TABLE IF EXISTS mfa_recovery_code;
ALTER TABLE app_user
    DROP COLUMN IF EXISTS mfa_enrolled_at,
    DROP COLUMN IF EXISTS mfa_secret;
DROP TABLE IF EXISTS refresh_token;

DROP TABLE IF EXISTS idempotency_key;

DROP INDEX IF EXISTS ix_move_battery;
DROP INDEX IF EXISTS ix_move_group;
ALTER TABLE movement_event
    DROP COLUMN IF EXISTS battery_id,
    DROP COLUMN IF EXISTS movement_group_id;

DROP INDEX IF EXISTS ix_app_user_party;
ALTER TABLE app_user
    DROP COLUMN IF EXISTS party_id;

COMMIT;
