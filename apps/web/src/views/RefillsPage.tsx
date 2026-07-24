"use client";

import AddIcon from "@mui/icons-material/Add";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
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
import type { Client, MovementEvent, MovementState } from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import {
  GridActionsCell,
  gridActionsColumnWidth,
  type GridActionItem,
} from "../components/GridActionsCell";
import { DeliverDrawer } from "../features/movements/DeliverDrawer";
import {
  clientCustodyLabel,
  isMovementReturned,
} from "../features/clients/clientLedgerLogic";
import { ReturnDialog } from "../features/movements/ReturnDialog";
import { SwapDialog } from "../features/movements/SwapDialog";
import { SwapPickDialog } from "../features/movements/SwapPickDialog";
import { VoidDialog } from "../features/movements/VoidDialog";
import { movementStateChipColor } from "../lib/chipColors";
import { formatCapacity } from "../lib/format";
import { useLocations } from "../hooks/useLocations";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { movementSortParam } from "../lib/sortParam";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

/** Customer-owned cylinder refills (Su Propiedad / rellenado). */
export default function RefillsPage() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const canWrite = useSessionStore((state) =>
    state.hasCapability("movements:write"),
  );
  const canVoid = useSessionStore((state) =>
    state.hasCapability("movements:void"),
  );
  const { localities } = useLocations();

  const cityOptions = useMemo(
    () => localities.filter((locality) => (locality.client_count ?? 0) > 0),
    [localities],
  );

  const [openOnly, setOpenOnly] = useState(false);
  const [stateFilter, setStateFilter] = useState<MovementState | "">("");
  const [cityFilter, setCityFilter] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: "delivery_date", sort: "desc" },
  ]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [swapPickOpen, setSwapPickOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState<MovementEvent | null>(null);
  const [swapTarget, setSwapTarget] = useState<MovementEvent | null>(null);
  const [voidTarget, setVoidTarget] = useState<MovementEvent | null>(null);

  const cursor = cursors[paginationModel.page];

  const handleSearchChange = (value: string) => {
    setSearch(value);
    window.clearTimeout((handleSearchChange as { timer?: number }).timer);
    (handleSearchChange as { timer?: number }).timer = window.setTimeout(() => {
      setDebouncedSearch(value);
      setPaginationModel((prev) => ({ ...prev, page: 0 }));
      setCursors([undefined]);
    }, 300);
  };

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", "refills", clientQuery, cityFilter],
    queryFn: () =>
      api.listClients({
        q: clientQuery || undefined,
        limit: 20,
        ...(cityFilter !== "" ? { "filter[locality_id]": cityFilter } : {}),
      }),
  });

  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      q: debouncedSearch || undefined,
      sort: movementSortParam(sortModel),
      "filter[movement_kind]": "REFILL" as const,
      ...(openOnly ? { open: true } : {}),
      ...(stateFilter ? { "filter[state]": stateFilter } : {}),
      ...(client
        ? { "filter[holder_party_id]": client.id }
        : cityFilter !== ""
          ? { "filter[locality_id]": cityFilter }
          : {}),
    }),
    [
      paginationModel.pageSize,
      cursor,
      debouncedSearch,
      sortModel,
      openOnly,
      stateFilter,
      client,
      cityFilter,
    ],
  );

  const movementsQuery = useQuery({
    queryKey: ["refills", queryParams],
    queryFn: () => api.listMovements(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = movementsQuery.data?.data ?? [];
  const pageMeta = movementsQuery.data?.page;

  useEffect(() => {
    const nextCursor = movementsQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) =>
      stashNextCursor(prev, paginationModel.page, nextCursor),
    );
  }, [movementsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const columns: GridColDef<MovementEvent>[] = useMemo(
    () => [
      {
        field: "cylinder_serial",
        headerName: translate("refills.columns.serial"),
        width: 120,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
          >
            {params.value ?? "—"}
          </Link>
        ),
      },
      {
        field: "holder_name",
        headerName: translate("refills.columns.client"),
        flex: 1,
        minWidth: 150,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/clients/${params.row.holder_party_id}`}
            underline="hover"
          >
            {params.value ?? "—"}
          </Link>
        ),
      },
      {
        field: "delivery_date",
        headerName: translate("refills.columns.entry"),
        width: 120,
      },
      {
        field: "return_date",
        headerName: translate("refills.columns.exit"),
        width: 120,
        valueGetter: (_v, row) => row.return_date ?? "—",
      },
      {
        field: "gas_code",
        headerName: translate("refills.columns.gas"),
        width: 100,
        valueGetter: (_v, row) => row.gas_code ?? "—",
      },
      {
        field: "capacity_m3",
        headerName: translate("refills.columns.capacity"),
        width: 110,
        valueGetter: (_v, row) =>
          row.capacity_m3 != null
            ? formatCapacity(row.capacity_m3, row.capacity_unit ?? "M3")
            : "—",
      },
      {
        field: "owner_name",
        headerName: translate("refills.columns.owner"),
        width: 140,
        valueGetter: (_v, row) => row.owner_name ?? "—",
      },
      {
        field: "locality_name",
        headerName: translate("refills.columns.city"),
        width: 130,
        valueGetter: (_v, row) => row.locality_name ?? "—",
      },
      {
        field: "state",
        headerName: translate("refills.columns.state"),
        width: 120,
        renderCell: (params) => {
          const returned = isMovementReturned(params.row);
          return (
            <Chip
              size="small"
              label={clientCustodyLabel(params.row, translate)}
              color={movementStateChipColor(params.row.state, returned)}
            />
          );
        },
      },
      {
        field: "actions",
        headerName: translate("refills.columns.actions"),
        width: gridActionsColumnWidth(3),
        sortable: false,
        filterable: false,
        align: "left",
        headerAlign: "left",
        renderCell: (params) => {
          const actions: GridActionItem[] = [];
          if (canWrite && params.row.state === "OPEN") {
            actions.push({
              key: "return",
              label: translate("actions.return"),
              icon: <AssignmentReturnIcon fontSize="small" />,
              onClick: () => setReturnTarget(params.row),
            });
            actions.push({
              key: "swap",
              label: translate("actions.swap"),
              icon: <SwapHorizIcon fontSize="small" />,
              onClick: () => setSwapTarget(params.row),
            });
          }
          if (canVoid && params.row.state !== "VOID") {
            actions.push({
              key: "void",
              label: translate("actions.void"),
              icon: <CancelOutlinedIcon fontSize="small" />,
              color: "warning",
              onClick: () => setVoidTarget(params.row),
            });
          }
          return <GridActionsCell actions={actions} />;
        },
      },
    ],
    [translate, canWrite, canVoid],
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
        <Stack spacing={0.5}>
          <Typography variant="h5">{translate("refills.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {translate("refills.subtitle")}
          </Typography>
        </Stack>
        {canWrite && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<SwapHorizIcon />}
              onClick={() => setSwapPickOpen(true)}
            >
              {translate("actions.swap")}
            </Button>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setDeliverOpen(true)}
            >
              {translate("actions.new_refill")}
            </Button>
          </Stack>
        )}
      </Stack>

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
      >
        <TextField
          size="small"
          label={translate("refills.filters.serial")}
          value={search}
          onChange={(event) => handleSearchChange(event.target.value)}
          sx={{ minWidth: 200 }}
        />
        <FormControlLabel
          control={
            <Switch
              checked={openOnly}
              onChange={(event) => {
                setOpenOnly(event.target.checked);
                resetPaging();
              }}
            />
          }
          label={translate("refills.filters.open_only")}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>{translate("refills.filters.state")}</InputLabel>
          <Select
            label={translate("refills.filters.state")}
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value as MovementState | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {(["OPEN", "CLOSED", "SWAPPED", "VOID"] as MovementState[]).map(
              (state) => (
                <MenuItem key={state} value={state}>
                  {translate(`enums.movement_state.${state}`)}
                </MenuItem>
              ),
            )}
          </Select>
        </FormControl>
        <FormControl
          size="small"
          sx={{ minWidth: 180 }}
          disabled={client != null}
        >
          <InputLabel>{translate("refills.filters.locality")}</InputLabel>
          <Select
            label={translate("refills.filters.locality")}
            value={cityFilter}
            onChange={(event) => {
              const value = event.target.value;
              setCityFilter(value === "" ? "" : Number(value));
              setClient(null);
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {cityOptions.map((locality) => (
              <MenuItem key={locality.id} value={locality.id}>
                {locality.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Autocomplete
          size="small"
          sx={{ minWidth: 220 }}
          options={clientsSearch.data?.data ?? []}
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
              label={translate("refills.filters.client")}
            />
          )}
        />
      </Stack>

      {movementsQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={movementsQuery.isLoading || movementsQuery.isFetching}
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
                  {translate("refills.empty")}
                </Typography>
                {canWrite && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDeliverOpen(true)}
                  >
                    {translate("actions.new_refill")}
                  </Button>
                )}
              </Stack>
            ),
          }}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>

      <DeliverDrawer
        open={deliverOpen}
        onClose={() => setDeliverOpen(false)}
        defaultKind="REFILL"
      />
      <SwapPickDialog
        open={swapPickOpen}
        onClose={() => setSwapPickOpen(false)}
        onSelect={(movement) => {
          setSwapPickOpen(false);
          setSwapTarget(movement);
        }}
        kindFilter="REFILL"
      />
      <ReturnDialog
        open={Boolean(returnTarget)}
        movement={returnTarget}
        onClose={() => setReturnTarget(null)}
      />
      <SwapDialog
        open={Boolean(swapTarget)}
        movement={swapTarget}
        onClose={() => setSwapTarget(null)}
      />
      <VoidDialog
        open={Boolean(voidTarget)}
        movement={voidTarget}
        onClose={() => setVoidTarget(null)}
      />
    </Stack>
  );
}
