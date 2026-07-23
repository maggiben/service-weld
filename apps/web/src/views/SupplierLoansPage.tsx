"use client";

import AddIcon from "@mui/icons-material/Add";
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
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  AdvanceSupplierLoanInput,
  LoanStage,
  SupplierLoan,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { useSessionStore } from "../store/sessionStore";

const NEXT: Record<LoanStage, AdvanceSupplierLoanInput["stage"] | null> = {
  RECEIVED: "OUT_TO_CLIENT",
  OUT_TO_CLIENT: "BACK_FROM_CLIENT",
  BACK_FROM_CLIENT: "RETURNED_TO_SUPPLIER",
  RETURNED_TO_SUPPLIER: null,
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

export default function SupplierLoansPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) =>
    s.hasCapability("supplier_loans:write"),
  );
  const queryClient = useQueryClient();
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
      sort: "received_from_supplier" as const,
      open: openOnly ? true : undefined,
      overdue: overdueOnly ? true : undefined,
    }),
    [paginationModel.pageSize, cursor, openOnly, overdueOnly],
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
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [loansQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
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
      setError(t("errors.generic"));
    },
  });

  const advanceMutation = useMutation({
    mutationFn: () => {
      if (!advanceLoan) throw new Error("no loan");
      const stage = NEXT[advanceLoan.stage];
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
          setError(t("errors.stage_out_of_order"));
          return;
        }
        if (err.code === "DATE_ORDER") {
          setError(t("errors.date_order"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(t("errors.generic"));
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
      setError(t("errors.generic"));
    },
  });

  const columns = useMemo<GridColDef<SupplierLoan>[]>(
    () => [
      {
        field: "cylinder_serial",
        headerName: t("loans.columns.cylinder"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "supplier_name",
        headerName: t("loans.columns.supplier"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "stage",
        headerName: t("loans.columns.stage"),
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
              label={t(`enums.loan_stage.${stage}`)}
              color={color}
            />
          );
        },
      },
      {
        field: "received_from_supplier",
        headerName: t("loans.columns.received"),
        width: 120,
      },
      {
        field: "client_name",
        headerName: t("loans.columns.client"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "overdue",
        headerName: t("loans.columns.overdue"),
        width: 100,
        renderCell: (params) =>
          params.value ? (
            <Chip size="small" color="warning" label={t("loans.overdue_yes")} />
          ) : (
            "—"
          ),
      },
      {
        field: "actions",
        headerName: "",
        width: 120,
        sortable: false,
        renderCell: (params) => {
          const next = NEXT[params.row.stage];
          if (!canWrite || !next) return null;
          return (
            <Button
              size="small"
              onClick={() => {
                setAdvanceLoan(params.row);
                setAdvanceDate(todayIso());
                setClientId(
                  params.row.client_party_id != null
                    ? String(params.row.client_party_id)
                    : "",
                );
                setError(null);
              }}
            >
              {t("actions.advance")}
            </Button>
          );
        },
      },
    ],
    [t, canWrite],
  );

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="h5">{t("loans.title")}</Typography>
          <Chip
            size="small"
            variant="outlined"
            label={t("loans.overdue_threshold_chip", { days: overdueDays })}
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
              {t("actions.configure_overdue")}
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
              {t("actions.new_loan")}
            </Button>
          )}
        </Stack>
      </Stack>

      <Stack direction="row" spacing={2}>
        <FormControlLabel
          control={
            <Switch
              checked={openOnly}
              onChange={(_, v) => {
                setOpenOnly(v);
                setCursors([undefined]);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            />
          }
          label={t("loans.filters.open")}
        />
        <FormControlLabel
          control={
            <Switch
              checked={overdueOnly}
              onChange={(_, v) => {
                setOverdueOnly(v);
                setCursors([undefined]);
                setPaginationModel((p) => ({ ...p, page: 0 }));
              }}
            />
          }
          label={t("loans.filters.overdue", { days: overdueDays })}
        />
      </Stack>

      {loansQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loansQuery.isLoading || loansQuery.isFetching}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50, 100]}
          rowCount={
            paginationModel.page * paginationModel.pageSize +
            rows.length +
            (pageMeta?.has_more ? 1 : 0)
          }
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
          <Typography variant="h6">{t("loans.form.title")}</Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t("loans.form.cylinder_id")}
            value={cylinderId}
            onChange={(e) => setCylinderId(e.target.value)}
            type="number"
            required
          />
          <TextField
            label={t("loans.form.supplier_id")}
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            type="number"
            required
            helperText={t("loans.form.supplier_hint")}
          />
          <TextField
            label={t("loans.form.received_on")}
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setDrawerOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              {t("actions.save")}
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
        <DialogTitle>{t("loans.advance.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            {advanceLoan && (
              <Typography variant="body2">
                {t("loans.advance.summary", {
                  serial: advanceLoan.cylinder_serial,
                  stage: t(`enums.loan_stage.${NEXT[advanceLoan.stage]!}`),
                })}
              </Typography>
            )}
            {advanceLoan?.stage === "RECEIVED" && (
              <TextField
                select
                label={t("loans.form.client")}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
              >
                {(clientsQuery.data?.data ?? []).map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <TextField
              label={t("loans.advance.date")}
              type="date"
              value={advanceDate}
              onChange={(e) => setAdvanceDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAdvanceLoan(null)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={advanceMutation.isPending}
            onClick={() => advanceMutation.mutate()}
          >
            {t("actions.advance")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("loans.threshold.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {t("loans.threshold.help")}
            </Typography>
            <TextField
              label={t("loans.threshold.days")}
              type="number"
              value={thresholdDays}
              onChange={(e) => setThresholdDays(e.target.value)}
              inputProps={{ min: 1, max: 3650 }}
              required
              autoFocus
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setThresholdOpen(false)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={thresholdMutation.isPending}
            onClick={() => thresholdMutation.mutate()}
          >
            {t("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={savedToast}
        autoHideDuration={3000}
        onClose={() => setSavedToast(false)}
        message={t("loans.threshold.saved")}
      />
    </Box>
  );
}
