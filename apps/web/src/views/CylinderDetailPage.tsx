"use client";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
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
import { displayRentalDays } from "../features/movements/displayRentalDays";
import { useUiStore } from "../store/uiStore";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export default function CylinderDetailPage() {
  const { t } = useTranslation();
  const locale = useUiStore((s) => s.locale);
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const cylinderId = Number(params.id);

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
    setCursors((prev) => {
      const next = [...prev];
      next[paginationModel.page + 1] = nextCursor;
      return next;
    });
  }, [historyQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const columns: GridColDef<CylinderHistoryRow>[] = useMemo(
    () => [
      {
        field: "delivery_date",
        headerName: t("cylinders.detail.columns.delivery"),
        width: 130,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "holder_name",
        headerName: t("cylinders.detail.columns.holder"),
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
        headerName: t("cylinders.detail.columns.return"),
        width: 130,
        valueFormatter: (value: string | null) => formatDate(value),
      },
      {
        field: "gas_code",
        headerName: t("cylinders.detail.columns.gas"),
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: t("cylinders.detail.columns.kind"),
        width: 120,
        valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
      },
      {
        field: "rental_days",
        headerName: t("cylinders.detail.columns.rental_days"),
        width: 120,
        type: "number",
        valueGetter: (_v, row) => displayRentalDays(row),
      },
      {
        field: "state",
        headerName: t("cylinders.detail.columns.state"),
        width: 120,
        renderCell: (params) => (
          <Chip
            size="small"
            label={t(`enums.movement_state.${params.value}`)}
            color={params.value === "OPEN" ? "warning" : "default"}
          />
        ),
      },
      {
        field: "note",
        headerName: t("cylinders.detail.columns.note"),
        flex: 1,
        minWidth: 140,
        valueFormatter: (value: string | null) => value ?? "—",
      },
    ],
    [t],
  );

  const cylinder = cylinderQuery.data;
  const rows = historyQuery.data?.data ?? [];
  const pageMeta = historyQuery.data?.page;

  if (!Number.isFinite(cylinderId)) {
    return <Alert severity="error">{t("errors.load_failed")}</Alert>;
  }

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => router.push("/cylinders")}
          size="small"
        >
          {t("cylinders.detail.back")}
        </Button>
      </Stack>

      {(cylinderQuery.isError || historyQuery.isError) && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      {cylinder && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={2}
            justifyContent="space-between"
          >
            <Box>
              <Typography variant="h5">
                {t("cylinders.detail.title", {
                  serial: cylinder.serial_number,
                })}
              </Typography>
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
                  label={t(`enums.basis.${cylinder.ownership_basis}`)}
                  variant="outlined"
                />
                {cylinder.gas_code && (
                  <Chip
                    size="small"
                    label={cylinder.gas_code}
                    color="primary"
                  />
                )}
                <Chip
                  size="small"
                  label={t(`enums.cylinder_state.${cylinder.state}`)}
                  color={cylinder.state === "AT_CLIENT" ? "warning" : "default"}
                />
                <Chip
                  size="small"
                  label={t(`enums.condition.${cylinder.condition}`)}
                />
              </Stack>
            </Box>
            <Paper variant="outlined" sx={{ px: 2, py: 1.5, minWidth: 200 }}>
              <Typography variant="caption" color="text.secondary">
                {t("cylinders.detail.current_holder")}
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
                  {t("cylinders.detail.in_stock")}
                </Typography>
              )}
            </Paper>
          </Stack>
        </Paper>
      )}

      <Typography variant="h6">
        {t("cylinders.detail.history_title")}
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
          rowCount={
            paginationModel.page * paginationModel.pageSize +
            rows.length +
            (pageMeta?.has_more ? 1 : 0)
          }
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
                  {t("cylinders.detail.empty")}
                </Typography>
              </Stack>
            ),
          }}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
        />
      </Box>
    </Stack>
  );
}
