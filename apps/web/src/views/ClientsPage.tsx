"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridSortModel,
  gridClasses,
} from "@mui/x-data-grid";
import { enUS, esES } from "@mui/x-data-grid/locales";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { api } from "../api/client";
import type { Client, ClientCoverage, ClientStatus } from "@weld/schemas";
import { ClientLedgerDrawer } from "../features/clients/ClientLedgerDrawer";
import { CreateClientDrawer } from "../features/clients/CreateClientDrawer";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { clientSortParam } from "../lib/sortParam";
import { useLocations } from "../hooks/useLocations";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function ClientsEmptyOverlay({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { t: translate } = useTranslation();
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={{ height: "100%", py: 4 }}
    >
      <Typography color="text.secondary">
        {translate("clients.empty")}
      </Typography>
      {canCreate && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
          {translate("actions.new_client")}
        </Button>
      )}
    </Stack>
  );
}

export default function ClientsPage() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const router = useRouter();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("clients:write"),
  );
  const { localities, localityLabel } = useLocations();

  const cityOptions = useMemo(
    () => localities.filter((locality) => (locality.client_count ?? 0) > 0),
    [localities],
  );

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<number | "">("");
  const [coverageFilter, setCoverageFilter] = useState<ClientCoverage | "">("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "">("");
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: "name", sort: "asc" },
  ]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [ledgerClient, setLedgerClient] = useState<{
    id: number;
    name: string;
  } | null>(null);

  const handleSearchChange = (value: string) => {
    setSearch(value);
    window.clearTimeout((handleSearchChange as { timer?: number }).timer);
    (handleSearchChange as { timer?: number }).timer = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
      setCursors([undefined]);
    }, 300);
  };

  const cursor = cursors[paginationModel.page];

  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      q: debouncedSearch || undefined,
      sort: clientSortParam(sortModel),
      ...(cityFilter !== "" ? { "filter[locality_id]": cityFilter } : {}),
      ...(coverageFilter ? { "filter[coverage]": coverageFilter } : {}),
      ...(statusFilter ? { "filter[status]": statusFilter } : {}),
    }),
    [
      paginationModel.pageSize,
      cursor,
      debouncedSearch,
      sortModel,
      cityFilter,
      coverageFilter,
      statusFilter,
    ],
  );

  const clientsQuery = useQuery({
    queryKey: ["clients", queryParams],
    queryFn: () => api.listClients(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = clientsQuery.data?.data ?? [];
  const pageMeta = clientsQuery.data?.page;

  useEffect(() => {
    const nextCursor = clientsQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) =>
      stashNextCursor(prev, paginationModel.page, nextCursor),
    );
  }, [clientsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const columns: GridColDef<Client>[] = useMemo(
    () => [
      {
        field: "name",
        headerName: translate("clients.columns.name"),
        flex: 1,
        minWidth: 180,
      },
      {
        field: "locality_id",
        headerName: translate("clients.columns.territory"),
        width: 160,
        valueFormatter: (value: number | null) => localityLabel(value),
      },
      {
        field: "coverage",
        headerName: translate("clients.columns.coverage"),
        width: 160,
        valueFormatter: (value: string) => translate(`enums.coverage.${value}`),
      },
      {
        field: "outstanding_count",
        headerName: translate("clients.columns.outstanding"),
        width: 110,
        type: "number",
        valueGetter: (_value, row) => row.outstanding_count ?? 0,
        renderCell: (params) => (
          <Link
            component="button"
            type="button"
            underline="hover"
            onClick={(event) => {
              event.stopPropagation();
              setLedgerClient({ id: params.row.id, name: params.row.name });
            }}
            sx={{ fontWeight: params.value > 0 ? 600 : undefined }}
          >
            {params.value}
          </Link>
        ),
      },
      {
        field: "status",
        headerName: translate("clients.columns.status"),
        width: 120,
        valueFormatter: (value: string) => translate(`enums.status.${value}`),
      },
      {
        field: "version",
        headerName: translate("clients.columns.version"),
        width: 90,
      },
      {
        field: "segment",
        headerName: translate("clients.columns.segment"),
        width: 160,
        valueFormatter: (value: string | null) =>
          value ? translate(`enums.segment.${value}`) : "—",
      },
    ],
    [translate, localityLabel],
  );

  const resetPaging = () => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setCursors([undefined]);
  };

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
        justifyContent="space-between"
      >
        <Typography variant="h5">{translate("clients.title")}</Typography>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDrawerOpen(true)}
          >
            {translate("actions.new_client")}
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          size="small"
          label={translate("actions.search")}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>{translate("clients.filters.territory")}</InputLabel>
          <Select
            label={translate("clients.filters.territory")}
            value={cityFilter}
            onChange={(event) => {
              const value = event.target.value;
              setCityFilter(value === "" ? "" : Number(value));
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {cityOptions.map((locality) => (
              <MenuItem key={locality.id} value={locality.id}>
                {locality.name}
                {locality.client_count != null
                  ? ` (${locality.client_count})`
                  : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{translate("clients.filters.coverage")}</InputLabel>
          <Select
            label={translate("clients.filters.coverage")}
            value={coverageFilter}
            onChange={(event) => {
              setCoverageFilter(event.target.value as ClientCoverage | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            <MenuItem value="PRIVATE">
              {translate("enums.coverage.PRIVATE")}
            </MenuItem>
            <MenuItem value="MUNICIPAL_HOSPITAL">
              {translate("enums.coverage.MUNICIPAL_HOSPITAL")}
            </MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{translate("clients.filters.status")}</InputLabel>
          <Select
            label={translate("clients.filters.status")}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ClientStatus | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            <MenuItem value="ACTIVE">
              {translate("enums.status.ACTIVE")}
            </MenuItem>
            <MenuItem value="DORMANT">
              {translate("enums.status.DORMANT")}
            </MenuItem>
            <MenuItem value="INACTIVE">
              {translate("enums.status.INACTIVE")}
            </MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {clientsQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={clientsQuery.isLoading || clientsQuery.isFetching}
          sortingMode="server"
          filterMode="server"
          paginationMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) => {
            setSortModel(model);
            resetPaging();
          }}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          rowCount={cursorPageRowCount(
            paginationModel.page,
            paginationModel.pageSize,
            rows.length,
            pageMeta?.has_more ?? false,
          )}
          disableRowSelectionOnClick
          onRowClick={(params) => router.push(`/clients/${params.id}`)}
          localeText={
            locale === "es"
              ? esES.components.MuiDataGrid.defaultProps.localeText
              : enUS.components.MuiDataGrid.defaultProps.localeText
          }
          slots={{
            noRowsOverlay: () => (
              <ClientsEmptyOverlay
                canCreate={canWrite}
                onCreate={() => setDrawerOpen(true)}
              />
            ),
          }}
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            [`& .${gridClasses.row}`]: { cursor: "pointer" },
          }}
        />
      </Box>

      <CreateClientDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      <ClientLedgerDrawer
        open={ledgerClient != null}
        clientPartyId={ledgerClient?.id ?? null}
        clientName={ledgerClient?.name}
        onClose={() => setLedgerClient(null)}
      />
    </Stack>
  );
}
