"use client";

import Chip from "@mui/material/Chip";
import type { ChipProps } from "@mui/material/Chip";
import Link from "@mui/material/Link";
import type { GridColDef } from "@mui/x-data-grid";
import type {
  ClientAccountOutstandingRow,
  MovementEvent,
  MovementState,
} from "@weld/schemas";
import type { TFunction } from "i18next";
import NextLink from "next/link";
import { displayRentalDays } from "../movements/displayRentalDays";

export function formatLedgerDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function movementStateColor(
  state: MovementState,
  returned: boolean,
): ChipProps["color"] {
  if (returned) {
    switch (state) {
      case "SWAPPED":
        return "info";
      case "LOST":
        return "error";
      case "CLOSED":
        return "success";
      default:
        return "default";
    }
  }
  return state === "OPEN" ? "warning" : "default";
}

/**
 * Client-facing custody label.
 * Rentals: on-loan / returned. Refills (customer-owned): in progress / closed —
 * never "loan" wording, since the cylinder is already theirs.
 */
export function clientCustodyLabel(
  row: Pick<MovementEvent, "state" | "return_date" | "movement_kind">,
  t: TFunction,
): string {
  const isRefill = row.movement_kind === "REFILL";
  const returned =
    row.return_date != null ||
    row.state === "CLOSED" ||
    row.state === "SWAPPED" ||
    row.state === "LOST" ||
    row.state === "SOLD";

  if (returned) {
    if (row.state === "SWAPPED") return t("enums.movement_state.SWAPPED");
    if (row.state === "LOST") return t("enums.movement_state.LOST");
    if (row.state === "SOLD") return t("enums.movement_state.SOLD");
    if (row.state === "VOID") return t("enums.movement_state.VOID");
    return isRefill
      ? t("clients.detail.custody.refill_closed")
      : t("clients.detail.custody.returned");
  }

  if (row.state === "OPEN") {
    return isRefill
      ? t("clients.detail.custody.refill_open")
      : t("clients.detail.custody.on_loan");
  }
  return t(`enums.movement_state.${row.state}`);
}

type ColumnOpts = {
  compact?: boolean;
};

export function buildOutstandingColumns(
  t: TFunction,
  opts: ColumnOpts = {},
): GridColDef<ClientAccountOutstandingRow>[] {
  const w = opts.compact
    ? { gas: 90, kind: 110, delivery: 130, days: 120, state: 130 }
    : { gas: 100, kind: 120, delivery: 140, days: 130, state: 140 };

  return [
    {
      field: "serial",
      headerName: t("clients.detail.columns.serial"),
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
      headerName: t("clients.detail.columns.gas"),
      width: w.gas,
      valueFormatter: (value: string | null) => value ?? "—",
    },
    {
      field: "movement_kind",
      headerName: t("clients.detail.columns.kind"),
      width: w.kind,
      valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
    },
    {
      field: "delivery_date",
      headerName: t("clients.detail.columns.delivery"),
      width: w.delivery,
      valueFormatter: (value: string) => formatLedgerDate(value),
    },
    {
      field: "accrued_days",
      headerName: t("clients.detail.columns.accrued_days"),
      width: w.days,
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
      headerName: t("clients.detail.columns.state"),
      width: w.state,
      sortable: false,
      valueGetter: (_v, row) => row.movement_kind,
      renderCell: (params) => (
        <Chip
          size="small"
          label={
            params.row.movement_kind === "REFILL"
              ? t("clients.detail.custody.refill_open")
              : t("clients.detail.custody.on_loan")
          }
          color="warning"
        />
      ),
    },
  ];
}

export function buildHistoryColumns(
  t: TFunction,
  tab: "history" | "rentals" | "refills",
  opts: ColumnOpts = {},
): GridColDef<MovementEvent>[] {
  const w = opts.compact
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
      headerName: t("clients.detail.columns.serial"),
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
      headerName: t("clients.detail.columns.gas"),
      width: w.gas,
      valueFormatter: (value: string | null) => value ?? "—",
    },
    {
      field: "movement_kind",
      headerName: t("clients.detail.columns.kind"),
      width: w.kind,
      valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
    },
    {
      field: "delivery_date",
      headerName: t("clients.detail.columns.delivery"),
      width: w.delivery,
      valueFormatter: (value: string) => formatLedgerDate(value),
    },
    {
      field: "return_date",
      headerName: t("clients.detail.columns.return"),
      width: w.ret,
      valueFormatter: (value: string | null) => formatLedgerDate(value),
    },
  ];

  // REFILL = client-owned refill cycle — rental days do not apply.
  if (tab !== "refills") {
    cols.push({
      field: "rental_days",
      headerName: t("clients.detail.columns.rental_days"),
      width: w.days,
      type: "number",
      valueGetter: (_v, row) => displayRentalDays(row),
    });
  }

  cols.push({
    field: "state",
    headerName: t("clients.detail.columns.state"),
    width: w.state,
    renderCell: (params) => {
      const returned = params.row.return_date != null;
      return (
        <Chip
          size="small"
          label={clientCustodyLabel(params.row, t)}
          color={movementStateColor(params.row.state, returned)}
        />
      );
    },
  });

  return cols;
}
