"use client";

import AddIcon from "@mui/icons-material/Add";
import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import SyncIcon from "@mui/icons-material/Sync";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonGroup from "@mui/material/ButtonGroup";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  CapacityUnit,
  GasCode,
  RatePeriod,
  RentalRate,
} from "@weld/schemas";
import {
  CYLINDER_CAPACITY_KG_OPTIONS,
  CYLINDER_CAPACITY_OPTIONS,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RefillRatesPanel } from "../features/rates/RefillRatesPanel";
import { formatCapacity } from "../lib/format";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { useNotificationStore } from "../store/notificationStore";
import { useSessionStore } from "../store/sessionStore";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

type RatesTab = "rental" | "refill";

function parseRatesTab(value: string | null): RatesTab {
  return value === "refill" ? "refill" : "rental";
}

export default function RatesPage() {
  const { t: translate } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseRatesTab(searchParams.get("tab"));
  const [createMenuAnchor, setCreateMenuAnchor] = useState<HTMLElement | null>(
    null,
  );
  const [refillCreateRequestId, setRefillCreateRequestId] = useState(0);
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
  const [editingRate, setEditingRate] = useState<RentalRate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [amount, setAmount] = useState("85");
  const [period, setPeriod] = useState<RatePeriod>("DAILY");
  const [gas, setGas] = useState<GasCode | "">("");
  const [capacity, setCapacity] = useState<number | "">("");
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>("M3");
  const [clientId, setClientId] = useState<number | "">("");
  const [effectiveFrom, setEffectiveFrom] = useState(
    dayjs().format("YYYY-MM-DD"),
  );
  const [effectiveTo, setEffectiveTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [backfillConfirmOpen, setBackfillConfirmOpen] = useState(false);
  const [backfillRateId, setBackfillRateId] = useState<number | undefined>();

  const isEditing = editingRate != null;

  const clientsQuery = useQuery({
    queryKey: ["clients", "rate-picker"],
    queryFn: () => api.listClients({ limit: 100, sort: "name" }),
    enabled: drawerOpen,
  });

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
    queryKey: ["rental-rates", queryParams],
    queryFn: () => api.listRentalRates(queryParams),
    enabled: tab === "rental" && (paginationModel.page === 0 || cursor != null),
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

  const resetForm = (rate?: RentalRate) => {
    setError(null);
    if (rate) {
      setEditingRate(rate);
      setAmount(String(rate.amount));
      setPeriod(rate.period);
      setGas(rate.gas_code ?? "");
      setCapacity(rate.capacity_m3 ?? "");
      setCapacityUnit(rate.capacity_unit ?? "M3");
      setClientId(rate.client_party_id ?? "");
      setEffectiveFrom(rate.effective_from);
      setEffectiveTo(rate.effective_to);
      return;
    }
    setEditingRate(null);
    setAmount("85");
    setPeriod("DAILY");
    setGas("");
    setCapacity("");
    setCapacityUnit("M3");
    setClientId("");
    setEffectiveFrom(dayjs().format("YYYY-MM-DD"));
    setEffectiveTo(null);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditingRate(null);
    setError(null);
  };

  const setTab = (next: RatesTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "rental") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (rate: RentalRate) => {
    if (!canWrite) return;
    resetForm(rate);
    setDrawerOpen(true);
  };

  const closeCreateMenu = () => setCreateMenuAnchor(null);

  const openCreateMenu = (event: MouseEvent<HTMLElement>) => {
    setCreateMenuAnchor(event.currentTarget);
  };

  const createRentalRate = () => {
    closeCreateMenu();
    setTab("rental");
    openCreate();
  };

  const createRefillRate = () => {
    closeCreateMenu();
    setTab("refill");
    setRefillCreateRequestId((prev) => prev + 1);
  };

  const openBackfillConfirm = (rateId?: number) => {
    setBackfillRateId(rateId);
    setBackfillConfirmOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        amount: Number(amount),
        period,
        gas_code: gas || null,
        capacity_m3: capacity === "" ? null : Number(capacity),
        capacity_unit: capacityUnit,
        client_party_id: clientId === "" ? null : Number(clientId),
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
      };
      if (editingRate) {
        return api.updateRentalRate(editingRate.id, payload);
      }
      return api.createRentalRate(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rental-rates"] });
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
      api.backfillRentalRates(
        backfillRateId != null ? { rate_id: backfillRateId } : {},
      ),
    onSuccess: (result) => {
      setBackfillConfirmOpen(false);
      pushToast(
        translate("rates.backfill.done", {
          filled: result.defaults_filled,
          increased: result.defaults_increased,
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
        field: "client_name",
        headerName: translate("rates.columns.client"),
        flex: 1,
        minWidth: 140,
        valueGetter: (_v, row) => row.client_name ?? translate("rates.global"),
      },
      {
        field: "gas_code",
        headerName: translate("rates.columns.gas"),
        width: 100,
        valueGetter: (_v, row) => row.gas_code ?? translate("rates.any_gas"),
      },
      {
        field: "capacity_m3",
        headerName: translate("rates.columns.capacity"),
        width: 110,
        valueGetter: (_v, row: RentalRate) =>
          row.capacity_m3 != null
            ? formatCapacity(row.capacity_m3, row.capacity_unit)
            : translate("rates.any_capacity"),
      },
      {
        field: "period",
        headerName: translate("rates.columns.period"),
        width: 110,
        valueFormatter: (value: string) =>
          translate(`enums.rate_period.${value}`),
      },
      {
        field: "amount",
        headerName: translate("rates.columns.amount"),
        width: 110,
        type: "number",
      },
    ],
    [translate],
  );

  return (
    <Stack spacing={2} sx={{ height: "calc(100vh - 180px)" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={1}
      >
        <Typography variant="h5">{translate("rates.title")}</Typography>
        {canWrite && (
          <>
            <ButtonGroup
              variant="contained"
              aria-label={translate("actions.new_rate_menu")}
            >
              <Button startIcon={<AddIcon />} onClick={openCreateMenu}>
                {translate("actions.new_rate_menu")}
              </Button>
              <Button
                size="small"
                aria-label={translate("actions.new_rate_menu")}
                aria-haspopup="menu"
                aria-expanded={createMenuAnchor ? "true" : undefined}
                onClick={openCreateMenu}
              >
                <ArrowDropDownIcon />
              </Button>
            </ButtonGroup>
            <Menu
              anchorEl={createMenuAnchor}
              open={Boolean(createMenuAnchor)}
              onClose={closeCreateMenu}
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              transformOrigin={{ vertical: "top", horizontal: "right" }}
            >
              <MenuItem onClick={createRentalRate}>
                {translate("actions.new_rate")}
              </MenuItem>
              <MenuItem onClick={createRefillRate}>
                {translate("actions.new_refill_rate")}
              </MenuItem>
            </Menu>
          </>
        )}
      </Stack>

      <Tabs
        value={tab}
        onChange={(_event, value: RatesTab) => setTab(value)}
        sx={{ borderBottom: 1, borderColor: "divider" }}
      >
        <Tab value="rental" label={translate("rates.tabs.rental")} />
        <Tab value="refill" label={translate("rates.tabs.refill")} />
      </Tabs>

      {/* Mount only the active tab: MUI DataGrid inside display:none measures
          zero size and stays empty after the panel is shown again. */}
      {tab === "refill" ? (
        <RefillRatesPanel createRequestId={refillCreateRequestId} />
      ) : (
        <>
          <Stack
            direction={{ xs: "column", md: "row" }}
            justifyContent="flex-end"
            alignItems={{ md: "center" }}
            spacing={1}
          >
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
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
          </Stack>

          {ratesQuery.isError && (
            <Alert severity="error">{translate("errors.load_failed")}</Alert>
          )}

          <Box sx={{ flex: 1, minHeight: 400 }}>
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
              onRowClick={(params) => openEdit(params.row as RentalRate)}
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
                  ? translate("rates.form.title_edit")
                  : translate("rates.form.title")}
              </Typography>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField
                label={translate("rates.form.amount")}
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                fullWidth
              />
              <TextField
                select
                label={translate("rates.form.period")}
                value={period}
                onChange={(event) =>
                  setPeriod(event.target.value as RatePeriod)
                }
                fullWidth
              >
                <MenuItem value="DAILY">
                  {translate("enums.rate_period.DAILY")}
                </MenuItem>
                <MenuItem value="MONTHLY">
                  {translate("enums.rate_period.MONTHLY")}
                </MenuItem>
              </TextField>
              <TextField
                select
                label={translate("rates.form.client")}
                value={clientId}
                onChange={(event) =>
                  setClientId(
                    event.target.value === "" ? "" : Number(event.target.value),
                  )
                }
                fullWidth
              >
                <MenuItem value="">{translate("rates.global")}</MenuItem>
                {(clientsQuery.data?.data ?? []).map((client) => (
                  <MenuItem key={client.id} value={client.id}>
                    {client.name}
                  </MenuItem>
                ))}
              </TextField>
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
                    helperText: translate("rates.form.effective_from_hint"),
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
                {translate("rates.form.precedence_hint")}
              </Alert>
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button onClick={closeDrawer}>
                  {translate("actions.cancel")}
                </Button>
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
              backfillMutation.isPending
                ? undefined
                : setBackfillConfirmOpen(false)
            }
          >
            <DialogTitle>{translate("rates.backfill.title")}</DialogTitle>
            <DialogContent>
              <DialogContentText>
                {backfillRateId != null
                  ? translate("rates.backfill.body_rate")
                  : translate("rates.backfill.body_all")}
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
                {translate("rates.backfill.confirm")}
              </Button>
            </DialogActions>
          </Dialog>
        </>
      )}
    </Stack>
  );
}
