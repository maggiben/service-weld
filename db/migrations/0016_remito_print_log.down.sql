-- Rollback remito print log (docs/specs/remitos.md §15).

DROP TRIGGER IF EXISTS trg_audit_remito_print_log ON remito_print_log;
DROP TABLE IF EXISTS remito_print_log;
DROP TYPE IF EXISTS print_copy_kind;
