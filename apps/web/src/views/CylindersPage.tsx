"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import ListSubheader from "@mui/material/ListSubheader";
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
import type {
  Client,
  Cylinder,
  CylinderState,
  OwnershipBasis,
} from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { api } from "../api/client";
import { RegisterCylinderDrawer } from "../features/cylinders/RegisterCylinderDrawer";
import { ReplaceCylinderDialog } from "../features/cylinders/ReplaceCylinderDialog";
import { ReportLossDialog } from "../features/cylinders/ReportLossDialog";
import { useLocations } from "../hooks/useLocations";
import { formatCapacity } from "../lib/format";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { cylinderSortParam } from "../lib/sortParam";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const STATES: CylinderState[] = [
  "IN_STOCK_EMPTY",
  "IN_STOCK_FULL",
  "AT_CLIENT",
  "AT_SUPPLIER",
  "SOLD",
  "LOST",
  "BROKEN",
  "RETURNED_TO_SUPPLIER",
  "RETIRED",
];
const BASES: OwnershipBasis[] = ["OURS", "SUPPLIER", "CUSTOMER"];

export default function CylindersPage() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const router = useRouter();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("cylinders:write"),
  );
  const {
    territories,
    localities,
    territoryLabel,
    encodeFilter,
    decodeFilter,
  } = useLocations();

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<CylinderState | "">("");
  const [basisFilter, setBasisFilter] = useState<OwnershipBasis | "">("");
  const [locationFilter, setLocationFilter] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: "serial_number", sort: "asc" },
  ]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lossTarget, setLossTarget] = useState<Cylinder | null>(null);
  const [replaceTarget, setReplaceTarget] = useState<Cylinder | null>(null);

  const location = decodeFilter(locationFilter);
  const cityFilterId = location?.kind === "locality" ? location.id : undefined;

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", "cylinders", clientQuery, cityFilterId],
    queryFn: () =>
      api.listClients({
        q: clientQuery || undefined,
        limit: 20,
        ...(cityFilterId != null
          ? { "filter[locality_id]": cityFilterId }
          : {}),
      }),
  });

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

  const queryParams = useMemo(() => {
    const locationDecoded = decodeFilter(locationFilter);
    return {
      limit: paginationModel.pageSize,
      cursor,
      q: debouncedSearch || undefined,
      sort: cylinderSortParam(sortModel),
      ...(stateFilter ? { "filter[state]": stateFilter } : {}),
      ...(basisFilter ? { "filter[ownership_basis]": basisFilter } : {}),
      ...(locationDecoded?.kind === "territory"
        ? { "filter[territory_id]": locationDecoded.id }
        : {}),
      ...(locationDecoded?.kind === "locality"
        ? { "filter[locality_id]": locationDecoded.id }
        : {}),
      ...(client ? { "filter[holder_party_id]": client.id } : {}),
    };
  }, [
    paginationModel.pageSize,
    cursor,
    debouncedSearch,
    sortModel,
    stateFilter,
    basisFilter,
    locationFilter,
    client,
    decodeFilter,
  ]);

  const cylindersQuery = useQuery({
    queryKey: ["cylinders", queryParams],
    queryFn: () => api.listCylinders(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = cylindersQuery.data?.data ?? [];
  const pageMeta = cylindersQuery.data?.page;

  useEffect(() => {
    const nextCursor = cylindersQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) =>
      stashNextCursor(prev, paginationModel.page, nextCursor),
    );
  }, [cylindersQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const columns: GridColDef<Cylinder>[] = useMemo(
    () => [
      {
        field: "serial_number",
        headerName: translate("cylinders.columns.serial"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "owner_name",
        headerName: translate("cylinders.columns.owner"),
        width: 160,
        sortable: false,
      },
      {
        field: "current_holder_name",
        headerName: translate("cylinders.columns.holder"),
        width: 180,
        sortable: false,
        valueFormatter: (value: string | null | undefined) => value ?? "—",
      },
      {
        field: "current_location_name",
        headerName: translate("cylinders.columns.city"),
        width: 140,
        sortable: false,
        valueFormatter: (value: string | null | undefined) => value ?? "—",
      },
      {
        field: "gas_code",
        headerName: translate("cylinders.columns.gas"),
        width: 110,
        sortable: false,
      },
      {
        field: "capacity_m3",
        headerName: translate("cylinders.columns.capacity"),
        width: 110,
        sortable: false,
        valueGetter: (_v, row: Cylinder) =>
          formatCapacity(row.capacity_m3, row.capacity_unit),
      },
      {
        field: "ownership_basis",
        headerName: translate("cylinders.columns.basis"),
        width: 120,
        sortable: false,
        valueFormatter: (value: string) => translate(`enums.basis.${value}`),
      },
      {
        field: "state",
        headerName: translate("cylinders.columns.state"),
        width: 160,
        renderCell: (params) => (
          <Chip
            size="small"
            label={translate(`enums.cylinder_state.${params.value}`)}
            color={
              params.value === "AT_CLIENT"
                ? "warning"
                : params.value?.startsWith("IN_STOCK")
                  ? "success"
                  : "default"
            }
          />
        ),
      },
      {
        field: "condition",
        headerName: translate("cylinders.columns.condition"),
        width: 100,
        sortable: false,
        valueFormatter: (value: string) =>
          translate(`enums.condition.${value}`),
      },
      {
        field: "home_territory_id",
        headerName: translate("cylinders.columns.territory"),
        width: 140,
        sortable: false,
        valueFormatter: (value: number | null) => territoryLabel(value),
      },
      {
        field: "actions",
        headerName: "",
        width: 200,
        sortable: false,
        renderCell: (params) => {
          if (!canWrite) return null;
          const terminal = [
            "SOLD",
            "LOST",
            "BROKEN",
            "RETURNED_TO_SUPPLIER",
            "RETIRED",
          ].includes(params.row.state);
          const canReplace =
            params.row.state === "AT_CLIENT" ||
            params.row.state === "LOST" ||
            params.row.state === "BROKEN";
          return (
            <Stack direction="row" spacing={0.5}>
              {!terminal && (
                <Button
                  size="small"
                  color="error"
                  onClick={(event) => {
                    event.stopPropagation();
                    setLossTarget(params.row);
                  }}
                >
                  {translate("actions.report_loss")}
                </Button>
              )}
              {canReplace && (
                <Button
                  size="small"
                  onClick={(event) => {
                    event.stopPropagation();
                    setReplaceTarget(params.row);
                  }}
                >
                  {translate("actions.replace")}
                </Button>
              )}
            </Stack>
          );
        },
      },
    ],
    [translate, canWrite, territoryLabel],
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
        <Typography variant="h5">{translate("cylinders.title")}</Typography>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setDrawerOpen(true)}
          >
            {translate("actions.register_cylinder")}
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <TextField
          size="small"
          label={translate("cylinders.filters.serial")}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          sx={{ minWidth: 200 }}
        />
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{translate("cylinders.filters.location")}</InputLabel>
          <Select
            label={translate("cylinders.filters.location")}
            value={locationFilter}
            onChange={(event) => {
              setLocationFilter(event.target.value);
              setClient(null);
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            <ListSubheader>
              {translate("cylinders.filters.depots")}
            </ListSubheader>
            {territories.map((territory) => (
              <MenuItem
                key={`territory-${territory.id}`}
                value={encodeFilter({ kind: "territory", id: territory.id })}
              >
                {territory.name}
              </MenuItem>
            ))}
            <ListSubheader>
              {translate("cylinders.filters.cities")}
            </ListSubheader>
            {localities.map((locality) => (
              <MenuItem
                key={`locality-${locality.id}`}
                value={encodeFilter({ kind: "locality", id: locality.id })}
              >
                {locality.name}
                {locality.territory_name ? ` · ${locality.territory_name}` : ""}
                {locality.cylinder_count != null
                  ? ` (${locality.cylinder_count})`
                  : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Autocomplete
          size="small"
          sx={{ minWidth: 220 }}
          options={
            client
              ? [
                  client,
                  ...(clientsSearch.data?.data ?? []).filter(
                    (client) => client.id !== client.id,
                  ),
                ]
              : (clientsSearch.data?.data ?? [])
          }
          getOptionLabel={(option: Client) => option.name}
          isOptionEqualToValue={(left, right) => left.id === right.id}
          loading={clientsSearch.isFetching}
          value={client}
          onChange={(_, value) => {
            setClient(value);
            resetPaging();
          }}
          onInputChange={(_, value, reason) => {
            if (reason !== "reset") setClientQuery(value);
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={translate("cylinders.filters.client")}
            />
          )}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>{translate("cylinders.filters.state")}</InputLabel>
          <Select
            label={translate("cylinders.filters.state")}
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value as CylinderState | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {STATES.map((state) => (
              <MenuItem key={state} value={state}>
                {translate(`enums.cylinder_state.${state}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{translate("cylinders.filters.basis")}</InputLabel>
          <Select
            label={translate("cylinders.filters.basis")}
            value={basisFilter}
            onChange={(event) => {
              setBasisFilter(event.target.value as OwnershipBasis | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {BASES.map((basis) => (
              <MenuItem key={basis} value={basis}>
                {translate(`enums.basis.${basis}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      {cylindersQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={cylindersQuery.isLoading || cylindersQuery.isFetching}
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
          onRowClick={(params) => router.push(`/cylinders/${params.id}`)}
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
                spacing={2}
              >
                <Typography color="text.secondary">
                  {translate("cylinders.empty")}
                </Typography>
                {canWrite && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDrawerOpen(true)}
                  >
                    {translate("actions.register_cylinder")}
                  </Button>
                )}
              </Stack>
            ),
          }}
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            [`& .${gridClasses.row}`]: { cursor: "pointer" },
          }}
        />
      </Box>

      <RegisterCylinderDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <ReportLossDialog
        open={Boolean(lossTarget)}
        cylinder={lossTarget}
        onClose={() => setLossTarget(null)}
      />
      <ReplaceCylinderDialog
        open={Boolean(replaceTarget)}
        cylinder={replaceTarget}
        onClose={() => setReplaceTarget(null)}
      />
    </Stack>
  );
}
