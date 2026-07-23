"use client";

import AddIcon from "@mui/icons-material/Add";
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
import type {
  Client,
  MovementEvent,
  MovementKind,
  MovementState,
} from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { DeliverDrawer } from "../features/movements/DeliverDrawer";
import { displayRentalDays } from "../features/movements/displayRentalDays";
import {
  clientCustodyLabel,
  isMovementReturned,
} from "../features/clients/clientLedgerLogic";
import { ReturnDialog } from "../features/movements/ReturnDialog";
import { SwapDialog } from "../features/movements/SwapDialog";
import { SwapPickDialog } from "../features/movements/SwapPickDialog";
import { VoidDialog } from "../features/movements/VoidDialog";
import { movementStateChipColor } from "../lib/chipColors";
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

export default function MovementsPage() {
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
  const [kindFilter, setKindFilter] = useState<MovementKind | "">("");
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
    queryKey: ["clients", "picker", "movements", clientQuery, cityFilter],
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
      // "Open only" = outstanding rentals of our/supplier stock, not customer refills.
      ...(openOnly
        ? { open: true, "filter[movement_kind]": "RENTAL" as const }
        : kindFilter
          ? { "filter[movement_kind]": kindFilter }
          : {}),
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
      kindFilter,
      stateFilter,
      client,
      cityFilter,
    ],
  );

  const movementsQuery = useQuery({
    queryKey: ["movements", queryParams],
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

  const showRentalDays = kindFilter !== "REFILL";

  const columns: GridColDef<MovementEvent>[] = useMemo(() => {
    const cols: GridColDef<MovementEvent>[] = [
      {
        field: "delivery_date",
        headerName: translate("movements.columns.delivery"),
        width: 120,
      },
      {
        field: "return_date",
        headerName: translate("movements.columns.return"),
        width: 120,
        valueGetter: (_v, row) => row.return_date ?? "—",
      },
      {
        field: "cylinder_serial",
        headerName: translate("movements.columns.serial"),
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
        headerName: translate("movements.columns.holder"),
        flex: 1,
        minWidth: 160,
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
        field: "property_basis",
        headerName: translate("movements.columns.property"),
        width: 120,
        valueFormatter: (value: string) => translate(`enums.basis.${value}`),
      },
      {
        field: "movement_kind",
        headerName: translate("movements.columns.kind"),
        width: 110,
        valueFormatter: (value: string) =>
          translate(`enums.movement_kind.${value}`),
      },
      {
        field: "gas_code",
        headerName: translate("movements.columns.gas"),
        width: 100,
      },
    ];

    // Refill-only view: customer-owned cycles — rental days do not apply.
    if (showRentalDays) {
      cols.push({
        field: "rental_days",
        headerName: translate("movements.columns.rental_days"),
        width: 110,
        type: "number",
        valueGetter: (_v, row) => displayRentalDays(row),
      });
    }

    cols.push(
      {
        field: "state",
        headerName: translate("movements.columns.state"),
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
        headerName: translate("movements.columns.actions"),
        width: 260,
        sortable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          // Customer-owned (refill) stock is theirs — no "return to us", only canje.
          const canReturn =
            params.row.property_basis !== "CUSTOMER" &&
            params.row.movement_kind !== "REFILL";
          return (
            <Stack direction="row" spacing={0.5} justifyContent="flex-end">
              {canWrite && params.row.state === "OPEN" ? (
                <>
                  {canReturn ? (
                    <Button
                      size="small"
                      onClick={() => setReturnTarget(params.row)}
                    >
                      {translate("actions.return")}
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    onClick={() => setSwapTarget(params.row)}
                  >
                    {translate("actions.swap")}
                  </Button>
                </>
              ) : null}
              {canVoid && params.row.state !== "VOID" ? (
                <Button
                  size="small"
                  color="warning"
                  onClick={() => setVoidTarget(params.row)}
                >
                  {translate("actions.void")}
                </Button>
              ) : null}
            </Stack>
          );
        },
      },
    );

    return cols;
  }, [translate, canWrite, canVoid, showRentalDays]);

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
        <Stack direction="row" spacing={1.5} alignItems="baseline">
          <Typography variant="h5">{translate("movements.title")}</Typography>
          {pageMeta?.total_estimate != null && (
            <Typography variant="body2" color="text.secondary">
              {translate("movements.total", {
                count: pageMeta.total_estimate,
              })}
            </Typography>
          )}
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
              {translate("actions.new_delivery")}
            </Button>
          </Stack>
        )}
      </Stack>

      <Alert severity="info" sx={{ py: 0.5 }}>
        {translate("movements.swap.list_hint")}
      </Alert>
      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        alignItems={{ md: "center" }}
      >
        <TextField
          size="small"
          label={translate("movements.filters.serial")}
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
                if (event.target.checked) setKindFilter("");
                resetPaging();
              }}
            />
          }
          label={translate("movements.filters.open_only")}
        />
        <FormControl size="small" sx={{ minWidth: 140 }} disabled={openOnly}>
          <InputLabel>{translate("movements.filters.kind")}</InputLabel>
          <Select
            label={translate("movements.filters.kind")}
            value={openOnly ? "RENTAL" : kindFilter}
            onChange={(event) => {
              setKindFilter(event.target.value as MovementKind | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            <MenuItem value="RENTAL">
              {translate("enums.movement_kind.RENTAL")}
            </MenuItem>
            <MenuItem value="REFILL">
              {translate("enums.movement_kind.REFILL")}
            </MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>{translate("movements.filters.state")}</InputLabel>
          <Select
            label={translate("movements.filters.state")}
            value={stateFilter}
            onChange={(event) => {
              setStateFilter(event.target.value as MovementState | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {(
              [
                "OPEN",
                "CLOSED",
                "SWAPPED",
                "VOID",
                "LOST",
                "SOLD",
              ] as MovementState[]
            ).map((state) => (
              <MenuItem key={state} value={state}>
                {translate(`enums.movement_state.${state}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          size="small"
          sx={{ minWidth: 180 }}
          disabled={client != null}
        >
          <InputLabel>{translate("movements.filters.locality")}</InputLabel>
          <Select
            label={translate("movements.filters.locality")}
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
                {locality.client_count != null
                  ? ` (${locality.client_count})`
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
              label={translate("movements.filters.client")}
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
                  {translate("movements.empty")}
                </Typography>
                {canWrite && (
                  <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setDeliverOpen(true)}
                  >
                    {translate("actions.new_delivery")}
                  </Button>
                )}
              </Stack>
            ),
          }}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>

      <DeliverDrawer open={deliverOpen} onClose={() => setDeliverOpen(false)} />
      <SwapPickDialog
        open={swapPickOpen}
        onClose={() => setSwapPickOpen(false)}
        onSelect={(movement) => {
          setSwapPickOpen(false);
          setSwapTarget(movement);
        }}
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
