import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billableDaysInPeriod,
  dailyUnitPrice,
  ratesOverlap,
  resolveEffectiveRate,
  rentalChargeAmount,
} from "./rates";
import { Money } from "./value-objects";

describe("resolveEffectiveRate", () => {
  const rates = [
    {
      id: 1,
      client_party_id: null,
      gas_code: null,
      period: "DAILY" as const,
      amount: 50,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 2,
      client_party_id: 10,
      gas_code: null,
      period: "DAILY" as const,
      amount: 80,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 3,
      client_party_id: 10,
      gas_code: "O2",
      period: "DAILY" as const,
      amount: 85,
      effective_from: "2020-01-01",
      effective_to: null,
    },
  ];

  it("prefers client+gas over client and global", () => {
    const hit = resolveEffectiveRate(rates, 10, "O2", "2024-01-01");
    assert.equal(hit?.id, 3);
  });

  it("falls back to client default", () => {
    const hit = resolveEffectiveRate(rates, 10, "CO2", "2024-01-01");
    assert.equal(hit?.id, 2);
  });

  it("falls back to global", () => {
    const hit = resolveEffectiveRate(rates, 99, "CO2", "2024-01-01");
    assert.equal(hit?.id, 1);
  });
});

describe("rentalChargeAmount", () => {
  it("AC3: 44 days × 85 = 3740", () => {
    const charge = rentalChargeAmount(44, Money.of(85));
    assert.equal(charge.amount, 3740);
  });

  it("same-day is zero (D-14)", () => {
    assert.equal(
      billableDaysInPeriod({
        deliveryDate: "2024-01-01",
        returnDate: "2024-01-01",
        periodStart: "2024-01-01",
        periodEnd: "2024-01-31",
      }),
      0,
    );
  });
});

describe("dailyUnitPrice", () => {
  it("monthly prorates /30", () => {
    const unit = dailyUnitPrice({
      id: 1,
      client_party_id: null,
      gas_code: null,
      period: "MONTHLY",
      amount: 3000,
      effective_from: "2020-01-01",
      effective_to: null,
    });
    assert.equal(unit.amount, 100);
  });
});

describe("ratesOverlap", () => {
  it("detects open-ended overlap", () => {
    assert.equal(
      ratesOverlap(
        { effective_from: "2020-01-01", effective_to: null },
        { effective_from: "2021-01-01", effective_to: "2021-12-31" },
      ),
      true,
    );
  });
});
