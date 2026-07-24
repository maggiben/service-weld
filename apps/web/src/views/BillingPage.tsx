"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import ListSubheader from "@mui/material/ListSubheader";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridRowParams,
  gridClasses,
} from "@mui/x-data-grid";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import NextLink from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  BillingExportPayload,
  BillingRunDetail,
  Client,
  Invoice,
  PeriodInvoicesResponse,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import {
  filterBillingInvoices,
  formatInvoiceDailyRate,
  formatInvoiceDaysBreakdown,
  invoiceRentedCylinders,
  invoiceSoldCylinders,
  invoiceTotalDays,
} from "../features/billing/billingLogic";
import { ClientLedgerDrawer } from "../features/clients/ClientLedgerDrawer";
import { useLocations } from "../hooks/useLocations";
import { useSessionStore } from "../store/sessionStore";

function periodInvoicesToRun(
  result: PeriodInvoicesResponse,
  clientPartyId: number | null,
): BillingRunDetail {
  const total = result.invoices.reduce((sum, inv) => sum + inv.total, 0);
  const totalDays = result.invoices.reduce(
    (sum, inv) => sum + invoiceTotalDays(inv),
    0,
  );
  const statuses = new Set(result.invoices.map((inv) => inv.status));
  const status = statuses.has("EXPORTED")
    ? "EXPORTED"
    : statuses.has("APPROVED")
      ? "APPROVED"
      : "DRAFT";
  return {
    id: 0,
    period_start: result.period_start,
    period_end: result.period_end,
    client_party_id: clientPartyId,
    status,
    created_at: new Date().toISOString(),
    invoice_count: result.invoices.length,
    total: Math.round(total * 100) / 100,
    total_days: totalDays,
    invoices: result.invoices,
  };
}

export default function BillingPage() {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("billing:write"),
  );
  const { territories, localities, encodeFilter, decodeFilter } =
    useLocations();
  const [periodStart, setPeriodStart] = useState(
    dayjs().startOf("month").format("YYYY-MM-DD"),
  );
  const [periodEnd, setPeriodEnd] = useState(
    dayjs().endOf("month").format("YYYY-MM-DD"),
  );
  const [client, setClient] = useState<Client | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [run, setRun] = useState<BillingRunDetail | null>(null);
  const [runMode, setRunMode] = useState<
    "period" | "history" | "existing" | null
  >(null);
  const [exportPayload, setExportPayload] =
    useState<BillingExportPayload | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [ledgerClient, setLedgerClient] = useState<{
    id: number;
    name?: string;
  } | null>(null);

  const location = decodeFilter(locationFilter);

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", "billing", clientQuery, locationFilter],
    queryFn: () =>
      api.listClients({
        q: clientQuery || undefined,
        limit: 20,
        ...(location?.kind === "territory"
          ? { "filter[territory_id]": location.id }
          : {}),
        ...(location?.kind === "locality"
          ? { "filter[locality_id]": location.id }
          : {}),
      }),
  });

  const billingScope = {
    client_party_id: client?.id ?? null,
    locality_id:
      client != null
        ? null
        : location?.kind === "locality"
          ? location.id
          : null,
    territory_id:
      client != null
        ? null
        : location?.kind === "territory"
          ? location.id
          : null,
  };

  const applyPeriodInvoices = (result: PeriodInvoicesResponse) => {
    setRun(periodInvoicesToRun(result, client?.id ?? null));
    setRunMode("existing");
    setExportPayload(null);
    setSelectedInvoice(null);
    setError(null);
    setInfo(
      result.locked
        ? translate("billing.period_locked_loaded")
        : translate("billing.period_loaded"),
    );
  };

  const draftMutation = useMutation({
    mutationFn: (mode: "period" | "history") =>
      api.createBillingRun(
        mode === "history"
          ? {
              mode: "history",
              charges: "all",
              ...billingScope,
            }
          : {
              period_start: periodStart,
              period_end: periodEnd,
              mode: "period",
              charges: "all",
              ...billingScope,
            },
      ),
    onSuccess: async (result, mode) => {
      setExportPayload(null);
      setSelectedInvoice(null);
      setError(null);

      const skipNotes: string[] = [];
      if ((result.skipped_already_billed ?? 0) > 0) {
        skipNotes.push(
          translate("billing.skipped_already_billed", {
            count: result.skipped_already_billed,
          }),
        );
      }
      if ((result.skipped_sales_no_price ?? 0) > 0) {
        skipNotes.push(
          translate("billing.skipped_sales_no_price", {
            count: result.skipped_sales_no_price,
            serials: (result.skipped_sales_no_price_serials ?? []).join(", "),
          }),
        );
      }
      if ((result.skipped_no_rate ?? 0) > 0) {
        skipNotes.push(
          translate("billing.skipped_no_rate", {
            count: result.skipped_no_rate,
          }),
        );
      }

      const scopedEmpty =
        (result.invoice_count ?? result.invoices.length) === 0 ||
        (client != null &&
          !result.invoices.some((inv) => inv.client_party_id === client.id));

      if (scopedEmpty) {
        try {
          const existing = await api.listPeriodInvoices({
            period_start: result.period_start,
            period_end: result.period_end,
            ...(billingScope.client_party_id != null
              ? { client_party_id: billingScope.client_party_id }
              : {}),
            ...(billingScope.locality_id != null
              ? { locality_id: billingScope.locality_id }
              : {}),
            ...(billingScope.territory_id != null
              ? { territory_id: billingScope.territory_id }
              : {}),
          });
          if (existing.invoices.length > 0) {
            applyPeriodInvoices(existing);
            setInfo(
              [
                translate("billing.no_new_charges_showing_existing"),
                ...skipNotes,
              ]
                .filter(Boolean)
                .join(" "),
            );
            return;
          }
        } catch {
          // Fall through to show the empty draft.
        }
      }

      setRun(result);
      setRunMode(mode);
      if (mode === "history") {
        setPeriodStart(result.period_start);
        setPeriodEnd(result.period_end);
      }
      setInfo(skipNotes.length > 0 ? skipNotes.join(" ") : null);
    },
    onError: async (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "PERIOD_LOCKED") {
          try {
            const existing = await api.listPeriodInvoices({
              period_start: periodStart,
              period_end: periodEnd,
              ...(billingScope.client_party_id != null
                ? { client_party_id: billingScope.client_party_id }
                : {}),
              ...(billingScope.locality_id != null
                ? { locality_id: billingScope.locality_id }
                : {}),
              ...(billingScope.territory_id != null
                ? { territory_id: billingScope.territory_id }
                : {}),
            });
            applyPeriodInvoices(existing);
            return;
          } catch {
            setError(translate("errors.period_locked"));
            return;
          }
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const loadPeriodMutation = useMutation({
    mutationFn: () =>
      api.listPeriodInvoices({
        period_start: periodStart,
        period_end: periodEnd,
        ...(billingScope.client_party_id != null
          ? { client_party_id: billingScope.client_party_id }
          : {}),
        ...(billingScope.locality_id != null
          ? { locality_id: billingScope.locality_id }
          : {}),
        ...(billingScope.territory_id != null
          ? { territory_id: billingScope.territory_id }
          : {}),
      }),
    onSuccess: (result) => {
      applyPeriodInvoices(result);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => {
      if (!run || run.id <= 0) throw new Error("No run");
      return api.exportBillingRun(run.id);
    },
    onSuccess: async (payload) => {
      setExportPayload(payload);
      const refreshed = await api.getBillingRun(payload.run_id);
      setRun(refreshed);
      setSelectedInvoice(
        refreshed.invoices.find((inv) => inv.id === selectedInvoice?.id) ??
          null,
      );
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "NOT_APPROVED") {
          setError(translate("errors.not_approved"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const openInvoiceLedger = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setLedgerClient({
      id: invoice.client_party_id,
      name: invoice.client_name,
    });
  };

  const invoiceColumns: GridColDef<Invoice>[] = useMemo(
    () => [
      {
        field: "client_name",
        headerName: translate("billing.columns.client"),
        flex: 1,
        minWidth: 160,
        renderCell: (params) => (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={(event) => {
              event.stopPropagation();
              openInvoiceLedger(params.row);
            }}
            sx={{ textAlign: "left" }}
          >
            {params.value ?? params.row.client_party_id}
          </Link>
        ),
      },
      {
        field: "client_locality_name",
        headerName: translate("billing.columns.locality"),
        width: 140,
        valueGetter: (_v, row) => row.client_locality_name ?? "—",
      },
      {
        field: "rented",
        headerName: translate("billing.columns.rented"),
        width: 110,
        type: "number",
        valueGetter: (_v, row) => invoiceRentedCylinders(row),
      },
      {
        field: "sold",
        headerName: translate("billing.columns.sold"),
        width: 110,
        type: "number",
        valueGetter: (_v, row) => invoiceSoldCylinders(row),
      },
      {
        field: "days_breakdown",
        headerName: translate("billing.columns.days_breakdown"),
        flex: 1,
        minWidth: 180,
        sortable: false,
        valueGetter: (_v, row) => formatInvoiceDaysBreakdown(row, translate),
      },
      {
        field: "total_days",
        headerName: translate("billing.columns.total_days"),
        width: 130,
        type: "number",
        valueGetter: (_v, row) => invoiceTotalDays(row),
      },
      {
        field: "daily_rate",
        headerName: translate("billing.columns.daily_rate"),
        width: 130,
        sortable: false,
        valueGetter: (_v, row) => formatInvoiceDailyRate(row, translate),
      },
      {
        field: "total",
        headerName: translate("billing.columns.total"),
        width: 140,
        type: "number",
        valueFormatter: (value: number) =>
          `${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ARS`,
      },
      {
        field: "status",
        headerName: translate("billing.columns.status"),
        width: 120,
        valueFormatter: (value: string) =>
          translate(`enums.invoice_status.${value}`),
      },
      {
        field: "arca",
        headerName: translate("billing.columns.arca"),
        width: 110,
        sortable: false,
        valueGetter: (_v, row) =>
          row.arca?.cae
            ? translate("billing.columns.arca_ok")
            : translate("billing.columns.arca_pending"),
      },
    ],
    [translate],
  );

  const busy =
    draftMutation.isPending ||
    exportMutation.isPending ||
    loadPeriodMutation.isPending;

  const viewingExisting =
    runMode === "existing" || (run != null && run.id <= 0);

  const displayedInvoices = useMemo(
    () =>
      filterBillingInvoices(run?.invoices ?? [], {
        clientPartyId: client?.id,
        location,
      }),
    [run?.invoices, client?.id, location],
  );

  const handleInvoiceUpdated = async (updated: Invoice) => {
    const mergeInvoice = (previous: Invoice | null | undefined): Invoice => ({
      ...updated,
      charge_lines: updated.charge_lines ?? previous?.charge_lines,
    });
    setSelectedInvoice((current) => mergeInvoice(current));
    if (!run || viewingExisting) {
      setRun((current) => {
        if (!current) return current;
        return {
          ...current,
          invoices: current.invoices.map((inv) =>
            inv.id === updated.id ? mergeInvoice(inv) : inv,
          ),
        };
      });
      return;
    }
    try {
      const refreshed = await api.getBillingRun(run.id);
      setRun(refreshed);
      const fromRun = refreshed.invoices.find((inv) => inv.id === updated.id);
      setSelectedInvoice(fromRun ?? mergeInvoice(updated));
    } catch {
      setRun((current) => {
        if (!current) return current;
        return {
          ...current,
          invoices: current.invoices.map((inv) =>
            inv.id === updated.id ? mergeInvoice(inv) : inv,
          ),
        };
      });
    }
  };

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Typography variant="h5">{translate("billing.title")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {translate("billing.subtitle")}
      </Typography>

      <Stack spacing={0.5}>
        <Stack
          direction="row"
          spacing={2}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
        >
          <DatePicker
            label={translate("billing.period_start")}
            value={dayjs(periodStart)}
            onChange={(value: Dayjs | null) => {
              if (value) setPeriodStart(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
          />
          <DatePicker
            label={translate("billing.period_end")}
            value={dayjs(periodEnd)}
            onChange={(value: Dayjs | null) => {
              if (value) setPeriodEnd(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
          />
          {canWrite && (
            <Button
              size="small"
              variant="contained"
              disabled={busy}
              onClick={() => draftMutation.mutate("period")}
              sx={{ height: 40 }}
            >
              {translate("actions.run_billing")}
            </Button>
          )}
          {canWrite && (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => draftMutation.mutate("history")}
              sx={{ height: 40 }}
            >
              {translate("actions.run_billing_history")}
            </Button>
          )}
          <Button
            size="small"
            variant="text"
            disabled={busy}
            onClick={() => loadPeriodMutation.mutate()}
            sx={{ height: 40 }}
          >
            {translate("actions.view_period_invoices")}
          </Button>
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="billing-location-label">
              {translate("billing.filters.location")}
            </InputLabel>
            <Select
              labelId="billing-location-label"
              label={translate("billing.filters.location")}
              value={locationFilter}
              disabled={client != null}
              onChange={(event) => {
                setLocationFilter(event.target.value);
                setClient(null);
              }}
            >
              <MenuItem value="">
                <em>{translate("billing.filters.all_locations")}</em>
              </MenuItem>
              <ListSubheader>
                {translate("billing.filters.territories")}
              </ListSubheader>
              {territories.map((tr) => (
                <MenuItem
                  key={`territory-${tr.id}`}
                  value={encodeFilter({ kind: "territory", id: tr.id })}
                >
                  {tr.name}
                </MenuItem>
              ))}
              <ListSubheader>
                {translate("billing.filters.cities")}
              </ListSubheader>
              {localities.map((loc) => (
                <MenuItem
                  key={`locality-${loc.id}`}
                  value={encodeFilter({ kind: "locality", id: loc.id })}
                >
                  {loc.name}
                  {loc.territory_name ? ` · ${loc.territory_name}` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            size="small"
            sx={{ minWidth: 240 }}
            options={
              client
                ? [
                    client,
                    ...(clientsSearch.data?.data ?? []).filter(
                      (option) => option.id !== client.id,
                    ),
                  ]
                : (clientsSearch.data?.data ?? [])
            }
            getOptionLabel={(option: Client) => option.name}
            isOptionEqualToValue={(left, right) => left.id === right.id}
            loading={clientsSearch.isFetching}
            value={client}
            onChange={(_, value) => setClient(value)}
            onInputChange={(_, value, reason) => {
              if (reason !== "reset") setClientQuery(value);
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("billing.filters.client")}
              />
            )}
          />
          {canWrite &&
            !viewingExisting &&
            (run?.status === "APPROVED" || run?.status === "EXPORTED") && (
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => exportMutation.mutate()}
                sx={{ height: 40 }}
              >
                {translate("actions.export_billing")}
              </Button>
            )}
        </Stack>
        <Stack spacing={0.25}>
          <Typography variant="caption" color="text.secondary">
            {translate("billing.period_hint")}
          </Typography>
          {canWrite && (
            <Typography variant="caption" color="text.secondary">
              {translate("billing.history_hint")}
            </Typography>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}
      {info && !error && <Alert severity="info">{info}</Alert>}

      {run && (
        <Alert severity={run.invoice_count ? "success" : "warning"}>
          <Typography variant="body2" component="div">
            {translate(
              runMode === "history"
                ? "billing.run_summary_history"
                : runMode === "existing"
                  ? "billing.run_summary_existing"
                  : "billing.run_summary",
              {
                id: run.id,
                invoices: run.invoice_count,
                lines: run.invoices.reduce(
                  (sum, inv) => sum + (inv.charge_lines?.length ?? 0),
                  0,
                ),
                days: run.total_days ?? 0,
                total: Number(run.total ?? 0).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
                status: translate(`enums.invoice_status.${run.status}`),
                from: run.period_start,
                to: run.period_end,
              },
            )}
          </Typography>
          {(run.skipped_no_rate ?? 0) > 0 && (
            <Typography variant="body2" component="div" sx={{ mt: 0.75 }}>
              {translate("billing.skipped_no_rate", {
                count: run.skipped_no_rate,
              })}{" "}
              <Link component={NextLink} href="/rates" underline="hover">
                {translate("billing.configure_rates")}
              </Link>
            </Typography>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.5 }}
          >
            {translate("billing.days_hint")}
          </Typography>
        </Alert>
      )}

      {exportPayload && (
        <Alert severity="info">
          {translate("billing.export_ready", {
            count: exportPayload.invoices.length,
            at: exportPayload.exported_at,
          })}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 240 }}>
        <DataGrid
          rows={displayedInvoices}
          columns={invoiceColumns}
          getRowId={(row) => row.id}
          loading={busy}
          disableRowSelectionOnClick
          onRowClick={(params: GridRowParams<Invoice>) => {
            openInvoiceLedger(params.row);
          }}
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            [`& .${gridClasses.row}`]: { cursor: "pointer" },
          }}
          slots={{
            noRowsOverlay: () => (
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {translate("billing.empty")}
                </Typography>
              </Stack>
            ),
          }}
        />
      </Box>

      <ClientLedgerDrawer
        open={ledgerClient != null}
        clientPartyId={ledgerClient?.id ?? null}
        clientName={ledgerClient?.name}
        initialTab={selectedInvoice != null ? "invoice" : undefined}
        billingInvoice={
          selectedInvoice != null &&
          ledgerClient != null &&
          selectedInvoice.client_party_id === ledgerClient.id
            ? selectedInvoice
            : (run?.invoices.find(
                (inv) => inv.client_party_id === ledgerClient?.id,
              ) ?? null)
        }
        onBillingInvoiceUpdated={handleInvoiceUpdated}
        onClose={() => {
          setLedgerClient(null);
          setSelectedInvoice(null);
        }}
      />
    </Stack>
  );
}
