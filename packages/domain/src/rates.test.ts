import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  billableDaysInPeriod,
  billingRateOnDate,
  dailyUnitPrice,
  ratesOverlap,
  resolveBillingUnitPrice,
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
      capacity_m3: null,
      period: "DAILY" as const,
      amount: 50,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 2,
      client_party_id: 10,
      gas_code: null,
      capacity_m3: null,
      period: "DAILY" as const,
      amount: 80,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 3,
      client_party_id: 10,
      gas_code: "O2",
      capacity_m3: null,
      period: "DAILY" as const,
      amount: 85,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 4,
      client_party_id: 10,
      gas_code: "O2",
      capacity_m3: 10,
      period: "DAILY" as const,
      amount: 120,
      effective_from: "2020-01-01",
      effective_to: null,
    },
    {
      id: 5,
      client_party_id: null,
      gas_code: null,
      capacity_m3: 6,
      period: "DAILY" as const,
      amount: 70,
      effective_from: "2020-01-01",
      effective_to: null,
    },
  ];

  it("prefers client+gas over client and global", () => {
    const hit = resolveEffectiveRate(rates, 10, "O2", "2024-01-01", 6);
    assert.equal(hit?.id, 3);
  });

  it("prefers client+gas+size over client+gas", () => {
    const hit = resolveEffectiveRate(rates, 10, "O2", "2024-01-01", 10);
    assert.equal(hit?.id, 4);
  });

  it("falls back to client default", () => {
    const hit = resolveEffectiveRate(rates, 10, "CO2", "2024-01-01", null);
    assert.equal(hit?.id, 2);
  });

  it("falls back to global size when no client/gas match", () => {
    const hit = resolveEffectiveRate(rates, 99, "CO2", "2024-01-01", 6);
    assert.equal(hit?.id, 5);
  });

  it("falls back to global when size unknown", () => {
    const hit = resolveEffectiveRate(rates, 99, "CO2", "2024-01-01", null);
    assert.equal(hit?.id, 1);
  });

  it("does not apply a size-specific rate to a different size", () => {
    const hit = resolveEffectiveRate(rates, 99, "CO2", "2024-01-01", 10);
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

  it("clips long-open rental to the billing period (not full life)", () => {
    // Cylinder out since 2020-07-08: ledger accrues ~2204 days to 2026-07-21,
    // but a July-2026 period invoice only bills the days inside the window.
    assert.equal(
      billableDaysInPeriod({
        deliveryDate: "2020-07-08",
        returnDate: null,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        asOfDate: "2026-07-31",
      }),
      30,
    );
  });

  it("open rental mid-period accrues to as-of, not future period end", () => {
    // Serial 323214: delivered 2026-07-21, draft for July 1–31 must not bill
    // Jul 22–31 that have not happened yet (009 AC4).
    assert.equal(
      billableDaysInPeriod({
        deliveryDate: "2026-07-21",
        returnDate: null,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        asOfDate: "2026-07-21",
      }),
      0,
    );
    assert.equal(
      billableDaysInPeriod({
        deliveryDate: "2026-07-21",
        returnDate: null,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
        asOfDate: "2026-07-25",
      }),
      4,
    );
  });

  it("history-style window bills full accrued life of an open rental", () => {
    assert.equal(
      billableDaysInPeriod({
        deliveryDate: "2020-07-08",
        returnDate: null,
        periodStart: "2020-07-08",
        periodEnd: "2026-07-21",
      }),
      2204,
    );
  });
});

describe("resolveBillingUnitPrice", () => {
  const lateGlobal = [
    {
      id: 1,
      client_party_id: null,
      gas_code: null,
      capacity_m3: null,
      period: "DAILY" as const,
      amount: 85,
      // Rate starts after a long-open delivery (real REYNOSO / 11358 case).
      effective_from: "2021-07-20",
      effective_to: null,
    },
  ];

  it("history uses tarifa vigente so pre-rate deliveries are not skipped", () => {
    const unit = resolveBillingUnitPrice({
      rates: lateGlobal,
      clientPartyId: 2205,
      gasCode: "ACET",
      capacityM3: 6,
      mode: "history",
      deliveryDate: "2020-07-08",
      periodStart: "2020-07-08",
      periodEnd: "2026-07-21",
    });
    assert.equal(unit?.amount, 85);
    assert.equal(rentalChargeAmount(2204, unit!).amount, 187_340);
  });

  it("history rate-on is period end, not delivery", () => {
    assert.equal(
      billingRateOnDate({
        mode: "history",
        deliveryDate: "2020-07-08",
        periodStart: "2020-07-08",
        periodEnd: "2026-07-21",
      }),
      "2026-07-21",
    );
  });

  it("period mode still prices at the window start (AC5)", () => {
    assert.equal(
      billingRateOnDate({
        mode: "period",
        deliveryDate: "2020-07-08",
        periodStart: "2026-07-01",
        periodEnd: "2026-07-31",
      }),
      "2026-07-01",
    );
  });
});

describe("dailyUnitPrice", () => {
  it("monthly prorates /30", () => {
    const unit = dailyUnitPrice({
      id: 1,
      client_party_id: null,
      gas_code: null,
      capacity_m3: null,
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
