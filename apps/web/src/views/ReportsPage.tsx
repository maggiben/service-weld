"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  type GridRenderCellParams,
  gridClasses,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Client,
  Cylinder,
  DataQualityRow,
  FleetRow,
  FloatAgingRow,
  LossReportRow,
  MedicalStatementRow,
  RentalReportRow,
  SupplierReturnsRow,
} from "@weld/schemas";
import { api } from "../api/client";
import { ClientLedgerDrawer } from "../features/clients/ClientLedgerDrawer";
import { useTerritories } from "../hooks/useTerritories";
import { useSessionStore } from "../store/sessionStore";

function loanStageChipColor(
  stage: string,
): "default" | "info" | "warning" | "success" {
  if (stage === "OUT_TO_CLIENT") return "warning";
  if (stage === "BACK_FROM_CLIENT") return "info";
  if (stage === "RETURNED_TO_SUPPLIER") return "success";
  return "default";
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

function monthStartIso() {
  const today = todayIso();
  return `${today.slice(0, 8)}01`;
}

type ReportTab =
  "fleet" | "float" | "rental" | "loss" | "supplier" | "quality" | "medical";

type LedgerClient = { id: number; name?: string };

function ClientLedgerLink({
  clientPartyId,
  label,
  onOpen,
}: {
  clientPartyId: number;
  label: string;
  onOpen: (client: LedgerClient) => void;
}) {
  return (
    <Link
      component="button"
      type="button"
      underline="hover"
      onClick={(e) => {
        e.stopPropagation();
        onOpen({ id: clientPartyId, name: label });
      }}
      sx={{ textAlign: "left" }}
    >
      {label}
    </Link>
  );
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const canMedical = useSessionStore((s) => s.hasCapability("medical:read"));
  const { territories } = useTerritories();
  const [tab, setTab] = useState<ReportTab>("fleet");
  const [groupBy, setGroupBy] = useState<
    "state" | "gas_code" | "owner" | "locality" | "client"
  >("state");
  const [periodStart, setPeriodStart] = useState(monthStartIso());
  const [periodEnd, setPeriodEnd] = useState(todayIso());
  const [bucket, setBucket] = useState<"" | ">30" | ">90" | ">180" | ">365">(
    "",
  );
  const [territoryFilter, setTerritoryFilter] = useState<number | "">("");
  const [rentalClient, setRentalClient] = useState<Client | null>(null);
  const [rentalCylinder, setRentalCylinder] = useState<Cylinder | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [cylinderQuery, setCylinderQuery] = useState("");
  const [ledgerClient, setLedgerClient] = useState<LedgerClient | null>(null);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  useEffect(() => {
    setPaginationModel({ page: 0, pageSize: 50 });
    setCursors([undefined]);
  }, [tab, bucket, territoryFilter]);

  const cursor = cursors[paginationModel.page];
  const showClientLedgerHint =
    tab === "float" ||
    tab === "rental" ||
    tab === "medical" ||
    (tab === "fleet" && groupBy === "client");

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", "reports-rental", clientQuery],
    queryFn: () => api.listClients({ q: clientQuery || undefined, limit: 20 }),
    enabled: tab === "rental",
  });

  const cylindersSearch = useQuery({
    queryKey: ["cylinders", "picker", "reports-rental", cylinderQuery],
    queryFn: () =>
      api.listCylinders({ q: cylinderQuery || undefined, limit: 20 }),
    enabled: tab === "rental",
  });

  const fleetQuery = useQuery({
    queryKey: ["reports", "fleet", groupBy],
    queryFn: () => api.reportFleet({ group_by: groupBy }),
    enabled: tab === "fleet",
  });

  const floatQuery = useQuery({
    queryKey: [
      "reports",
      "float",
      paginationModel.pageSize,
      cursor,
      bucket,
      territoryFilter,
    ],
    queryFn: () =>
      api.reportFloatAging({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-days_out",
        ...(bucket ? { bucket } : {}),
        ...(territoryFilter !== ""
          ? { "filter[territory_id]": territoryFilter }
          : {}),
      }),
    enabled: tab === "float",
  });

  const rentalClientId = rentalClient?.id;
  const rentalCylinderId = rentalCylinder?.id;

  const rentalQuery = useQuery({
    queryKey: [
      "reports",
      "rental",
      periodStart,
      periodEnd,
      rentalClientId,
      rentalCylinderId,
    ],
    queryFn: () =>
      api.reportRental({
        period_start: periodStart,
        period_end: periodEnd,
        ...(rentalClientId != null
          ? { "filter[client_party_id]": rentalClientId }
          : {}),
        ...(rentalCylinderId != null
          ? { "filter[cylinder_id]": rentalCylinderId }
          : {}),
      }),
    enabled: tab === "rental",
  });

  const lossQuery = useQuery({
    queryKey: ["reports", "loss", periodStart, periodEnd],
    queryFn: () =>
      api.reportLoss({
        period_start: periodStart,
        period_end: periodEnd,
      }),
    enabled: tab === "loss",
  });

  const supplierQuery = useQuery({
    queryKey: ["reports", "supplier", paginationModel.pageSize, cursor],
    queryFn: () =>
      api.reportSupplierReturns({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-days_open",
      }),
    enabled: tab === "supplier",
  });

  const qualityQuery = useQuery({
    queryKey: ["reports", "quality", paginationModel.pageSize, cursor],
    queryFn: () =>
      api.reportDataQuality({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-created_at",
      }),
    enabled: tab === "quality",
  });

  const medicalQuery = useQuery({
    queryKey: ["reports", "medical", periodStart, periodEnd],
    queryFn: () =>
      api.reportMedicalStatement({
        period_start: periodStart,
        period_end: periodEnd,
      }),
    enabled: tab === "medical" && canMedical,
  });

  useEffect(() => {
    const next =
      tab === "float"
        ? floatQuery.data?.page.next_cursor
        : tab === "supplier"
          ? supplierQuery.data?.page.next_cursor
          : tab === "quality"
            ? qualityQuery.data?.page.next_cursor
            : undefined;
    if (!next) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [
    tab,
    floatQuery.data?.page.next_cursor,
    supplierQuery.data?.page.next_cursor,
    qualityQuery.data?.page.next_cursor,
    paginationModel.page,
  ]);

  const fleetColumns = useMemo<GridColDef<FleetRow>[]>(
    () => [
      {
        field: "group_key",
        headerName:
          groupBy === "state"
            ? t("reports.group.state")
            : groupBy === "gas_code"
              ? t("reports.group.gas")
              : groupBy === "owner"
                ? t("reports.group.owner")
                : groupBy === "locality"
                  ? t("reports.group.locality")
                  : t("reports.group.client"),
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row) => {
          if (groupBy === "state") {
            const state = row.state ?? row.group_key;
            return t(`enums.cylinder_state.${state}`, {
              defaultValue: state,
            });
          }
          if (groupBy === "gas_code") {
            const code = row.gas_code ?? row.group_key;
            return t(`enums.gas.${code}`, { defaultValue: code });
          }
          if (groupBy === "locality") {
            return row.locality_name ?? t("reports.group.unassigned_locality");
          }
          if (groupBy === "client") {
            return row.client_name ?? row.group_key;
          }
          return row.owner_name ?? row.group_key;
        },
        renderCell:
          groupBy === "client"
            ? (params: GridRenderCellParams<FleetRow>) => {
                const id = params.row.client_party_id;
                const name =
                  params.row.client_name ?? params.row.group_key ?? "—";
                if (id == null) return name;
                return (
                  <ClientLedgerLink
                    clientPartyId={id}
                    label={name}
                    onOpen={setLedgerClient}
                  />
                );
              }
            : undefined,
      },
      {
        field: "count",
        headerName: t("reports.columns.count"),
        width: 110,
      },
    ],
    [t, groupBy],
  );

  const floatColumns = useMemo<GridColDef<FloatAgingRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: t("reports.columns.client"),
        flex: 1,
        minWidth: 140,
        renderCell: (params) => (
          <ClientLedgerLink
            clientPartyId={params.row.client_party_id}
            label={params.value ?? String(params.row.client_party_id)}
            onOpen={setLedgerClient}
          />
        ),
      },
      {
        field: "serial_number",
        headerName: t("reports.columns.serial"),
        width: 120,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
            onClick={(e) => e.stopPropagation()}
          >
            {params.value}
          </Link>
        ),
      },
      {
        field: "delivery_date",
        headerName: t("reports.columns.delivery"),
        width: 120,
      },
      {
        field: "days_out",
        headerName: t("reports.columns.days_out"),
        width: 110,
      },
      {
        field: "bucket",
        headerName: t("reports.columns.bucket"),
        width: 110,
      },
    ],
    [t],
  );

  const rentalColumns = useMemo<GridColDef<RentalReportRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: t("reports.columns.client"),
        flex: 1,
        minWidth: 140,
        renderCell: (params) => (
          <ClientLedgerLink
            clientPartyId={params.row.client_party_id}
            label={params.value ?? String(params.row.client_party_id)}
            onOpen={setLedgerClient}
          />
        ),
      },
      {
        field: "gas_code",
        headerName: t("reports.columns.gas"),
        width: 110,
        valueFormatter: (value: string | null) =>
          value ? t(`enums.gas.${value}`, { defaultValue: value }) : "—",
      },
      {
        field: "rental_days",
        headerName: t("reports.columns.rental_days"),
        width: 110,
      },
      {
        field: "revenue",
        headerName: t("reports.columns.revenue"),
        width: 120,
        valueFormatter: (value: number) =>
          new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(value),
      },
      {
        field: "movement_count",
        headerName: t("reports.columns.movements"),
        width: 110,
      },
    ],
    [t],
  );

  const lossColumns = useMemo<GridColDef<LossReportRow>[]>(
    () => [
      {
        field: "owner_name",
        headerName: t("reports.columns.owner"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "ownership_basis",
        headerName: t("reports.columns.basis"),
        width: 120,
        valueFormatter: (value: string) =>
          t(`enums.basis.${value}`, { defaultValue: value }),
      },
      {
        field: "state",
        headerName: t("reports.columns.state"),
        width: 160,
        valueFormatter: (value: string) =>
          t(`enums.cylinder_state.${value}`, { defaultValue: value }),
      },
      {
        field: "count",
        headerName: t("reports.columns.count"),
        width: 90,
      },
      {
        field: "liability",
        headerName: t("reports.columns.liability"),
        width: 110,
      },
    ],
    [t],
  );

  const supplierColumns = useMemo<GridColDef<SupplierReturnsRow>[]>(
    () => [
      {
        field: "supplier_name",
        headerName: t("reports.columns.supplier"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "serial_number",
        headerName: t("reports.columns.serial"),
        width: 120,
        renderCell: (params) =>
          params.row.cylinder_id != null && params.value ? (
            <Link
              component={NextLink}
              href={`/cylinders/${params.row.cylinder_id}`}
              underline="hover"
              onClick={(e) => e.stopPropagation()}
            >
              {params.value}
            </Link>
          ) : (
            (params.value ?? "—")
          ),
      },
      {
        field: "stage",
        headerName: t("reports.columns.stage"),
        width: 180,
        renderCell: (params) => {
          const stage = params.value as string;
          return (
            <Chip
              size="small"
              label={t(`enums.loan_stage.${stage}`, {
                defaultValue: stage,
              })}
              color={loanStageChipColor(stage)}
            />
          );
        },
      },
      {
        field: "days_open",
        headerName: t("reports.columns.days_open"),
        width: 110,
      },
    ],
    [t],
  );

  const qualityColumns = useMemo<GridColDef<DataQualityRow>[]>(
    () => [
      {
        field: "source",
        headerName: t("reports.columns.source"),
        width: 140,
      },
      {
        field: "reason",
        headerName: t("reports.columns.reason"),
        flex: 1,
        minWidth: 180,
      },
      {
        field: "status",
        headerName: t("reports.columns.status"),
        width: 110,
      },
      {
        field: "created_at",
        headerName: t("reports.columns.created"),
        width: 180,
      },
    ],
    [t],
  );

  const medicalColumns = useMemo<GridColDef<MedicalStatementRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: t("reports.columns.client"),
        flex: 1,
        minWidth: 140,
        renderCell: (params) => (
          <ClientLedgerLink
            clientPartyId={params.row.client_party_id}
            label={params.value ?? String(params.row.client_party_id)}
            onOpen={setLedgerClient}
          />
        ),
      },
      {
        field: "deliveries",
        headerName: t("reports.columns.deliveries"),
        width: 110,
      },
      {
        field: "rental_days",
        headerName: t("reports.columns.rental_days"),
        width: 110,
      },
      {
        field: "accessory_rentals",
        headerName: t("reports.columns.accessories"),
        width: 120,
      },
    ],
    [t],
  );

  const activeQuery =
    tab === "fleet"
      ? fleetQuery
      : tab === "float"
        ? floatQuery
        : tab === "rental"
          ? rentalQuery
          : tab === "loss"
            ? lossQuery
            : tab === "supplier"
              ? supplierQuery
              : tab === "quality"
                ? qualityQuery
                : medicalQuery;

  const rows =
    tab === "fleet"
      ? (fleetQuery.data?.data ?? []).map((r, i) => ({ ...r, id: i }))
      : tab === "float"
        ? (floatQuery.data?.data ?? []).map((r) => ({
            ...r,
            id: r.movement_id,
          }))
        : tab === "rental"
          ? (rentalQuery.data?.data ?? []).map((r, i) => ({ ...r, id: i }))
          : tab === "loss"
            ? (lossQuery.data?.data ?? []).map((r, i) => ({ ...r, id: i }))
            : tab === "supplier"
              ? (supplierQuery.data?.data ?? []).map((r) => ({
                  ...r,
                  id: r.loan_id,
                }))
              : tab === "quality"
                ? (qualityQuery.data?.data ?? []).map((r) => ({
                    ...r,
                    id: r.id,
                  }))
                : (medicalQuery.data?.data ?? []).map((r, i) => ({
                    ...r,
                    id: i,
                  }));

  const columns =
    tab === "fleet"
      ? fleetColumns
      : tab === "float"
        ? floatColumns
        : tab === "rental"
          ? rentalColumns
          : tab === "loss"
            ? lossColumns
            : tab === "supplier"
              ? supplierColumns
              : tab === "quality"
                ? qualityColumns
                : medicalColumns;

  const paginated = tab === "float" || tab === "supplier" || tab === "quality";

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">{t("reports.title")}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {t("reports.subtitle")}
        </Typography>
        {showClientLedgerHint ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {t("reports.hint_client_ledger")}
          </Typography>
        ) : null}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v: ReportTab) => setTab(v)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="fleet" label={t("reports.tabs.fleet")} />
        <Tab value="float" label={t("reports.tabs.float")} />
        <Tab value="rental" label={t("reports.tabs.rental")} />
        <Tab value="loss" label={t("reports.tabs.loss")} />
        <Tab value="supplier" label={t("reports.tabs.supplier")} />
        <Tab value="quality" label={t("reports.tabs.quality")} />
        {canMedical ? (
          <Tab value="medical" label={t("reports.tabs.medical")} />
        ) : null}
      </Tabs>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {tab === "fleet" ? (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{t("reports.filters.group_by")}</InputLabel>
            <Select
              label={t("reports.filters.group_by")}
              value={groupBy}
              onChange={(e) =>
                setGroupBy(
                  e.target.value as
                    "state" | "gas_code" | "owner" | "locality" | "client",
                )
              }
            >
              <MenuItem value="state">{t("reports.group.state")}</MenuItem>
              <MenuItem value="gas_code">{t("reports.group.gas")}</MenuItem>
              <MenuItem value="owner">{t("reports.group.owner")}</MenuItem>
              <MenuItem value="locality">
                {t("reports.group.locality")}
              </MenuItem>
              <MenuItem value="client">{t("reports.group.client")}</MenuItem>
            </Select>
          </FormControl>
        ) : null}
        {tab === "float" ? (
          <>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t("reports.filters.territory")}</InputLabel>
              <Select
                label={t("reports.filters.territory")}
                value={territoryFilter}
                onChange={(e) => {
                  const value = e.target.value;
                  setTerritoryFilter(value === "" ? "" : Number(value));
                }}
              >
                <MenuItem value="">{t("clients.filters.all")}</MenuItem>
                {territories.map((territory) => (
                  <MenuItem key={territory.id} value={territory.id}>
                    {territory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{t("reports.filters.bucket")}</InputLabel>
              <Select
                label={t("reports.filters.bucket")}
                value={bucket}
                onChange={(e) =>
                  setBucket(
                    e.target.value as "" | ">30" | ">90" | ">180" | ">365",
                  )
                }
              >
                <MenuItem value="">{t("reports.bucket.all")}</MenuItem>
                <MenuItem value=">30">&gt;30</MenuItem>
                <MenuItem value=">90">&gt;90</MenuItem>
                <MenuItem value=">180">&gt;180</MenuItem>
                <MenuItem value=">365">&gt;365</MenuItem>
              </Select>
            </FormControl>
          </>
        ) : null}
        {tab === "rental" || tab === "loss" || tab === "medical" ? (
          <>
            <TextField
              size="small"
              type="date"
              label={t("reports.filters.period_start")}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              size="small"
              type="date"
              label={t("reports.filters.period_end")}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            {tab === "rental" ? (
              <>
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 220 }}
                  options={
                    rentalClient
                      ? [
                          rentalClient,
                          ...(clientsSearch.data?.data ?? []).filter(
                            (c) => c.id !== rentalClient.id,
                          ),
                        ]
                      : (clientsSearch.data?.data ?? [])
                  }
                  getOptionLabel={(option: Client) => option.name}
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  loading={clientsSearch.isFetching}
                  value={rentalClient}
                  onChange={(_, value) => setRentalClient(value)}
                  onInputChange={(_, value, reason) => {
                    if (reason !== "reset") setClientQuery(value);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t("reports.filters.client")}
                    />
                  )}
                />
                <Autocomplete
                  size="small"
                  sx={{ minWidth: 220 }}
                  options={
                    rentalCylinder
                      ? [
                          rentalCylinder,
                          ...(cylindersSearch.data?.data ?? []).filter(
                            (c) => c.id !== rentalCylinder.id,
                          ),
                        ]
                      : (cylindersSearch.data?.data ?? [])
                  }
                  getOptionLabel={(option: Cylinder) =>
                    `${option.serial_number}${
                      option.owner_name ? ` · ${option.owner_name}` : ""
                    }`
                  }
                  isOptionEqualToValue={(a, b) => a.id === b.id}
                  loading={cylindersSearch.isFetching}
                  value={rentalCylinder}
                  onChange={(_, value) => setRentalCylinder(value)}
                  onInputChange={(_, value, reason) => {
                    if (reason !== "reset") setCylinderQuery(value);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t("reports.filters.cylinder")}
                    />
                  )}
                />
              </>
            ) : null}
            <Button
              variant="outlined"
              onClick={() => {
                void activeQuery.refetch();
              }}
            >
              {t("reports.refresh")}
            </Button>
          </>
        ) : null}
      </Stack>

      {activeQuery.isError ? (
        <Alert severity="error">{t("reports.error")}</Alert>
      ) : null}

      <Box sx={{ height: 520, width: "100%" }}>
        <DataGrid
          rows={rows as Array<{ id: string | number }>}
          columns={columns as GridColDef[]}
          loading={activeQuery.isLoading}
          disableRowSelectionOnClick
          paginationMode={paginated ? "server" : "client"}
          rowCount={
            paginated
              ? paginationModel.page * paginationModel.pageSize +
                rows.length +
                (cursors[paginationModel.page + 1] ? 1 : 0)
              : undefined
          }
          paginationModel={paginationModel}
          onPaginationModelChange={setPaginationModel}
          pageSizeOptions={[25, 50, 100]}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          localeText={{
            noRowsLabel: t("reports.empty"),
          }}
        />
      </Box>

      <ClientLedgerDrawer
        open={ledgerClient != null}
        clientPartyId={ledgerClient?.id ?? null}
        clientName={ledgerClient?.name}
        onClose={() => setLedgerClient(null)}
      />
    </Stack>
  );
}
