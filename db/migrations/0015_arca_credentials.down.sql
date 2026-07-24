-- Rollback ARCA credentials (docs/specs/arca-integration.md).

DROP TRIGGER IF EXISTS trg_audit_arca_credentials ON arca_credentials;
DROP TRIGGER IF EXISTS trg_touch_arca_credentials ON arca_credentials;
DROP FUNCTION IF EXISTS fn_audit_arca_credentials();
DROP TABLE IF EXISTS arca_credentials;

DELETE FROM system_setting
WHERE key IN (
    'arca_testing_mode',
    'arca_company_cuit',
    'arca_company_legal_name',
    'arca_company_alias',
    'arca_point_of_sale'
);

DROP TYPE IF EXISTS arca_environment;
