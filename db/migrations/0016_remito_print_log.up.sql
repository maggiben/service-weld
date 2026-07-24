-- Remito controlled print log (docs/specs/remitos.md §15).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'print_copy_kind') THEN
        CREATE TYPE print_copy_kind AS ENUM (
            'ORIGINAL', 'DUPLICADO', 'TRIPLICADO', 'REIMPRESION'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS remito_print_log (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    remito_id        bigint NOT NULL REFERENCES delivery_note(id),
    copy_kind        print_copy_kind NOT NULL,
    reprint_seq      integer,
    reason           text,
    printed_by       bigint REFERENCES app_user(id),
    printed_at       timestamptz NOT NULL DEFAULT now(),
    pdf_object_ref   text,
    content_version  integer,
    CONSTRAINT ck_remito_print_reprint CHECK (
        (copy_kind = 'REIMPRESION' AND reprint_seq IS NOT NULL AND reason IS NOT NULL AND length(trim(reason)) > 0)
        OR (copy_kind <> 'REIMPRESION' AND reprint_seq IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_remito_print_log_remito
    ON remito_print_log (remito_id, printed_at DESC);

DROP TRIGGER IF EXISTS trg_audit_remito_print_log ON remito_print_log;
CREATE TRIGGER trg_audit_remito_print_log
    AFTER INSERT OR UPDATE OR DELETE ON remito_print_log
    FOR EACH ROW EXECUTE FUNCTION fn_audit();
