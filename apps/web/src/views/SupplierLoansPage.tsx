"use client";

import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Snackbar from "@mui/material/Snackbar";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridSortModel,
  gridClasses,
} from "@mui/x-data-grid";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AdvanceSupplierLoanInput,
  LoanStage,
  SupplierLoan,
} from "@weld/schemas";
import { businessTodayIso, calendarDaysBetween } from "@weld/domain";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import {
  GridActionsCell,
  gridActionsColumnWidth,
} from "../components/GridActionsCell";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { todayIso } from "../lib/dateFormat";
import { supplierLoanSortParam } from "../lib/sortParam";
import {
  LOAN_STAGE_NEXT,
  formatLoanDate,
} from "../features/supplier-loans/loanLogic";
import { useSessionStore } from "../store/sessionStore";

export default function SupplierLoansPage() {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("supplier_loans:write"),
  );
  const queryClient = useQueryClient();
  const [sortModel, setSortModel] = useState<GridSortModel>([
    { field: "received_from_supplier", sort: "asc" },
  ]);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [openOnly, setOpenOnly] = useState(true);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [advanceLoan, setAdvanceLoan] = useState<SupplierLoan | null>(null);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [thresholdDays, setThresholdDays] = useState("120");
  const [savedToast, setSavedToast] = useState(false);
  const [cylinderId, setCylinderId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [receivedOn, setReceivedOn] = useState(todayIso());
  const [advanceDate, setAdvanceDate] = useState(todayIso());
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: supplierLoanSortParam(sortModel),
      open: openOnly ? true : undefined,
      overdue: overdueOnly ? true : undefined,
    }),
    [paginationModel.pageSize, cursor, sortModel, openOnly, overdueOnly],
  );

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });

  const overdueDays = settingsQuery.data?.supplier_loan_overdue_days ?? 120;

  const loansQuery = useQuery({
    queryKey: ["supplier-loans", queryParams],
    queryFn: () => api.listSupplierLoans(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = loansQuery.data?.data ?? [];
  const pageMeta = loansQuery.data?.page;

  const clientsQuery = useQuery({
    queryKey: ["clients", "loan-advance"],
    queryFn: () => api.listClients({ limit: 100, sort: "name" }),
    enabled: advanceLoan?.stage === "RECEIVED",
  });

  useEffect(() => {
    const next = loansQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [loansQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createSupplierLoan({
        cylinder_id: Number(cylinderId),
        supplier_party_id: Number(supplierId),
        received_from_supplier: receivedOn,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["supplier-loans"] });
      setDrawerOpen(false);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const advanceMutation = useMutation({
    mutationFn: () => {
      if (!advanceLoan) throw new Error("no loan");
      const stage = LOAN_STAGE_NEXT[advanceLoan.stage];
      if (!stage) throw new Error("terminal");
      const body: AdvanceSupplierLoanInput = {
        stage,
        date: advanceDate,
      };
      if (stage === "OUT_TO_CLIENT") {
        body.client_party_id = Number(clientId);
      }
      return api.advanceSupplierLoan(advanceLoan.id, body, {
        ifMatch: advanceLoan.version,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["supplier-loans"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      setAdvanceLoan(null);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "STAGE_OUT_OF_ORDER") {
          setError(translate("errors.stage_out_of_order"));
          return;
        }
        if (err.code === "DATE_ORDER") {
          setError(translate("errors.date_order"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const thresholdMutation = useMutation({
    mutationFn: () => {
      const days = Number(thresholdDays);
      if (!Number.isFinite(days) || days < 1) {
        throw new Error("invalid days");
      }
      return api.updateSettings(
        { supplier_loan_overdue_days: days },
        { ifMatch: settingsQuery.data?.version },
      );
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["supplier-loans"] }),
        queryClient.invalidateQueries({ queryKey: ["alerts"] }),
      ]);
      setThresholdOpen(false);
      setError(null);
      setSavedToast(true);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const columns = useMemo<GridColDef<SupplierLoan>[]>(
    () => [
      {
        field: "cylinder_serial",
        headerName: translate("loans.columns.cylinder"),
        flex: 1,
        minWidth: 120,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
          >
            {params.value ?? "—"}
          </Link>
        ),
      },
      {
        field: "supplier_name",
        headerName: translate("loans.columns.supplier"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "stage",
        headerName: translate("loans.columns.stage"),
        width: 180,
        renderCell: (params) => {
          const stage = params.value as LoanStage;
          const color =
            stage === "OUT_TO_CLIENT"
              ? "warning"
              : stage === "BACK_FROM_CLIENT"
                ? "info"
                : stage === "RETURNED_TO_SUPPLIER"
                  ? "success"
                  : "default";
          return (
            <Chip
              size="small"
              label={translate(`enums.loan_stage.${stage}`)}
              color={color}
            />
          );
        },
      },
      {
        field: "received_from_supplier",
        headerName: translate("loans.columns.received"),
        width: 120,
      },
      {
        field: "client_name",
        headerName: translate("loans.columns.client"),
        flex: 1,
        minWidth: 120,
        renderCell: (params) => {
          const name = params.value ?? params.row.client_name;
          if (params.row.client_party_id == null || !name) {
            return name ?? "—";
          }
          return (
            <Link
              component={NextLink}
              href={`/clients/${params.row.client_party_id}`}
              underline="hover"
            >
              {name}
            </Link>
          );
        },
      },
      {
        field: "returned_by_client",
        headerName: translate("loans.columns.disposition"),
        width: 260,
        // Solo devolución del cliente o vencido. Sin returned_by_client → nada
        // (no mostrar "Entregado": la entrega ya está en la etapa / otros datos).
        renderCell: (params) => {
          const row = params.row;
          if (row.returned_by_client) {
            return (
              <Chip
                size="small"
                color="success"
                label={translate("loans.status.returned_on", {
                  date: formatLoanDate(row.returned_by_client),
                })}
              />
            );
          }
          if (row.overdue && row.received_from_supplier) {
            const daysOpen = calendarDaysBetween(
              row.received_from_supplier,
              businessTodayIso(),
            );
            return (
              <Tooltip
                title={translate("loans.status.overdue_hint", {
                  days: daysOpen,
                  threshold: overdueDays,
                  received: formatLoanDate(row.received_from_supplier),
                })}
              >
                <Chip
                  size="small"
                  color="warning"
                  label={translate("loans.status.overdue_on", {
                    days: daysOpen,
                    threshold: overdueDays,
                  })}
                />
              </Tooltip>
            );
          }
          return "—";
        },
      },
      {
        field: "actions",
        headerName: "",
        width: gridActionsColumnWidth(1),
        sortable: false,
        filterable: false,
        align: "left",
        headerAlign: "left",
        renderCell: (params) => {
          const next = LOAN_STAGE_NEXT[params.row.stage];
          if (!canWrite || !next) return null;
          return (
            <GridActionsCell
              actions={[
                {
                  key: "advance",
                  label: translate("actions.advance"),
                  icon: <ArrowForwardIcon fontSize="small" />,
                  onClick: () => {
                    setAdvanceLoan(params.row);
                    setAdvanceDate(todayIso());
                    setClientId(
                      params.row.client_party_id != null
                        ? String(params.row.client_party_id)
                        : "",
                    );
                    setError(null);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [translate, canWrite, overdueDays],
  );

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h5">{translate("loans.title")}</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={translate("loans.overdue_threshold_chip", {
              days: overdueDays,
            })}
          />
        </Stack>
        <Stack direction="row" spacing={1}>
          {canWrite && (
            <Button
              variant="outlined"
              startIcon={<SettingsOutlinedIcon />}
              onClick={() => {
                setThresholdDays(String(overdueDays));
                setThresholdOpen(true);
                setError(null);
              }}
            >
              {translate("actions.configure_overdue")}
            </Button>
          )}
          {canWrite && (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => {
                setDrawerOpen(true);
                setError(null);
              }}
            >
              {translate("actions.new_loan")}
            </Button>
          )}
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={openOnly}
              onChange={(_, value) => {
                setOpenOnly(value);
                setCursors([undefined]);
                setPaginationModel((part) => ({ ...part, page: 0 }));
              }}
            />
          }
          label={translate("loans.filters.open")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={overdueOnly}
              onChange={(_, value) => {
                setOverdueOnly(value);
                setCursors([undefined]);
                setPaginationModel((part) => ({ ...part, page: 0 }));
              }}
            />
          }
          label={translate("loans.filters.overdue", { days: overdueDays })}
        />
      </Stack>

      {loansQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loansQuery.isLoading || loansQuery.isFetching}
          sortingMode="server"
          paginationMode="server"
          sortModel={sortModel}
          onSortModelChange={(model) => {
            setSortModel(model);
            setCursors([undefined]);
            setPaginationModel((part) => ({ ...part, page: 0 }));
          }}
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

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">{translate("loans.form.title")}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={translate("loans.form.cylinder_id")}
            value={cylinderId}
            onChange={(event) => setCylinderId(event.target.value)}
            type="number"
            required
          />
          <TextField
            label={translate("loans.form.supplier_id")}
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            type="number"
            required
            helperText={translate("loans.form.supplier_hint")}
          />
          <DatePicker
            label={translate("loans.form.received_on")}
            value={dayjs(receivedOn)}
            onChange={(value: Dayjs | null) => {
              if (value) setReceivedOn(value.format("YYYY-MM-DD"));
            }}
            slotProps={{ textField: { required: true } }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setDrawerOpen(false)}>
              {translate("actions.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {translate("actions.save")}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog
        open={advanceLoan != null}
        onClose={() => setAdvanceLoan(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{translate("loans.advance.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {advanceLoan && (
              <Typography variant="body2">
                {translate("loans.advance.summary", {
                  serial: advanceLoan.cylinder_serial,
                  stage: translate(
                    `enums.loan_stage.${LOAN_STAGE_NEXT[advanceLoan.stage]!}`,
                  ),
                })}
              </Typography>
            )}
            {advanceLoan?.stage === "RECEIVED" && (
              <TextField
                select
                label={translate("loans.form.client")}
                value={clientId}
                onChange={(event) => setClientId(event.target.value)}
                required
              >
                {(clientsQuery.data?.data ?? []).map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <DatePicker
              label={translate("loans.advance.date")}
              value={dayjs(advanceDate)}
              onChange={(value: Dayjs | null) => {
                if (value) setAdvanceDate(value.format("YYYY-MM-DD"));
              }}
              slotProps={{ textField: { required: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvanceLoan(null)}>
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            {translate("actions.advance")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{translate("loans.threshold.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {translate("loans.threshold.help")}
            </Typography>
            <TextField
              label={translate("loans.threshold.days")}
              type="number"
              value={thresholdDays}
              onChange={(event) => setThresholdDays(event.target.value)}
              inputProps={{ min: 1, max: 3650 }}
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setThresholdOpen(false)}>
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={thresholdMutation.isPending}
            onClick={() => thresholdMutation.mutate()}
          >
            {translate("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={savedToast}
        autoHideDuration={3000}
        onClose={() => setSavedToast(false)}
        message={translate("loans.threshold.saved")}
      />
    </Box>
  );
}
