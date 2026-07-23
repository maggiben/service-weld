import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_DEPOT_SEED_ID,
  defaultCapacityUnitForGas,
  emptyRegisterCylinderValues,
  findCylinderBySerial,
  hasSerialNumber,
  prefillRegisterFromCylinder,
  resolveDefaultTerritoryId,
} from "./cylinderFormLogic";

describe("cylinderFormLogic", () => {
  it("defaults weight gases to KG and others to M3", () => {
    assert.equal(defaultCapacityUnitForGas("ACET"), "KG");
    assert.equal(defaultCapacityUnitForGas("CO2"), "KG");
    assert.equal(defaultCapacityUnitForGas("THERMOLENE"), "KG");
    assert.equal(defaultCapacityUnitForGas("O2"), "M3");
    assert.equal(defaultCapacityUnitForGas("ATAL"), "M3");
    assert.equal(defaultCapacityUnitForGas(null), "M3");
  });

  it("starts register form empty with EMPTY condition", () => {
    const values = emptyRegisterCylinderValues(3);
    assert.equal(values.gas_code, null);
    assert.equal(values.capacity_m3, null);
    assert.equal(values.capacity_unit, "M3");
    assert.equal(values.condition, "EMPTY");
    assert.equal(values.home_territory_id, 3);
  });

  it("resolves Chacabuco as default depot", () => {
    assert.equal(
      resolveDefaultTerritoryId([
        { id: 1, name: "Junín" },
        { id: 2, name: "Chacabuco" },
      ]),
      2,
    );
    assert.equal(resolveDefaultTerritoryId([]), DEFAULT_DEPOT_SEED_ID);
  });

  it("gates the form on serial presence", () => {
    assert.equal(hasSerialNumber(""), false);
    assert.equal(hasSerialNumber("   "), false);
    assert.equal(hasSerialNumber("309817"), true);
  });

  it("prefills full cylinders and leaves gas free when empty", () => {
    assert.deepEqual(
      prefillRegisterFromCylinder({
        condition: "FULL",
        state: "IN_STOCK_FULL",
        gas_code: "ACET",
        capacity_m3: 5,
        capacity_unit: "KG",
      }),
      {
        gas_code: "ACET",
        capacity_m3: 5,
        capacity_unit: "KG",
        condition: "FULL",
        lockGas: true,
        lockCapacity: true,
      },
    );
    assert.deepEqual(
      prefillRegisterFromCylinder({
        condition: "EMPTY",
        state: "IN_STOCK_EMPTY",
        gas_code: "O2",
        capacity_m3: 10,
        capacity_unit: "M3",
      }),
      {
        gas_code: null,
        capacity_m3: 10,
        capacity_unit: "M3",
        condition: "EMPTY",
        lockGas: false,
        lockCapacity: true,
      },
    );
  });

  it("finds exact serial matches preferring owner", () => {
    const rows = [
      {
        id: 1,
        owner_party_id: 2,
        serial_number: "ABC",
        gas_code: "O2",
        capacity_m3: null,
        capacity_unit: "M3" as const,
        ownership_basis: "SUPPLIER" as const,
        packaging: "SINGLE" as const,
        battery_id: null,
        home_territory_id: null,
        state: "IN_STOCK_EMPTY" as const,
        condition: "EMPTY" as const,
        acquisition_date: null,
        version: 1,
      },
      {
        id: 2,
        owner_party_id: 1,
        serial_number: "ABC",
        gas_code: "ACET",
        capacity_m3: 5,
        capacity_unit: "KG" as const,
        ownership_basis: "OURS" as const,
        packaging: "SINGLE" as const,
        battery_id: null,
        home_territory_id: 2,
        state: "IN_STOCK_FULL" as const,
        condition: "FULL" as const,
        acquisition_date: null,
        version: 1,
      },
    ];
    assert.equal(findCylinderBySerial(rows, "abc", 1)?.id, 2);
    assert.equal(findCylinderBySerial(rows, "ABC")?.id, 1);
    assert.equal(findCylinderBySerial(rows, "nope"), null);
  });
});
