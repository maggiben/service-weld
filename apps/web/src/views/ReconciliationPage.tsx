"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
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
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OutstandingRow, ReconciliationVarianceRow } from "@weld/schemas";
import { api } from "../api/client";
import { cylinderStateChipColor } from "../lib/chipColors";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { todayIso } from "../lib/dateFormat";
import { useSessionStore } from "../store/sessionStore";

function SerialLink({
  cylinderId,
  serial,
}: {
  cylinderId: number | null | undefined;
  serial: string;
}) {
  if (cylinderId == null) return <>{serial}</>;
  return (
    <Link
      component={NextLink}
      href={`/cylinders/${cylinderId}`}
      underline="hover"
      onClick={(event) => event.stopPropagation()}
    >
      {serial}
    </Link>
  );
}

export default function ReconciliationPage() {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("cylinders:write"),
  );
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [serials, setSerials] = useState("");
  const [countedOn, setCountedOn] = useState(todayIso());
  const [fullPlantCount, setFullPlantCount] = useState(false);
  const [varianceRows, setVarianceRows] = useState<ReconciliationVarianceRow[]>(
    [],
  );
  const [summary, setSummary] = useState<string | null>(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "-accrued_days" as const,
    }),
    [paginationModel.pageSize, cursor],
  );

  const outstandingQuery = useQuery({
    queryKey: ["outstanding", queryParams],
    queryFn: () => api.listOutstanding(queryParams),
    enabled: tab === 0 && (paginationModel.page === 0 || cursor != null),
  });

  const rows = outstandingQuery.data?.data ?? [];
  const pageMeta = outstandingQuery.data?.page;

  useEffect(() => {
    const next = outstandingQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [outstandingQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const countMutation = useMutation({
    mutationFn: () =>
      api.runPhysicalCount({
        counted_on: countedOn,
        serial_numbers: serials
          .split(/[\n,]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        cylinder_ids: [],
        full_plant_count: fullPlantCount,
      }),
    onSuccess: (result) => {
      setVarianceRows(result.rows);
      setSummary(
        translate("reconciliation.count.summary", {
          matched: result.matched,
          elsewhere: result.present_elsewhere,
          absent: result.absent_here,
          unknown: result.unknown_serial,
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ["outstanding"] });
    },
  });

  const outstandingColumns = useMemo<GridColDef<OutstandingRow>[]>(
    () => [
      {
        field: "serial_number",
        headerName: translate("reconciliation.outstanding.columns.serial"),
        width: 130,
        renderCell: (part) => (
          <SerialLink cylinderId={part.row.cylinder_id} serial={part.value} />
        ),
      },
      {
        field: "cylinder_state",
        headerName: translate("reconciliation.outstanding.columns.state"),
        width: 150,
        renderCell: (part) => (
          <Chip
            size="small"
            color={cylinderStateChipColor(part.value)}
            label={translate(`enums.cylinder_state.${part.value}`)}
          />
        ),
      },
      {
        field: "client_name",
        headerName: translate("reconciliation.outstanding.columns.held_by"),
        flex: 1.2,
        minWidth: 180,
        renderCell: (part) => (
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label={translate("reconciliation.held_by", { name: part.value })}
          />
        ),
      },
      {
        field: "gas_code",
        headerName: translate("reconciliation.outstanding.columns.gas"),
        width: 90,
      },
      {
        field: "delivery_date",
        headerName: translate("reconciliation.outstanding.columns.delivery"),
        width: 120,
      },
      {
        field: "accrued_days",
        headerName: translate("reconciliation.outstanding.columns.days"),
        width: 100,
      },
      {
        field: "to_verify",
        headerName: translate("reconciliation.outstanding.columns.verify"),
        width: 110,
        renderCell: (part) =>
          part.value ? (
            <Chip
              size="small"
              color="warning"
              label={translate("reconciliation.to_verify")}
            />
          ) : (
            "—"
          ),
      },
    ],
    [translate],
  );

  const varianceColumns = useMemo<GridColDef<ReconciliationVarianceRow>[]>(
    () => [
      {
        field: "kind",
        headerName: translate("reconciliation.count.columns.kind"),
        width: 160,
        valueFormatter: (value: string) =>
          translate(`enums.variance_kind.${value}`),
      },
      {
        field: "serial_number",
        headerName: translate("reconciliation.count.columns.serial"),
        width: 130,
        renderCell: (part) => (
          <SerialLink cylinderId={part.row.cylinder_id} serial={part.value} />
        ),
      },
      {
        field: "system_state",
        headerName: translate("reconciliation.count.columns.state"),
        width: 150,
        renderCell: (part) =>
          part.value ? (
            <Chip
              size="small"
              color={cylinderStateChipColor(part.value)}
              label={translate(`enums.cylinder_state.${part.value}`, {
                defaultValue: part.value,
              })}
            />
          ) : (
            "—"
          ),
      },
      {
        field: "holder_name",
        headerName: translate("reconciliation.count.columns.held_by"),
        flex: 1,
        minWidth: 160,
        renderCell: (part) =>
          part.value ? (
            <Chip
              size="small"
              color="info"
              variant="outlined"
              label={translate("reconciliation.held_by", { name: part.value })}
            />
          ) : (
            "—"
          ),
      },
      {
        field: "suggested_action",
        headerName: translate("reconciliation.count.columns.action"),
        width: 120,
        valueFormatter: (value: string | undefined) =>
          value ? translate(`enums.suggested_action.${value}`) : "—",
      },
    ],
    [translate],
  );

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Box>
        <Typography variant="h5">
          {translate("reconciliation.title")}
        </Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
          {translate("reconciliation.subtitle")}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          flexWrap="wrap"
          sx={{ mt: 1.5 }}
        >
          <Chip
            size="small"
            color={tab === 0 ? "primary" : "default"}
            label={translate("reconciliation.pills.outstanding")}
            onClick={() => setTab(0)}
          />
          <Chip
            size="small"
            color={tab === 1 ? "primary" : "default"}
            label={translate("reconciliation.pills.count")}
            onClick={() => setTab(1)}
          />
        </Stack>
      </Box>

      <Tabs value={tab} onChange={(_, value) => setTab(value)}>
        <Tab label={translate("reconciliation.tabs.outstanding")} />
        <Tab label={translate("reconciliation.tabs.count")} />
      </Tabs>

      {tab === 0 && (
        <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
          <Alert severity="info">
            {translate("reconciliation.outstanding.help")}
          </Alert>
          {outstandingQuery.isError && (
            <Alert severity="error">{translate("errors.load_failed")}</Alert>
          )}
          <Box sx={{ flex: 1, minHeight: 360 }}>
            <DataGrid
              rows={rows}
              columns={outstandingColumns}
              getRowId={(row) => row.movement_id}
              loading={
                outstandingQuery.isLoading || outstandingQuery.isFetching
              }
              paginationMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={handlePaginationModelChange}
              pageSizeOptions={[25, 50, 100]}
              rowCount={cursorPageRowCount(
                paginationModel.page,
                paginationModel.pageSize,
                rows.length,
                pageMeta?.has_more ?? false,
              )}
              disableRowSelectionOnClick
              sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
            />
          </Box>
        </Stack>
      )}

      {tab === 1 && (
        <Stack spacing={2}>
          <Alert severity="info">
            {translate("reconciliation.count.help")}
          </Alert>
          {!canWrite && (
            <Alert severity="info">
              {translate("reconciliation.count.read_only")}
            </Alert>
          )}
          <TextField
            label={translate("reconciliation.count.date")}
            type="date"
            value={countedOn}
            onChange={(event) => setCountedOn(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ maxWidth: 220 }}
          />
          <TextField
            label={translate("reconciliation.count.serials")}
            value={serials}
            onChange={(event) => setSerials(event.target.value)}
            multiline
            minRows={4}
            helperText={translate("reconciliation.count.serials_hint")}
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={fullPlantCount}
                onChange={(event) => setFullPlantCount(event.target.checked)}
                disabled={!canWrite}
              />
            }
            label={translate("reconciliation.count.full_plant")}
          />
          {fullPlantCount && (
            <Alert severity="warning">
              {translate("reconciliation.count.full_plant_warning")}
            </Alert>
          )}
          <Button
            variant="contained"
            disabled={!canWrite || countMutation.isPending || !serials.trim()}
            onClick={() => countMutation.mutate()}
            sx={{ alignSelf: "flex-start" }}
          >
            {translate("actions.run_count")}
          </Button>
          {summary && <Alert severity="info">{summary}</Alert>}
          {countMutation.isError && (
            <Alert severity="error">{translate("errors.generic")}</Alert>
          )}
          <Box sx={{ minHeight: 320 }}>
            <DataGrid
              rows={varianceRows}
              columns={varianceColumns}
              getRowId={(row) =>
                `${row.kind}:${row.serial_number}:${row.cylinder_id ?? "x"}`
              }
              disableRowSelectionOnClick
              hideFooter={varianceRows.length < 25}
              sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
            />
          </Box>
        </Stack>
      )}
    </Box>
  );
}
