"use client";

import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
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
import {
  GridActionsCell,
  gridActionsColumnWidth,
} from "../components/GridActionsCell";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { formatActorLabel } from "../features/audit/auditLogic";

const ACTIONS: AuditAction[] = ["INSERT", "UPDATE", "DELETE", "VOID"];

function AuditLogsPageInner() {
  const { t: translate } = useTranslation();
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
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [logsQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const resetPaging = () => {
    setCursors([undefined]);
    setPaginationModel((part) => ({ ...part, page: 0 }));
  };

  const columns = useMemo<GridColDef<AuditLogEntry>[]>(
    () => [
      {
        field: "occurred_at",
        headerName: translate("audit.columns.occurred"),
        width: 190,
        valueFormatter: (value: string) => new Date(value).toLocaleString(),
      },
      {
        field: "actor_username",
        headerName: translate("audit.columns.actor"),
        width: 160,
        valueGetter: (_value, row) => formatActorLabel(row, translate),
      },
      {
        field: "actor_role",
        headerName: translate("audit.columns.role"),
        width: 140,
        valueFormatter: (value: string | null) =>
          value
            ? translate(`enums.role.${value}`, { defaultValue: value })
            : "—",
      },
      {
        field: "action",
        headerName: translate("audit.columns.action"),
        width: 100,
      },
      {
        field: "entity_table",
        headerName: translate("audit.columns.entity"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "entity_id",
        headerName: translate("audit.columns.entity_id"),
        width: 100,
        valueFormatter: (value: number | null) =>
          value == null ? "—" : String(value),
      },
      {
        field: "source",
        headerName: translate("audit.columns.source"),
        width: 100,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "actions",
        headerName: "",
        width: gridActionsColumnWidth(1),
        sortable: false,
        filterable: false,
        align: "left",
        headerAlign: "left",
        renderCell: (params) => (
          <GridActionsCell
            actions={[
              {
                key: "view",
                label: translate("audit.view_diff"),
                icon: <VisibilityOutlinedIcon fontSize="small" />,
                onClick: () => setSelected(params.row),
              },
            ]}
          />
        ),
      },
    ],
    [translate],
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom>
        {translate("audit.title")}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 2 }}>
        {translate("audit.subtitle")}
      </Typography>

      {logsQuery.isError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {translate("errors.generic")}
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
          label={translate("audit.filters.entity_table")}
          value={entityTable}
          onChange={(event) => {
            setEntityTable(event.target.value);
            resetPaging();
          }}
        />
        <TextField
          size="small"
          label={translate("audit.filters.actor")}
          value={actorUsername}
          onChange={(event) => {
            setActorUsername(event.target.value);
            resetPaging();
          }}
        />
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>{translate("audit.filters.action")}</InputLabel>
          <Select
            label={translate("audit.filters.action")}
            value={action}
            onChange={(event) => {
              setAction(event.target.value as AuditAction | "");
              resetPaging();
            }}
          >
            <MenuItem value="">{translate("audit.filters.all")}</MenuItem>
            {ACTIONS.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          size="small"
          type="date"
          label={translate("audit.filters.from")}
          value={fromDate}
          onChange={(event) => {
            setFromDate(event.target.value);
            resetPaging();
          }}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          size="small"
          type="date"
          label={translate("audit.filters.to")}
          value={toDate}
          onChange={(event) => {
            setToDate(event.target.value);
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
          rowCount={cursorPageRowCount(
            paginationModel.page,
            paginationModel.pageSize,
            rows.length,
            pageMeta?.has_more ?? false,
          )}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          slots={{
            noRowsOverlay: () => (
              <Stack height="100%" alignItems="center" justifyContent="center">
                <Typography color="text.secondary">
                  {translate("audit.empty")}
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
        <DialogTitle>{translate("audit.diff_title")}</DialogTitle>
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
                <strong>{translate("audit.columns.actor")}:</strong>{" "}
                {formatActorLabel(selected, translate)}
                {selected.actor_role
                  ? ` (${translate(`enums.role.${selected.actor_role}`, { defaultValue: selected.actor_role })})`
                  : ""}
                {selected.source ? ` · ${selected.source}` : ""}
              </Typography>
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {translate("audit.before")}
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
                  {translate("audit.after")}
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
            {translate("actions.close")}
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
