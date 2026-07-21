"use client";

import AddIcon from "@mui/icons-material/Add";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Accessory,
  AccessoryRental,
  AccessoryType,
  ChargeBasis,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { useSessionStore } from "../store/sessionStore";

const TYPES: AccessoryType[] = ["REGULATOR", "ADAPTER", "PORTABLE_O2_BACKPACK"];

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

export default function AccessoriesPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) => s.hasCapability("accessories:write"));
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
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
    enabled: tab === 0,
  });

  const rentalsQuery = useQuery({
    queryKey: ["accessory-rentals", paginationModel.pageSize, cursor],
    queryFn: () =>
      api.listAccessoryRentals({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-start_date",
        open: true,
      }),
    enabled: tab === 1,
  });

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
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [
    tab,
    accessoriesQuery.data?.page.next_cursor,
    rentalsQuery.data?.page.next_cursor,
    paginationModel.page,
  ]);

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
        err instanceof ApiClientError ? err.message : t("errors.generic"),
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
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["accessories"] }),
        queryClient.invalidateQueries({ queryKey: ["accessory-rentals"] }),
      ]);
      setDrawer(null);
      setError(null);
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        err.code === "ACCESSORY_ALREADY_ON_LOAN"
      ) {
        setError(t("errors.accessory_already_on_loan"));
        return;
      }
      setError(
        err instanceof ApiClientError ? err.message : t("errors.generic"),
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
        headerName: t("accessories.columns.type"),
        width: 160,
        valueFormatter: (v: AccessoryType) => t(`enums.accessory_type.${v}`),
      },
      {
        field: "identifier",
        headerName: t("accessories.columns.identifier"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "state",
        headerName: t("accessories.columns.state"),
        width: 120,
        valueFormatter: (v: string) => t(`enums.accessory_state.${v}`),
      },
      {
        field: "owner_name",
        headerName: t("accessories.columns.owner"),
        flex: 1,
        minWidth: 120,
      },
    ],
    [t],
  );

  const rentalColumns = useMemo<GridColDef<AccessoryRental>[]>(
    () => [
      {
        field: "accessory_type",
        headerName: t("accessories.columns.type"),
        width: 140,
        valueFormatter: (v: AccessoryType | undefined) =>
          v ? t(`enums.accessory_type.${v}`) : "—",
      },
      {
        field: "client_name",
        headerName: t("accessories.rentals.columns.client"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "start_date",
        headerName: t("accessories.rentals.columns.start"),
        width: 120,
      },
      {
        field: "charge_basis",
        headerName: t("accessories.rentals.columns.basis"),
        width: 120,
        valueFormatter: (v: ChargeBasis) => t(`enums.charge_basis.${v}`),
      },
      {
        field: "actions",
        headerName: "",
        width: 120,
        sortable: false,
        renderCell: (params) =>
          canWrite && params.row.state === "ON_LOAN" ? (
            <Button
              size="small"
              onClick={() => returnMutation.mutate(params.row)}
            >
              {t("actions.return")}
            </Button>
          ) : null,
      },
    ],
    [t, canWrite, returnMutation],
  );

  const activeQueryError =
    tab === 0 ? accessoriesQuery.isError : rentalsQuery.isError;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5">{t("accessories.title")}</Typography>
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
              {t("actions.new_accessory")}
            </Button>
            <Button
              variant="contained"
              onClick={() => {
                setDrawer("rent");
                setError(null);
              }}
            >
              {t("actions.rent_accessory")}
            </Button>
          </Stack>
        )}
      </Stack>

      <Tabs
        value={tab}
        onChange={(_, v) => {
          setTab(v);
          setCursors([undefined]);
          setPaginationModel((p) => ({ ...p, page: 0 }));
        }}
      >
        <Tab label={t("accessories.tabs.inventory")} />
        <Tab label={t("accessories.tabs.rentals")} />
      </Tabs>

      {activeQueryError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        {tab === 0 ? (
          <DataGrid
            rows={accessoriesQuery.data?.data ?? []}
            columns={accessoryColumns}
            getRowId={(row) => row.id}
            loading={accessoriesQuery.isLoading || accessoriesQuery.isFetching}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50]}
            rowCount={accessoriesQuery.data?.page.total_estimate ?? -1}
            paginationMeta={{
              hasNextPage: accessoriesQuery.data?.page.has_more ?? false,
            }}
            disableRowSelectionOnClick
            sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          />
        ) : (
          <DataGrid
            rows={rentalsQuery.data?.data ?? []}
            columns={rentalColumns}
            getRowId={(row) => row.id}
            loading={rentalsQuery.isLoading || rentalsQuery.isFetching}
            paginationMode="server"
            paginationModel={paginationModel}
            onPaginationModelChange={setPaginationModel}
            pageSizeOptions={[25, 50]}
            rowCount={rentalsQuery.data?.page.total_estimate ?? -1}
            paginationMeta={{
              hasNextPage: rentalsQuery.data?.page.has_more ?? false,
            }}
            disableRowSelectionOnClick
            sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          />
        )}
      </Box>

      <Drawer
        anchor="right"
        open={drawer != null}
        onClose={() => setDrawer(null)}
        PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">
            {drawer === "create"
              ? t("accessories.form.title")
              : t("accessories.rent.title")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          {drawer === "create" && (
            <>
              <TextField
                select
                label={t("accessories.form.type")}
                value={type}
                onChange={(e) => setType(e.target.value as AccessoryType)}
              >
                {TYPES.map((x) => (
                  <MenuItem key={x} value={x}>
                    {t(`enums.accessory_type.${x}`)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("accessories.form.identifier")}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
              <TextField
                label={t("accessories.form.owner_id")}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                type="number"
              />
              <Button
                variant="contained"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
              >
                {t("actions.save")}
              </Button>
            </>
          )}
          {drawer === "rent" && (
            <>
              <TextField
                label={t("accessories.rent.accessory_id")}
                value={accessoryId}
                onChange={(e) => setAccessoryId(e.target.value)}
                type="number"
              />
              <TextField
                select
                label={t("accessories.rent.client")}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                {(clientsQuery.data?.data ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label={t("accessories.rent.start")}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                select
                label={t("accessories.rent.basis")}
                value={basis}
                onChange={(e) => setBasis(e.target.value as ChargeBasis)}
              >
                <MenuItem value="RENTAL">
                  {t("enums.charge_basis.RENTAL")}
                </MenuItem>
                <MenuItem value="FREE_LOAN">
                  {t("enums.charge_basis.FREE_LOAN")}
                </MenuItem>
              </TextField>
              <Button
                variant="contained"
                onClick={() => rentMutation.mutate()}
                disabled={rentMutation.isPending}
              >
                {t("actions.save")}
              </Button>
            </>
          )}
        </Stack>
      </Drawer>
    </Box>
  );
}
