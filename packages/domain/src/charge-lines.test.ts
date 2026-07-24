import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  countRentedCylinders,
  countSoldCylinders,
  invoiceCylinderDays,
  isDayChargeLine,
  isRentalCylinderChargeLine,
  isSaleChargeLine,
} from "./charge-lines";

describe("charge-lines", () => {
  const rental = {
    quantity: 2,
    unit: "day",
    unit_price: 85,
    source_table: "movement_event",
  };
  const sale = {
    quantity: 1,
    unit: "unit",
    unit_price: 21_000,
    source_table: "cylinder_sale",
  };
  const accessory = {
    quantity: 3,
    unit: "day",
    unit_price: 10,
    source_table: "accessory_rental",
  };
  const fill = {
    quantity: 1,
    unit: "fill",
    unit_price: 500,
    source_table: "movement_event",
  };

  it("classifies day, sale, and rental-cylinder lines", () => {
    assert.equal(isDayChargeLine(rental), true);
    assert.equal(isDayChargeLine(sale), false);
    assert.equal(isSaleChargeLine(sale), true);
    assert.equal(isSaleChargeLine(rental), false);
    assert.equal(isRentalCylinderChargeLine(rental), true);
    assert.equal(isRentalCylinderChargeLine(accessory), false);
    assert.equal(isRentalCylinderChargeLine(fill), false);
  });

  it("counts rented/sold cylinders and cylinder-days without mixing sales", () => {
    const lines = [rental, sale, accessory, fill];
    assert.equal(countRentedCylinders(lines), 1);
    assert.equal(countSoldCylinders(lines), 1);
    assert.equal(invoiceCylinderDays(lines), 5);
    assert.equal(invoiceCylinderDays(null), 0);
  });
});
