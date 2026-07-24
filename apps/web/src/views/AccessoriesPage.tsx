"use client";

import AddIcon from "@mui/icons-material/Add";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import NextLink from "next/link";
import { useSearchParams } from "next/navigation";
import type {
  Accessory,
  AccessoryRental,
  AccessoryType,
  ChargeBasis,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import {
  GridActionsCell,
  gridActionsColumnWidth,
} from "../components/GridActionsCell";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { todayIso } from "../lib/dateFormat";
import { useSessionStore } from "../store/sessionStore";

const TYPES: AccessoryType[] = ["REGULATOR", "ADAPTER", "PORTABLE_O2_BACKPACK"];

export default function AccessoriesPage() {
  const { t: translate } = useTranslation();
  const searchParams = useSearchParams();
  const remitoFilterParam = searchParams.get("remito_id");
  const remitoFilterId =
    remitoFilterParam != null && remitoFilterParam !== ""
      ? Number(remitoFilterParam)
      : null;
  const remitoFilter =
    remitoFilterId != null && Number.isFinite(remitoFilterId)
      ? remitoFilterId
      : null;

  const remitoNoteQuery = useQuery({
    queryKey: ["delivery-notes", "detail", remitoFilter],
    queryFn: () => api.getDeliveryNote(remitoFilter!),
    enabled: remitoFilter != null,
  });
  const remitoLabel =
    remitoNoteQuery.data?.remito_number ??
    (remitoFilter != null ? String(remitoFilter) : "");

  const canWrite = useSessionStore((state) =>
    state.hasCapability("accessories:write"),
  );
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(remitoFilter != null ? 1 : 0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawer, setDrawer] = useState<"create" | "rent" | null>(null);
  const [type, setType] = useState<AccessoryType>("REGULATOR");
  const [identifier, setIdentifier] = useState("");
  const [ownerId, setOwnerId] = useState("1");
  const [accessoryId, setAccessoryId] = useState("");
  const [clientId, setClientId] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [basis, setBasis] = useState<ChargeBasis>("RENTAL");
  const [remitoNumber, setRemitoNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cursor = cursors[paginationModel.page];
  const accessoriesQuery = useQuery({
    queryKey: ["accessories", paginationModel.pageSize, cursor],
    queryFn: () =>
      api.listAccessories({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-updated_at",
      }),
    enabled: tab === 0 && (paginationModel.page === 0 || cursor != null),
  });

  const rentalsQuery = useQuery({
    queryKey: [
      "accessory-rentals",
      paginationModel.pageSize,
      cursor,
      remitoFilter,
    ],
    queryFn: () =>
      api.listAccessoryRentals({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-start_date",
        ...(remitoFilter != null
          ? { "filter[remito_id]": remitoFilter }
          : { open: true }),
      }),
    enabled: tab === 1 && (paginationModel.page === 0 || cursor != null),
  });

  const accessoryRows = accessoriesQuery.data?.data ?? [];
  const accessoryPageMeta = accessoriesQuery.data?.page;
  const rentalRows = rentalsQuery.data?.data ?? [];
  const rentalPageMeta = rentalsQuery.data?.page;

  const clientsQuery = useQuery({
    queryKey: ["clients", "accessory-rent"],
    queryFn: () => api.listClients({ limit: 100, sort: "name" }),
    enabled: drawer === "rent",
  });

  useEffect(() => {
    const next =
      tab === 0
        ? accessoriesQuery.data?.page.next_cursor
        : rentalsQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [
    tab,
    accessoriesQuery.data?.page.next_cursor,
    rentalsQuery.data?.page.next_cursor,
    paginationModel.page,
  ]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createAccessory({
        accessory_type: type,
        identifier: identifier.trim() || null,
        owner_party_id: Number(ownerId),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accessories"] });
      setDrawer(null);
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const rentMutation = useMutation({
    mutationFn: () =>
      api.createAccessoryRental({
        accessory_id: Number(accessoryId),
        client_party_id: Number(clientId),
        quantity: 1,
        start_date: startDate,
        charge_basis: basis,
        remito_number: remitoNumber.trim() || null,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accessories"] }),
        queryClient.invalidateQueries({ queryKey: ["accessory-rentals"] }),
        queryClient.invalidateQueries({ queryKey: ["delivery-notes"] }),
      ]);
      setDrawer(null);
      setRemitoNumber("");
      setError(null);
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        err.code === "ACCESSORY_ALREADY_ON_LOAN"
      ) {
        setError(translate("errors.accessory_already_on_loan"));
        return;
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const returnMutation = useMutation({
    mutationFn: (row: AccessoryRental) =>
      api.returnAccessoryRental(
        row.id,
        { end_date: todayIso() },
        { ifMatch: row.version },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accessories"] }),
        queryClient.invalidateQueries({ queryKey: ["accessory-rentals"] }),
      ]);
    },
  });

  const accessoryColumns = useMemo<GridColDef<Accessory>[]>(
    () => [
      {
        field: "accessory_type",
        headerName: translate("accessories.columns.type"),
        width: 160,
        valueFormatter: (value: AccessoryType) =>
          translate(`enums.accessory_type.${value}`),
      },
      {
        field: "identifier",
        headerName: translate("accessories.columns.identifier"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "state",
        headerName: translate("accessories.columns.state"),
        width: 120,
        valueFormatter: (value: string) =>
          translate(`enums.accessory_state.${value}`),
      },
      {
        field: "owner_name",
        headerName: translate("accessories.columns.owner"),
        flex: 1,
        minWidth: 120,
      },
    ],
    [translate],
  );

  const rentalColumns = useMemo<GridColDef<AccessoryRental>[]>(
    () => [
      {
        field: "accessory_type",
        headerName: translate("accessories.columns.type"),
        width: 140,
        valueFormatter: (value: AccessoryType | undefined) =>
          value ? translate(`enums.accessory_type.${value}`) : "—",
      },
      {
        field: "client_name",
        headerName: translate("accessories.rentals.columns.client"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "start_date",
        headerName: translate("accessories.rentals.columns.start"),
        width: 120,
      },
      {
        field: "charge_basis",
        headerName: translate("accessories.rentals.columns.basis"),
        width: 120,
        valueFormatter: (value: ChargeBasis) =>
          translate(`enums.charge_basis.${value}`),
      },
      {
        field: "actions",
        headerName: "",
        width: gridActionsColumnWidth(1),
        sortable: false,
        filterable: false,
        align: "left",
        headerAlign: "left",
        renderCell: (params) =>
          canWrite && params.row.state === "ON_LOAN" ? (
            <GridActionsCell
              actions={[
                {
                  key: "return",
                  label: translate("actions.return"),
                  icon: <AssignmentReturnIcon fontSize="small" />,
                  onClick: () => returnMutation.mutate(params.row),
                },
              ]}
            />
          ) : null,
      },
    ],
    [translate, canWrite, returnMutation],
  );

  const activeQueryError =
    tab === 0 ? accessoriesQuery.isError : rentalsQuery.isError;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">{translate("accessories.title")}</Typography>
        {canWrite && (
          <Stack direction="row" spacing={1}>
            <Button
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={() => {
                setDrawer("create");
                setError(null);
              }}
            >
              {translate("actions.new_accessory")}
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setDrawer("rent");
                setError(null);
              }}
            >
              {translate("actions.rent_accessory")}
            </Button>
          </Stack>
        )}
      </Stack>

      {remitoFilter != null && (
        <Alert
          severity="info"
          action={
            <Button
              color="inherit"
              size="small"
              component={NextLink}
              href="/accessories"
            >
              {translate("movements.filters.clear_remito")}
            </Button>
          }
        >
          {translate("movements.filters.remito_active", { id: remitoLabel })}
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(_, value) => {
          setTab(value);
          setCursors([undefined]);
          setPaginationModel((part) => ({ ...part, page: 0 }));
        }}
      >
        <Tab label={translate("accessories.tabs.inventory")} />
        <Tab label={translate("accessories.tabs.rentals")} />
      </Tabs>

      {activeQueryError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        {tab === 0 ? (
          <DataGrid
            rows={accessoryRows}
            columns={accessoryColumns}
            getRowId={(row) => row.id}
            loading={accessoriesQuery.isLoading || accessoriesQuery.isFetching}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            pageSizeOptions={[25, 50]}
            rowCount={cursorPageRowCount(
              paginationModel.page,
              paginationModel.pageSize,
              accessoryRows.length,
              accessoryPageMeta?.has_more ?? false,
            )}
            disableRowSelectionOnClick
            sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          />
        ) : (
          <DataGrid
            rows={rentalRows}
            columns={rentalColumns}
            getRowId={(row) => row.id}
            loading={rentalsQuery.isLoading || rentalsQuery.isFetching}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={handlePaginationModelChange}
            pageSizeOptions={[25, 50]}
            rowCount={cursorPageRowCount(
              paginationModel.page,
              paginationModel.pageSize,
              rentalRows.length,
              rentalPageMeta?.has_more ?? false,
            )}
            disableRowSelectionOnClick
            sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          />
        )}
      </Box>

      <Drawer
        anchor="right"
        open={drawer != null}
        onClose={() => setDrawer(null)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">
            {drawer === "create"
              ? translate("accessories.form.title")
              : translate("accessories.rent.title")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {drawer === "create" && (
            <>
              <TextField
                select
                label={translate("accessories.form.type")}
                value={type}
                onChange={(event) =>
                  setType(event.target.value as AccessoryType)
                }
              >
                {TYPES.map((option) => (
                  <MenuItem key={option} value={option}>
                    {translate(`enums.accessory_type.${option}`)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={translate("accessories.form.identifier")}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
              />
              <TextField
                label={translate("accessories.form.owner_id")}
                value={ownerId}
                onChange={(event) => setOwnerId(event.target.value)}
                type="number"
              />
              <Button
                variant="contained"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {translate("actions.save")}
              </Button>
            </>
          )}
          {drawer === "rent" && (
            <>
              <TextField
                label={translate("accessories.rent.accessory_id")}
                value={accessoryId}
                onChange={(event) => setAccessoryId(event.target.value)}
                type="number"
              />
              <TextField
                select
                label={translate("accessories.rent.client")}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
              >
                {(clientsQuery.data?.data ?? []).map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.name}
                  </MenuItem>
                ))}
              </TextField>
              <DatePicker
                label={translate("accessories.rent.start")}
                value={dayjs(startDate)}
                onChange={(value: Dayjs | null) => {
                  if (value) setStartDate(value.format("YYYY-MM-DD"));
                }}
              />
              <TextField
                select
                label={translate("accessories.rent.basis")}
                value={basis}
                onChange={(event) =>
                  setBasis(event.target.value as ChargeBasis)
                }
              >
                <MenuItem value="RENTAL">
                  {translate("enums.charge_basis.RENTAL")}
                </MenuItem>
                <MenuItem value="FREE_LOAN">
                  {translate("enums.charge_basis.FREE_LOAN")}
                </MenuItem>
              </TextField>
              <TextField
                label={translate("accessories.rent.remito_number")}
                value={remitoNumber}
                onChange={(event) => setRemitoNumber(event.target.value)}
                helperText={translate("accessories.rent.remito_hint")}
              />
              <Button
                variant="contained"
                onClick={() => rentMutation.mutate()}
                disabled={rentMutation.isPending}
              >
                {translate("actions.save")}
              </Button>
            </>
          )}
        </Stack>
      </Drawer>
    </Box>
  );
}
