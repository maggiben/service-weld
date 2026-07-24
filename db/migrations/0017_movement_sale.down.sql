-- Reverse 0015_movement_sale: rebuild movement_kind without 'SALE'.
-- PostgreSQL cannot drop an enum value in place, so recreate the type.
-- Fails intentionally if any SALE rows remain (clean them up first).

ALTER TABLE movement_event DROP CONSTRAINT IF EXISTS ck_move_kind_basis;
ALTER TABLE movement_event ALTER COLUMN movement_kind TYPE text;

DROP TYPE IF EXISTS movement_kind;
CREATE TYPE movement_kind AS ENUM ('RENTAL','REFILL');

ALTER TABLE movement_event
    ALTER COLUMN movement_kind TYPE movement_kind USING movement_kind::movement_kind;
ALTER TABLE movement_event
    ADD CONSTRAINT ck_move_kind_basis
    CHECK ((movement_kind='REFILL') = (property_basis='CUSTOMER'));
