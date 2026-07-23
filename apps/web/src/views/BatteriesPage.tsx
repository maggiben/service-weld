"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
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
import type { GasCode } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { useSessionStore } from "../store/sessionStore";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

export default function BatteriesPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) => s.hasCapability("batteries:write"));
  const queryClient = useQueryClient();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [code, setCode] = useState("");
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [gas, setGas] = useState<GasCode | "">("O2");
  const [memberIds, setMemberIds] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "battery_code" as const,
    }),
    [paginationModel.pageSize, cursor],
  );

  const batteriesQuery = useQuery({
    queryKey: ["batteries", queryParams],
    queryFn: () => api.listBatteries(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = batteriesQuery.data?.data ?? [];
  const pageMeta = batteriesQuery.data?.page;

  const ownersQuery = useQuery({
    queryKey: ["cylinders", "owners-hint"],
    queryFn: () => api.listCylinders({ limit: 100, sort: "serial_number" }),
    enabled: drawerOpen,
  });

  useEffect(() => {
    const next = batteriesQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [batteriesQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const cyl of ownersQuery.data?.data ?? []) {
      if (cyl.owner_name) map.set(cyl.owner_party_id, cyl.owner_name);
    }
    return [...map.entries()];
  }, [ownersQuery.data]);

  const createMutation = useMutation({
    mutationFn: () => {
      const ids = memberIds
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n));
      if (ownerId === "") throw new Error("owner");
      return api.createBattery({
        battery_code: code.trim(),
        owner_party_id: Number(ownerId),
        gas_code: gas || null,
        member_cylinder_ids: ids,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batteries"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      setDrawerOpen(false);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "TOO_FEW_MEMBERS") {
          setError(t("errors.too_few_members"));
          return;
        }
        if (err.code === "MEMBER_ALREADY_PACKED") {
          setError(t("errors.member_already_packed"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
    },
  });

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "battery_code",
        headerName: t("batteries.columns.code"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "owner_name",
        headerName: t("batteries.columns.owner"),
        width: 160,
      },
      { field: "gas_code", headerName: t("batteries.columns.gas"), width: 100 },
      {
        field: "member_count",
        headerName: t("batteries.columns.members"),
        width: 110,
        type: "number",
      },
      {
        field: "state",
        headerName: t("batteries.columns.state"),
        width: 150,
        valueFormatter: (value: string) => t(`enums.cylinder_state.${value}`),
      },
    ],
    [t],
  );

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
      >
        <Typography variant="h5">{t("batteries.title")}</Typography>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setError(null);
              setCode("");
              setMemberIds("");
              setDrawerOpen(true);
            }}
          >
            {t("actions.new_battery")}
          </Button>
        )}
      </Stack>

      {batteriesQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 400 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={batteriesQuery.isLoading || batteriesQuery.isFetching}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50]}
          rowCount={
            paginationModel.page * paginationModel.pageSize +
            rows.length +
            (pageMeta?.has_more ? 1 : 0)
          }
          disableRowSelectionOnClick
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">{t("batteries.form.title")}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("batteries.form.code")}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            fullWidth
            required
          />
          <TextField
            select
            label={t("batteries.form.owner")}
            value={ownerId}
            onChange={(e) =>
              setOwnerId(e.target.value === "" ? "" : Number(e.target.value))
            }
            fullWidth
            required
          >
            {ownerOptions.map(([id, name]) => (
              <MenuItem key={id} value={id}>
                {name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={t("batteries.form.gas")}
            value={gas}
            onChange={(e) => setGas(e.target.value as GasCode | "")}
            fullWidth
          >
            {GASES.map((g) => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label={t("batteries.form.members")}
            value={memberIds}
            onChange={(e) => setMemberIds(e.target.value)}
            helperText={t("batteries.form.members_hint")}
            fullWidth
            required
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setDrawerOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={
                createMutation.isPending || !code.trim() || ownerId === ""
              }
              onClick={() => createMutation.mutate()}
            >
              {t("actions.save")}
            </Button>
          </Stack>
        </Stack>
      </Drawer>
    </Stack>
  );
}
