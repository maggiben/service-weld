"use client";

import DashboardCustomizeIcon from "@mui/icons-material/DashboardCustomize";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import RefreshIcon from "@mui/icons-material/Refresh";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useTheme } from "@mui/material/styles";
import { BarChart } from "@mui/x-charts/BarChart";
import { Gauge, gaugeClasses } from "@mui/x-charts/Gauge";
import { PieChart } from "@mui/x-charts/PieChart";
import { blueberryTwilightPalette } from "@mui/x-charts/colorPalettes";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type {
  Alert as AlertRow,
  FloatAgingRow,
  SupplierReturnsRow,
} from "@weld/schemas";
import { api } from "../api/client";
import {
  agingBucketChartData,
  collectFloatAgingPages,
  currentPeriodRange,
  fleetChartData,
  fleetKpisFromStateRows,
  formatArs,
  formatInteger,
  lossTotalCount,
  rentalTotals,
  refillChartByGas,
  refillTotals,
  revenueHeatColor,
  revenueHeatColors,
  shortenChartLabel,
  topClientsByRevenue,
  yearRevenueSlice,
  yearSlices,
  type ChartDatum,
  type PeriodGrain,
} from "../features/dashboard/dashboardLogic";
import { formatAlertDetail } from "../features/alerts/alertDisplay";
import { todayIso, yearOfIso, formatDateDMY } from "../lib/dateFormat";
import { useSessionStore } from "../store/sessionStore";

const FALLBACK_GAS_COLOR = "#78909c";

const AGING_I18N_KEY: Record<string, string> = {
  "≤30": "lte30",
  ">30": "gt30",
  ">90": "gt90",
  ">180": "gt180",
  ">365": "gt365",
};

function gasBarColor(
  gasCode: string,
  palette: Record<string, string> | undefined,
): string {
  if (!gasCode || gasCode === "—") return FALLBACK_GAS_COLOR;
  return palette?.[gasCode] ?? FALLBACK_GAS_COLOR;
}

function ChartBottomLegend({
  items,
  colorFor,
}: {
  items: ChartDatum[];
  colorFor: (item: ChartDatum, index: number) => string;
}) {
  return (
    <Stack
      direction="row"
      flexWrap="wrap"
      useFlexGap
      spacing={1}
      justifyContent="center"
      sx={{
        mt: 1,
        px: 0.5,
        pb: 0.5,
        flexShrink: 0,
        width: "100%",
        boxSizing: "border-box",
      }}
    >
      {items.map((item, index) => (
        <Stack
          key={item.id}
          direction="row"
          alignItems="center"
          spacing={0.5}
          sx={{ maxWidth: "100%" }}
        >
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: 0.5,
              bgcolor: colorFor(item, index),
              flexShrink: 0,
            }}
          />
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            title={item.label}
            sx={{ maxWidth: 140 }}
          >
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function Panel({
  title,
  action,
  children,
  minHeight = 280,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  minHeight?: number;
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ mb: 1, flexShrink: 0 }}
      >
        <Typography variant="subtitle1" fontWeight={600} noWrap title={title}>
          {title}
        </Typography>
        {action}
      </Stack>
      <Box
        sx={{
          flex: 1,
          minHeight,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </Box>
    </Paper>
  );
}

function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const body = (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        height: "100%",
        transition: "border-color 0.15s",
        ...(href
          ? {
              "&:hover": { borderColor: "primary.main" },
              cursor: "pointer",
            }
          : {}),
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
    </Paper>
  );
  if (!href) return body;
  return (
    <Link component={NextLink} href={href} underline="none" color="inherit">
      {body}
    </Link>
  );
}

function ChartEmpty({ message }: { message: string }) {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ height: "100%", minHeight: 200 }}
    >
      <Typography color="text.secondary">{message}</Typography>
    </Stack>
  );
}

function ChartLoading() {
  return (
    <Stack
      alignItems="center"
      justifyContent="center"
      sx={{ height: "100%", minHeight: 200 }}
    >
      <CircularProgress size={28} />
    </Stack>
  );
}

/** Measures the flex parent so PieChart can fill the panel instead of a fixed tiny height. */
function FillSizedPieChart({
  chartKey,
  colors,
  data,
}: {
  chartKey: string;
  colors: string[];
  data: ChartDatum[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      setSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const side = Math.max(0, Math.min(size.width, size.height));

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: "1 1 auto",
        minHeight: 220,
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {side > 0 ? (
        <PieChart
          key={chartKey}
          colors={colors}
          width={side}
          height={side}
          series={[
            {
              data: data.map((row, index) => ({
                id: row.id,
                label: row.label,
                value: row.value,
                color: colors[index % colors.length],
              })),
              innerRadius: "52%",
              outerRadius: "96%",
              paddingAngle: 1,
              cornerRadius: 3,
              highlightScope: { fade: "global", highlight: "item" },
            },
          ]}
          margin={{ top: 4, bottom: 4, left: 4, right: 4 }}
          slotProps={{
            legend: { hidden: true },
          }}
        />
      ) : null}
    </Box>
  );
}

function Worklist<T>({
  title,
  empty,
  viewAllHref,
  viewAllLabel,
  rows,
  loading,
  error,
  renderRow,
}: {
  title: string;
  empty: string;
  viewAllHref: string;
  viewAllLabel: string;
  rows: readonly T[];
  loading: boolean;
  error: boolean;
  renderRow: (row: T) => ReactNode;
}) {
  return (
    <Panel
      title={title}
      minHeight={160}
      action={
        <Button
          component={NextLink}
          href={viewAllHref}
          size="small"
          endIcon={<OpenInNewIcon fontSize="small" />}
        >
          {viewAllLabel}
        </Button>
      }
    >
      {loading ? (
        <Stack spacing={1}>
          <Skeleton height={28} />
          <Skeleton height={28} />
          <Skeleton height={28} />
        </Stack>
      ) : error ? (
        <Alert severity="warning">{empty}</Alert>
      ) : rows.length === 0 ? (
        <Typography color="text.secondary">{empty}</Typography>
      ) : (
        <Stack
          spacing={1}
          divider={<Box sx={{ borderBottom: 1, borderColor: "divider" }} />}
        >
          {rows.map((row) => renderRow(row))}
        </Stack>
      )}
    </Panel>
  );
}

export default function DashboardPage() {
  const theme = useTheme();
  const { t: translate, i18n } = useTranslation();
  const locale = i18n.language?.startsWith("en") ? "en-US" : "es-AR";
  const gasPalette = theme.palette.gas;
  const pieColors = blueberryTwilightPalette(theme.palette.mode);
  const canAlerts = useSessionStore((state) =>
    state.hasCapability("alerts:read"),
  );
  const asOf = todayIso();
  const year = yearOfIso(asOf);
  const initialRange = currentPeriodRange("month", asOf);
  const [grain, setGrain] = useState<PeriodGrain>("month");
  const [periodStart, setPeriodStart] = useState(initialRange.start);
  const [periodEnd, setPeriodEnd] = useState(initialRange.end);
  const periodKey = `${periodStart}:${periodEnd}`;
  const periodEnabled = Boolean(
    periodStart && periodEnd && periodStart <= periodEnd,
  );

  const applyGrain = (next: PeriodGrain) => {
    setGrain(next);
    const range = currentPeriodRange(next, asOf);
    setPeriodStart(range.start);
    setPeriodEnd(range.end);
  };

  const labelState = (id: string) =>
    translate(`enums.cylinder_state.${id}`, { defaultValue: id });
  const labelGas = (id: string) =>
    id === "—" ? translate("dashboard.unknown_gas") : id;
  const labelBucket = (id: string) =>
    translate(`dashboard.aging.${AGING_I18N_KEY[id] ?? id}`, {
      defaultValue: id,
    });
  const labelSlice = (labelKey: string) =>
    translate(`dashboard.grain_labels.${labelKey}`);

  const slices = useMemo(
    () => yearSlices(year, grain, asOf),
    [year, grain, asOf],
  );

  const fleetStateQuery = useQuery({
    queryKey: ["dashboard", "fleet", "state", periodStart, periodEnd],
    queryFn: ({ queryKey }) =>
      api.reportFleet({
        group_by: "state",
        period_start: String(queryKey[3]),
        period_end: String(queryKey[4]),
      }),
    enabled: periodEnabled,
  });

  const fleetGasQuery = useQuery({
    queryKey: ["dashboard", "fleet", "gas", periodStart, periodEnd],
    queryFn: ({ queryKey }) =>
      api.reportFleet({
        group_by: "gas_code",
        period_start: String(queryKey[3]),
        period_end: String(queryKey[4]),
      }),
    enabled: periodEnabled,
  });

  const rentalQuery = useQuery({
    queryKey: ["dashboard", "rental", periodStart, periodEnd],
    queryFn: ({ queryKey }) => {
      const start = String(queryKey[2]);
      const end = String(queryKey[3]);
      return api.reportRental({
        period_start: start,
        period_end: end,
      });
    },
    enabled: periodEnabled,
  });

  const refillQuery = useQuery({
    queryKey: ["dashboard", "refill", periodStart, periodEnd],
    queryFn: ({ queryKey }) => {
      const start = String(queryKey[2]);
      const end = String(queryKey[3]);
      return api.reportRefill({
        period_start: start,
        period_end: end,
      });
    },
    enabled: periodEnabled,
  });

  const yearRevenueQuery = useQuery({
    queryKey: ["dashboard", "revenue-year", year, grain, asOf] as const,
    queryFn: async ({ queryKey }) => {
      const [, , yearKey, grainKey, asOfKey] = queryKey;
      const periodSlices = yearSlices(yearKey, grainKey, asOfKey);
      const results = await Promise.all(
        periodSlices.map(async (slice) => {
          const [rentalReport, refillReport] = await Promise.all([
            api.reportRental({
              period_start: slice.start,
              period_end: slice.end,
            }),
            api.reportRefill({
              period_start: slice.start,
              period_end: slice.end,
            }),
          ]);
          const totals = yearRevenueSlice(
            rentalTotals(rentalReport.data).revenue,
            refillTotals(refillReport.data).revenue,
          );
          return {
            id: slice.id,
            labelKey: slice.labelKey,
            rental: totals.rental,
            refill: totals.refill,
          };
        }),
      );
      return results;
    },
  });

  const yearRevenueChart = useMemo(
    () =>
      (yearRevenueQuery.data ?? []).map((row) => ({
        id: row.id,
        label: labelSlice(row.labelKey),
        rental: row.rental,
        refill: row.refill,
      })),
    [yearRevenueQuery.data, i18n.language, grain],
  );

  const selectYearSlice = (dataIndex: number) => {
    const slice = slices[dataIndex];
    if (!slice) return;
    setPeriodStart(slice.start);
    setPeriodEnd(slice.end);
  };

  const lossQuery = useQuery({
    queryKey: ["dashboard", "loss", periodStart, periodEnd],
    queryFn: ({ queryKey }) => {
      const start = String(queryKey[2]);
      const end = String(queryKey[3]);
      return api.reportLoss({
        period_start: start,
        period_end: end,
      });
    },
    enabled: periodEnabled,
  });

  /** Live open float for worklists (not filtered by dashboard period). */
  const floatQuery = useQuery({
    queryKey: ["dashboard", "float", "open"],
    queryFn: () =>
      collectFloatAgingPages((cursor) =>
        api.reportFloatAging({
          limit: 200,
          sort: "-days_out",
          cursor,
        }),
      ),
  });

  /** Period-overlapping custody for the aging chart (accumulates with lookback). */
  const agingQuery = useQuery({
    queryKey: ["dashboard", "float", "aging", periodStart, periodEnd],
    queryFn: ({ queryKey }) =>
      collectFloatAgingPages(
        (cursor) =>
          api.reportFloatAging({
            limit: 200,
            sort: "-days_out",
            cursor,
            period_start: String(queryKey[3]),
            period_end: String(queryKey[4]),
          }),
        30,
      ),
    enabled: periodEnabled,
  });

  const supplierQuery = useQuery({
    queryKey: ["dashboard", "supplier-returns"],
    queryFn: () => api.reportSupplierReturns({ limit: 5, sort: "-days_open" }),
  });

  const alertsQuery = useQuery({
    queryKey: ["dashboard", "alerts"],
    queryFn: () =>
      api.listAlerts({ open: true, limit: 5, sort: "-created_at" }),
    enabled: canAlerts,
  });

  const alertsSummaryQuery = useQuery({
    queryKey: ["alerts", "summary", periodStart, periodEnd],
    queryFn: ({ queryKey }) =>
      api.alertsSummary({
        period_start: String(queryKey[2]),
        period_end: String(queryKey[3]),
      }),
    enabled: canAlerts && periodEnabled,
  });

  const kpis = useMemo(
    () => fleetKpisFromStateRows(fleetStateQuery.data?.data ?? []),
    [fleetStateQuery.data],
  );
  const rentals = useMemo(
    () => rentalTotals(rentalQuery.data?.data ?? []),
    [rentalQuery.data],
  );
  const refills = useMemo(
    () => refillTotals(refillQuery.data?.data ?? []),
    [refillQuery.data],
  );
  const refillGasChart = useMemo(
    () => refillChartByGas(refillQuery.data?.data ?? []),
    [refillQuery.data],
  );
  const losses = useMemo(
    () => lossTotalCount(lossQuery.data?.data ?? []),
    [lossQuery.data],
  );

  const stateChart: ChartDatum[] = useMemo(
    () => fleetChartData(fleetStateQuery.data?.data ?? [], "state", labelState),
    [fleetStateQuery.data, i18n.language],
  );
  const gasChart: ChartDatum[] = useMemo(
    () => fleetChartData(fleetGasQuery.data?.data ?? [], "gas_code", labelGas),
    [fleetGasQuery.data, i18n.language],
  );
  const agingChart: ChartDatum[] = useMemo(
    () => agingBucketChartData(agingQuery.data ?? [], labelBucket),
    [agingQuery.data, i18n.language],
  );
  const topClients: ChartDatum[] = useMemo(
    () =>
      topClientsByRevenue(
        rentalQuery.data?.data ?? [],
        8,
        refillQuery.data?.data ?? [],
      ),
    [rentalQuery.data, refillQuery.data],
  );
  const topClientsChart = useMemo(
    () =>
      topClients.map((row) => ({
        ...row,
        label: shortenChartLabel(row.label, 28),
      })),
    [topClients],
  );
  const topClientColors = useMemo(
    () => revenueHeatColors(topClientsChart),
    [topClientsChart],
  );

  const longOutstanding = useMemo(() => {
    const rows = floatQuery.data ?? [];
    return rows.filter((row) => row.days_out > 30).slice(0, 5);
  }, [floatQuery.data]);

  const refreshing =
    fleetStateQuery.isFetching ||
    fleetGasQuery.isFetching ||
    rentalQuery.isFetching ||
    refillQuery.isFetching ||
    yearRevenueQuery.isFetching ||
    lossQuery.isFetching ||
    floatQuery.isFetching ||
    agingQuery.isFetching;

  const refreshAll = () => {
    void fleetStateQuery.refetch();
    void fleetGasQuery.refetch();
    void rentalQuery.refetch();
    void refillQuery.refetch();
    void yearRevenueQuery.refetch();
    void lossQuery.refetch();
    void floatQuery.refetch();
    void agingQuery.refetch();
    void supplierQuery.refetch();
    if (canAlerts) {
      void alertsQuery.refetch();
      void alertsSummaryQuery.refetch();
    }
  };

  const periodInvalid = periodStart > periodEnd;

  return (
    <Stack spacing={2.5}>
      <Stack
        direction={{ xs: "column", md: "row" }}
        justifyContent="space-between"
        alignItems={{ xs: "stretch", md: "flex-start" }}
        spacing={2}
      >
        <Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <DashboardCustomizeIcon color="primary" />
            <Typography variant="h5">{translate("dashboard.title")}</Typography>
          </Stack>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {translate("dashboard.subtitle")}
          </Typography>
        </Box>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          alignItems={{ xs: "stretch", sm: "center" }}
          flexWrap="wrap"
          useFlexGap
        >
          <ToggleButtonGroup
            exclusive
            size="small"
            value={grain}
            onChange={(_event, next: PeriodGrain | null) => {
              if (next) applyGrain(next);
            }}
          >
            <ToggleButton
              value="month"
              title={translate("dashboard.grain.month_hint")}
            >
              {translate("dashboard.grain.month")}
            </ToggleButton>
            <ToggleButton
              value="quarter"
              title={translate("dashboard.grain.quarter_hint")}
            >
              {translate("dashboard.grain.quarter")}
            </ToggleButton>
            <ToggleButton
              value="semester"
              title={translate("dashboard.grain.semester_hint")}
            >
              {translate("dashboard.grain.semester")}
            </ToggleButton>
          </ToggleButtonGroup>
          <TextField
            size="small"
            type="date"
            label={translate("dashboard.period_start")}
            value={periodStart}
            onChange={(event) => setPeriodStart(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: "100%", sm: 168 } }}
          />
          <TextField
            size="small"
            type="date"
            label={translate("dashboard.period_end")}
            value={periodEnd}
            onChange={(event) => setPeriodEnd(event.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ width: { xs: "100%", sm: 168 } }}
          />
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={refreshAll}
            disabled={refreshing}
          >
            {translate("dashboard.refresh")}
          </Button>
        </Stack>
      </Stack>

      {periodInvalid ? (
        <Alert severity="warning">
          {translate("dashboard.period_invalid")}
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: {
            xs: "1fr",
            sm: "1fr 1fr",
            md: "repeat(3, 1fr)",
            lg: "repeat(6, 1fr)",
          },
        }}
      >
        <KpiCard
          label={translate("dashboard.kpi.fleet")}
          value={
            fleetStateQuery.isLoading ? "…" : formatInteger(kpis.total, locale)
          }
          hint={translate("dashboard.kpi.period_activity_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/cylinders"
        />
        <KpiCard
          label={translate("dashboard.kpi.in_stock")}
          value={
            fleetStateQuery.isLoading
              ? "…"
              : formatInteger(kpis.in_stock, locale)
          }
          hint={translate("dashboard.kpi.period_activity_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/cylinders"
        />
        <KpiCard
          label={translate("dashboard.kpi.float")}
          value={
            fleetStateQuery.isLoading
              ? "…"
              : formatInteger(kpis.at_client, locale)
          }
          hint={translate("dashboard.kpi.period_activity_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/reports"
        />
        <KpiCard
          label={translate("dashboard.kpi.revenue")}
          value={
            rentalQuery.isLoading ? "…" : formatArs(rentals.revenue, locale)
          }
          hint={translate("dashboard.kpi.revenue_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/billing"
        />
        <KpiCard
          label={translate("dashboard.kpi.refill_revenue")}
          value={
            refillQuery.isLoading ? "…" : formatArs(refills.revenue, locale)
          }
          hint={translate("dashboard.kpi.refill_revenue_hint", {
            count: refills.refill_count,
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/refills"
        />
        <KpiCard
          label={translate("dashboard.kpi.losses")}
          value={lossQuery.isLoading ? "…" : formatInteger(losses, locale)}
          hint={translate("dashboard.kpi.losses_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href="/reports"
        />
        <KpiCard
          label={translate("dashboard.kpi.alerts")}
          value={
            !canAlerts
              ? "—"
              : alertsSummaryQuery.isLoading
                ? "…"
                : formatInteger(
                    alertsSummaryQuery.data?.open_count ?? 0,
                    locale,
                  )
          }
          hint={translate("dashboard.kpi.alerts_period_hint", {
            from: formatDateDMY(periodStart),
            to: formatDateDMY(periodEnd),
          })}
          href={canAlerts ? "/alerts" : undefined}
        />
      </Box>

      <Panel
        title={translate("dashboard.charts.revenue_year", { year })}
        action={
          <Typography variant="caption" color="text.secondary">
            {translate(`dashboard.grain.${grain}`)}
          </Typography>
        }
      >
        <Typography
          variant="caption"
          color="text.secondary"
          display="block"
          sx={{ mb: 1 }}
        >
          {translate("dashboard.charts.revenue_year_hint")}
        </Typography>
        {yearRevenueQuery.isLoading ? (
          <ChartLoading />
        ) : yearRevenueQuery.isError ? (
          <Alert severity="error">{translate("dashboard.error")}</Alert>
        ) : yearRevenueChart.every(
            (row) => row.rental === 0 && row.refill === 0,
          ) ? (
          <ChartEmpty message={translate("dashboard.empty_period")} />
        ) : (
          <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <BarChart
              key={`revenue-year-${grain}-${yearRevenueQuery.dataUpdatedAt}`}
              dataset={yearRevenueChart}
              xAxis={[{ dataKey: "label", scaleType: "band" }]}
              series={[
                {
                  dataKey: "rental",
                  label: translate("dashboard.series.revenue"),
                  color: "#2e7d32",
                  stack: "revenue",
                },
                {
                  dataKey: "refill",
                  label: translate("dashboard.series.refill_revenue"),
                  color: "#1565c0",
                  stack: "revenue",
                },
              ]}
              height={240}
              margin={{ left: 50, right: 10, top: 10, bottom: 30 }}
              grid={{ horizontal: true }}
              slotProps={{ legend: { hidden: true } }}
              onAxisClick={(_event, data) => {
                if (data?.dataIndex != null) selectYearSlice(data.dataIndex);
              }}
              onItemClick={(_event, item) => {
                selectYearSlice(item.dataIndex);
              }}
              sx={{ cursor: "pointer", flexShrink: 0 }}
            />
            <ChartBottomLegend
              items={[
                {
                  id: "rental",
                  label: translate("dashboard.series.revenue"),
                  value: 0,
                },
                {
                  id: "refill",
                  label: translate("dashboard.series.refill_revenue"),
                  value: 0,
                },
              ]}
              colorFor={(item) =>
                item.id === "refill" ? "#1565c0" : "#2e7d32"
              }
            />
          </Stack>
        )}
      </Panel>

      <Panel
        title={translate("dashboard.charts.refills")}
        action={
          <Button component={NextLink} href="/refills" size="small">
            {translate("dashboard.view_all")}
          </Button>
        }
      >
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mb: 1 }}
        >
          {translate("dashboard.charts.refills_hint")}
        </Typography>
        {refillQuery.isLoading ? (
          <ChartLoading />
        ) : refillQuery.isError ? (
          <Alert severity="error">{translate("dashboard.error")}</Alert>
        ) : refillGasChart.length === 0 ? (
          <ChartEmpty message={translate("dashboard.empty_period")} />
        ) : (
          <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <BarChart
              key={`refills-${periodKey}-${refillQuery.dataUpdatedAt}`}
              dataset={refillGasChart}
              xAxis={[
                {
                  dataKey: "id",
                  scaleType: "band",
                  valueFormatter: (code) => labelGas(String(code)),
                },
              ]}
              yAxis={[
                {
                  id: "count",
                  scaleType: "linear",
                  min: 0,
                  valueFormatter: (value) =>
                    value == null ? "" : formatInteger(Number(value), locale),
                },
                {
                  id: "revenue",
                  scaleType: "linear",
                  min: 0,
                  valueFormatter: (value) =>
                    value == null ? "" : formatInteger(Number(value), locale),
                },
              ]}
              series={[
                {
                  dataKey: "count",
                  label: translate("dashboard.series.refill_count"),
                  yAxisId: "count",
                  color: "#1565c0",
                },
                {
                  dataKey: "revenue",
                  label: translate("dashboard.series.refill_revenue"),
                  yAxisId: "revenue",
                  color: "#ef6c00",
                },
              ]}
              leftAxis="count"
              rightAxis="revenue"
              height={280}
              margin={{ left: 56, right: 72, top: 12, bottom: 32 }}
              grid={{ horizontal: true }}
              slotProps={{ legend: { hidden: true } }}
            />
            <ChartBottomLegend
              items={[
                {
                  id: "count",
                  label: translate("dashboard.series.refill_count"),
                  value: 0,
                },
                {
                  id: "revenue",
                  label: translate("dashboard.series.refill_revenue"),
                  value: 0,
                },
              ]}
              colorFor={(item) =>
                item.id === "revenue" ? "#ef6c00" : "#1565c0"
              }
            />
          </Stack>
        )}
      </Panel>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1.2fr 1fr 0.8fr" },
        }}
      >
        <Panel
          title={translate("dashboard.charts.fleet_state")}
          minHeight={320}
          action={
            <Button component={NextLink} href="/reports" size="small">
              {translate("dashboard.view_reports")}
            </Button>
          }
        >
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.5, flexShrink: 0 }}
          >
            {translate("dashboard.charts.fleet_period", {
              from: formatDateDMY(periodStart),
              to: formatDateDMY(periodEnd),
            })}
          </Typography>
          {fleetStateQuery.isLoading ? (
            <ChartLoading />
          ) : fleetStateQuery.isError ? (
            <Alert severity="error">{translate("dashboard.error")}</Alert>
          ) : stateChart.length === 0 ? (
            <ChartEmpty message={translate("dashboard.empty")} />
          ) : (
            <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <FillSizedPieChart
                chartKey={`fleet-state-${periodKey}-${fleetStateQuery.dataUpdatedAt}`}
                colors={pieColors}
                data={stateChart}
              />
              <Box
                sx={{
                  flexShrink: 0,
                  maxHeight: 88,
                  overflowY: "auto",
                  overflowX: "hidden",
                }}
              >
                <ChartBottomLegend
                  items={stateChart}
                  colorFor={(_item, index) =>
                    pieColors[index % pieColors.length]!
                  }
                />
              </Box>
            </Stack>
          )}
        </Panel>

        <Panel title={translate("dashboard.charts.fleet_gas")} minHeight={320}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.5, flexShrink: 0 }}
          >
            {translate("dashboard.charts.fleet_period", {
              from: formatDateDMY(periodStart),
              to: formatDateDMY(periodEnd),
            })}
          </Typography>
          {fleetGasQuery.isLoading ? (
            <ChartLoading />
          ) : fleetGasQuery.isError ? (
            <Alert severity="error">{translate("dashboard.error")}</Alert>
          ) : gasChart.length === 0 ? (
            <ChartEmpty message={translate("dashboard.empty")} />
          ) : (
            <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mb: 0.5, flexShrink: 0 }}
              >
                {translate("dashboard.charts.fleet_gas_unit")}
              </Typography>
              <Box sx={{ flex: "1 1 auto", minHeight: 180, minWidth: 0 }}>
                <BarChart
                  key={`fleet-gas-${periodKey}-${fleetGasQuery.dataUpdatedAt}`}
                  dataset={gasChart}
                  layout="horizontal"
                  yAxis={[
                    {
                      dataKey: "label",
                      scaleType: "band",
                      tickLabelStyle: {
                        fontSize: 11,
                        textAnchor: "end",
                      },
                      colorMap: {
                        type: "ordinal",
                        values: gasChart.map((row) => row.label),
                        colors: gasChart.map((row) =>
                          gasBarColor(row.id, gasPalette),
                        ),
                      },
                    },
                  ]}
                  series={[
                    {
                      dataKey: "value",
                      label: translate("dashboard.series.cylinders"),
                    },
                  ]}
                  height={Math.max(200, gasChart.length * 28)}
                  margin={{ left: 64, right: 28, top: 8, bottom: 28 }}
                  grid={{ vertical: true }}
                  slotProps={{ legend: { hidden: true } }}
                />{" "}
              </Box>
            </Stack>
          )}
        </Panel>

        <Panel
          title={translate("dashboard.charts.utilization")}
          minHeight={320}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.5, flexShrink: 0 }}
          >
            {translate("dashboard.charts.fleet_period", {
              from: formatDateDMY(periodStart),
              to: formatDateDMY(periodEnd),
            })}
          </Typography>
          {fleetStateQuery.isLoading ? (
            <ChartLoading />
          ) : (
            <Stack
              alignItems="center"
              justifyContent="center"
              spacing={1}
              sx={{ flex: 1, minHeight: 0, px: 1, pb: 0.5 }}
            >
              <Gauge
                key={`util-${periodKey}-${kpis.float_utilization_pct}`}
                value={kpis.float_utilization_pct}
                startAngle={-110}
                endAngle={110}
                height={180}
                text={({ value }) => `${value}%`}
                sx={{
                  [`& .${gaugeClasses.valueText}`]: {
                    fontSize: 28,
                    fontWeight: 700,
                  },
                }}
              />
              <Typography
                variant="body2"
                color="text.secondary"
                textAlign="center"
                sx={{ flexShrink: 0 }}
              >
                {translate("dashboard.charts.utilization_hint")}
              </Typography>
            </Stack>
          )}
        </Panel>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", lg: "1fr 1fr" },
        }}
      >
        <Panel title={translate("dashboard.charts.aging")}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.5, flexShrink: 0 }}
          >
            {translate("dashboard.charts.aging_period", {
              from: formatDateDMY(periodStart),
              to: formatDateDMY(periodEnd),
            })}
          </Typography>
          {agingQuery.isLoading ? (
            <ChartLoading />
          ) : agingQuery.isError ? (
            <Alert severity="error">{translate("dashboard.error")}</Alert>
          ) : agingChart.every((row) => row.value === 0) ? (
            <ChartEmpty message={translate("dashboard.empty")} />
          ) : (
            <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <BarChart
                key={`aging-${periodKey}-${agingQuery.dataUpdatedAt}`}
                dataset={agingChart}
                xAxis={[{ dataKey: "label", scaleType: "band" }]}
                series={[
                  {
                    dataKey: "value",
                    label: translate("dashboard.series.cylinders"),
                    color: "#ed6c02",
                  },
                ]}
                height={220}
                margin={{ left: 40, right: 10, top: 10, bottom: 30 }}
                grid={{ horizontal: true }}
                slotProps={{ legend: { hidden: true } }}
              />
              <ChartBottomLegend
                items={[
                  {
                    id: "cylinders",
                    label: translate("dashboard.series.cylinders"),
                    value: 0,
                  },
                ]}
                colorFor={() => "#ed6c02"}
              />
            </Stack>
          )}
        </Panel>

        <Panel title={translate("dashboard.charts.top_clients")}>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.5, flexShrink: 0 }}
          >
            {translate("dashboard.charts.top_clients_period", {
              from: formatDateDMY(periodStart),
              to: formatDateDMY(periodEnd),
              total: formatArs(rentals.revenue + refills.revenue, locale),
            })}
          </Typography>
          {rentalQuery.isLoading || refillQuery.isLoading ? (
            <ChartLoading />
          ) : rentalQuery.isError || refillQuery.isError ? (
            <Alert severity="error">{translate("dashboard.error")}</Alert>
          ) : topClientsChart.length === 0 ? (
            <ChartEmpty message={translate("dashboard.empty_period")} />
          ) : (
            <Stack sx={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <BarChart
                key={`top-clients-${periodKey}-${rentalQuery.dataUpdatedAt}-${refillQuery.dataUpdatedAt}`}
                dataset={topClientsChart}
                layout="horizontal"
                yAxis={[
                  {
                    dataKey: "label",
                    scaleType: "band",
                    tickLabelStyle: {
                      fontSize: 10,
                      textAnchor: "end",
                    },
                    colorMap: {
                      type: "ordinal",
                      values: topClientsChart.map((row) => row.label),
                      colors: topClientColors,
                    },
                  },
                ]}
                series={[
                  {
                    dataKey: "value",
                    label: translate("dashboard.series.total_revenue"),
                    valueFormatter: (value) =>
                      value == null ? "" : formatArs(Number(value), locale),
                  },
                ]}
                height={Math.max(240, topClientsChart.length * 40)}
                margin={{ left: 148, right: 28, top: 8, bottom: 36 }}
                grid={{ vertical: true }}
                slotProps={{ legend: { hidden: true } }}
              />
              <ChartBottomLegend
                items={[
                  {
                    id: "low",
                    label: translate("dashboard.legend.revenue_low"),
                    value: 0,
                  },
                  {
                    id: "high",
                    label: translate("dashboard.legend.revenue_high"),
                    value: 1,
                  },
                ]}
                colorFor={(item) =>
                  revenueHeatColor(item.id === "high" ? 1 : 0)
                }
              />
            </Stack>
          )}
        </Panel>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
        }}
      >
        <Worklist
          title={translate("dashboard.worklists.outstanding")}
          empty={translate("dashboard.worklists.outstanding_empty")}
          viewAllHref="/reports"
          viewAllLabel={translate("dashboard.view_all")}
          rows={longOutstanding}
          loading={floatQuery.isLoading}
          error={floatQuery.isError}
          renderRow={(row: FloatAgingRow) => (
            <Stack
              key={row.movement_id}
              direction="row"
              justifyContent="space-between"
              spacing={1}
            >
              <Box sx={{ minWidth: 0 }}>
                <Link
                  component={NextLink}
                  href={`/clients/${row.client_party_id}`}
                  underline="hover"
                >
                  {row.client_name}
                </Link>
                <Typography
                  variant="caption"
                  display="block"
                  color="text.secondary"
                >
                  {row.serial_number} · {formatDateDMY(row.delivery_date)}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600} color="warning.main">
                {translate("dashboard.days_out", { days: row.days_out })}
              </Typography>
            </Stack>
          )}
        />

        <Worklist
          title={translate("dashboard.worklists.supplier")}
          empty={translate("dashboard.worklists.supplier_empty")}
          viewAllHref="/supplier-loans"
          viewAllLabel={translate("dashboard.view_all")}
          rows={supplierQuery.data?.data ?? []}
          loading={supplierQuery.isLoading}
          error={supplierQuery.isError}
          renderRow={(row: SupplierReturnsRow) => (
            <Stack
              key={row.loan_id}
              direction="row"
              justifyContent="space-between"
              spacing={1}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" noWrap>
                  {row.supplier_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {row.serial_number ?? `#${row.cylinder_id}`} · {row.stage}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600}>
                {translate("dashboard.days_out", { days: row.days_open })}
              </Typography>
            </Stack>
          )}
        />

        <Worklist
          title={translate("dashboard.worklists.alerts")}
          empty={
            canAlerts
              ? translate("dashboard.worklists.alerts_empty")
              : translate("dashboard.worklists.alerts_forbidden")
          }
          viewAllHref="/alerts"
          viewAllLabel={translate("dashboard.view_all")}
          rows={canAlerts ? (alertsQuery.data?.data ?? []) : []}
          loading={canAlerts && alertsQuery.isLoading}
          error={canAlerts && alertsQuery.isError}
          renderRow={(row: AlertRow) => (
            <Stack key={row.id} spacing={0.25}>
              <Typography variant="body2" noWrap fontWeight={600}>
                {translate(`enums.alert_type.${row.alert_type}`, {
                  defaultValue: row.alert_type,
                })}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {formatAlertDetail(row, translate) ||
                  row.client_name ||
                  row.cylinder_serial ||
                  "—"}
              </Typography>
            </Stack>
          )}
        />
      </Box>
    </Stack>
  );
}
