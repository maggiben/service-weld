-- ARCA credentials + testing-mode setting (docs/specs/arca-integration.md M0).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'arca_environment') THEN
        CREATE TYPE arca_environment AS ENUM ('HOMOLOGATION', 'PRODUCTION');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS arca_credentials (
    id                        bigserial PRIMARY KEY,
    company_id                bigint NOT NULL DEFAULT 1,
    environment               arca_environment NOT NULL,
    cuit                      text NOT NULL,
    certificate_encrypted     text,
    private_key_encrypted     text,
    csr_pem                   text,
    certificate_fingerprint   text,
    valid_until               timestamptz,
    last_validation           timestamptz,
    last_authentication       timestamptz,
    last_connection_status    text,
    last_connection_error     text,
    created_at                timestamptz NOT NULL DEFAULT now(),
    updated_at                timestamptz NOT NULL DEFAULT now(),
    version                   integer NOT NULL DEFAULT 1,
    created_by                bigint REFERENCES app_user(id),
    updated_by                bigint REFERENCES app_user(id),
    deleted_at                timestamptz,
    CONSTRAINT ck_arca_cuit_digits CHECK (cuit ~ '^\d{11}$'),
    CONSTRAINT ck_arca_connection_status CHECK (
        last_connection_status IS NULL
        OR last_connection_status IN ('NOT_CONFIGURED', 'CONNECTED', 'FAILED')
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_arca_credentials_company_env
    ON arca_credentials (company_id, environment)
    WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_touch_arca_credentials ON arca_credentials;
CREATE TRIGGER trg_touch_arca_credentials
    BEFORE UPDATE ON arca_credentials
    FOR EACH ROW EXECUTE FUNCTION fn_touch_row();

-- Audit with secret columns redacted (R-53).
CREATE OR REPLACE FUNCTION fn_audit_arca_credentials() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    v_before jsonb;
    v_after  jsonb;
    v_id     bigint;
    v_action audit_action;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_before := NULL;
        v_after := to_jsonb(NEW);
        v_action := 'INSERT';
    ELSIF TG_OP = 'UPDATE' THEN
        v_before := to_jsonb(OLD);
        v_after := to_jsonb(NEW);
        v_action := 'UPDATE';
    ELSE
        v_before := to_jsonb(OLD);
        v_after := NULL;
        v_action := 'DELETE';
    END IF;

    IF v_before IS NOT NULL THEN
        v_before := v_before
            || jsonb_build_object(
                'certificate_encrypted',
                CASE WHEN v_before ? 'certificate_encrypted'
                     AND v_before->>'certificate_encrypted' IS NOT NULL
                    THEN '«redacted»' ELSE NULL END,
                'private_key_encrypted',
                CASE WHEN v_before ? 'private_key_encrypted'
                     AND v_before->>'private_key_encrypted' IS NOT NULL
                    THEN '«redacted»' ELSE NULL END
            );
    END IF;
    IF v_after IS NOT NULL THEN
        v_after := v_after
            || jsonb_build_object(
                'certificate_encrypted',
                CASE WHEN v_after ? 'certificate_encrypted'
                     AND v_after->>'certificate_encrypted' IS NOT NULL
                    THEN '«redacted»' ELSE NULL END,
                'private_key_encrypted',
                CASE WHEN v_after ? 'private_key_encrypted'
                     AND v_after->>'private_key_encrypted' IS NOT NULL
                    THEN '«redacted»' ELSE NULL END
            );
    END IF;

    v_id := COALESCE(v_after->>'id', v_before->>'id')::bigint;
    INSERT INTO audit_log(
        actor_user_id, actor_role, action, entity_table, entity_id,
        before, after, source
    )
    VALUES (
        NULLIF(current_setting('app.current_user_id', true), '')::bigint,
        NULLIF(current_setting('app.current_role_code', true), ''),
        v_action, TG_TABLE_NAME, v_id, v_before, v_after,
        NULLIF(current_setting('app.source', true), '')
    );
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_arca_credentials ON arca_credentials;
CREATE TRIGGER trg_audit_arca_credentials
    AFTER INSERT OR UPDATE OR DELETE ON arca_credentials
    FOR EACH ROW EXECUTE FUNCTION fn_audit_arca_credentials();

INSERT INTO system_setting (key, value)
VALUES ('arca_testing_mode', 'true')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_setting (key, value)
VALUES ('arca_company_cuit', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_setting (key, value)
VALUES ('arca_company_legal_name', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_setting (key, value)
VALUES ('arca_company_alias', '')
ON CONFLICT (key) DO NOTHING;

INSERT INTO system_setting (key, value)
VALUES ('arca_point_of_sale', '1')
ON CONFLICT (key) DO NOTHING;
