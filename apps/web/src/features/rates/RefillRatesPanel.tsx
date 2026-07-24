"use client";

import SyncIcon from "@mui/icons-material/Sync";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { CapacityUnit, GasCode, RefillRate } from "@weld/schemas";
import {
  CYLINDER_CAPACITY_KG_OPTIONS,
  CYLINDER_CAPACITY_OPTIONS,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { formatCapacity } from "../../lib/format";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../../lib/cursorPagination";
import { useNotificationStore } from "../../store/notificationStore";
import { useSessionStore } from "../../store/sessionStore";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

/** Per-fill gas prices (gas × size) for REFILL / Su Propiedad. */
export function RefillRatesPanel({
  createRequestId = 0,
}: {
  /** Increment from parent to open the create drawer (e.g. header menu). */
  createRequestId?: number;
}) {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("rates:write"),
  );
  const canBillingWrite = useSessionStore((state) =>
    state.hasCapability("billing:write"),
  );
  const canBackfill = canWrite && canBillingWrite;
  const queryClient = useQueryClient();
  const pushToast = useNotificationStore((state) => state.pushToast);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [editingRate, setEditingRate] = useState<RefillRate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [amount, setAmount] = useState("1500");
  const [gas, setGas] = useState<GasCode | "">("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>("M3");
  const [effectiveFrom, setEffectiveFrom] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillRateId, setBackfillRateId] = useState<number | undefined>();

  const isEditing = editingRate != null;

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "-effective_from" as const,
    }),
    [paginationModel.pageSize, cursor],
  );

  const ratesQuery = useQuery({
    queryKey: ["refill-rates", queryParams],
    queryFn: () => api.listRefillRates(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = ratesQuery.data?.data ?? [];
  const pageMeta = ratesQuery.data?.page;

  useEffect(() => {
    const next = ratesQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [ratesQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const resetForm = (rate?: RefillRate) => {
    setError(null);
    if (rate) {
      setEditingRate(rate);
      setAmount(String(rate.amount));
      setGas(rate.gas_code ?? "");
      setCapacity(rate.capacity_m3 ?? "");
      setCapacityUnit(rate.capacity_unit ?? "M3");
      setEffectiveFrom(rate.effective_from);
      setEffectiveTo(rate.effective_to);
      return;
    }
    setEditingRate(null);
    setAmount("1500");
    setGas("");
    setCapacity("");
    setCapacityUnit("M3");
    setEffectiveFrom(dayjs().format("YYYY-MM-DD"));
    setEffectiveTo(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingRate(null);
    setError(null);
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  useEffect(() => {
    if (createRequestId <= 0) return;
    openCreate();
    // Signal from parent menu; re-run only when request id changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional signal trigger
  }, [createRequestId]);

  const openEdit = (rate: RefillRate) => {
    if (!canWrite) return;
    resetForm(rate);
    setDrawerOpen(true);
  };

  const openBackfillConfirm = (rateId?: number) => {
    setBackfillRateId(rateId);
    setBackfillConfirmOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        amount: Number(amount),
        gas_code: gas || null,
        capacity_m3: capacity === "" ? null : Number(capacity),
        capacity_unit: capacityUnit,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      };
      if (editingRate) {
        return api.updateRefillRate(editingRate.id, payload);
      }
      return api.createRefillRate(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["refill-rates"] });
      closeDrawer();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "RATE_OVERLAP") {
          setError(translate("errors.rate_overlap"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const backfillMutation = useMutation({
    mutationFn: () =>
      api.backfillRefillRates(
        backfillRateId != null ? { rate_id: backfillRateId } : {},
      ),
    onSuccess: async (result) => {
      setBackfillConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      pushToast(
        translate("rates.refill.backfill.done", {
          invoices: result.invoice_count,
          lines: result.line_count,
          skipped: result.skipped_no_rate,
          total: result.total,
        }),
      );
    },
    onError: (err) => {
      setBackfillConfirmOpen(false);
      if (err instanceof ApiClientError) {
        if (err.code === "PERIOD_LOCKED") {
          pushToast(translate("errors.period_locked"));
          return;
        }
        pushToast(err.message);
        return;
      }
      pushToast(translate("errors.generic"));
    },
  });

  const columns: GridColDef[] = useMemo(
    () => [
      {
        field: "effective_from",
        headerName: translate("rates.columns.from"),
        width: 120,
      },
      {
        field: "effective_to",
        headerName: translate("rates.columns.to"),
        width: 120,
        valueGetter: (_v, row) => row.effective_to ?? "—",
      },
      {
        field: "gas_code",
        headerName: translate("rates.columns.gas"),
        flex: 1,
        minWidth: 100,
        valueGetter: (_v, row) => row.gas_code ?? translate("rates.any_gas"),
      },
      {
        field: "capacity_m3",
        headerName: translate("rates.columns.capacity"),
        width: 110,
        valueGetter: (_v, row: RefillRate) =>
          row.capacity_m3 != null
            ? formatCapacity(row.capacity_m3, row.capacity_unit)
            : translate("rates.any_capacity"),
      },
      {
        field: "amount",
        headerName: translate("rates.refill.columns.amount"),
        width: 130,
        type: "number",
      },
    ],
    [translate],
  );

  return (
    <Stack spacing={2} sx={{ flex: 1, minHeight: 0 }}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ md: "center" }}
        spacing={1}
      >
        <Typography variant="body2" color="text.secondary">
          {translate("rates.refill.subtitle")}
        </Typography>
        {canBackfill && (
          <Button
            variant="outlined"
            startIcon={<SyncIcon />}
            onClick={() => openBackfillConfirm()}
            disabled={backfillMutation.isPending}
          >
            {translate("actions.backfill_rates")}
          </Button>
        )}
      </Stack>

      {ratesQuery.isError && (
        <Alert severity="error">{translate("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={ratesQuery.isLoading || ratesQuery.isFetching}
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
          onRowClick={(params) => openEdit(params.row as RefillRate)}
          sx={{
            [`& .${gridClasses.cell}`]: { outline: "none" },
            ...(canWrite
              ? { [`& .${gridClasses.row}`]: { cursor: "pointer" } }
              : {}),
          }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={closeDrawer}
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 400 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">
            {isEditing
              ? translate("rates.refill.form.title_edit")
              : translate("rates.refill.form.title")}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={translate("rates.refill.form.amount")}
            type="number"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            fullWidth
          />
          <TextField
            select
            label={translate("rates.form.gas")}
            value={gas}
            onChange={(event) => setGas(event.target.value as GasCode | "")}
            fullWidth
          >
            <MenuItem value="">{translate("rates.any_gas")}</MenuItem>
            {GASES.map((code) => (
              <MenuItem key={code} value={code}>
                {code}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label={translate("rates.form.capacity_unit")}
            value={capacityUnit}
            onChange={(event) => {
              setCapacityUnit(event.target.value as CapacityUnit);
              setCapacity("");
            }}
            fullWidth
          >
            <MenuItem value="M3">
              {translate("enums.capacity_unit.M3")}
            </MenuItem>
            <MenuItem value="KG">
              {translate("enums.capacity_unit.KG")}
            </MenuItem>
          </TextField>
          <TextField
            select
            label={translate("rates.form.capacity")}
            value={capacity}
            onChange={(event) =>
              setCapacity(
                event.target.value === "" ? "" : Number(event.target.value),
              )
            }
            fullWidth
            helperText={translate("rates.form.capacity_hint")}
          >
            <MenuItem value="">{translate("rates.any_capacity")}</MenuItem>
            {(capacityUnit === "KG"
              ? CYLINDER_CAPACITY_KG_OPTIONS
              : CYLINDER_CAPACITY_OPTIONS
            ).map((size) => (
              <MenuItem key={`${capacityUnit}-${size}`} value={size}>
                {formatCapacity(size, capacityUnit)}
              </MenuItem>
            ))}
          </TextField>
          <DatePicker
            label={translate("rates.form.effective_from")}
            value={dayjs(effectiveFrom)}
            onChange={(value: Dayjs | null) => {
              if (value) setEffectiveFrom(value.format("YYYY-MM-DD"));
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                helperText: translate("rates.refill.form.effective_from_hint"),
              },
            }}
          />
          <DatePicker
            label={translate("rates.form.effective_to")}
            value={effectiveTo ? dayjs(effectiveTo) : null}
            onChange={(value: Dayjs | null) => {
              setEffectiveTo(value ? value.format("YYYY-MM-DD") : null);
            }}
            slotProps={{
              textField: {
                fullWidth: true,
                helperText: translate("rates.form.effective_to_hint"),
              },
              field: { clearable: true },
            }}
          />
          <Alert severity="info">
            {translate("rates.refill.form.precedence_hint")}
          </Alert>
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={closeDrawer}>{translate("actions.cancel")}</Button>
            {canBackfill && isEditing && editingRate && (
              <Button
                variant="outlined"
                startIcon={<SyncIcon />}
                disabled={backfillMutation.isPending}
                onClick={() => openBackfillConfirm(editingRate.id)}
              >
                {translate("actions.backfill_rates")}
              </Button>
            )}
            <Button
              variant="contained"
              disabled={saveMutation.isPending || !amount}
              onClick={() => saveMutation.mutate()}
            >
              {translate("actions.save")}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog
        open={backfillConfirmOpen}
        onClose={() =>
          backfillMutation.isPending ? undefined : setBackfillConfirmOpen(false)
        }
      >
        <DialogTitle>{translate("rates.refill.backfill.title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {backfillRateId != null
              ? translate("rates.refill.backfill.body_rate")
              : translate("rates.refill.backfill.body_all")}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setBackfillConfirmOpen(false)}
            disabled={backfillMutation.isPending}
          >
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={backfillMutation.isPending}
            onClick={() => backfillMutation.mutate()}
          >
            {translate("rates.refill.backfill.confirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
