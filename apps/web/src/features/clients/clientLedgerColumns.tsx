"use client";

import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import type { GridColDef } from "@mui/x-data-grid";
import type { ClientAccountOutstandingRow, MovementEvent } from "@weld/schemas";
import type { TFunction } from "i18next";
import NextLink from "next/link";
import { displayRentalDays } from "../movements/displayRentalDays";
import {
  formatLedgerDate,
  clientCustodyLabel,
  movementStateChipColor,
} from "./clientLedgerLogic";

export { formatLedgerDate, clientCustodyLabel };

type ColumnOpts = {
  compact?: boolean;
};

export function buildOutstandingColumns(
  translate: TFunction,
  opts: ColumnOpts = {},
): GridColDef<ClientAccountOutstandingRow>[] {
  const wrap = opts.compact
    ? { gas: 90, kind: 110, delivery: 130, days: 120, state: 130 }
    : { gas: 100, kind: 120, delivery: 140, days: 130, state: 140 };

  return [
    {
      field: "serial",
      headerName: translate("clients.detail.columns.serial"),
      flex: 1,
      minWidth: opts.compact ? 110 : 120,
      renderCell: (params) => (
        <Link
          component={NextLink}
          href={`/cylinders/${params.row.cylinder_id}`}
          underline="hover"
        >
          {params.value}
        </Link>
      ),
    },
    {
      field: "gas_code",
      headerName: translate("clients.detail.columns.gas"),
      width: wrap.gas,
      valueFormatter: (value: string | null) => value ?? "—",
    },
    {
      field: "movement_kind",
      headerName: translate("clients.detail.columns.kind"),
      width: wrap.kind,
      valueFormatter: (value: string) =>
        translate(`enums.movement_kind.${value}`),
    },
    {
      field: "delivery_date",
      headerName: translate("clients.detail.columns.delivery"),
      width: wrap.delivery,
      valueFormatter: (value: string) => formatLedgerDate(value),
    },
    {
      field: "accrued_days",
      headerName: translate("clients.detail.columns.accrued_days"),
      width: wrap.days,
      type: "number",
      renderCell: (params) => (
        <Chip
          size="small"
          label={params.value}
          color={
            params.value >= 90
              ? "error"
              : params.value >= 30
                ? "warning"
                : "default"
          }
        />
      ),
    },
    {
      field: "custody",
      headerName: translate("clients.detail.columns.state"),
      width: wrap.state,
      sortable: false,
      valueGetter: (_v, row) => row.movement_kind,
      renderCell: (params) => (
        <Chip
          size="small"
          label={
            params.row.movement_kind === "REFILL"
              ? translate("clients.detail.custody.refill_open")
              : translate("clients.detail.custody.on_loan")
          }
          color="warning"
        />
      ),
    },
  ];
}

export function buildHistoryColumns(
  translate: TFunction,
  tab: "history" | "rentals" | "refills",
  opts: ColumnOpts = {},
): GridColDef<MovementEvent>[] {
  const wrap = opts.compact
    ? {
        gas: 90,
        kind: 110,
        delivery: 130,
        ret: 130,
        days: 110,
        state: 130,
      }
    : {
        gas: 100,
        kind: 120,
        delivery: 140,
        ret: 140,
        days: 120,
        state: 140,
      };

  const cols: GridColDef<MovementEvent>[] = [
    {
      field: "cylinder_serial",
      headerName: translate("clients.detail.columns.serial"),
      flex: 1,
      minWidth: opts.compact ? 110 : 120,
      renderCell: (params) => (
        <Link
          component={NextLink}
          href={`/cylinders/${params.row.cylinder_id}`}
          underline="hover"
        >
          {params.value ?? params.row.cylinder_id}
        </Link>
      ),
    },
    {
      field: "gas_code",
      headerName: translate("clients.detail.columns.gas"),
      width: wrap.gas,
      valueFormatter: (value: string | null) => value ?? "—",
    },
    {
      field: "movement_kind",
      headerName: translate("clients.detail.columns.kind"),
      width: wrap.kind,
      valueFormatter: (value: string) =>
        translate(`enums.movement_kind.${value}`),
    },
    {
      field: "delivery_date",
      headerName: translate("clients.detail.columns.delivery"),
      width: wrap.delivery,
      valueFormatter: (value: string) => formatLedgerDate(value),
    },
    {
      field: "return_date",
      headerName: translate("clients.detail.columns.return"),
      width: wrap.ret,
      valueFormatter: (value: string | null) => formatLedgerDate(value),
    },
  ];

  // REFILL = client-owned refill cycle — rental days do not apply.
  if (tab !== "refills") {
    cols.push({
      field: "rental_days",
      headerName: translate("clients.detail.columns.rental_days"),
      width: wrap.days,
      type: "number",
      valueGetter: (_v, row) => displayRentalDays(row),
    });
  }

  cols.push({
    field: "state",
    headerName: translate("clients.detail.columns.state"),
    width: wrap.state,
    renderCell: (params) => {
      const returned = params.row.return_date != null;
      return (
        <Chip
          size="small"
          label={clientCustodyLabel(params.row, translate)}
          color={movementStateChipColor(params.row.state, returned)}
        />
      );
    },
  });

  return cols;
}
