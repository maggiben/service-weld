"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Invoice } from "@weld/schemas";
import { InvoiceBillingActions } from "./InvoiceBillingActions";
import { InvoiceChargeLinesPanel } from "./InvoiceChargeLinesPanel";

export interface InvoiceBillingDrawerProps {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onInvoiceUpdated: (invoice: Invoice) => void;
}

export function InvoiceBillingDrawer({
  open,
  invoice,
  onClose,
  onInvoiceUpdated,
}: InvoiceBillingDrawerProps) {
  const { t: translate } = useTranslation();
  const isDraft = invoice?.status === "DRAFT";
  const [selection, setSelection] = useState<number[]>([]);

  useEffect(() => {
    if (!open || !invoice) return;
    if (invoice.status === "DRAFT") {
      setSelection((invoice.charge_lines ?? []).map((line) => line.id));
    }
  }, [
    open,
    invoice?.id,
    invoice?.status,
    invoice?.charge_lines?.length,
    invoice?.version,
  ]);

  const selectedChargeLineIds = isDraft ? selection : undefined;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 760, md: 920 } } }}
    >
      <Stack spacing={2.5} sx={{ p: 3, height: "100%" }}>
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
            selectedChargeLineIds={selectedChargeLineIds}
          />
        ) : (
          <Alert severity="info">{translate("billing.lines.empty")}</Alert>
        )}

        <Divider />

        {invoice ? (
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <InvoiceChargeLinesPanel
              invoice={invoice}
              selection={selection}
              onSelectionChange={setSelection}
            />
          </Box>
        ) : null}
      </Stack>
    </Drawer>
  );
}
