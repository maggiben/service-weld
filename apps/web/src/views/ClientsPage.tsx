"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
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
import type { ClientListQuery } from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { api } from "../api/client";
import type { ClientCoverage, ClientStatus } from "@weld/schemas";
import { CreateClientDrawer } from "../features/clients/CreateClientDrawer";
import { useTerritories } from "../hooks/useTerritories";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function sortToApiParam(sortModel: GridSortModel): ClientListQuery["sort"] {
  if (sortModel.length === 0) return "name";
  const { field, sort } = sortModel[0]!;
  const prefix = sort === "desc" ? "-" : "";
  if (field === "name" || field === "territory_id" || field === "created_at") {
    return `${prefix}${field}` as ClientListQuery["sort"];
  }
  return "name";
}

function ClientsEmptyOverlay({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      spacing={2}
      sx={{ height: "100%", py: 4 }}
    >
      <Typography color="text.secondary">{t("clients.empty")}</Typography>
      {canCreate && (
        <Button variant="contained" startIcon={<AddIcon />} onClick={onCreate}>
          {t("actions.new_client")}
        </Button>
      )}
    </Stack>
  );
}

export default function ClientsPage() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const router = useRouter();
  const canWrite = useSessionStore((s) => s.hasCapability("clients:write"));
  const { territories, label: territoryLabel } = useTerritories();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [territoryFilter, setTerritoryFilter] = useState<number | "">("");
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
      sort: sortToApiParam(sortModel),
      ...(territoryFilter !== ""
        ? { "filter[territory_id]": territoryFilter }
        : {}),
      ...(coverageFilter ? { "filter[coverage]": coverageFilter } : {}),
      ...(statusFilter ? { "filter[status]": statusFilter } : {}),
    }),
    [
      paginationModel.pageSize,
      cursor,
      debouncedSearch,
      sortModel,
      territoryFilter,
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
    setCursors((prev) => {
      const next = [...prev];
      next[paginationModel.page + 1] = nextCursor;
      return next;
    });
  }, [clientsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "name",
        headerName: t("clients.columns.name"),
        flex: 1,
        minWidth: 180,
      },
      {
        field: "territory_id",
        headerName: t("clients.columns.territory"),
        width: 140,
        valueFormatter: (value: number) => territoryLabel(value),
      },
      {
        field: "coverage",
        headerName: t("clients.columns.coverage"),
        width: 160,
        valueFormatter: (value: string) => t(`enums.coverage.${value}`),
      },
      {
        field: "segment",
        headerName: t("clients.columns.segment"),
        width: 160,
        valueFormatter: (value: string | null) =>
          value ? t(`enums.segment.${value}`) : "—",
      },
      {
        field: "status",
        headerName: t("clients.columns.status"),
        width: 120,
        valueFormatter: (value: string) => t(`enums.status.${value}`),
      },
      { field: "version", headerName: t("clients.columns.version"), width: 90 },
    ],
    [t, territoryLabel],
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
        <Typography variant="h5">{t("clients.title")}</Typography>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDrawerOpen(true)}
          >
            {t("actions.new_client")}
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          size="small"
          label={t("actions.search")}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          sx={{ minWidth: 240 }}
        />
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t("clients.filters.territory")}</InputLabel>
          <Select
            label={t("clients.filters.territory")}
            value={territoryFilter}
            onChange={(event) => {
              const value = event.target.value;
              setTerritoryFilter(value === "" ? "" : Number(value));
              resetPaging();
            }}
          >
            <MenuItem value="">{t("clients.filters.all")}</MenuItem>
            {territories.map((territory) => (
              <MenuItem key={territory.id} value={territory.id}>
                {territory.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{t("clients.filters.coverage")}</InputLabel>
          <Select
            label={t("clients.filters.coverage")}
            value={coverageFilter}
            onChange={(event) => {
              setCoverageFilter(event.target.value as ClientCoverage | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{t("clients.filters.all")}</MenuItem>
            <MenuItem value="PRIVATE">{t("enums.coverage.PRIVATE")}</MenuItem>
            <MenuItem value="MUNICIPAL_HOSPITAL">
              {t("enums.coverage.MUNICIPAL_HOSPITAL")}
            </MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t("clients.filters.status")}</InputLabel>
          <Select
            label={t("clients.filters.status")}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as ClientStatus | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{t("clients.filters.all")}</MenuItem>
            <MenuItem value="ACTIVE">{t("enums.status.ACTIVE")}</MenuItem>
            <MenuItem value="DORMANT">{t("enums.status.DORMANT")}</MenuItem>
            <MenuItem value="INACTIVE">{t("enums.status.INACTIVE")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      {clientsQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
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
          rowCount={
            paginationModel.page * paginationModel.pageSize +
            rows.length +
            (pageMeta?.has_more ? 1 : 0)
          }
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
    </Stack>
  );
}
