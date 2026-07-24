"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MovementKind, Invoice } from "@weld/schemas";
import { api } from "../../api/client";
import { InvoiceBillingActions } from "../billing/InvoiceBillingActions";
import { InvoiceChargeLinesPanel } from "../billing/InvoiceChargeLinesPanel";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../../lib/cursorPagination";
import {
  buildHistoryColumns,
  buildOutstandingColumns,
} from "./clientLedgerColumns";
import { formatOpenRentalsKpiDetail } from "./clientLedgerLogic";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type LedgerTab = "invoice" | "outstanding" | "history" | "rentals" | "refills";

export interface ClientLedgerDrawerProps {
  clientPartyId: number | null;
  clientName?: string;
  open: boolean;
  onClose: () => void;
  /** When opened from Facturación, the draft/approved invoice for this client. */
  billingInvoice?: Invoice | null;
  onBillingInvoiceUpdated?: (invoice: Invoice) => void;
  /** Prefer the Factura tab when a billing invoice is present. */
  initialTab?: LedgerTab;
}

export function ClientLedgerDrawer({
  clientPartyId,
  clientName,
  open,
  onClose,
  billingInvoice = null,
  onBillingInvoiceUpdated,
  initialTab,
}: ClientLedgerDrawerProps) {
  const { t: translate } = useTranslation();
  const hasInvoice = billingInvoice != null && onBillingInvoiceUpdated != null;
  const [tab, setTab] = useState<LedgerTab>(
    initialTab ?? (hasInvoice ? "invoice" : "outstanding"),
  );
  const [openOnly, setOpenOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [lineSelection, setLineSelection] = useState<number[]>([]);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab ?? (hasInvoice ? "invoice" : "outstanding"));
    setOpenOnly(false);
    setPaginationModel({ page: 0, pageSize: 50 });
    setCursors([undefined]);
  }, [open, clientPartyId, hasInvoice, initialTab]);

  useEffect(() => {
    if (!billingInvoice) {
      setLineSelection([]);
      return;
    }
    // Re-select all lines whenever the invoice returns to DRAFT (e.g. simulation undo).
    if (billingInvoice.status === "DRAFT") {
      setLineSelection(
        (billingInvoice.charge_lines ?? []).map((line) => line.id),
      );
    }
  }, [
    billingInvoice?.id,
    billingInvoice?.status,
    billingInvoice?.charge_lines?.length,
    billingInvoice?.version,
  ]);

  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setCursors([undefined]);
  }, [tab, openOnly]);

  const kindFilter: MovementKind | undefined =
    tab === "rentals" ? "RENTAL" : tab === "refills" ? "REFILL" : undefined;

  const accountQueryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor: cursors[paginationModel.page],
      sort: "-delivery_date" as const,
      ...(tab === "outstanding" || openOnly ? { open: true } : {}),
      ...(kindFilter ? { "filter[kind]": kindFilter } : {}),
    }),
    [
      paginationModel.page,
      paginationModel.pageSize,
      cursors,
      tab,
      openOnly,
      kindFilter,
    ],
  );

  const enabled =
    open &&
    tab !== "invoice" &&
    clientPartyId != null &&
    Number.isFinite(clientPartyId) &&
    (paginationModel.page === 0 || cursors[paginationModel.page] != null);

  const clientQuery = useQuery({
    queryKey: ["client", clientPartyId],
    queryFn: () => api.getClient(clientPartyId!),
    enabled: open && clientPartyId != null,
  });

  const accountQuery = useQuery({
    queryKey: ["client-account", clientPartyId, accountQueryParams],
    queryFn: () => api.getClientAccount(clientPartyId!, accountQueryParams),
    enabled,
  });

  useEffect(() => {
    const nextCursor = accountQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) =>
      stashNextCursor(prev, paginationModel.page, nextCursor),
    );
  }, [accountQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const outstanding = accountQuery.data?.outstanding ?? [];
  const summary = accountQuery.data?.rental_summary;
  const title = clientQuery.data?.name ?? clientName ?? "—";
  const isInvoiceTab = tab === "invoice";
  const isOutstandingTab = tab === "outstanding";
  const pageMeta = accountQuery.data?.page;
  const selectedChargeLineIds =
    hasInvoice && billingInvoice?.status === "DRAFT"
      ? lineSelection
      : undefined;

  const outstandingColumns = useMemo(
    () => buildOutstandingColumns(translate, { compact: false }),
    [translate],
  );

  const historyColumns = useMemo(
    () =>
      buildHistoryColumns(
        translate,
        tab === "refills" ? "refills" : "history",
        {
          compact: false,
        },
      ),
    [translate, tab],
  );

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 760, md: 920 } } }}
    >
      <Stack spacing={2.5} sx={{ p: 2.5, height: "100%" }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-start"
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {billingInvoice
                ? translate("billing.ledger.subtitle_with_invoice")
                : translate("billing.ledger.subtitle")}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {clientPartyId != null && (
              <Button
                component={NextLink}
                href={`/clients/${clientPartyId}`}
                size="small"
                variant="outlined"
              >
                {translate("billing.ledger.open_full")}
              </Button>
            )}
            <Button size="small" onClick={onClose}>
              {translate("actions.close")}
            </Button>
          </Stack>
        </Stack>

        {hasInvoice && billingInvoice && onBillingInvoiceUpdated && (
          <Box
            sx={{
              p: 2,
              borderRadius: 1,
              border: "1px solid",
              borderColor: "divider",
              bgcolor: "action.hover",
            }}
          >
            <Typography variant="subtitle2" sx={{ mb: 1.25 }}>
              {translate("billing.ledger.invoice_actions")}
            </Typography>
            <InvoiceBillingActions
              invoice={billingInvoice}
              onInvoiceUpdated={onBillingInvoiceUpdated}
              selectedChargeLineIds={selectedChargeLineIds}
            />
          </Box>
        )}

        {summary && !isInvoiceTab && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`${translate("clients.detail.kpi.outstanding")}: ${summary.open_count}`}
            />
            <Chip
              size="small"
              label={`${translate("clients.detail.kpi.rentals")}: ${summary.open_rental_count} · ${formatOpenRentalsKpiDetail(summary, translate)}`}
            />
            <Chip
              size="small"
              label={`${translate("clients.detail.kpi.refills")}: ${summary.open_refill_count}`}
            />
          </Stack>
        )}

        <Tabs
          value={tab}
          onChange={(_, value: LedgerTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {hasInvoice && (
            <Tab
              value="invoice"
              label={translate("billing.ledger.tabs.invoice")}
            />
          )}
          <Tab
            value="outstanding"
            label={translate("clients.detail.tabs.outstanding")}
          />
          <Tab
            value="history"
            label={translate("clients.detail.tabs.history")}
          />
          <Tab
            value="rentals"
            label={translate("clients.detail.tabs.rentals")}
          />
          <Tab
            value="refills"
            label={translate("clients.detail.tabs.refills")}
          />
        </Tabs>

        {!isOutstandingTab && !isInvoiceTab && (
          <FormControlLabel
            control={
              <Switch
                checked={openOnly}
                onChange={(event) => setOpenOnly(event.target.checked)}
              />
            }
            label={translate("clients.detail.filters.open_only")}
          />
        )}

        {(clientQuery.isError || accountQuery.isError) && !isInvoiceTab && (
          <Alert severity="error">{translate("errors.load_failed")}</Alert>
        )}

        <Box sx={{ flex: 1, minHeight: 0 }}>
          {isInvoiceTab && billingInvoice ? (
            <InvoiceChargeLinesPanel
              invoice={billingInvoice}
              selection={lineSelection}
              onSelectionChange={setLineSelection}
            />
          ) : isOutstandingTab ? (
            <DataGrid
              rows={outstanding}
              columns={outstandingColumns}
              getRowId={(row) => row.movement_id}
              loading={accountQuery.isLoading || accountQuery.isFetching}
              density="standard"
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              initialState={{
                pagination: { paginationModel: { pageSize: 50 } },
              }}
              disableRowSelectionOnClick
              slots={{
                noRowsOverlay: () => (
                  <Stack
                    height="100%"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Typography color="text.secondary">
                      {translate("clients.detail.empty")}
                    </Typography>
                  </Stack>
                ),
              }}
              sx={{
                [`& .${gridClasses.cell}`]: { outline: "none", py: 1 },
              }}
            />
          ) : (
            <DataGrid
              rows={accountQuery.data?.data ?? []}
              columns={historyColumns}
              getRowId={(row) => row.id}
              loading={accountQuery.isLoading || accountQuery.isFetching}
              density="standard"
              paginationMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={handlePaginationModelChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              rowCount={cursorPageRowCount(
                paginationModel.page,
                paginationModel.pageSize,
                accountQuery.data?.data?.length ?? 0,
                pageMeta?.has_more ?? false,
              )}
              disableRowSelectionOnClick
              slots={{
                noRowsOverlay: () => (
                  <Stack
                    height="100%"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Typography color="text.secondary">
                      {translate("clients.detail.empty")}
                    </Typography>
                  </Stack>
                ),
              }}
              sx={{
                [`& .${gridClasses.cell}`]: { outline: "none", py: 1 },
              }}
            />
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}
