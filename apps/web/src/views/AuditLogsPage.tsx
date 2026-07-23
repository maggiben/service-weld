"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AuditAction, AuditLogEntry } from "@weld/schemas";
import { api } from "../api/client";
import { RequireCapability } from "../auth/RequireAuth";

const ACTIONS: AuditAction[] = ["INSERT", "UPDATE", "DELETE", "VOID"];

function formatActorLabel(
  entry: Pick<AuditLogEntry, "actor_username" | "actor_user_id" | "source">,
  t: (key: string) => string,
): string {
  if (entry.actor_username) return entry.actor_username;
  if (entry.actor_user_id != null) {
    return `${t("audit.unknown_user")} #${entry.actor_user_id}`;
  }
  if (
    !entry.source ||
    entry.source === "migration" ||
    entry.source === "data_cleanup"
  ) {
    return t("audit.system_user");
  }
  return "—";
}

function AuditLogsPageInner() {
  const { t } = useTranslation();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [entityTable, setEntityTable] = useState("");
  const [actorUsername, setActorUsername] = useState("");
  const [action, setAction] = useState<AuditAction | "">("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "-occurred_at" as const,
      "filter[entity_table]": entityTable.trim() || undefined,
      "filter[actor_username]": actorUsername.trim() || undefined,
      "filter[action]": action || undefined,
      "filter[occurred_at][gte]": fromDate || undefined,
      "filter[occurred_at][lte]": toDate || undefined,
    }),
    [
      paginationModel.pageSize,
      cursor,
      entityTable,
      actorUsername,
      action,
      fromDate,
      toDate,
    ],
  );

  const logsQuery = useQuery({
    queryKey: ["audit-logs", queryParams],
    queryFn: () => api.listAuditLogs(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = logsQuery.data?.data ?? [];
  const pageMeta = logsQuery.data?.page;

  useEffect(() => {
    const next = logsQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [logsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const resetPaging = () => {
    setCursors([undefined]);
    setPaginationModel((p) => ({ ...p, page: 0 }));
  };

  const columns = useMemo<GridColDef<AuditLogEntry>[]>(
    () => [
      {
        field: "occurred_at",
        headerName: t("audit.columns.occurred"),
        width: 190,
        valueFormatter: (value: string) => new Date(value).toLocaleString(),
      },
      {
        field: "actor_username",
        headerName: t("audit.columns.actor"),
        width: 160,
        valueGetter: (_value, row) => formatActorLabel(row, t),
      },
      {
        field: "actor_role",
        headerName: t("audit.columns.role"),
        width: 140,
        valueFormatter: (value: string | null) =>
          value ? t(`enums.role.${value}`, { defaultValue: value }) : "—",
      },
      {
        field: "action",
        headerName: t("audit.columns.action"),
        width: 100,
      },
      {
        field: "entity_table",
        headerName: t("audit.columns.entity"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "entity_id",
        headerName: t("audit.columns.entity_id"),
        width: 100,
        valueFormatter: (value: number | null) =>
          value == null ? "—" : String(value),
      },
      {
        field: "source",
        headerName: t("audit.columns.source"),
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "actions",
        headerName: "",
        width: 100,
        sortable: false,
        renderCell: (params) => (
          <Button size="small" onClick={() => setSelected(params.row)}>
            {t("audit.view_diff")}
          </Button>
        ),
      },
    ],
    [t],
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {t("audit.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {t("audit.subtitle")}
      </Typography>

      {logsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {t("errors.generic")}
        </Alert>
      )}

      <Stack
        direction={{ xs: "column", md: "row" }}
        spacing={2}
        sx={{ mb: 2 }}
        flexWrap="wrap"
      >
        <TextField
          size="small"
          label={t("audit.filters.entity_table")}
          value={entityTable}
          onChange={(e) => {
            setEntityTable(e.target.value);
            resetPaging();
          }}
        />
        <TextField
          size="small"
          label={t("audit.filters.actor")}
          value={actorUsername}
          onChange={(e) => {
            setActorUsername(e.target.value);
            resetPaging();
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>{t("audit.filters.action")}</InputLabel>
          <Select
            label={t("audit.filters.action")}
            value={action}
            onChange={(e) => {
              setAction(e.target.value as AuditAction | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{t("audit.filters.all")}</MenuItem>
            {ACTIONS.map((a) => (
              <MenuItem key={a} value={a}>
                {a}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label={t("audit.filters.from")}
          value={fromDate}
          onChange={(e) => {
            setFromDate(e.target.value);
            resetPaging();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={t("audit.filters.to")}
          value={toDate}
          onChange={(e) => {
            setToDate(e.target.value);
            resetPaging();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => `${row.id}-${row.occurred_at}`}
          loading={logsQuery.isLoading}
          paginationMode="server"
          sortingMode="server"
          rowCount={
            paginationModel.page * paginationModel.pageSize +
            rows.length +
            (pageMeta?.has_more ? 1 : 0)
          }
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          slots={{
            noRowsOverlay: () => (
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {t("audit.empty")}
                </Typography>
              </Stack>
            ),
          }}
        />
      </Box>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t("audit.diff_title")}</DialogTitle>
        <DialogContent dividers>
          {selected && (
            <Stack spacing={2}>
              <Typography variant="body2" color="text.secondary">
                {selected.entity_table}
                {selected.entity_id != null
                  ? ` #${selected.entity_id}`
                  : ""} · {selected.action} ·{" "}
                {new Date(selected.occurred_at).toLocaleString()}
              </Typography>
              <Typography variant="body2">
                <strong>{t("audit.columns.actor")}:</strong>{" "}
                {formatActorLabel(selected, t)}
                {selected.actor_role
                  ? ` (${t(`enums.role.${selected.actor_role}`, { defaultValue: selected.actor_role })})`
                  : ""}
                {selected.source ? ` · ${selected.source}` : ""}
              </Typography>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t("audit.before")}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    overflow: "auto",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(selected.before, null, 2) ?? "null"}
                </Box>
              </Box>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t("audit.after")}
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    m: 0,
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    overflow: "auto",
                    fontSize: 12,
                  }}
                >
                  {JSON.stringify(selected.after, null, 2) ?? "null"}
                </Box>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)}>
            {t("actions.close")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function AuditLogsPage() {
  return (
    <RequireCapability capability="audit:read">
      <AuditLogsPageInner />
    </RequireCapability>
  );
}
