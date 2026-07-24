import assert from "node:assert/strict";
import type {
  FleetRow,
  FloatAgingRow,
  LossReportRow,
  RentalReportRow,
} from "@weld/schemas";
import {
  agingBucketChartData,
  collectFloatAgingPages,
  currentPeriodRange,
  fleetChartData,
  fleetKpisFromStateRows,
  formatArs,
  lossTotalCount,
  rentalTotals,
  refillChartByGas,
  refillTotals,
  revenueHeatColor,
  revenueHeatColors,
  shortenChartLabel,
  sumFleetCounts,
  topClientsByRevenue,
  yearRevenueSlice,
  yearSlices,
} from "./dashboardLogic";

function fleet(
  partial: Partial<FleetRow> & { group_key: string; count: number },
): FleetRow {
  return partial as FleetRow;
}

describe("dashboardLogic", () => {
  it("sums fleet and builds KPIs from state rows", () => {
    const rows = [
      fleet({ group_key: "IN_STOCK_FULL", state: "IN_STOCK_FULL", count: 40 }),
      fleet({
        group_key: "IN_STOCK_EMPTY",
        state: "IN_STOCK_EMPTY",
        count: 10,
      }),
      fleet({ group_key: "AT_CLIENT", state: "AT_CLIENT", count: 30 }),
      fleet({ group_key: "AT_SUPPLIER", state: "AT_SUPPLIER", count: 5 }),
      fleet({ group_key: "LOST", state: "LOST", count: 2 }),
      fleet({ group_key: "BROKEN", state: "BROKEN", count: 3 }),
    ];
    assert.equal(sumFleetCounts(rows), 90);
    assert.deepEqual(fleetKpisFromStateRows(rows), {
      total: 90,
      in_stock: 50,
      at_client: 30,
      at_supplier: 5,
      lost_or_broken: 5,
      float_utilization_pct: 33.3,
    });
  });

  it("builds labeled chart data for fleet and aging buckets", () => {
    const fleetRows = [
      fleet({ group_key: "O2", gas_code: "O2", count: 12 }),
      fleet({ group_key: "CO2", gas_code: "CO2", count: 8 }),
      fleet({ group_key: "O2", gas_code: "O2", count: 3 }),
    ];
    assert.deepEqual(
      fleetChartData(fleetRows, "gas_code", (id) => `gas:${id}`),
      [
        { id: "O2", label: "gas:O2", value: 15 },
        { id: "CO2", label: "gas:CO2", value: 8 },
      ],
    );

    const aging: FloatAgingRow[] = [
      {
        movement_id: 1,
        cylinder_id: 1,
        serial_number: "A",
        client_party_id: 1,
        client_name: "Acme",
        delivery_date: "2026-01-01",
        days_out: 10,
        bucket: "≤30",
      },
      {
        movement_id: 2,
        cylinder_id: 2,
        serial_number: "B",
        client_party_id: 2,
        client_name: "Beta",
        delivery_date: "2025-01-01",
        days_out: 100,
        bucket: ">90",
      },
      {
        movement_id: 3,
        cylinder_id: 3,
        serial_number: "C",
        client_party_id: 3,
        client_name: "Gamma",
        delivery_date: "2025-06-01",
        days_out: 40,
        bucket: ">30",
      },
    ];
    assert.deepEqual(agingBucketChartData(aging), [
      { id: "≤30", label: "≤30", value: 1 },
      { id: ">30", label: ">30", value: 1 },
      { id: ">90", label: ">90", value: 1 },
      { id: ">180", label: ">180", value: 0 },
      { id: ">365", label: ">365", value: 0 },
    ]);
  });

  it("aggregates rental revenue and top clients", () => {
    const rows: RentalReportRow[] = [
      {
        client_party_id: 1,
        client_name: "Acme",
        gas_code: "O2",
        rental_days: 10,
        revenue: 1000,
        movement_count: 2,
      },
      {
        client_party_id: 1,
        client_name: "Acme",
        gas_code: "CO2",
        rental_days: 5,
        revenue: 250,
        movement_count: 1,
      },
      {
        client_party_id: 2,
        client_name: "Beta",
        gas_code: "O2",
        rental_days: 3,
        revenue: 900,
        movement_count: 1,
      },
    ];
    assert.deepEqual(rentalTotals(rows), {
      revenue: 2150,
      rental_days: 18,
      movement_count: 4,
      client_count: 2,
    });
    assert.deepEqual(topClientsByRevenue(rows, 1), [
      { id: "1", label: "Acme", value: 1250 },
    ]);
    assert.deepEqual(
      topClientsByRevenue(rows, 2, [
        {
          client_party_id: 2,
          client_name: "Beta",
          gas_code: "O2",
          refill_count: 2,
          revenue: 500,
        },
      ]),
      [
        { id: "2", label: "Beta", value: 1400 },
        { id: "1", label: "Acme", value: 1250 },
      ],
    );
    assert.deepEqual(yearRevenueSlice(1000.4, 250.6), {
      rental: 1000,
      refill: 251,
    });
  });

  it("aggregates refill count and revenue by gas", () => {
    const rows = [
      {
        client_party_id: 1,
        client_name: "Acme",
        gas_code: "O2" as const,
        refill_count: 3,
        revenue: 3600,
      },
      {
        client_party_id: 2,
        client_name: "Beta",
        gas_code: "O2" as const,
        refill_count: 1,
        revenue: 1200,
      },
      {
        client_party_id: 2,
        client_name: "Beta",
        gas_code: "CO2" as const,
        refill_count: 2,
        revenue: 2000,
      },
    ];
    assert.deepEqual(refillTotals(rows), {
      revenue: 6800,
      refill_count: 6,
      client_count: 2,
    });
    assert.deepEqual(refillChartByGas(rows), [
      { id: "O2", label: "O2", count: 4, revenue: 4800 },
      { id: "CO2", label: "CO2", count: 2, revenue: 2000 },
    ]);
  });

  it("sums losses and formats ARS", () => {
    const rows: LossReportRow[] = [
      {
        owner_party_id: 1,
        owner_name: "Self",
        ownership_basis: "OURS",
        state: "LOST",
        count: 2,
        liability: "OURS",
      },
      {
        owner_party_id: 1,
        owner_name: "Self",
        ownership_basis: "OURS",
        state: "BROKEN",
        count: 1,
        liability: "CUSTOMER",
      },
    ];
    assert.equal(lossTotalCount(rows), 3);
    assert.equal(formatArs(1500), "1.500 ARS");
    assert.equal(formatArs(22131, "es-AR"), "22.131 ARS");
  });

  it("pages float-aging until exhausted", async () => {
    const pages = [
      {
        data: [
          {
            movement_id: 1,
            cylinder_id: 1,
            serial_number: "A",
            client_party_id: 1,
            client_name: "Acme",
            delivery_date: "2026-01-01",
            days_out: 10,
            bucket: "≤30" as const,
          },
        ],
        page: { has_more: true, next_cursor: "c1" },
      },
      {
        data: [
          {
            movement_id: 2,
            cylinder_id: 2,
            serial_number: "B",
            client_party_id: 2,
            client_name: "Beta",
            delivery_date: "2025-01-01",
            days_out: 100,
            bucket: ">90" as const,
          },
        ],
        page: { has_more: false, next_cursor: null },
      },
    ];
    let calls = 0;
    const rows = await collectFloatAgingPages(async (cursor) => {
      const page = pages[calls]!;
      calls += 1;
      if (calls === 1) assert.equal(cursor, undefined);
      else assert.equal(cursor, "c1");
      return page;
    });
    assert.equal(rows.length, 2);
    assert.equal(calls, 2);
  });

  it("builds year slices for month, quarter and semester", () => {
    const asOf = "2026-07-23";
    const months = yearSlices(2026, "month", asOf);
    assert.equal(months.length, 7);
    assert.equal(months[0]?.start, "2026-01-01");
    assert.equal(months[6]?.end, "2026-07-23");

    const quarters = yearSlices(2026, "quarter", asOf);
    assert.equal(quarters.length, 3);
    assert.equal(quarters[2]?.id, "2026-q3");
    assert.equal(quarters[2]?.end, "2026-07-23");

    const halves = yearSlices(2026, "semester", asOf);
    assert.equal(halves.length, 2);
    assert.equal(halves[1]?.start, "2026-07-01");
  });

  it("widens KPI presets: month < quarter < semester lookback", () => {
    const asOf = "2026-07-23";
    assert.deepEqual(currentPeriodRange("month", asOf), {
      start: "2026-07-01",
      end: "2026-07-23",
    });
    assert.deepEqual(currentPeriodRange("quarter", asOf), {
      start: "2026-05-01",
      end: "2026-07-23",
    });
    assert.deepEqual(currentPeriodRange("semester", asOf), {
      start: "2026-02-01",
      end: "2026-07-23",
    });

    const mid = "2026-08-15";
    assert.deepEqual(currentPeriodRange("month", mid), {
      start: "2026-08-01",
      end: "2026-08-15",
    });
    assert.deepEqual(currentPeriodRange("quarter", mid), {
      start: "2026-06-01",
      end: "2026-08-15",
    });
    assert.deepEqual(currentPeriodRange("semester", mid), {
      start: "2026-03-01",
      end: "2026-08-15",
    });
  });

  it("lookback presets cross the year boundary", () => {
    const asOf = "2026-02-10";
    assert.deepEqual(currentPeriodRange("month", asOf), {
      start: "2026-02-01",
      end: "2026-02-10",
    });
    assert.deepEqual(currentPeriodRange("quarter", asOf), {
      start: "2025-12-01",
      end: "2026-02-10",
    });
    assert.deepEqual(currentPeriodRange("semester", asOf), {
      start: "2025-09-01",
      end: "2026-02-10",
    });
  });

  it("maps revenue to a muted→saturated green scale", () => {
    assert.equal(revenueHeatColor(0), "hsl(122 28% 72%)");
    assert.equal(revenueHeatColor(1), "hsl(122 70% 32%)");
    assert.deepEqual(
      revenueHeatColors([
        { id: "1", label: "Low", value: 100 },
        { id: "2", label: "High", value: 900 },
      ]),
      ["hsl(122 28% 72%)", "hsl(122 70% 32%)"],
    );
    assert.equal(shortenChartLabel("Acme"), "Acme");
    assert.equal(
      shortenChartLabel("Cliente con nombre muy largo industrial", 20).endsWith(
        "…",
      ),
      true,
    );
  });
});
