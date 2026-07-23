"use client";

import AlertMui from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Alert, MovementKind } from "@weld/schemas";
import { api } from "../api/client";
import { AlertContactDialog } from "../features/alerts/AlertContactDialog";
import { alertEntityHref } from "../features/alerts/alertDisplay";
import { useSessionStore } from "../store/sessionStore";
import { useNotificationStore } from "../store/notificationStore";

const ALERT_TYPES = [
  "LONG_OUTSTANDING",
  "SUPPLIER_LOAN_OVERDUE",
  "SUPPLIER_LIABILITY",
] as const;

function severityColor(
  severity: number,
): "default" | "info" | "warning" | "error" {
  if (severity >= 3) return "error";
  if (severity === 2) return "warning";
  return "info";
}

export default function AlertsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const canWrite = useSessionStore((s) => s.hasCapability("alerts:write"));
  const setUnread = useNotificationStore((s) => s.setUnreadFromAlerts);
  const pushToast = useNotificationStore((s) => s.pushToast);
  const queryClient = useQueryClient();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [kindFilter, setKindFilter] = useState<MovementKind | "">("");
  const [contactAlert, setContactAlert] = useState<Alert | null>(null);

  const resetPaging = () => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setCursors([undefined]);
  };

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      open: true as const,
      sort: "-created_at" as const,
      ...(typeFilter ? { "filter[alert_type]": typeFilter } : {}),
      ...(kindFilter ? { "filter[movement_kind]": kindFilter } : {}),
    }),
    [paginationModel.pageSize, cursor, typeFilter, kindFilter],
  );

  const alertsQuery = useQuery({
    queryKey: ["alerts", queryParams],
    queryFn: () => api.listAlerts(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = alertsQuery.data?.data ?? [];
  const pageMeta = alertsQuery.data?.page;

  useEffect(() => {
    const next = alertsQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [alertsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  useEffect(() => {
    if (alertsQuery.data?.page) {
      if (!alertsQuery.data.page.has_more) {
        setUnread(alertsQuery.data.data.length);
      }
    }
  }, [alertsQuery.data, setUnread]);

  const refreshMutation = useMutation({
    mutationFn: () => api.refreshAlerts(),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      setUnread(result.open_count);
      pushToast(
        t("alerts.refreshed", {
          created: result.created,
          open: result.open_count,
        }),
      );
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: number) => api.resolveAlert(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["alerts"] });
      pushToast(t("alerts.resolved"));
    },
  });

  const columns = useMemo<GridColDef<Alert>[]>(
    () => [
      {
        field: "alert_type",
        headerName: t("alerts.columns.type"),
        width: 200,
        valueFormatter: (v: string) =>
          t(`enums.alert_type.${v}`, { defaultValue: v }),
      },
      {
        field: "movement_kind",
        headerName: t("alerts.columns.kind"),
        width: 110,
        valueFormatter: (v: string | null | undefined) =>
          v ? t(`enums.movement_kind.${v}`) : "—",
      },
      {
        field: "cylinder_serial",
        headerName: t("alerts.columns.cylinder"),
        width: 130,
        renderCell: (params) =>
          params.row.cylinder_id != null && params.value ? (
            <Link
              component={NextLink}
              href={`/cylinders/${params.row.cylinder_id}`}
              onClick={(e) => e.stopPropagation()}
              underline="hover"
            >
              {params.value}
            </Link>
          ) : (
            (params.value ?? "—")
          ),
      },
      {
        field: "client_name",
        headerName: t("alerts.columns.client"),
        flex: 1,
        minWidth: 140,
        valueGetter: (_v, row) => row.client_name ?? row.counterparty_name,
        renderCell: (params) => {
          const name = params.row.client_name ?? params.row.counterparty_name;
          if (!name) return "—";
          if (params.row.client_party_id != null && params.row.client_name) {
            return (
              <Link
                component={NextLink}
                href={`/clients/${params.row.client_party_id}`}
                onClick={(e) => e.stopPropagation()}
                underline="hover"
              >
                {name}
              </Link>
            );
          }
          return name;
        },
      },
      {
        field: "client_phone",
        headerName: t("alerts.columns.phone"),
        width: 130,
        valueFormatter: (v: string | null | undefined) => v ?? "—",
      },
      {
        field: "days_open",
        headerName: t("alerts.columns.days"),
        width: 80,
        valueFormatter: (v: number | null | undefined) =>
          v == null ? "—" : String(v),
      },
      {
        field: "gas_code",
        headerName: t("alerts.columns.gas"),
        width: 90,
        valueFormatter: (v: string | null | undefined) =>
          v ? t(`enums.gas.${v}`, { defaultValue: v }) : "—",
      },
      {
        field: "last_contacted_at",
        headerName: t("alerts.columns.last_contact"),
        width: 120,
        valueFormatter: (v: string | null | undefined) =>
          v ? v.slice(0, 10) : "—",
      },
      {
        field: "contact_note",
        headerName: t("alerts.columns.notes"),
        flex: 1,
        minWidth: 160,
        renderCell: (params) => {
          const note = params.value as string | null | undefined;
          if (!note) return "—";
          return (
            <Tooltip title={note}>
              <Typography
                variant="body2"
                noWrap
                sx={{
                  maxWidth: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {note}
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        field: "severity",
        headerName: t("alerts.columns.severity"),
        width: 100,
        renderCell: (params) => (
          <Chip
            size="small"
            color={severityColor(params.value)}
            label={t(`alerts.severity.${params.value}`, {
              defaultValue: String(params.value),
            })}
          />
        ),
      },
      {
        field: "actions",
        headerName: "",
        width: 200,
        sortable: false,
        renderCell: (params) => (
          <Stack
            direction="row"
            spacing={0.5}
            onClick={(e) => e.stopPropagation()}
          >
            {canWrite && (
              <Button size="small" onClick={() => setContactAlert(params.row)}>
                {t("alerts.actions.contact")}
              </Button>
            )}
            {canWrite && !params.row.resolved_at ? (
              <Button
                size="small"
                onClick={() => resolveMutation.mutate(params.row.id)}
              >
                {t("actions.resolve")}
              </Button>
            ) : null}
          </Stack>
        ),
      },
    ],
    [t, canWrite, resolveMutation],
  );

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="flex-start"
        gap={2}
      >
        <Box>
          <Typography variant="h5">{t("alerts.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("alerts.subtitle")}
          </Typography>
        </Box>
        {canWrite && (
          <Button
            variant="contained"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {t("actions.refresh_alerts")}
          </Button>
        )}
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{t("alerts.filters.type")}</InputLabel>
          <Select
            label={t("alerts.filters.type")}
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              resetPaging();
            }}
          >
            <MenuItem value="">{t("clients.filters.all")}</MenuItem>
            {ALERT_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {t(`enums.alert_type.${type}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{t("alerts.filters.kind")}</InputLabel>
          <Select
            label={t("alerts.filters.kind")}
            value={kindFilter}
            onChange={(e) => {
              setKindFilter(e.target.value as MovementKind | "");
              if (e.target.value && typeFilter !== "LONG_OUTSTANDING") {
                setTypeFilter("LONG_OUTSTANDING");
              }
              resetPaging();
            }}
          >
            <MenuItem value="">{t("clients.filters.all")}</MenuItem>
            <MenuItem value="RENTAL">
              {t("enums.movement_kind.RENTAL")}
            </MenuItem>
            <MenuItem value="REFILL">
              {t("enums.movement_kind.REFILL")}
            </MenuItem>
          </Select>
        </FormControl>
        {kindFilter === "RENTAL" && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ maxWidth: 420 }}
          >
            {t("alerts.filters.kind_hint_rental")}
          </Typography>
        )}
        {kindFilter === "REFILL" && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ maxWidth: 420 }}
          >
            {t("alerts.filters.kind_hint_refill")}
          </Typography>
        )}
      </Stack>

      {alertsQuery.isError && (
        <AlertMui severity="error">{t("errors.load_failed")}</AlertMui>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={alertsQuery.isLoading || alertsQuery.isFetching}
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
          onRowClick={(params) => {
            const href = alertEntityHref(params.row);
            if (href) router.push(href);
          }}
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            [`& .${gridClasses.row}`]: { cursor: "pointer" },
          }}
        />
      </Box>

      <AlertContactDialog
        alert={contactAlert}
        open={contactAlert != null}
        onClose={() => setContactAlert(null)}
      />
    </Box>
  );
}
