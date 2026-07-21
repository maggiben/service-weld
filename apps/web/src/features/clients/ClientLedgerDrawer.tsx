"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import Link from "@mui/material/Link";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import {
  DataGrid,
  type GridColDef,
  type GridPaginationModel,
  gridClasses,
} from "@mui/x-data-grid";
import { useQuery } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ClientAccountOutstandingRow,
  MovementEvent,
  MovementKind,
} from "@weld/schemas";
import { api } from "../../api/client";
import { displayRentalDays } from "../movements/displayRentalDays";

const PAGE_SIZE_OPTIONS = [25, 50, 100];

type LedgerTab = "outstanding" | "history" | "rentals" | "refills";

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export interface ClientLedgerDrawerProps {
  clientPartyId: number | null;
  clientName?: string;
  open: boolean;
  onClose: () => void;
}

export function ClientLedgerDrawer({
  clientPartyId,
  clientName,
  open,
  onClose,
}: ClientLedgerDrawerProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<LedgerTab>("outstanding");
  const [openOnly, setOpenOnly] = useState(false);
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);

  useEffect(() => {
    if (!open) return;
    setTab("outstanding");
    setOpenOnly(false);
    setPaginationModel({ page: 0, pageSize: 50 });
    setCursors([undefined]);
  }, [open, clientPartyId]);

  useEffect(() => {
    setPaginationModel((prev) => ({ ...prev, page: 0 }));
    setCursors([undefined]);
  }, [tab, openOnly]);

  const kindFilter: MovementKind | undefined =
    tab === "rentals" ? "RENTAL" : tab === "refills" ? "REFILL" : undefined;

  const accountQueryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor: cursors[paginationModel.page],
      sort: "-delivery_date" as const,
      ...(tab === "outstanding" || openOnly ? { open: true } : {}),
      ...(kindFilter ? { "filter[kind]": kindFilter } : {}),
    }),
    [
      paginationModel.page,
      paginationModel.pageSize,
      cursors,
      tab,
      openOnly,
      kindFilter,
    ],
  );

  const enabled =
    open &&
    clientPartyId != null &&
    Number.isFinite(clientPartyId) &&
    (paginationModel.page === 0 || cursors[paginationModel.page] != null);

  const clientQuery = useQuery({
    queryKey: ["client", clientPartyId],
    queryFn: () => api.getClient(clientPartyId!),
    enabled: open && clientPartyId != null,
  });

  const accountQuery = useQuery({
    queryKey: ["client-account", clientPartyId, accountQueryParams],
    queryFn: () => api.getClientAccount(clientPartyId!, accountQueryParams),
    enabled,
  });

  useEffect(() => {
    const nextCursor = accountQuery.data?.page.next_cursor;
    if (!nextCursor) return;
    setCursors((prev) => {
      const next = [...prev];
      next[paginationModel.page + 1] = nextCursor;
      return next;
    });
  }, [accountQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    if (model.pageSize !== paginationModel.pageSize) {
      setCursors([undefined]);
      setPaginationModel({ page: 0, pageSize: model.pageSize });
      return;
    }
    setPaginationModel(model);
  };

  const outstanding = accountQuery.data?.outstanding ?? [];
  const summary = accountQuery.data?.rental_summary;
  const title = clientQuery.data?.name ?? clientName ?? "—";
  const isOutstandingTab = tab === "outstanding";
  const pageMeta = accountQuery.data?.page;

  const outstandingColumns: GridColDef<ClientAccountOutstandingRow>[] = useMemo(
    () => [
      {
        field: "serial",
        headerName: t("clients.detail.columns.serial"),
        flex: 1,
        minWidth: 110,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
          >
            {params.value}
          </Link>
        ),
      },
      {
        field: "gas_code",
        headerName: t("clients.detail.columns.gas"),
        width: 90,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: t("clients.detail.columns.kind"),
        width: 110,
        valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
      },
      {
        field: "delivery_date",
        headerName: t("clients.detail.columns.delivery"),
        width: 120,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "accrued_days",
        headerName: t("clients.detail.columns.accrued_days"),
        width: 120,
        type: "number",
        renderCell: (params) => (
          <Chip
            size="small"
            label={params.value}
            color={
              params.value >= 90
                ? "error"
                : params.value >= 30
                  ? "warning"
                  : "default"
            }
          />
        ),
      },
    ],
    [t],
  );

  const historyColumns: GridColDef<MovementEvent>[] = useMemo(() => {
    const cols: GridColDef<MovementEvent>[] = [
      {
        field: "cylinder_serial",
        headerName: t("clients.detail.columns.serial"),
        flex: 1,
        minWidth: 110,
        renderCell: (params) => (
          <Link
            component={NextLink}
            href={`/cylinders/${params.row.cylinder_id}`}
            underline="hover"
          >
            {params.value ?? params.row.cylinder_id}
          </Link>
        ),
      },
      {
        field: "gas_code",
        headerName: t("clients.detail.columns.gas"),
        width: 90,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "movement_kind",
        headerName: t("clients.detail.columns.kind"),
        width: 110,
        valueFormatter: (value: string) => t(`enums.movement_kind.${value}`),
      },
      {
        field: "delivery_date",
        headerName: t("clients.detail.columns.delivery"),
        width: 120,
        valueFormatter: (value: string) => formatDate(value),
      },
      {
        field: "return_date",
        headerName: t("clients.detail.columns.return"),
        width: 120,
        valueFormatter: (value: string | null) => formatDate(value),
      },
    ];
    if (tab !== "refills") {
      cols.push({
        field: "rental_days",
        headerName: t("clients.detail.columns.rental_days"),
        width: 110,
        type: "number",
        valueGetter: (_v, row) => displayRentalDays(row),
      });
    }
    cols.push({
      field: "state",
      headerName: t("clients.detail.columns.state"),
      width: 110,
      renderCell: (params) => (
        <Chip size="small" label={t(`enums.movement_state.${params.value}`)} />
      ),
    });
    return cols;
  }, [t, tab]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 720, md: 880 } } }}
    >
      <Stack spacing={2} sx={{ p: 2, height: "100%" }}>
        <Stack
          direction="row"
          spacing={1}
          alignItems="flex-start"
          justifyContent="space-between"
        >
          <Box>
            <Typography variant="h6">{title}</Typography>
            <Typography variant="body2" color="text.secondary">
              {t("billing.ledger.subtitle")}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {clientPartyId != null && (
              <Button
                component={NextLink}
                href={`/clients/${clientPartyId}`}
                size="small"
                variant="outlined"
              >
                {t("billing.ledger.open_full")}
              </Button>
            )}
            <Button size="small" onClick={onClose}>
              {t("actions.close")}
            </Button>
          </Stack>
        </Stack>

        {summary && (
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip
              size="small"
              label={`${t("clients.detail.kpi.outstanding")}: ${summary.open_count}`}
            />
            <Chip
              size="small"
              label={`${t("clients.detail.kpi.rentals")}: ${summary.open_rental_count}`}
            />
            <Chip
              size="small"
              label={`${t("clients.detail.kpi.refills")}: ${summary.open_refill_count}`}
            />
          </Stack>
        )}

        <Tabs
          value={tab}
          onChange={(_, value: LedgerTab) => setTab(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab
            value="outstanding"
            label={t("clients.detail.tabs.outstanding")}
          />
          <Tab value="history" label={t("clients.detail.tabs.history")} />
          <Tab value="rentals" label={t("clients.detail.tabs.rentals")} />
          <Tab value="refills" label={t("clients.detail.tabs.refills")} />
        </Tabs>

        {!isOutstandingTab && (
          <FormControlLabel
            control={
              <Switch
                checked={openOnly}
                onChange={(e) => setOpenOnly(e.target.checked)}
              />
            }
            label={t("clients.detail.filters.open_only")}
          />
        )}

        {(clientQuery.isError || accountQuery.isError) && (
          <Alert severity="error">{t("errors.load_failed")}</Alert>
        )}

        <Box sx={{ flex: 1, minHeight: 0 }}>
          {isOutstandingTab ? (
            <DataGrid
              rows={outstanding}
              columns={outstandingColumns}
              getRowId={(row) => row.movement_id}
              loading={accountQuery.isLoading || accountQuery.isFetching}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              initialState={{
                pagination: { paginationModel: { pageSize: 50 } },
              }}
              disableRowSelectionOnClick
              slots={{
                noRowsOverlay: () => (
                  <Stack
                    height="100%"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Typography color="text.secondary">
                      {t("clients.detail.empty")}
                    </Typography>
                  </Stack>
                ),
              }}
              sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
            />
          ) : (
            <DataGrid
              rows={accountQuery.data?.data ?? []}
              columns={historyColumns}
              getRowId={(row) => row.id}
              loading={accountQuery.isLoading || accountQuery.isFetching}
              paginationMode="server"
              paginationModel={paginationModel}
              onPaginationModelChange={handlePaginationModelChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              rowCount={
                paginationModel.page * paginationModel.pageSize +
                (accountQuery.data?.data?.length ?? 0) +
                (pageMeta?.has_more ? 1 : 0)
              }
              disableRowSelectionOnClick
              slots={{
                noRowsOverlay: () => (
                  <Stack
                    height="100%"
                    alignItems="center"
                    justifyContent="center"
                  >
                    <Typography color="text.secondary">
                      {t("clients.detail.empty")}
                    </Typography>
                  </Stack>
                ),
              }}
              sx={{ [`& .${gridClasses.cell}`]: { outline: "none" } }}
            />
          )}
        </Box>
      </Stack>
    </Drawer>
  );
}
