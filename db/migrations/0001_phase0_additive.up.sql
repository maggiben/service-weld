-- =====================================================================
-- Migration 0001 — Phase 0 additive changes
-- Implements ADR decisions D-1, D-5, D-6, D-8 (see specs/DECISIONS.md).
-- ADDITIVE ONLY: new nullable columns + new tables. No ledger rewrite.
-- Apply AFTER schema.sql on a fresh DB, or via node-pg-migrate in order.
-- Idempotent (IF NOT EXISTS) so re-runs are safe.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- D-1  CLIENT role deferred to Phase 2 — but link app_user -> party now
--       so the future self-service portal is a clean additive step.
-- ---------------------------------------------------------------------
ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS party_id bigint REFERENCES party(id);
CREATE INDEX IF NOT EXISTS ix_app_user_party ON app_user(party_id);

-- ---------------------------------------------------------------------
-- D-5  Battery / multi-serial movements move as a group.
--       - movement_group_id groups cylinders delivered/returned together
--         (a battery, or a legacy multi-serial cell).
--       - battery_id links the group to the battery when applicable.
--       Single-custody (BR-01) remains enforced per member by
--       ex_move_no_overlap; no change to that constraint.
-- ---------------------------------------------------------------------
ALTER TABLE movement_event
    ADD COLUMN IF NOT EXISTS movement_group_id uuid,
    ADD COLUMN IF NOT EXISTS battery_id bigint REFERENCES cylinder_battery(id);
CREATE INDEX IF NOT EXISTS ix_move_group   ON movement_event(movement_group_id)
    WHERE movement_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_move_battery ON movement_event(battery_id)
    WHERE battery_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- D-6  Generic idempotency store for ALL creating POSTs (not just
--       movement_event.request_id). An interceptor short-circuits a
--       repeated Idempotency-Key and returns the stored response.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS idempotency_key (
    key               text PRIMARY KEY,
    user_id           bigint REFERENCES app_user(id),
    endpoint          text NOT NULL,
    request_hash      text NOT NULL,       -- hash of method+path+body
    response_snapshot jsonb,               -- captured success response
    status_code       integer,
    created_at        timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_idem_expires ON idempotency_key(expires_at);
CREATE INDEX IF NOT EXISTS ix_idem_user    ON idempotency_key(user_id);

-- ---------------------------------------------------------------------
-- D-8  Auth persistence: refresh-token rotation/revocation + MFA (TOTP).
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS refresh_token (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     bigint NOT NULL REFERENCES app_user(id),
    token_hash  text NOT NULL,             -- store only the hash
    issued_at   timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,               -- non-null = revoked/rotated
    user_agent  text,
    ip          inet
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_token_hash ON refresh_token(token_hash);
CREATE INDEX IF NOT EXISTS ix_refresh_user_active ON refresh_token(user_id) WHERE revoked_at IS NULL;

ALTER TABLE app_user
    ADD COLUMN IF NOT EXISTS mfa_secret     text,        -- encrypted TOTP secret
    ADD COLUMN IF NOT EXISTS mfa_enrolled_at timestamptz;

CREATE TABLE IF NOT EXISTS mfa_recovery_code (
    id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id   bigint NOT NULL REFERENCES app_user(id),
    code_hash text NOT NULL,
    used_at   timestamptz
);
CREATE INDEX IF NOT EXISTS ix_mfa_recovery_user ON mfa_recovery_code(user_id) WHERE used_at IS NULL;

COMMIT;
