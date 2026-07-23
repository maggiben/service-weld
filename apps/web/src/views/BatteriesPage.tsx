"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Battery } from "@weld/schemas";
import { api } from "../api/client";
import { BatteryFormDrawer } from "../features/batteries/BatteryFormDrawer";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { useSessionStore } from "../store/sessionStore";

export default function BatteriesPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) => s.hasCapability("batteries:write"));
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<number | null>(null);

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

  useEffect(() => {
    const next = batteriesQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [batteriesQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const openCreate = () => {
    setDrawerMode("create");
    setEditingId(null);
    setDrawerOpen(true);
  };

  const openEdit = (battery: Battery) => {
    setDrawerMode("edit");
    setEditingId(battery.id);
    setDrawerOpen(true);
  };

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
      ...(canWrite
        ? [
            {
              field: "actions",
              headerName: "",
              width: 100,
              sortable: false,
              filterable: false,
              renderCell: (params) => (
                <Button size="small" onClick={() => openEdit(params.row)}>
                  {t("actions.edit")}
                </Button>
              ),
            } satisfies GridColDef<Battery>,
          ]
        : []),
    ],
    [t, canWrite],
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
            onClick={openCreate}
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
          rowCount={cursorPageRowCount(
            paginationModel.page,
            paginationModel.pageSize,
            rows.length,
            pageMeta?.has_more ?? false,
          )}
          disableRowSelectionOnClick
          onRowDoubleClick={(params) => {
            if (canWrite) openEdit(params.row);
          }}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>

      <BatteryFormDrawer
        open={drawerOpen}
        mode={drawerMode}
        batteryId={editingId}
        onClose={() => setDrawerOpen(false)}
      />
    </Stack>
  );
}
