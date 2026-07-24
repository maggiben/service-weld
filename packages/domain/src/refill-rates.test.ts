import assert from "node:assert/strict";
import {
  refillChargeAmount,
  resolveRefillPrice,
  resolveRefillUnitPrice,
} from "./refill-rates";
import { Money } from "./value-objects";

describe("resolveRefillPrice", () => {
  const rates = [
    {
      id: 1,
      gas_code: null,
      capacity_m3: null,
      capacity_unit: "M3" as const,
      amount: 500,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 2,
      gas_code: "O2",
      capacity_m3: null,
      capacity_unit: "M3" as const,
      amount: 900,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 3,
      gas_code: "O2",
      capacity_m3: 10,
      capacity_unit: "M3" as const,
      amount: 1200,
      effective_from: "2020-01-01",
      effective_to: null,
    },
  ];

  it("prefers gas+size over gas", () => {
    const hit = resolveRefillPrice(rates, "O2", "2024-01-01", 10, "M3");
    assert.equal(hit?.id, 3);
  });

  it("prefers gas over global when size does not match", () => {
    const hit = resolveRefillPrice(rates, "O2", "2024-01-01", 6, "M3");
    assert.equal(hit?.id, 2);
  });

  it("falls back to global when no gas match", () => {
    const hit = resolveRefillPrice(rates, "N2", "2024-01-01", null, null);
    assert.equal(hit?.id, 1);
  });

  it("ignores rates outside effective window", () => {
    const dated = [
      {
        ...rates[0]!,
        id: 9,
        effective_from: "2025-01-01",
        effective_to: null,
      },
    ];
    const hit = resolveRefillPrice(dated, "O2", "2024-06-01", 10, "M3");
    assert.equal(hit, null);
  });
});

describe("resolveRefillUnitPrice", () => {
  const rates = [
    {
      id: 1,
      gas_code: "CO2",
      capacity_m3: 10,
      capacity_unit: "KG" as const,
      amount: 3500,
      effective_from: "2024-06-01",
      effective_to: null,
    },
  ];

  it("returns Money for a matching fill", () => {
    const price = resolveRefillUnitPrice({
      rates,
      gasCode: "CO2",
      capacityM3: 10,
      capacityUnit: "KG",
      deliveryDate: "2024-07-01",
      periodStart: "2024-07-01",
      periodEnd: "2024-07-31",
    });
    assert.equal(price?.amount, 3500);
  });

  it("returns null when no rate matches", () => {
    const price = resolveRefillUnitPrice({
      rates,
      gasCode: "O2",
      capacityM3: 10,
      capacityUnit: "M3",
      deliveryDate: "2024-07-01",
      periodStart: "2024-07-01",
      periodEnd: "2024-07-31",
    });
    assert.equal(price, null);
  });

  it("falls back to period-end rate when delivery predates the rate", () => {
    const price = resolveRefillUnitPrice({
      rates,
      gasCode: "CO2",
      capacityM3: 10,
      capacityUnit: "KG",
      deliveryDate: "2024-01-15",
      periodStart: "2024-01-01",
      periodEnd: "2024-07-31",
    });
    assert.equal(price?.amount, 3500);
  });
});

describe("refillChargeAmount", () => {
  it("passes through rounded Money", () => {
    assert.equal(refillChargeAmount(Money.of(1234.56)).amount, 1234.56);
  });
});
