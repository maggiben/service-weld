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
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { useQuery } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
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
  RefillReportRow,
  RentalReportRow,
  SupplierReturnsRow,
} from "@weld/schemas";
import { api } from "../api/client";
import { ClientLedgerDrawer } from "../features/clients/ClientLedgerDrawer";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { todayIso, monthStartIso } from "../lib/dateFormat";
import { loanStageChipColor } from "../lib/chipColors";
import { useTerritories } from "../hooks/useTerritories";
import { useSessionStore } from "../store/sessionStore";

type ReportTab =
  | "fleet"
  | "float"
  | "rental"
  | "refill"
  | "loss"
  | "supplier"
  | "quality"
  | "medical";

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
      onClick={(event) => {
        event.stopPropagation();
        onOpen({ id: clientPartyId, name: label });
      }}
      sx={{ textAlign: "left" }}
    >
      {label}
    </Link>
  );
}

export default function ReportsPage() {
  const { t: translate } = useTranslation();
  const canMedical = useSessionStore((state) =>
    state.hasCapability("medical:read"),
  );
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
  const [refillClient, setRefillClient] = useState<Client | null>(null);
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
    tab === "refill" ||
    tab === "medical" ||
    (tab === "fleet" && groupBy === "client");

  const clientsSearch = useQuery({
    queryKey: ["clients", "picker", "reports", tab, clientQuery],
    queryFn: () => api.listClients({ q: clientQuery || undefined, limit: 20 }),
    enabled: tab === "rental" || tab === "refill",
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
    enabled: tab === "float" && (paginationModel.page === 0 || cursor != null),
  });

  const rentalClientId = rentalClient?.id;
  const rentalCylinderId = rentalCylinder?.id;
  const refillClientId = refillClient?.id;

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

  const refillQuery = useQuery({
    queryKey: ["reports", "refill", periodStart, periodEnd, refillClientId],
    queryFn: () =>
      api.reportRefill({
        period_start: periodStart,
        period_end: periodEnd,
        ...(refillClientId != null
          ? { "filter[client_party_id]": refillClientId }
          : {}),
      }),
    enabled: tab === "refill",
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
    enabled:
      tab === "supplier" && (paginationModel.page === 0 || cursor != null),
  });

  const qualityQuery = useQuery({
    queryKey: ["reports", "quality", paginationModel.pageSize, cursor],
    queryFn: () =>
      api.reportDataQuality({
        limit: paginationModel.pageSize,
        cursor,
        sort: "-created_at",
      }),
    enabled:
      tab === "quality" && (paginationModel.page === 0 || cursor != null),
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
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [
    tab,
    floatQuery.data?.page.next_cursor,
    supplierQuery.data?.page.next_cursor,
    qualityQuery.data?.page.next_cursor,
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

  const fleetColumns = useMemo<GridColDef<FleetRow>[]>(
    () => [
      {
        field: "group_key",
        headerName:
          groupBy === "state"
            ? translate("reports.group.state")
            : groupBy === "gas_code"
              ? translate("reports.group.gas")
              : groupBy === "owner"
                ? translate("reports.group.owner")
                : groupBy === "locality"
                  ? translate("reports.group.locality")
                  : translate("reports.group.client"),
        flex: 1,
        minWidth: 160,
        valueGetter: (_value, row) => {
          if (groupBy === "state") {
            const state = row.state ?? row.group_key;
            return translate(`enums.cylinder_state.${state}`, {
              defaultValue: state,
            });
          }
          if (groupBy === "gas_code") {
            const code = row.gas_code ?? row.group_key;
            return translate(`enums.gas.${code}`, { defaultValue: code });
          }
          if (groupBy === "locality") {
            return (
              row.locality_name ??
              translate("reports.group.unassigned_locality")
            );
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
        headerName: translate("reports.columns.count"),
        width: 110,
      },
    ],
    [translate, groupBy],
  );

  const floatColumns = useMemo<GridColDef<FloatAgingRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: translate("reports.columns.client"),
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
        headerName: translate("reports.columns.serial"),
        width: 120,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
            onClick={(event) => event.stopPropagation()}
          >
            {params.value}
          </Link>
        ),
      },
      {
        field: "delivery_date",
        headerName: translate("reports.columns.delivery"),
        width: 120,
      },
      {
        field: "days_out",
        headerName: translate("reports.columns.days_out"),
        width: 110,
      },
      {
        field: "bucket",
        headerName: translate("reports.columns.bucket"),
        width: 110,
      },
    ],
    [translate],
  );

  const rentalColumns = useMemo<GridColDef<RentalReportRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: translate("reports.columns.client"),
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
        headerName: translate("reports.columns.gas"),
        width: 110,
        valueFormatter: (value: string | null) =>
          value
            ? translate(`enums.gas.${value}`, { defaultValue: value })
            : "—",
      },
      {
        field: "rental_days",
        headerName: translate("reports.columns.rental_days"),
        width: 110,
      },
      {
        field: "revenue",
        headerName: translate("reports.columns.revenue"),
        width: 120,
        valueFormatter: (value: number) =>
          new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(value),
      },
      {
        field: "movement_count",
        headerName: translate("reports.columns.movements"),
        width: 110,
      },
    ],
    [translate],
  );

  const refillColumns = useMemo<GridColDef<RefillReportRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: translate("reports.columns.client"),
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
        headerName: translate("reports.columns.gas"),
        width: 110,
        valueFormatter: (value: string | null) =>
          value
            ? translate(`enums.gas.${value}`, { defaultValue: value })
            : "—",
      },
      {
        field: "refill_count",
        headerName: translate("reports.columns.refill_count"),
        width: 120,
      },
      {
        field: "revenue",
        headerName: translate("reports.columns.revenue"),
        width: 120,
        valueFormatter: (value: number) =>
          new Intl.NumberFormat(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          }).format(value),
      },
    ],
    [translate],
  );

  const lossColumns = useMemo<GridColDef<LossReportRow>[]>(
    () => [
      {
        field: "owner_name",
        headerName: translate("reports.columns.owner"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "ownership_basis",
        headerName: translate("reports.columns.basis"),
        width: 120,
        valueFormatter: (value: string) =>
          translate(`enums.basis.${value}`, { defaultValue: value }),
      },
      {
        field: "state",
        headerName: translate("reports.columns.state"),
        width: 160,
        valueFormatter: (value: string) =>
          translate(`enums.cylinder_state.${value}`, { defaultValue: value }),
      },
      {
        field: "count",
        headerName: translate("reports.columns.count"),
        width: 90,
      },
      {
        field: "liability",
        headerName: translate("reports.columns.liability"),
        width: 110,
      },
    ],
    [translate],
  );

  const supplierColumns = useMemo<GridColDef<SupplierReturnsRow>[]>(
    () => [
      {
        field: "supplier_name",
        headerName: translate("reports.columns.supplier"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "serial_number",
        headerName: translate("reports.columns.serial"),
        width: 120,
        renderCell: (params) =>
          params.row.cylinder_id != null && params.value ? (
            <Link
              component={NextLink}
              href={`/cylinders/${params.row.cylinder_id}`}
              underline="hover"
              onClick={(event) => event.stopPropagation()}
            >
              {params.value}
            </Link>
          ) : (
            (params.value ?? "—")
          ),
      },
      {
        field: "stage",
        headerName: translate("reports.columns.stage"),
        width: 180,
        renderCell: (params) => {
          const stage = params.value as string;
          return (
            <Chip
              size="small"
              label={translate(`enums.loan_stage.${stage}`, {
                defaultValue: stage,
              })}
              color={loanStageChipColor(stage)}
            />
          );
        },
      },
      {
        field: "days_open",
        headerName: translate("reports.columns.days_open"),
        width: 110,
      },
    ],
    [translate],
  );

  const qualityColumns = useMemo<GridColDef<DataQualityRow>[]>(
    () => [
      {
        field: "source",
        headerName: translate("reports.columns.source"),
        width: 140,
      },
      {
        field: "reason",
        headerName: translate("reports.columns.reason"),
        flex: 1,
        minWidth: 180,
      },
      {
        field: "status",
        headerName: translate("reports.columns.status"),
        width: 110,
      },
      {
        field: "created_at",
        headerName: translate("reports.columns.created"),
        width: 180,
      },
    ],
    [translate],
  );

  const medicalColumns = useMemo<GridColDef<MedicalStatementRow>[]>(
    () => [
      {
        field: "client_name",
        headerName: translate("reports.columns.client"),
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
        headerName: translate("reports.columns.deliveries"),
        width: 110,
      },
      {
        field: "rental_days",
        headerName: translate("reports.columns.rental_days"),
        width: 110,
      },
      {
        field: "accessory_rentals",
        headerName: translate("reports.columns.accessories"),
        width: 120,
      },
    ],
    [translate],
  );

  const activeQuery =
    tab === "fleet"
      ? fleetQuery
      : tab === "float"
        ? floatQuery
        : tab === "rental"
          ? rentalQuery
          : tab === "refill"
            ? refillQuery
            : tab === "loss"
              ? lossQuery
              : tab === "supplier"
                ? supplierQuery
                : tab === "quality"
                  ? qualityQuery
                  : medicalQuery;

  const rows =
    tab === "fleet"
      ? (fleetQuery.data?.data ?? []).map((row, item) => ({ ...row, id: item }))
      : tab === "float"
        ? (floatQuery.data?.data ?? []).map((row) => ({
            ...row,
            id: row.movement_id,
          }))
        : tab === "rental"
          ? (rentalQuery.data?.data ?? []).map((row, item) => ({
              ...row,
              id: item,
            }))
          : tab === "refill"
            ? (refillQuery.data?.data ?? []).map((row, item) => ({
                ...row,
                id: item,
              }))
            : tab === "loss"
              ? (lossQuery.data?.data ?? []).map((row, item) => ({
                  ...row,
                  id: item,
                }))
              : tab === "supplier"
                ? (supplierQuery.data?.data ?? []).map((row) => ({
                    ...row,
                    id: row.loan_id,
                  }))
                : tab === "quality"
                  ? (qualityQuery.data?.data ?? []).map((row) => ({
                      ...row,
                      id: row.id,
                    }))
                  : (medicalQuery.data?.data ?? []).map((row, item) => ({
                      ...row,
                      id: item,
                    }));

  const columns =
    tab === "fleet"
      ? fleetColumns
      : tab === "float"
        ? floatColumns
        : tab === "rental"
          ? rentalColumns
          : tab === "refill"
            ? refillColumns
            : tab === "loss"
              ? lossColumns
              : tab === "supplier"
                ? supplierColumns
                : tab === "quality"
                  ? qualityColumns
                  : medicalColumns;

  const paginated = tab === "float" || tab === "supplier" || tab === "quality";

  const pageMeta =
    tab === "float"
      ? floatQuery.data?.page
      : tab === "supplier"
        ? supplierQuery.data?.page
        : tab === "quality"
          ? qualityQuery.data?.page
          : undefined;

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="h5">{translate("reports.title")}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {translate("reports.subtitle")}
        </Typography>
        {showClientLedgerHint ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {translate("reports.hint_client_ledger")}
          </Typography>
        ) : null}
      </Box>

      <Tabs
        value={tab}
        onChange={(_, value: ReportTab) => setTab(value)}
        variant="scrollable"
        allowScrollButtonsMobile
      >
        <Tab value="fleet" label={translate("reports.tabs.fleet")} />
        <Tab value="float" label={translate("reports.tabs.float")} />
        <Tab value="rental" label={translate("reports.tabs.rental")} />
        <Tab value="refill" label={translate("reports.tabs.refill")} />
        <Tab value="loss" label={translate("reports.tabs.loss")} />
        <Tab value="supplier" label={translate("reports.tabs.supplier")} />
        <Tab value="quality" label={translate("reports.tabs.quality")} />
        {canMedical ? (
          <Tab value="medical" label={translate("reports.tabs.medical")} />
        ) : null}
      </Tabs>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        {tab === "fleet" ? (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel>{translate("reports.filters.group_by")}</InputLabel>
            <Select
              label={translate("reports.filters.group_by")}
              value={groupBy}
              onChange={(event) =>
                setGroupBy(
                  event.target.value as
                    "state" | "gas_code" | "owner" | "locality" | "client",
                )
              }
            >
              <MenuItem value="state">
                {translate("reports.group.state")}
              </MenuItem>
              <MenuItem value="gas_code">
                {translate("reports.group.gas")}
              </MenuItem>
              <MenuItem value="owner">
                {translate("reports.group.owner")}
              </MenuItem>
              <MenuItem value="locality">
                {translate("reports.group.locality")}
              </MenuItem>
              <MenuItem value="client">
                {translate("reports.group.client")}
              </MenuItem>
            </Select>
          </FormControl>
        ) : null}
        {tab === "float" ? (
          <>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{translate("reports.filters.territory")}</InputLabel>
              <Select
                label={translate("reports.filters.territory")}
                value={territoryFilter}
                onChange={(event) => {
                  const value = event.target.value;
                  setTerritoryFilter(value === "" ? "" : Number(value));
                }}
              >
                <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
                {territories.map((territory) => (
                  <MenuItem key={territory.id} value={territory.id}>
                    {territory.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>{translate("reports.filters.bucket")}</InputLabel>
              <Select
                label={translate("reports.filters.bucket")}
                value={bucket}
                onChange={(event) =>
                  setBucket(
                    event.target.value as "" | ">30" | ">90" | ">180" | ">365",
                  )
                }
              >
                <MenuItem value="">{translate("reports.bucket.all")}</MenuItem>
                <MenuItem value=">30">&gt;30</MenuItem>
                <MenuItem value=">90">&gt;90</MenuItem>
                <MenuItem value=">180">&gt;180</MenuItem>
                <MenuItem value=">365">&gt;365</MenuItem>
              </Select>
            </FormControl>
          </>
        ) : null}
        {tab === "rental" ||
        tab === "refill" ||
        tab === "loss" ||
        tab === "medical" ? (
          <>
            <DatePicker
              label={translate("reports.filters.period_start")}
              value={dayjs(periodStart)}
              onChange={(value: Dayjs | null) => {
                if (value) setPeriodStart(value.format("YYYY-MM-DD"));
              }}
              slotProps={{ textField: { size: "small" } }}
            />
            <DatePicker
              label={translate("reports.filters.period_end")}
              value={dayjs(periodEnd)}
              onChange={(value: Dayjs | null) => {
                if (value) setPeriodEnd(value.format("YYYY-MM-DD"));
              }}
              slotProps={{ textField: { size: "small" } }}
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
                            (client) => client.id !== rentalClient.id,
                          ),
                        ]
                      : (clientsSearch.data?.data ?? [])
                  }
                  getOptionLabel={(option: Client) => option.name}
                  isOptionEqualToValue={(left, right) => left.id === right.id}
                  loading={clientsSearch.isFetching}
                  value={rentalClient}
                  onChange={(_, value) => setRentalClient(value)}
                  onInputChange={(_, value, reason) => {
                    if (reason !== "reset") setClientQuery(value);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={translate("reports.filters.client")}
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
                            (cylinder) => cylinder.id !== rentalCylinder.id,
                          ),
                        ]
                      : (cylindersSearch.data?.data ?? [])
                  }
                  getOptionLabel={(option: Cylinder) =>
                    `${option.serial_number}${
                      option.owner_name ? ` · ${option.owner_name}` : ""
                    }`
                  }
                  isOptionEqualToValue={(left, right) => left.id === right.id}
                  loading={cylindersSearch.isFetching}
                  value={rentalCylinder}
                  onChange={(_, value) => setRentalCylinder(value)}
                  onInputChange={(_, value, reason) => {
                    if (reason !== "reset") setCylinderQuery(value);
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={translate("reports.filters.cylinder")}
                    />
                  )}
                />
              </>
            ) : null}
            {tab === "refill" ? (
              <Autocomplete
                size="small"
                sx={{ minWidth: 220 }}
                options={
                  refillClient
                    ? [
                        refillClient,
                        ...(clientsSearch.data?.data ?? []).filter(
                          (client) => client.id !== refillClient.id,
                        ),
                      ]
                    : (clientsSearch.data?.data ?? [])
                }
                getOptionLabel={(option: Client) => option.name}
                isOptionEqualToValue={(left, right) => left.id === right.id}
                loading={clientsSearch.isFetching}
                value={refillClient}
                onChange={(_, value) => setRefillClient(value)}
                onInputChange={(_, value, reason) => {
                  if (reason !== "reset") setClientQuery(value);
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={translate("reports.filters.client")}
                  />
                )}
              />
            ) : null}
            <Button
              variant="outlined"
              onClick={() => {
                void activeQuery.refetch();
              }}
            >
              {translate("reports.refresh")}
            </Button>
          </>
        ) : null}
      </Stack>

      {activeQuery.isError ? (
        <Alert severity="error">{translate("reports.error")}</Alert>
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
              ? cursorPageRowCount(
                  paginationModel.page,
                  paginationModel.pageSize,
                  rows.length,
                  pageMeta?.has_more ?? false,
                )
              : undefined
          }
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50, 100]}
          sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
          localeText={{
            noRowsLabel: translate("reports.empty"),
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
