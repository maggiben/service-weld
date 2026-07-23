"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import EditIcon from "@mui/icons-material/Edit";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { enUS, esES } from "@mui/x-data-grid/locales";
import type { CylinderHistoryRow } from "@weld/schemas";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { EditCylinderDrawer } from "../features/cylinders/EditCylinderDrawer";
import { displayRentalDays } from "../features/movements/displayRentalDays";
import { formatCapacity, formatLedgerNote } from "../lib/format";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { formatDateDMY } from "../lib/dateFormat";
import { useSessionStore } from "../store/sessionStore";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export default function CylinderDetailPage() {
  const { t: translate } = useTranslation();
  const locale = useUiStore((state) => state.locale);
  const canWrite = useSessionStore((state) =>
    state.hasCapability("cylinders:write"),
  );
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const cylinderId = Number(params.id);

  const [editOpen, setEditOpen] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setCursors([undefined]);
  }, [cylinderId]);

  const historyQueryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor: cursors[paginationModel.page],
      sort: "-delivery_date" as const,
    }),
    [paginationModel.page, paginationModel.pageSize, cursors],
  );

  const cylinderQuery = useQuery({
    queryKey: ["cylinder", cylinderId],
    queryFn: () => api.getCylinder(cylinderId),
    enabled: Number.isFinite(cylinderId),
  });

  const historyQuery = useQuery({
    queryKey: ["cylinder-history", cylinderId, historyQueryParams],
    queryFn: () => api.getCylinderHistory(cylinderId, historyQueryParams),
    enabled:
      Number.isFinite(cylinderId) &&
      (paginationModel.page === 0 || cursors[paginationModel.page] != null),
  });

  useEffect(() => {
    const nextCursor = historyQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) =>
      stashNextCursor(prev, paginationModel.page, nextCursor),
    );
  }, [historyQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const columns: GridColDef<CylinderHistoryRow>[] = useMemo(
    () => [
      {
        field: "delivery_date",
        headerName: translate("cylinders.detail.columns.delivery"),
        width: 130,
        valueFormatter: (value: string) => formatDateDMY(value),
      },
      {
        field: "holder_name",
        headerName: translate("cylinders.detail.columns.holder"),
        flex: 1,
        minWidth: 180,
        renderCell: (params) =>
          params.row.event_source === "SUPPLIER_LOAN" ? (
            <Typography variant="body2" component="span">
              {params.value}
            </Typography>
          ) : (
            <Link
              component={NextLink}
              href={`/clients/${params.row.holder_party_id}`}
              underline="hover"
            >
              {params.value}
            </Link>
          ),
      },
      {
        field: "return_date",
        headerName: translate("cylinders.detail.columns.return"),
        width: 130,
        valueFormatter: (value: string | null) => formatDateDMY(value),
      },
      {
        field: "gas_code",
        headerName: translate("cylinders.detail.columns.gas"),
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: translate("cylinders.detail.columns.kind"),
        width: 120,
        valueFormatter: (value: string) =>
          translate(`enums.movement_kind.${value}`),
      },
      {
        field: "rental_days",
        headerName: translate("cylinders.detail.columns.rental_days"),
        width: 120,
        type: "number",
        valueGetter: (_v, row) => displayRentalDays(row),
      },
      {
        field: "state",
        headerName: translate("cylinders.detail.columns.state"),
        width: 120,
        renderCell: (params) => (
          <Chip
            size="small"
            label={translate(`enums.movement_state.${params.value}`)}
            color={params.value === "OPEN" ? "warning" : "default"}
          />
        ),
      },
      {
        field: "note",
        headerName: translate("cylinders.detail.columns.note"),
        flex: 1,
        minWidth: 140,
        valueFormatter: (value: string | null) =>
          formatLedgerNote(value, (key) => translate(key)),
      },
    ],
    [translate],
  );

  const cylinder = cylinderQuery.data;
  const rows = historyQuery.data?.data ?? [];
  const pageMeta = historyQuery.data?.page;

  if (!Number.isFinite(cylinderId)) {
    return <Alert severity="error">{translate("errors.load_failed")}</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/cylinders")}
          size="small"
        >
          {translate("cylinders.detail.back")}
        </Button>
      </Stack>

      {(cylinderQuery.isError || historyQuery.isError) && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      {cylinder && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
          >
            <Box>
              <Stack
                direction="row"
                spacing={1}
                alignItems="center"
                flexWrap="wrap"
                useFlexGap
              >
                <Typography variant="h5">
                  {translate("cylinders.detail.title", {
                    serial: cylinder.serial_number,
                  })}
                </Typography>
                {canWrite && (
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => setEditOpen(true)}
                  >
                    {translate("actions.edit")}
                  </Button>
                )}
              </Stack>
              <Stack
                direction="row"
                spacing={1}
                flexWrap="wrap"
                useFlexGap
                sx={{ mt: 1 }}
              >
                <Chip
                  size="small"
                  label={cylinder.owner_name ?? `#${cylinder.owner_party_id}`}
                />
                <Chip
                  size="small"
                  label={translate(`enums.basis.${cylinder.ownership_basis}`)}
                  variant="outlined"
                />
                {cylinder.gas_code && (
                  <Chip
                    size="small"
                    label={cylinder.gas_code}
                    color="primary"
                  />
                )}
                {cylinder.capacity_m3 != null && (
                  <Chip
                    size="small"
                    label={formatCapacity(
                      cylinder.capacity_m3,
                      cylinder.capacity_unit,
                    )}
                    variant="outlined"
                  />
                )}
                <Chip
                  size="small"
                  label={translate(`enums.cylinder_state.${cylinder.state}`)}
                  color={cylinder.state === "AT_CLIENT" ? "warning" : "default"}
                />
                <Chip
                  size="small"
                  label={translate(`enums.condition.${cylinder.condition}`)}
                />
              </Stack>
            </Box>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary">
                {translate("cylinders.detail.current_holder")}
              </Typography>
              {cylinder.current_holder_party_id != null ? (
                <Typography variant="h6">
                  <Link
                    component={NextLink}
                    href={`/clients/${cylinder.current_holder_party_id}`}
                    underline="hover"
                  >
                    {cylinder.current_holder_name ??
                      `#${cylinder.current_holder_party_id}`}
                  </Link>
                </Typography>
              ) : (
                <Typography variant="h6" color="text.secondary">
                  {translate("cylinders.detail.in_stock")}
                </Typography>
              )}
            </Paper>
          </Stack>
        </Paper>
      )}

      <Typography variant="h6">
        {translate("cylinders.detail.history_title")}
      </Typography>

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) =>
            row.event_source === "SUPPLIER_LOAN"
              ? `loan-${row.loan_id}`
              : `move-${row.movement_id}`
          }
          loading={historyQuery.isLoading || historyQuery.isFetching}
          paginationMode="server"
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
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {translate("cylinders.detail.empty")}
                </Typography>
              </Stack>
            ),
          }}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>

      <EditCylinderDrawer
        open={editOpen}
        cylinder={cylinder ?? null}
        onClose={() => setEditOpen(false)}
      />
    </Stack>
  );
}
