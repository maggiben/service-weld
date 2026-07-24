"use client";

import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
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
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  MovementEvent,
  OutstandingRow,
  ReconciliationVarianceRow,
} from "@weld/schemas";
import { api } from "../api/client";
import {
  GridActionsCell,
  gridActionsColumnWidth,
  type GridActionItem,
} from "../components/GridActionsCell";
import { ReturnDialog } from "../features/movements/ReturnDialog";
import { SwapDialog } from "../features/movements/SwapDialog";
import { VoidDialog } from "../features/movements/VoidDialog";
import { cylinderStateChipColor } from "../lib/chipColors";
import {
  stashNextCursor,
  cursorGridServerPagination,
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
  const canWriteCylinders = useSessionStore((state) =>
    state.hasCapability("cylinders:write"),
  );
  const canWriteMovements = useSessionStore((state) =>
    state.hasCapability("movements:write"),
  );
  const canVoid = useSessionStore((state) =>
    state.hasCapability("movements:void"),
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
  const [returnTarget, setReturnTarget] = useState<MovementEvent | null>(null);
  const [swapTarget, setSwapTarget] = useState<MovementEvent | null>(null);
  const [voidTarget, setVoidTarget] = useState<MovementEvent | null>(null);
  const [loadingActionId, setLoadingActionId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
    // Keep prior page meta while fetching so DataGrid does not clamp page→0.
    placeholderData: keepPreviousData,
  });

  const rows = outstandingQuery.data?.data ?? [];
  const pageMeta = outstandingQuery.data?.page;
  const gridPagination = cursorGridServerPagination({
    page: paginationModel.page,
    pageSize: paginationModel.pageSize,
    loadedCount: rows.length,
    hasMore: pageMeta?.has_more,
  });

  useEffect(() => {
    // Placeholder data still carries the previous page's next_cursor — do not
    // stash it under the new page index or later pages repeat the same slice.
    if (outstandingQuery.isPlaceholderData) return;
    const next = outstandingQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [
    outstandingQuery.data?.page.next_cursor,
    outstandingQuery.isPlaceholderData,
    paginationModel.page,
  ]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const openMovementAction = async (
    movementId: number,
    setTarget: (movement: MovementEvent) => void,
  ) => {
    setActionError(null);
    setLoadingActionId(movementId);
    try {
      const movement = await api.getMovement(movementId);
      setTarget(movement);
    } catch {
      setActionError(translate("errors.load_failed"));
    } finally {
      setLoadingActionId(null);
    }
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
        width: 180,
        renderCell: (part) => (
          <Stack direction="row" spacing={0.75} alignItems="center">
            <SerialLink cylinderId={part.row.cylinder_id} serial={part.value} />
            {part.row.to_verify ? (
              <Chip
                size="small"
                color="warning"
                label={translate("reconciliation.to_verify")}
              />
            ) : null}
          </Stack>
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
        field: "actions",
        headerName: translate("reconciliation.outstanding.columns.actions"),
        width: gridActionsColumnWidth(3),
        sortable: false,
        filterable: false,
        align: "left",
        headerAlign: "left",
        renderCell: (params) => {
          const busy = loadingActionId === params.row.movement_id;
          const actions: GridActionItem[] = [];
          // Outstanding rows are open movements (on loan / refill in progress).
          if (canWriteMovements) {
            actions.push({
              key: "return",
              label: translate("actions.return"),
              icon: <AssignmentReturnIcon fontSize="small" />,
              disabled: busy,
              onClick: () => {
                void openMovementAction(
                  params.row.movement_id,
                  setReturnTarget,
                );
              },
            });
            actions.push({
              key: "swap",
              label: translate("actions.swap"),
              icon: <SwapHorizIcon fontSize="small" />,
              disabled: busy,
              onClick: () => {
                void openMovementAction(params.row.movement_id, setSwapTarget);
              },
            });
          }
          if (canVoid) {
            actions.push({
              key: "void",
              label: translate("actions.void"),
              icon: <CancelOutlinedIcon fontSize="small" />,
              color: "warning",
              disabled: busy,
              onClick: () => {
                void openMovementAction(params.row.movement_id, setVoidTarget);
              },
            });
          }
          return <GridActionsCell actions={actions} />;
        },
      },
    ],
    [translate, canWriteMovements, canVoid, loadingActionId],
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
          {actionError && <Alert severity="error">{actionError}</Alert>}
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
              rowCount={gridPagination.rowCount}
              estimatedRowCount={gridPagination.estimatedRowCount}
              paginationMeta={gridPagination.paginationMeta}
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
          {!canWriteCylinders && (
            <Alert severity="info">
              {translate("reconciliation.count.read_only")}
            </Alert>
          )}
          <DatePicker
            label={translate("reconciliation.count.date")}
            value={dayjs(countedOn)}
            onChange={(value: Dayjs | null) => {
              if (value) setCountedOn(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { sx: { maxWidth: 220 } } }}
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
                disabled={!canWriteCylinders}
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
            disabled={
              !canWriteCylinders || countMutation.isPending || !serials.trim()
            }
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

      <ReturnDialog
        open={Boolean(returnTarget)}
        movement={returnTarget}
        onClose={() => setReturnTarget(null)}
      />
      <SwapDialog
        open={Boolean(swapTarget)}
        movement={swapTarget}
        onClose={() => setSwapTarget(null)}
      />
      <VoidDialog
        open={Boolean(voidTarget)}
        movement={voidTarget}
        onClose={() => setVoidTarget(null)}
      />
    </Box>
  );
}
