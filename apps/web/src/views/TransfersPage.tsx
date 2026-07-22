"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import Stack from "@mui/material/Stack";
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
  Cylinder,
  StockTransfer,
  TransferCustodyStatus,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { SEED_TRANSFER_PARTIES } from "../constants/masters";
import { useSessionStore } from "../store/sessionStore";

type PartyOption = {
  id: number;
  name: string;
  party_type: string;
};

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

function partyTypeLabel(t: (key: string) => string, partyType: string): string {
  const key = `transfers.party_types.${partyType}`;
  const label = t(key);
  return label === key ? partyType : label;
}

function custodyChipColor(
  status: TransferCustodyStatus,
): "warning" | "info" | "success" {
  if (status === "LOANED") return "warning";
  if (status === "REFILL") return "info";
  return "success";
}

export default function TransfersPage() {
  const { t } = useTranslation();
  const canWrite = useSessionStore((s) => s.hasCapability("transfers:write"));
  const queryClient = useQueryClient();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [cylinderQuery, setCylinderQuery] = useState("");
  const [selectedCylinder, setSelectedCylinder] = useState<Cylinder | null>(
    null,
  );
  const [fromQuery, setFromQuery] = useState("");
  const [toQuery, setToQuery] = useState("");
  const [fromParty, setFromParty] = useState<PartyOption | null>(null);
  const [toParty, setToParty] = useState<PartyOption | null>(null);
  const [transferDate, setTransferDate] = useState(todayIso());
  const [returnDate, setReturnDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [closeTarget, setCloseTarget] = useState<StockTransfer | null>(null);
  const [closeDate, setCloseDate] = useState(todayIso());
  const [closeError, setCloseError] = useState<string | null>(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "-transfer_date" as const,
    }),
    [paginationModel.pageSize, cursor],
  );

  const transfersQuery = useQuery({
    queryKey: ["transfers", queryParams],
    queryFn: () => api.listTransfers(queryParams),
  });

  const cylindersSearch = useQuery({
    queryKey: ["cylinders", "transfer-picker", cylinderQuery],
    queryFn: () =>
      api.listCylinders({
        q: cylinderQuery || undefined,
        limit: 20,
      }),
    enabled: drawerOpen,
  });

  const fromClientsSearch = useQuery({
    queryKey: ["clients", "transfer-from", fromQuery],
    queryFn: () => api.listClients({ q: fromQuery || undefined, limit: 20 }),
    enabled: drawerOpen,
  });

  const toClientsSearch = useQuery({
    queryKey: ["clients", "transfer-to", toQuery],
    queryFn: () => api.listClients({ q: toQuery || undefined, limit: 20 }),
    enabled: drawerOpen,
  });

  const structuredParties = useMemo<PartyOption[]>(
    () =>
      SEED_TRANSFER_PARTIES.map((p) => ({
        id: p.id,
        name: p.name,
        party_type: p.party_type,
      })),
    [],
  );

  const fromOptions = useMemo(() => {
    const q = fromQuery.trim().toLowerCase();
    const nodes = structuredParties.filter(
      (p) => !q || p.name.toLowerCase().includes(q),
    );
    const clients: PartyOption[] = (fromClientsSearch.data?.data ?? []).map(
      (c) => ({
        id: c.id,
        name: c.name,
        party_type: "CUSTOMER",
      }),
    );
    const seen = new Set(nodes.map((p) => p.id));
    return [...nodes, ...clients.filter((c) => !seen.has(c.id))];
  }, [structuredParties, fromQuery, fromClientsSearch.data]);

  const toOptions = useMemo(() => {
    const q = toQuery.trim().toLowerCase();
    const nodes = structuredParties.filter(
      (p) => !q || p.name.toLowerCase().includes(q),
    );
    const clients: PartyOption[] = (toClientsSearch.data?.data ?? []).map(
      (c) => ({
        id: c.id,
        name: c.name,
        party_type: "CUSTOMER",
      }),
    );
    const seen = new Set(nodes.map((p) => p.id));
    return [...nodes, ...clients.filter((c) => !seen.has(c.id))];
  }, [structuredParties, toQuery, toClientsSearch.data]);

  useEffect(() => {
    const next = transfersQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => {
      const copy = [...prev];
      copy[paginationModel.page + 1] = next;
      return copy;
    });
  }, [transfersQuery.data?.page.next_cursor, paginationModel.page]);

  const resetForm = () => {
    setCylinderQuery("");
    setSelectedCylinder(null);
    setFromQuery("");
    setToQuery("");
    setFromParty(null);
    setToParty(null);
    setTransferDate(todayIso());
    setReturnDate("");
    setNote("");
    setError(null);
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (!selectedCylinder || !fromParty || !toParty) {
        throw new Error("missing");
      }
      return api.createTransfer({
        cylinder_id: selectedCylinder.id,
        from_party_id: fromParty.id,
        to_party_id: toParty.id,
        transfer_date: transferDate,
        return_date: returnDate.trim() || null,
        note: note.trim() || null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transfers"] });
      setDrawerOpen(false);
      resetForm();
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "SAME_PARTY") {
          setError(t("errors.same_party"));
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

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!closeTarget) throw new Error("missing");
      return api.closeTransfer(closeTarget.id, { return_date: closeDate });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transfers"] });
      setCloseTarget(null);
      setCloseError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "DATE_ORDER") {
          setCloseError(t("errors.date_order"));
          return;
        }
        setCloseError(err.message);
        return;
      }
      setCloseError(t("errors.generic"));
    },
  });

  const columns = useMemo<GridColDef<StockTransfer>[]>(
    () => [
      {
        field: "custody_status",
        headerName: t("transfers.columns.status"),
        width: 140,
        sortable: false,
        renderCell: (params) => (
          <Chip
            size="small"
            label={t(`transfers.custody_status.${params.value}`)}
            color={custodyChipColor(params.value as TransferCustodyStatus)}
            variant={params.row.return_date ? "outlined" : "filled"}
          />
        ),
      },
      {
        field: "transfer_date",
        headerName: t("transfers.columns.exit_date"),
        width: 120,
      },
      {
        field: "return_date",
        headerName: t("transfers.columns.entry_date"),
        width: 120,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "cylinder_serial",
        headerName: t("transfers.columns.cylinder"),
        flex: 1,
        minWidth: 110,
      },
      {
        field: "from_party_name",
        headerName: t("transfers.columns.from"),
        flex: 1,
        minWidth: 130,
        renderCell: (params) => (
          <Stack spacing={0} sx={{ lineHeight: 1.2, py: 0.5 }}>
            <Typography variant="body2">{params.value}</Typography>
            {params.row.from_party_type && (
              <Typography variant="caption" color="text.secondary">
                {partyTypeLabel(t, params.row.from_party_type)}
              </Typography>
            )}
          </Stack>
        ),
      },
      {
        field: "to_party_name",
        headerName: t("transfers.columns.to"),
        flex: 1,
        minWidth: 130,
        renderCell: (params) => (
          <Stack spacing={0} sx={{ lineHeight: 1.2, py: 0.5 }}>
            <Typography variant="body2">{params.value}</Typography>
            {params.row.to_party_type && (
              <Typography variant="caption" color="text.secondary">
                {partyTypeLabel(t, params.row.to_party_type)}
              </Typography>
            )}
          </Stack>
        ),
      },
      {
        field: "note",
        headerName: t("transfers.columns.note"),
        flex: 1.2,
        minWidth: 140,
      },
      ...(canWrite
        ? [
            {
              field: "actions",
              headerName: "",
              width: 140,
              sortable: false,
              filterable: false,
              renderCell: (params: { row: StockTransfer }) =>
                params.row.return_date ? null : (
                  <Button
                    size="small"
                    onClick={() => {
                      setCloseError(null);
                      setCloseDate(todayIso());
                      setCloseTarget(params.row);
                    }}
                  >
                    {t("transfers.actions.mark_entry")}
                  </Button>
                ),
            } satisfies GridColDef<StockTransfer>,
          ]
        : []),
    ],
    [t, canWrite],
  );

  const canSave =
    selectedCylinder != null &&
    fromParty != null &&
    toParty != null &&
    transferDate.length > 0;

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Box>
          <Typography variant="h5">{t("transfers.title")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("transfers.subtitle")}
          </Typography>
        </Box>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              resetForm();
              setDrawerOpen(true);
            }}
          >
            {t("actions.new_transfer")}
          </Button>
        )}
      </Stack>

      {transfersQuery.isError && (
        <Alert severity="error">{t("errors.load_failed")}</Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 360 }}>
        <DataGrid
          rows={transfersQuery.data?.data ?? []}
          columns={columns}
          getRowId={(row) => row.id}
          loading={transfersQuery.isLoading || transfersQuery.isFetching}
          paginationMode="server"
          paginationModel={paginationModel}
          onPaginationModelChange={(model) => {
            setPaginationModel(model);
            if (model.page === 0) setCursors([undefined]);
          }}
          pageSizeOptions={[25, 50, 100]}
          rowCount={transfersQuery.data?.page.total_estimate ?? -1}
          paginationMeta={{
            hasNextPage: transfersQuery.data?.page.has_more ?? false,
          }}
          disableRowSelectionOnClick
          getRowHeight={() => "auto"}
          sx={{
            [`& .${gridClasses.cell}`]: {
              outline: "none",
              py: 1,
              alignItems: "center",
            },
          }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 }, p: 3 } }}
      >
        <Stack spacing={2}>
          <Typography variant="h6">{t("transfers.form.title")}</Typography>
          {error && <Alert severity="error">{error}</Alert>}

          <Autocomplete
            options={cylindersSearch.data?.data ?? []}
            getOptionLabel={(option: Cylinder) =>
              `${option.serial_number}${option.owner_name ? ` · ${option.owner_name}` : ""}`
            }
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={cylindersSearch.isFetching}
            onInputChange={(_, value) => setCylinderQuery(value)}
            value={selectedCylinder}
            onChange={(_, value) => setSelectedCylinder(value)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("transfers.form.cylinder")}
                required
              />
            )}
          />

          <Autocomplete
            options={fromOptions}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={fromClientsSearch.isFetching}
            filterOptions={(opts) => opts}
            onInputChange={(_, value) => setFromQuery(value)}
            value={fromParty}
            onChange={(_, value) => setFromParty(value)}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Stack>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {partyTypeLabel(t, option.party_type)}
                  </Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t("transfers.form.from")}
                required
                helperText={t("transfers.form.party_hint")}
              />
            )}
          />

          <Autocomplete
            options={toOptions}
            getOptionLabel={(option) => option.name}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            loading={toClientsSearch.isFetching}
            filterOptions={(opts) => opts}
            onInputChange={(_, value) => setToQuery(value)}
            value={toParty}
            onChange={(_, value) => setToParty(value)}
            renderOption={(props, option) => (
              <li {...props} key={option.id}>
                <Stack>
                  <Typography variant="body2">{option.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {partyTypeLabel(t, option.party_type)}
                  </Typography>
                </Stack>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label={t("transfers.form.to")} required />
            )}
          />

          <TextField
            label={t("transfers.form.exit_date")}
            type="date"
            value={transferDate}
            onChange={(e) => setTransferDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText={t("transfers.form.exit_date_hint")}
            required
          />
          <TextField
            label={t("transfers.form.entry_date")}
            type="date"
            value={returnDate}
            onChange={(e) => setReturnDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            helperText={t("transfers.form.entry_date_hint")}
          />
          <TextField
            label={t("transfers.form.note")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button onClick={() => setDrawerOpen(false)}>
              {t("actions.cancel")}
            </Button>
            <Button
              variant="contained"
              disabled={createMutation.isPending || !canSave}
              onClick={() => createMutation.mutate()}
            >
              {t("actions.save")}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog
        open={closeTarget != null}
        onClose={() => setCloseTarget(null)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>{t("transfers.close.title")}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {closeError && <Alert severity="error">{closeError}</Alert>}
            <Typography variant="body2" color="text.secondary">
              {t("transfers.close.summary", {
                serial: closeTarget?.cylinder_serial ?? "",
                to: closeTarget?.to_party_name ?? "",
              })}
            </Typography>
            <TextField
              label={t("transfers.form.entry_date")}
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
              required
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCloseTarget(null)}>
            {t("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={closeMutation.isPending || !closeDate}
            onClick={() => closeMutation.mutate()}
          >
            {t("transfers.actions.mark_entry")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
