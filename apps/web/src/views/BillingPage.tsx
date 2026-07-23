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
  ChargeLine,
  Client,
  Invoice,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import {
  formatInvoiceDaysBreakdown,
  invoiceTotalDays,
} from "../features/billing/billingLogic";
import { ClientLedgerDrawer } from "../features/clients/ClientLedgerDrawer";
import { useLocations } from "../hooks/useLocations";
import { useSessionStore } from "../store/sessionStore";

export default function BillingPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) => s.hasCapability("billing:write"));
  const canApprove = useSessionStore((s) => s.hasCapability("billing:approve"));
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
  const [run, setRun] = useState<BillingRunDetail | null>(null);
  const [runMode, setRunMode] = useState<"period" | "history" | null>(null);
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

  const draftMutation = useMutation({
    mutationFn: (mode: "period" | "history") =>
      api.createBillingRun(
        mode === "history"
          ? {
              mode: "history",
              client_party_id: client?.id ?? null,
              locality_id:
                client || location?.kind !== "locality" ? null : location.id,
              territory_id:
                client || location?.kind !== "territory" ? null : location.id,
            }
          : {
              period_start: periodStart,
              period_end: periodEnd,
              mode: "period",
              client_party_id: client?.id ?? null,
              locality_id:
                client || location?.kind !== "locality" ? null : location.id,
              territory_id:
                client || location?.kind !== "territory" ? null : location.id,
            },
      ),
    onSuccess: (result, mode) => {
      setRun(result);
      setRunMode(mode);
      setExportPayload(null);
      setSelectedInvoice(null);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "PERIOD_LOCKED") {
          setError(t("errors.period_locked"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => {
      if (!run) throw new Error("No run");
      return api.approveBillingRun(run.id);
    },
    onSuccess: (result) => {
      setRun(result);
      setSelectedInvoice(
        result.invoices.find((inv) => inv.id === selectedInvoice?.id) ?? null,
      );
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const exportMutation = useMutation({
    mutationFn: () => {
      if (!run) throw new Error("No run");
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
          setError(t("errors.not_approved"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const invoiceColumns: GridColDef<Invoice>[] = useMemo(
    () => [
      {
        field: "client_name",
        headerName: t("billing.columns.client"),
        flex: 1,
        minWidth: 160,
        renderCell: (params) => (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={(e) => {
              e.stopPropagation();
              setLedgerClient({
                id: params.row.client_party_id,
                name: params.row.client_name,
              });
            }}
            sx={{ textAlign: "left" }}
          >
            {params.value ?? params.row.client_party_id}
          </Link>
        ),
      },
      {
        field: "client_locality_name",
        headerName: t("billing.columns.locality"),
        width: 140,
        valueGetter: (_v, row) => row.client_locality_name ?? "—",
      },
      {
        field: "lines",
        headerName: t("billing.columns.lines"),
        width: 100,
        type: "number",
        valueGetter: (_v, row) => row.charge_lines?.length ?? 0,
      },
      {
        field: "days_breakdown",
        headerName: t("billing.columns.days_breakdown"),
        flex: 1,
        minWidth: 200,
        sortable: false,
        valueGetter: (_v, row) => formatInvoiceDaysBreakdown(row, t),
      },
      {
        field: "total_days",
        headerName: t("billing.columns.total_days"),
        width: 130,
        type: "number",
        valueGetter: (_v, row) => invoiceTotalDays(row),
      },
      {
        field: "total",
        headerName: t("billing.columns.total"),
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
        headerName: t("billing.columns.status"),
        width: 120,
        valueFormatter: (value: string) => t(`enums.invoice_status.${value}`),
      },
    ],
    [t],
  );

  const lineColumns: GridColDef<ChargeLine>[] = useMemo(
    () => [
      {
        field: "description",
        headerName: t("billing.lines.description"),
        flex: 1,
        minWidth: 220,
      },
      {
        field: "quantity",
        headerName: t("billing.lines.days"),
        width: 90,
        type: "number",
      },
      {
        field: "unit_price",
        headerName: t("billing.lines.unit_price"),
        width: 130,
        type: "number",
        valueFormatter: (value: number) =>
          `${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ARS`,
      },
      {
        field: "calc",
        headerName: t("billing.lines.calc"),
        width: 160,
        sortable: false,
        valueGetter: (_v, row) =>
          t("billing.lines.calc_value", {
            days: row.quantity,
            price: Number(row.unit_price).toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
          }),
      },
      {
        field: "amount",
        headerName: t("billing.lines.amount"),
        width: 130,
        type: "number",
        valueFormatter: (value: number) =>
          `${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })} ARS`,
      },
    ],
    [t],
  );

  const busy =
    draftMutation.isPending ||
    approveMutation.isPending ||
    exportMutation.isPending;

  const selectedLines = selectedInvoice?.charge_lines ?? [];

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Typography variant="h5">{t("billing.title")}</Typography>
      <Typography variant="body2" color="text.secondary">
        {t("billing.subtitle")}
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
            label={t("billing.period_start")}
            value={dayjs(periodStart)}
            onChange={(v: Dayjs | null) => {
              if (v) setPeriodStart(v.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { size: "small", sx: { width: 180 } } }}
          />
          <DatePicker
            label={t("billing.period_end")}
            value={dayjs(periodEnd)}
            onChange={(v: Dayjs | null) => {
              if (v) setPeriodEnd(v.format("YYYY-MM-DD"));
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
              {t("actions.run_billing")}
            </Button>
          )}
          <FormControl size="small" sx={{ minWidth: 220 }}>
            <InputLabel id="billing-location-label">
              {t("billing.filters.location")}
            </InputLabel>
            <Select
              labelId="billing-location-label"
              label={t("billing.filters.location")}
              value={locationFilter}
              disabled={client != null}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setClient(null);
              }}
            >
              <MenuItem value="">
                <em>{t("billing.filters.all_locations")}</em>
              </MenuItem>
              <ListSubheader>{t("billing.filters.territories")}</ListSubheader>
              {territories.map((tr) => (
                <MenuItem
                  key={`territory-${tr.id}`}
                  value={encodeFilter({ kind: "territory", id: tr.id })}
                >
                  {tr.name}
                </MenuItem>
              ))}
              <ListSubheader>{t("billing.filters.cities")}</ListSubheader>
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
                      (c) => c.id !== client.id,
                    ),
                  ]
                : (clientsSearch.data?.data ?? [])
            }
            getOptionLabel={(option: Client) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={clientsSearch.isFetching}
            value={client}
            onChange={(_, value) => setClient(value)}
            onInputChange={(_, value, reason) => {
              if (reason !== "reset") setClientQuery(value);
            }}
            renderInput={(params) => (
              <TextField {...params} label={t("billing.filters.client")} />
            )}
          />
          {canWrite && (
            <Button
              size="small"
              variant="outlined"
              disabled={busy}
              onClick={() => draftMutation.mutate("history")}
              sx={{ height: 40 }}
            >
              {t("actions.run_billing_history")}
            </Button>
          )}
          {canApprove && run?.status === "DRAFT" && (
            <Button
              size="small"
              variant="outlined"
              disabled={busy || (run.invoice_count ?? 0) === 0}
              onClick={() => approveMutation.mutate()}
              sx={{ height: 40 }}
            >
              {t("actions.approve_billing")}
            </Button>
          )}
          {canWrite &&
            (run?.status === "APPROVED" || run?.status === "EXPORTED") && (
              <Button
                size="small"
                variant="outlined"
                disabled={busy}
                onClick={() => exportMutation.mutate()}
                sx={{ height: 40 }}
              >
                {t("actions.export_billing")}
              </Button>
            )}
        </Stack>
        <Stack spacing={0.25}>
          <Typography variant="caption" color="text.secondary">
            {t("billing.period_hint")}
          </Typography>
          {canWrite && (
            <Typography variant="caption" color="text.secondary">
              {t("billing.history_hint")}
            </Typography>
          )}
        </Stack>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {run && (
        <Alert severity={run.invoice_count ? "success" : "warning"}>
          <Typography variant="body2" component="div">
            {t(
              runMode === "history"
                ? "billing.run_summary_history"
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
                status: t(`enums.invoice_status.${run.status}`),
                from: run.period_start,
                to: run.period_end,
              },
            )}
          </Typography>
          {(run.skipped_no_rate ?? 0) > 0 && (
            <Typography variant="body2" component="div" sx={{ mt: 0.75 }}>
              {t("billing.skipped_no_rate", { count: run.skipped_no_rate })}{" "}
              <Link component={NextLink} href="/rates" underline="hover">
                {t("billing.configure_rates")}
              </Link>
            </Typography>
          )}
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mt: 0.5 }}
          >
            {t("billing.days_hint")}
          </Typography>
        </Alert>
      )}

      {exportPayload && (
        <Alert severity="info">
          {t("billing.export_ready", {
            count: exportPayload.invoices.length,
            at: exportPayload.exported_at,
          })}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 240 }}>
        <DataGrid
          rows={run?.invoices ?? []}
          columns={invoiceColumns}
          getRowId={(row) => row.id}
          loading={busy}
          disableRowSelectionOnClick
          onRowClick={(params: GridRowParams<Invoice>) =>
            setSelectedInvoice(params.row)
          }
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            [`& .${gridClasses.row}`]: { cursor: "pointer" },
          }}
          slots={{
            noRowsOverlay: () => (
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {t("billing.empty")}
                </Typography>
              </Stack>
            ),
          }}
        />
      </Box>

      {selectedInvoice && (
        <Box sx={{ minHeight: 180, maxHeight: 280 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            {t("billing.lines.title", {
              client:
                selectedInvoice.client_name ?? selectedInvoice.client_party_id,
              count: selectedLines.length,
              days:
                selectedInvoice.total_days ??
                selectedLines.reduce((sum, line) => sum + line.quantity, 0),
              total: Number(selectedInvoice.total).toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              }),
            })}
          </Typography>
          <DataGrid
            rows={selectedLines}
            columns={lineColumns}
            getRowId={(row) => row.id}
            density="compact"
            hideFooter={selectedLines.length <= 25}
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
                    {t("billing.lines.empty")}
                  </Typography>
                </Stack>
              ),
            }}
          />
        </Box>
      )}

      <ClientLedgerDrawer
        open={ledgerClient != null}
        clientPartyId={ledgerClient?.id ?? null}
        clientName={ledgerClient?.name}
        onClose={() => setLedgerClient(null)}
      />
    </Stack>
  );
}
