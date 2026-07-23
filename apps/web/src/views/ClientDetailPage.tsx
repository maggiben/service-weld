"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
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
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { enUS, esES } from "@mui/x-data-grid/locales";
import type { MovementKind } from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import {
  buildHistoryColumns,
  buildOutstandingColumns,
} from "../features/clients/clientLedgerColumns";
import { formatOpenRentalsKpiDetail } from "../features/clients/clientLedgerLogic";
import { ClientLocationMapPanel } from "../features/clients/ClientLocationMapPanel";
import { buildClientLocationQuery } from "../features/clients/clientLocationMap";
import { CreateClientDrawer } from "../features/clients/CreateClientDrawer";
import { useLocations } from "../hooks/useLocations";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type DetailTab = "outstanding" | "history" | "rentals" | "refills" | "location";

export default function ClientDetailPage() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const {
    localities,
    localityLabel,
    isLoading: locationsLoading,
  } = useLocations();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("clients:write"),
  );
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const clientId = Number(params.id);

  const [tab, setTab] = useState<DetailTab>("outstanding");
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

  const summary = accountQuery.data?.rental_summary;
  const outstanding = accountQuery.data?.outstanding ?? [];

  const outstandingColumns = useMemo(
    () => buildOutstandingColumns(translate),
    [translate],
  );

  const historyColumns = useMemo(
    () =>
      buildHistoryColumns(translate, tab === "refills" ? "refills" : "history"),
    [translate, tab],
  );

  const client = clientQuery.data;
  const isOutstandingTab = tab === "outstanding";
  const isLocationTab = tab === "location";
  const isLedgerTab = !isLocationTab;
  const pageMeta = accountQuery.data?.page;

  const locality = useMemo(() => {
    if (client?.locality_id == null) return null;
    return localities.find((row) => row.id === client.locality_id) ?? null;
  }, [client?.locality_id, localities]);

  const locationParts = useMemo(
    () => ({
      addressStreet: client?.address_street,
      localityName: locality?.name ?? null,
      province: locality?.province ?? null,
    }),
    [client?.address_street, locality],
  );

  const showLocationTab =
    Boolean(client?.address_street?.trim()) ||
    (client?.locality_id != null && (locality != null || locationsLoading));
  const locationQuery = buildClientLocationQuery(locationParts);

  useEffect(() => {
    if (!showLocationTab && tab === "location") {
      setTab("outstanding");
    }
  }, [showLocationTab, tab]);

  if (!Number.isFinite(clientId)) {
    return <Alert severity="error">{translate("errors.load_failed")}</Alert>;
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
          {translate("clients.detail.back")}
        </Button>
        {canWrite && client && (
          <Button
            variant="outlined"
            size="small"
            startIcon={<EditIcon />}
            onClick={() => setEditOpen(true)}
          >
            {translate("actions.edit")}
          </Button>
        )}
      </Stack>

      {clientQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
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
                  label={translate(`enums.coverage.${client.coverage}`)}
                  color="primary"
                  variant="outlined"
                />
                {client.segment && (
                  <Chip
                    size="small"
                    label={translate(`enums.segment.${client.segment}`)}
                  />
                )}
                <Chip
                  size="small"
                  label={translate(`enums.status.${client.status}`)}
                />
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
                      ? `${translate("clients.detail.locality")}: ${localityLabel(client.locality_id)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              )}
              {client.contacts
                ?.filter((client) => client.phone || client.name)
                .sort(
                  (left, right) =>
                    Number(right.is_primary) - Number(left.is_primary),
                )
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
                        ? ` · ${translate("clients.form.contact_primary")}`
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
                label={translate("clients.detail.kpi.outstanding")}
                value={summary?.open_count ?? client.outstanding_count ?? 0}
              />
              <Kpi
                label={translate("clients.detail.kpi.rentals")}
                value={summary?.open_rental_count ?? 0}
                detail={
                  summary
                    ? formatOpenRentalsKpiDetail(summary, translate)
                    : undefined
                }
              />
              <Kpi
                label={translate("clients.detail.kpi.refills")}
                value={summary?.open_refill_count ?? 0}
              />
              <Kpi
                label={translate("clients.detail.kpi.closed_days")}
                value={summary?.closed_days_last_period ?? 0}
              />
              <Kpi
                label={translate("clients.detail.kpi.accessories")}
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
        onChange={(_, value: DetailTab) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab
          value="outstanding"
          label={translate("clients.detail.tabs.outstanding")}
        />
        <Tab value="history" label={translate("clients.detail.tabs.history")} />
        <Tab value="rentals" label={translate("clients.detail.tabs.rentals")} />
        <Tab value="refills" label={translate("clients.detail.tabs.refills")} />
        {showLocationTab && (
          <Tab
            value="location"
            label={translate("clients.detail.tabs.location")}
          />
        )}
      </Tabs>

      {isLedgerTab && !isOutstandingTab && (
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

      {isLedgerTab && accountQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        {isLocationTab && locationQuery ? (
          <ClientLocationMapPanel query={locationQuery} locale={locale} />
        ) : isLocationTab ? (
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              height: "100%",
              minHeight: 360,
              display: "grid",
              placeItems: "center",
            }}
          >
            <Typography color="text.secondary">
              {translate("clients.detail.map.loading")}
            </Typography>
          </Paper>
        ) : isOutstandingTab ? (
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
                    {translate("clients.detail.empty")}
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
            rowCount={cursorPageRowCount(
              paginationModel.page,
              paginationModel.pageSize,
              accountQuery.data?.data?.length ?? 0,
              pageMeta?.has_more ?? false,
            )}
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
                    {translate("clients.detail.empty")}
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
        onDeleted={() => router.push("/clients")}
      />
    </Stack>
  );
}

function Kpi({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail?: string;
}) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 110 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h6">{value}</Typography>
      {detail ? (
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mt: 0.25 }}
        >
          {detail}
        </Typography>
      ) : null}
    </Paper>
  );
}
