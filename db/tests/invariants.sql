-- =====================================================================
-- db/tests/invariants.sql — Business-rule enforcement smoke suite
-- Run against a fresh DB loaded with schema.sql + migrations.
-- Self-checking: RAISES EXCEPTION on any unmet expectation, so a
-- non-zero psql exit = a broken invariant. Wrapped in a rolled-back
-- transaction so it leaves no data behind.
--
-- Maps to specs/001 acceptance criteria and specs/003 AC2. Tag: [BR-nn].
-- =====================================================================

BEGIN;

-- Helper: assert that a statement raises (used for negative cases).
CREATE OR REPLACE FUNCTION _expect_error(sql text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    BEGIN
        EXECUTE sql;
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'OK  %  (rejected: %)', label, SQLERRM;
        RETURN;
    END;
    RAISE EXCEPTION 'FAIL % : statement was expected to error but succeeded', label;
END;
$$;

-- ---- fixtures (SELF party is seeded by schema.sql) ----
INSERT INTO locality(name, territory_id) VALUES ('Chacabuco', 2);
INSERT INTO party(party_type, display_name) VALUES ('CUSTOMER','TORRES AMERICANAS');
INSERT INTO client(party_id, cuit, cuit_valid, territory_id, coverage)
  SELECT id,'30-64401913-2',true,2,'PRIVATE' FROM party WHERE display_name='TORRES AMERICANAS';
INSERT INTO cylinder(owner_party_id, serial_number, gas_code, capacity_m3, ownership_basis, home_territory_id)
  SELECT id,'80086','ATAL',6,'OURS',2 FROM party WHERE is_self;

-- ---- [BR-03] rental_days generated column ----
INSERT INTO movement_event(cylinder_id,holder_party_id,movement_kind,property_basis,gas_code,delivery_date)
  SELECT c.id,p.id,'RENTAL','OURS','ATAL','2013-05-20' FROM cylinder c, party p
  WHERE c.serial_number='80086' AND p.display_name='TORRES AMERICANAS';
UPDATE movement_event SET return_date='2013-07-26', state='CLOSED' WHERE state='OPEN';
DO $$
DECLARE d int;
BEGIN
  SELECT rental_days INTO d FROM movement_event LIMIT 1;
  IF d <> 67 THEN RAISE EXCEPTION 'FAIL [BR-03]: expected rental_days=67, got %', d; END IF;
  RAISE NOTICE 'OK  [BR-03] rental_days=67';
END $$;

-- ---- [BR-01] single custody: open a rental, then a second overlapping open must fail ----
INSERT INTO movement_event(cylinder_id,holder_party_id,movement_kind,property_basis,gas_code,delivery_date)
  SELECT c.id,p.id,'RENTAL','OURS','ATAL','2016-08-08' FROM cylinder c, party p
  WHERE c.serial_number='80086' AND p.display_name='TORRES AMERICANAS';
SELECT _expect_error($sql$
  INSERT INTO movement_event(cylinder_id,holder_party_id,movement_kind,property_basis,gas_code,delivery_date)
  SELECT c.id,p.id,'RENTAL','OURS','ATAL','2016-09-01' FROM cylinder c, party p
  WHERE c.serial_number='80086' AND p.display_name='TORRES AMERICANAS'
$sql$, '[BR-01] single custody');

-- ---- [BR-08] REFILL on an OURS cylinder must fail ----
SELECT _expect_error($sql$
  INSERT INTO movement_event(cylinder_id,holder_party_id,movement_kind,property_basis,gas_code,delivery_date)
  SELECT c.id,p.id,'REFILL','OURS','ATAL','2018-01-01' FROM cylinder c, party p
  WHERE c.serial_number='80086' AND p.display_name='TORRES AMERICANAS'
$sql$, '[BR-08] refill-on-ours');

-- ---- [BR-04] return before delivery must fail ----
SELECT _expect_error($sql$
  UPDATE movement_event SET return_date='2016-01-01' WHERE delivery_date='2016-08-08'
$sql$, '[BR-04] return-before-delivery');

-- ---- [BR-05] future date beyond today+30 must fail (trigger) ----
SELECT _expect_error($sql$
  INSERT INTO movement_event(cylinder_id,holder_party_id,movement_kind,property_basis,gas_code,delivery_date)
  SELECT c.id,p.id,'RENTAL','OURS','ATAL',CURRENT_DATE+400 FROM cylinder c, party p
  WHERE c.serial_number='80086' AND p.display_name='TORRES AMERICANAS'
$sql$, '[BR-05] future-date');

-- ---- [BR-17] bad CUIT format must fail ----
INSERT INTO party(party_type,display_name) VALUES ('CUSTOMER','BAD CUIT CO');
SELECT _expect_error($sql$
  INSERT INTO client(party_id,cuit,territory_id) SELECT id,'123-BAD',2 FROM party WHERE display_name='BAD CUIT CO'
$sql$, '[BR-17] bad-CUIT');

-- ---- [BR-02] duplicate serial for same owner must fail ----
SELECT _expect_error($sql$
  INSERT INTO cylinder(owner_party_id,serial_number,gas_code,ownership_basis)
  SELECT id,'80086','O2','OURS' FROM party WHERE is_self
$sql$, '[BR-02] duplicate-serial-per-owner');

-- ---- [BR-07] OURS cylinder owned by a SUPPLIER party must fail (trigger) ----
SELECT _expect_error($sql$
  INSERT INTO cylinder(owner_party_id,serial_number,gas_code,ownership_basis)
  SELECT id,'999','O2','OURS' FROM party WHERE display_name='Linde'
$sql$, '[BR-07] owner<->basis');

-- ---- audit trail written ----
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM audit_log WHERE entity_table='movement_event';
  IF n < 1 THEN RAISE EXCEPTION 'FAIL [audit]: no audit rows for movement_event'; END IF;
  RAISE NOTICE 'OK  [audit] % movement_event audit rows', n;
END $$;

-- ---- SCD-2 history + version bump on client update ----
UPDATE client SET coverage='MUNICIPAL_HOSPITAL' WHERE cuit='30-64401913-2';
DO $$
DECLARE v int; h int;
BEGIN
  SELECT version INTO v FROM client WHERE cuit='30-64401913-2';
  SELECT count(*) INTO h FROM client_history;
  IF v < 2 THEN RAISE EXCEPTION 'FAIL [SCD-2]: version not bumped (got %)', v; END IF;
  IF h < 1 THEN RAISE EXCEPTION 'FAIL [SCD-2]: no client_history row'; END IF;
  RAISE NOTICE 'OK  [SCD-2] client version=% history_rows=%', v, h;
END $$;

DROP FUNCTION _expect_error(text, text);

DO $$ BEGIN RAISE NOTICE '==== ALL INVARIANT CHECKS PASSED ===='; END $$;

ROLLBACK;  -- leave no fixtures behind
