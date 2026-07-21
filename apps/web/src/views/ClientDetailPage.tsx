"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { enUS, esES } from "@mui/x-data-grid/locales";
import type {
  ClientAccountOutstandingRow,
  MovementEvent,
  MovementKind,
} from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { CreateClientDrawer } from "../features/clients/CreateClientDrawer";
import { displayRentalDays } from "../features/movements/displayRentalDays";
import { useLocations } from "../hooks/useLocations";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type LedgerTab = "outstanding" | "history" | "rentals" | "refills";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function ClientDetailPage() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const { localityLabel } = useLocations();
  const canWrite = useSessionStore((s) => s.hasCapability("clients:write"));
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);

  const [tab, setTab] = useState<LedgerTab>("outstanding");
  const [editOpen, setEditOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

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

  const clientQuery = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => api.getClient(clientId),
    enabled: Number.isFinite(clientId),
  });

  const accountQuery = useQuery({
    queryKey: ["client-account", clientId, accountQueryParams],
    queryFn: () => api.getClientAccount(clientId, accountQueryParams),
    enabled:
      Number.isFinite(clientId) &&
      (paginationModel.page === 0 || cursors[paginationModel.page] != null),
  });

  useEffect(() => {
    const nextCursor = accountQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) => {
      const next = [...prev];
      next[paginationModel.page + 1] = nextCursor;
      return next;
    });
  }, [accountQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const summary = accountQuery.data?.rental_summary;
  const outstanding = accountQuery.data?.outstanding ?? [];

  const outstandingColumns: GridColDef<ClientAccountOutstandingRow>[] = useMemo(
    () => [
      {
        field: "serial",
        headerName: t("clients.detail.columns.serial"),
        flex: 1,
        minWidth: 120,
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
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: t("clients.detail.columns.kind"),
        width: 120,
        valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
      },
      {
        field: "delivery_date",
        headerName: t("clients.detail.columns.delivery"),
        width: 130,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "accrued_days",
        headerName: t("clients.detail.columns.accrued_days"),
        width: 130,
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
    ],
    [t],
  );

  const historyColumns: GridColDef<MovementEvent>[] = useMemo(() => {
    const cols: GridColDef<MovementEvent>[] = [
      {
        field: "cylinder_serial",
        headerName: t("clients.detail.columns.serial"),
        flex: 1,
        minWidth: 120,
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
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: t("clients.detail.columns.kind"),
        width: 120,
        valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
      },
      {
        field: "delivery_date",
        headerName: t("clients.detail.columns.delivery"),
        width: 130,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "return_date",
        headerName: t("clients.detail.columns.return"),
        width: 130,
        valueFormatter: (value: string | null) => formatDate(value),
      },
    ];
    // REFILL = client-owned refill cycle — rental days do not apply.
    if (tab !== "refills") {
      cols.push({
        field: "rental_days",
        headerName: t("clients.detail.columns.rental_days"),
        width: 120,
        type: "number",
        valueGetter: (_v, row) => displayRentalDays(row),
      });
    }
    cols.push({
      field: "state",
      headerName: t("clients.detail.columns.state"),
      width: 120,
      renderCell: (params) => (
        <Chip size="small" label={t(`enums.movement_state.${params.value}`)} />
      ),
    });
    return cols;
  }, [t, tab]);

  const client = clientQuery.data;
  const isOutstandingTab = tab === "outstanding";
  const pageMeta = accountQuery.data?.page;

  if (!Number.isFinite(clientId)) {
    return <Alert severity="error">{t("errors.load_failed")}</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        justifyContent="space-between"
      >
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/clients")}
          size="small"
        >
          {t("clients.detail.back")}
        </Button>
        {canWrite && client && (
          <Button
            variant="outlined"
            size="small"
            onClick={() => setEditOpen(true)}
          >
            {t("actions.edit")}
          </Button>
        )}
      </Stack>

      {clientQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      {client && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h5">{client.name}</Typography>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mt: 1 }}
              >
                {client.cuit && <Chip size="small" label={client.cuit} />}
                <Chip
                  size="small"
                  label={t(`enums.coverage.${client.coverage}`)}
                  color="primary"
                  variant="outlined"
                />
                {client.segment && (
                  <Chip
                    size="small"
                    label={t(`enums.segment.${client.segment}`)}
                  />
                )}
                <Chip size="small" label={t(`enums.status.${client.status}`)} />
              </Stack>
              {(client.address_street || client.locality_id != null) && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {[
                    client.address_street,
                    client.locality_id != null
                      ? `${t("clients.detail.locality")}: ${localityLabel(client.locality_id)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              )}
              {client.contacts
                ?.filter((c) => c.phone || c.name)
                .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
                .map((contact) => {
                  const prefix = [contact.name, contact.role]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <Typography
                      key={contact.id ?? `${contact.name}-${contact.phone}`}
                      variant="body2"
                      color="text.secondary"
                      sx={{ mt: 0.5 }}
                    >
                      {prefix || null}
                      {prefix && contact.phone ? " · " : null}
                      {contact.phone ? (
                        <Link href={`tel:${contact.phone}`} underline="hover">
                          {contact.phone}
                        </Link>
                      ) : null}
                      {contact.is_primary
                        ? ` · ${t("clients.form.contact_primary")}`
                        : null}
                    </Typography>
                  );
                })}
              {client.delivery_instructions && (
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {client.delivery_instructions}
                </Typography>
              )}
            </Box>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
              <Kpi
                label={t("clients.detail.kpi.outstanding")}
                value={summary?.open_count ?? client.outstanding_count ?? 0}
              />
              <Kpi
                label={t("clients.detail.kpi.rentals")}
                value={summary?.open_rental_count ?? 0}
              />
              <Kpi
                label={t("clients.detail.kpi.refills")}
                value={summary?.open_refill_count ?? 0}
              />
              <Kpi
                label={t("clients.detail.kpi.closed_days")}
                value={summary?.closed_days_last_period ?? 0}
              />
              <Kpi
                label={t("clients.detail.kpi.accessories")}
                value={client.open_accessory_count ?? 0}
              />
            </Stack>
          </Stack>
          {summary && summary.by_gas.length > 0 && (
            <Stack
              direction="row"
              spacing={1}
              flexWrap="wrap"
              useFlexGap
              sx={{ mt: 2 }}
            >
              {summary.by_gas.map((item) => (
                <Chip
                  key={item.gas_code ?? "none"}
                  size="small"
                  label={`${item.gas_code ?? "—"}: ${item.count}`}
                />
              ))}
            </Stack>
          )}
        </Paper>
      )}

      <Tabs
        value={tab}
        onChange={(_, value: LedgerTab) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="outstanding" label={t("clients.detail.tabs.outstanding")} />
        <Tab value="history" label={t("clients.detail.tabs.history")} />
        <Tab value="rentals" label={t("clients.detail.tabs.rentals")} />
        <Tab value="refills" label={t("clients.detail.tabs.refills")} />
      </Tabs>

      {!isOutstandingTab && (
        <FormControlLabel
          control={
            <Switch
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
          }
          label={t("clients.detail.filters.open_only")}
        />
      )}

      {accountQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        {isOutstandingTab ? (
          <DataGrid
            rows={outstanding}
            columns={outstandingColumns}
            getRowId={(row) => row.movement_id}
            loading={accountQuery.isLoading || accountQuery.isFetching}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            disableRowSelectionOnClick
            localeText={
              locale === "es"
                ? esES.components.MuiDataGrid.defaultProps.localeText
                : enUS.components.MuiDataGrid.defaultProps.localeText
            }
            slots={{
              noRowsOverlay: () => (
                <Stack
                  height="100%"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Typography color="text.secondary">
                    {t("clients.detail.empty")}
                  </Typography>
                </Stack>
              ),
            }}
            sx={{
              [`& .${gridClasses.cell}`]: { outline: "none" },
            }}
          />
        ) : (
          <DataGrid
            rows={accountQuery.data?.data ?? []}
            columns={historyColumns}
            getRowId={(row) => row.id}
            loading={accountQuery.isLoading || accountQuery.isFetching}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            rowCount={
              paginationModel.page * paginationModel.pageSize +
              (accountQuery.data?.data?.length ?? 0) +
              (pageMeta?.has_more ? 1 : 0)
            }
            disableRowSelectionOnClick
            localeText={
              locale === "es"
                ? esES.components.MuiDataGrid.defaultProps.localeText
                : enUS.components.MuiDataGrid.defaultProps.localeText
            }
            slots={{
              noRowsOverlay: () => (
                <Stack
                  height="100%"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Typography color="text.secondary">
                    {t("clients.detail.empty")}
                  </Typography>
                </Stack>
              ),
            }}
            sx={{
              [`& .${gridClasses.cell}`]: { outline: "none" },
            }}
          />
        )}
      </Box>

      <CreateClientDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        client={client}
      />
    </Stack>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
    </Paper>
  );
}
