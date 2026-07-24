"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridRenderCellParams,
  gridClasses,
} from "@mui/x-data-grid";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChargeLine, Invoice } from "@weld/schemas";
import {
  deferredChargeLinesTotal,
  selectedChargeLinesTotal,
} from "./billingLogic";

export interface InvoiceChargeLinesPanelProps {
  invoice: Invoice;
  /** Selected charge-line ids (bill now). */
  selection: number[];
  onSelectionChange: (ids: number[]) => void;
}

function formatMoney(value: number): string {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ARS`;
}

export function InvoiceChargeLinesPanel({
  invoice,
  selection,
  onSelectionChange,
}: InvoiceChargeLinesPanelProps) {
  const { t: translate } = useTranslation();
  const lines = invoice.charge_lines ?? [];
  const isDraft = invoice.status === "DRAFT";
  const selectedIds = useMemo(() => new Set(selection), [selection]);
  const billNowTotal = selectedChargeLinesTotal(lines, selectedIds);
  const laterTotal = deferredChargeLinesTotal(lines, selectedIds);
  const allSelected =
    lines.length > 0 && lines.every((line) => selectedIds.has(line.id));
  const someSelected = lines.some((line) => selectedIds.has(line.id));

  const toggleOne = (lineId: number, checked: boolean) => {
    if (!isDraft) return;
    if (checked) {
      onSelectionChange(
        selection.includes(lineId) ? selection : [...selection, lineId],
      );
      return;
    }
    onSelectionChange(selection.filter((id) => id !== lineId));
  };

  const toggleAll = (checked: boolean) => {
    if (!isDraft) return;
    onSelectionChange(checked ? lines.map((line) => line.id) : []);
  };

  const lineColumns: GridColDef<ChargeLine>[] = useMemo(
    () => [
      ...(isDraft
        ? [
            {
              field: "select",
              headerName: "",
              width: 56,
              sortable: false,
              filterable: false,
              disableColumnMenu: true,
              renderHeader: () => (
                <Checkbox
                  size="small"
                  color="primary"
                  disabled={lines.length === 0}
                  checked={allSelected}
                  indeterminate={someSelected && !allSelected}
                  onChange={(event) => toggleAll(event.target.checked)}
                  inputProps={{
                    "aria-label": translate(
                      "billing.invoice_drawer.select_all",
                    ),
                  }}
                />
              ),
              renderCell: (params: GridRenderCellParams<ChargeLine>) => (
                <Checkbox
                  size="small"
                  color="primary"
                  checked={selectedIds.has(params.row.id)}
                  onChange={(event) =>
                    toggleOne(params.row.id, event.target.checked)
                  }
                  inputProps={{
                    "aria-label": translate(
                      "billing.invoice_drawer.select_line",
                    ),
                  }}
                />
              ),
            } satisfies GridColDef<ChargeLine>,
          ]
        : []),
      {
        field: "description",
        headerName: translate("billing.lines.description"),
        flex: 1.4,
        minWidth: 280,
      },
      {
        field: "quantity",
        headerName: translate("billing.lines.days"),
        width: 90,
        type: "number",
      },
      {
        field: "unit",
        headerName: translate("billing.invoice_drawer.unit"),
        width: 100,
      },
      {
        field: "unit_price",
        headerName: translate("billing.lines.unit_price"),
        width: 140,
        type: "number",
        valueFormatter: (value: number) => formatMoney(value),
      },
      {
        field: "amount",
        headerName: translate("billing.lines.amount"),
        width: 140,
        type: "number",
        valueFormatter: (value: number) => formatMoney(value),
      },
    ],
    [
      translate,
      isDraft,
      lines,
      allSelected,
      someSelected,
      selectedIds,
      selection,
    ],
  );

  return (
    <Stack spacing={1.5} sx={{ height: "100%", minHeight: 280 }}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="baseline"
        flexWrap="wrap"
        useFlexGap
        spacing={1}
      >
        <Typography variant="subtitle1">
          {translate("billing.invoice_drawer.lines_title", {
            count: lines.length,
          })}
        </Typography>
        {isDraft && lines.length > 0 && (
          <Typography variant="body2" color="text.secondary">
            {translate("billing.invoice_drawer.selection_summary", {
              now: formatMoney(billNowTotal),
              later: formatMoney(laterTotal),
              selected: selectedIds.size,
              total: lines.length,
            })}
          </Typography>
        )}
      </Stack>

      {isDraft ? (
        <Alert severity="info">
          {translate("billing.invoice_drawer.select_lines_hint")}
        </Alert>
      ) : (
        <Alert severity="warning">
          {translate("billing.invoice_drawer.select_lines_locked_hint")}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 240 }}>
        <DataGrid
          rows={lines}
          columns={lineColumns}
          getRowId={(row) => row.id}
          density="standard"
          disableRowSelectionOnClick
          hideFooter={lines.length <= 25}
          getRowHeight={() => "auto"}
          sx={{
            height: "100%",
            [`& .${gridClasses.cell}`]: {
              outline: "none",
              py: 1.25,
              alignItems: "center",
            },
            [`& .${gridClasses.columnHeader}`]: { py: 1 },
            [`& .${gridClasses.row}`]: { maxHeight: "none !important" },
          }}
          slots={{
            noRowsOverlay: () => (
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {translate("billing.lines.empty")}
                </Typography>
              </Stack>
            ),
          }}
        />
      </Box>
    </Stack>
  );
}
