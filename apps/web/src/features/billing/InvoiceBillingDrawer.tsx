"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { DataGrid, type GridColDef, gridClasses } from "@mui/x-data-grid";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ChargeLine, Invoice } from "@weld/schemas";
import { InvoiceBillingActions } from "./InvoiceBillingActions";

export interface InvoiceBillingDrawerProps {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onInvoiceUpdated: (invoice: Invoice) => void;
}

function formatMoney(value: number): string {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ARS`;
}

export function InvoiceBillingDrawer({
  open,
  invoice,
  onClose,
  onInvoiceUpdated,
}: InvoiceBillingDrawerProps) {
  const { t: translate } = useTranslation();

  const lineColumns: GridColDef<ChargeLine>[] = useMemo(
    () => [
      {
        field: "description",
        headerName: translate("billing.lines.description"),
        flex: 1,
        minWidth: 200,
      },
      {
        field: "quantity",
        headerName: translate("billing.lines.days"),
        width: 80,
        type: "number",
      },
      {
        field: "unit",
        headerName: translate("billing.invoice_drawer.unit"),
        width: 90,
      },
      {
        field: "unit_price",
        headerName: translate("billing.lines.unit_price"),
        width: 120,
        type: "number",
        valueFormatter: (value: number) => formatMoney(value),
      },
      {
        field: "amount",
        headerName: translate("billing.lines.amount"),
        width: 120,
        type: "number",
        valueFormatter: (value: number) => formatMoney(value),
      },
    ],
    [translate],
  );

  const lines = invoice?.charge_lines ?? [];

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 720, md: 880 } } }}
    >
      <Stack spacing={2} sx={{ p: 2.5, height: "100%" }}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="flex-start"
          spacing={1}
        >
          <Box>
            <Typography variant="h6">
              {translate("billing.invoice_drawer.title", {
                client: invoice?.client_name ?? invoice?.client_party_id ?? "—",
              })}
            </Typography>
          </Box>
          <Button variant="text" onClick={onClose}>
            {translate("actions.close")}
          </Button>
        </Stack>

        {invoice ? (
          <InvoiceBillingActions
            invoice={invoice}
            onInvoiceUpdated={onInvoiceUpdated}
          />
        ) : (
          <Alert severity="info">{translate("billing.lines.empty")}</Alert>
        )}

        <Divider />

        <Typography variant="subtitle2">
          {translate("billing.invoice_drawer.lines_title", {
            count: lines.length,
          })}
        </Typography>
        <Box sx={{ flex: 1, minHeight: 280 }}>
          <DataGrid
            rows={lines}
            columns={lineColumns}
            getRowId={(row) => row.id}
            density="compact"
            disableRowSelectionOnClick
            sx={{
              height: "100%",
              [`& .${gridClasses.cell}`]: { outline: "none" },
            }}
            slots={{
              noRowsOverlay: () => (
                <Stack
                  height="100%"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Typography color="text.secondary">
                    {translate("billing.lines.empty")}
                  </Typography>
                </Stack>
              ),
            }}
          />
        </Box>
      </Stack>
    </Drawer>
  );
}
