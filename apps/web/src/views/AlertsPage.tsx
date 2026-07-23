"use client";

import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
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
import {
  GridActionsCell,
  gridActionsColumnWidth,
  type GridActionItem,
} from "../components/GridActionsCell";
import { AlertContactDialog } from "../features/alerts/AlertContactDialog";
import { alertEntityHref } from "../features/alerts/alertDisplay";
import { alertSeverityColor } from "../lib/chipColors";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { useSessionStore } from "../store/sessionStore";
import { useNotificationStore } from "../store/notificationStore";

const ALERT_TYPES = [
  "LONG_OUTSTANDING",
  "SUPPLIER_LOAN_OVERDUE",
  "SUPPLIER_LIABILITY",
] as const;

export default function AlertsPage() {
  const { t: translate } = useTranslation();
  const router = useRouter();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("alerts:write"),
  );
  const setUnread = useNotificationStore((state) => state.setUnreadFromAlerts);
  const pushToast = useNotificationStore((state) => state.pushToast);
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
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [alertsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
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
        translate("alerts.refreshed", {
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
      pushToast(translate("alerts.resolved"));
    },
  });

  const columns = useMemo<GridColDef<Alert>[]>(
    () => [
      {
        field: "alert_type",
        headerName: translate("alerts.columns.type"),
        width: 200,
        valueFormatter: (value: string) =>
          translate(`enums.alert_type.${value}`, { defaultValue: value }),
      },
      {
        field: "movement_kind",
        headerName: translate("alerts.columns.kind"),
        width: 110,
        valueFormatter: (value: string | null | undefined) =>
          value ? translate(`enums.movement_kind.${value}`) : "—",
      },
      {
        field: "cylinder_serial",
        headerName: translate("alerts.columns.cylinder"),
        width: 130,
        renderCell: (params) =>
          params.row.cylinder_id != null && params.value ? (
            <Link
              component={NextLink}
              href={`/cylinders/${params.row.cylinder_id}`}
              onClick={(event) => event.stopPropagation()}
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
        headerName: translate("alerts.columns.client"),
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
                onClick={(event) => event.stopPropagation()}
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
        headerName: translate("alerts.columns.phone"),
        width: 130,
        valueFormatter: (value: string | null | undefined) => value ?? "—",
      },
      {
        field: "days_open",
        headerName: translate("alerts.columns.days"),
        width: 80,
        valueFormatter: (value: number | null | undefined) =>
          value == null ? "—" : String(value),
      },
      {
        field: "gas_code",
        headerName: translate("alerts.columns.gas"),
        width: 90,
        valueFormatter: (value: string | null | undefined) =>
          value
            ? translate(`enums.gas.${value}`, { defaultValue: value })
            : "—",
      },
      {
        field: "last_contacted_at",
        headerName: translate("alerts.columns.last_contact"),
        width: 120,
        valueFormatter: (value: string | null | undefined) =>
          value ? value.slice(0, 10) : "—",
      },
      {
        field: "contact_note",
        headerName: translate("alerts.columns.notes"),
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
        headerName: translate("alerts.columns.severity"),
        width: 100,
        renderCell: (params) => (
          <Chip
            size="small"
            color={alertSeverityColor(params.value)}
            label={translate(`alerts.severity.${params.value}`, {
              defaultValue: String(params.value),
            })}
          />
        ),
      },
      {
        field: "actions",
        headerName: "",
        width: gridActionsColumnWidth(2),
        sortable: false,
        filterable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => {
          const actions: GridActionItem[] = [];
          if (canWrite) {
            actions.push({
              key: "contact",
              label: translate("alerts.actions.contact"),
              icon: <PhoneOutlinedIcon fontSize="small" />,
              onClick: () => setContactAlert(params.row),
            });
          }
          if (canWrite && !params.row.resolved_at) {
            actions.push({
              key: "resolve",
              label: translate("actions.resolve"),
              icon: <CheckCircleOutlineIcon fontSize="small" />,
              onClick: () => resolveMutation.mutate(params.row.id),
            });
          }
          return <GridActionsCell actions={actions} />;
        },
      },
    ],
    [translate, canWrite, resolveMutation],
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
          <Typography variant="h5">{translate("alerts.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {translate("alerts.subtitle")}
          </Typography>
        </Box>
        {canWrite && (
          <Button
            variant="contained"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
          >
            {translate("actions.refresh_alerts")}
          </Button>
        )}
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={1.5} alignItems="center">
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{translate("alerts.filters.type")}</InputLabel>
          <Select
            label={translate("alerts.filters.type")}
            value={typeFilter}
            onChange={(event) => {
              setTypeFilter(event.target.value);
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
            {ALERT_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {translate(`enums.alert_type.${type}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{translate("alerts.filters.kind")}</InputLabel>
          <Select
            label={translate("alerts.filters.kind")}
            value={kindFilter}
            onChange={(event) => {
              setKindFilter(event.target.value as MovementKind | "");
              if (event.target.value && typeFilter !== "LONG_OUTSTANDING") {
                setTypeFilter("LONG_OUTSTANDING");
              }
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
        {kindFilter === "RENTAL" && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ maxWidth: 420 }}
          >
            {translate("alerts.filters.kind_hint_rental")}
          </Typography>
        )}
        {kindFilter === "REFILL" && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ maxWidth: 420 }}
          >
            {translate("alerts.filters.kind_hint_refill")}
          </Typography>
        )}
      </Stack>

      {alertsQuery.isError && (
        <AlertMui severity="error">{translate("errors.load_failed")}</AlertMui>
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
          rowCount={cursorPageRowCount(
            paginationModel.page,
            paginationModel.pageSize,
            rows.length,
            pageMeta?.has_more ?? false,
          )}
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
