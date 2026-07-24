"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
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
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Client,
  DeliveryNote,
  RemitoPriority,
  RemitoStatus,
  RemitoType,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RemitoDetailPanel } from "../features/delivery-notes/RemitoDetailPanel";
import {
  REMITO_STATUSES,
  REMITO_TYPES,
  previewNextRemitoNumber,
  remitoPriorityChipColor,
  remitoStatusChipColor,
} from "../features/delivery-notes/remitoLogic";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import { todayIso } from "../lib/dateFormat";
import { useSessionStore } from "../store/sessionStore";

type SearchOption =
  { type: "remito"; note: DeliveryNote } | { type: "client"; client: Client };

function remitoOptionLabel(note: DeliveryNote): string {
  const client = note.client_name?.trim();
  return client ? `${note.remito_number} · ${client}` : note.remito_number;
}

export default function DeliveryNotesPage() {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("delivery_notes:write"),
  );
  const queryClient = useQueryClient();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedOption, setSelectedOption] = useState<SearchOption | null>(
    null,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [remitoType, setRemitoType] = useState<RemitoType>("DELIVERY");
  const [priority, setPriority] = useState<RemitoPriority>("NORMAL");
  const [issuedDate, setIssuedDate] = useState(todayIso());
  const [scheduledAt, setScheduledAt] = useState<string | null>(null);
  const [observations, setObservations] = useState("");
  const [typeFilter, setTypeFilter] = useState<RemitoType | "">("");
  const [statusFilter, setStatusFilter] = useState<RemitoStatus | "">("");
  const [clientQuery, setClientQuery] = useState("");
  const [client, setClient] = useState<Client | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetPaging = () => {
    setPaginationModel((model) => ({ ...model, page: 0 }));
    setCursors([undefined]);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
      resetPaging();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const cursor = cursors[paginationModel.page];
  const clientPartyFilter =
    selectedOption?.type === "client" ? selectedOption.client.id : undefined;
  const remitoFilter =
    selectedOption?.type === "remito"
      ? selectedOption.note.remito_number
      : undefined;

  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "-issued_date" as const,
      q:
        remitoFilter ??
        (clientPartyFilter == null ? debouncedSearch || undefined : undefined),
      ...(clientPartyFilter != null
        ? { "filter[client_party_id]": clientPartyFilter }
        : {}),
      ...(typeFilter ? { "filter[remito_type]": typeFilter } : {}),
      ...(statusFilter ? { "filter[status]": statusFilter } : {}),
    }),
    [
      paginationModel.pageSize,
      cursor,
      debouncedSearch,
      remitoFilter,
      clientPartyFilter,
      typeFilter,
      statusFilter,
    ],
  );

  const notesQuery = useQuery({
    queryKey: ["delivery-notes", queryParams],
    queryFn: () => api.listDeliveryNotes(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const suggestQuery = searchInput.trim();
  const remitoSuggest = useQuery({
    queryKey: ["delivery-notes", "suggest", suggestQuery, typeFilter],
    queryFn: () =>
      api.listDeliveryNotes({
        q: suggestQuery || undefined,
        limit: 8,
        sort: "-issued_date",
        ...(typeFilter ? { "filter[remito_type]": typeFilter } : {}),
      }),
    enabled: suggestQuery.length >= 1,
  });

  const clientSuggest = useQuery({
    queryKey: ["clients", "delivery-note-filter", suggestQuery],
    queryFn: () => api.listClients({ q: suggestQuery || undefined, limit: 8 }),
    enabled: suggestQuery.length >= 1,
  });

  const searchOptions = useMemo<SearchOption[]>(() => {
    const remitos: SearchOption[] = (remitoSuggest.data?.data ?? []).map(
      (note) => ({ type: "remito", note }),
    );
    const clients: SearchOption[] = (clientSuggest.data?.data ?? []).map(
      (clientRow) => ({ type: "client", client: clientRow }),
    );
    return [...remitos, ...clients];
  }, [remitoSuggest.data, clientSuggest.data]);

  const rows = notesQuery.data?.data ?? [];
  const pageMeta = notesQuery.data?.page;

  useEffect(() => {
    const next = notesQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((previous) =>
      stashNextCursor(previous, paginationModel.page, next),
    );
  }, [notesQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const clientsSearch = useQuery({
    queryKey: ["clients", "delivery-note", clientQuery],
    queryFn: () => api.listClients({ q: clientQuery || undefined, limit: 20 }),
    enabled: drawerOpen,
  });

  const seriesQuery = useQuery({
    queryKey: ["remito-series", "create"],
    queryFn: () => api.listRemitoSeries({ limit: 20 }),
    enabled: drawerOpen,
  });

  const nextRemitoNumber = useMemo(
    () => previewNextRemitoNumber(seriesQuery.data?.data),
    [seriesQuery.data],
  );

  const create = useMutation({
    mutationFn: () =>
      api.createDeliveryNote({
        series_code: "A",
        remito_type: remitoType,
        priority,
        issued_date: issuedDate || null,
        scheduled_delivery_at: scheduledAt,
        client_party_id: client?.id ?? null,
        observations: observations.trim() || null,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["delivery-notes"] });
      await queryClient.invalidateQueries({ queryKey: ["remito-series"] });
      setDrawerOpen(false);
      setRemitoType("DELIVERY");
      setPriority("NORMAL");
      setIssuedDate(todayIso());
      setScheduledAt(null);
      setObservations("");
      setClient(null);
      setClientQuery("");
      setError(null);
      setDetailId(created.id);
    },
    onError: (err) => {
      if (err instanceof ApiClientError && err.code === "DUPLICATE_REMITO") {
        setError(translate("delivery_notes.errors.duplicate"));
        return;
      }
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const columns = useMemo<GridColDef<DeliveryNote>[]>(
    () => [
      {
        field: "remito_number",
        headerName: translate("delivery_notes.columns.number"),
        flex: 1,
        minWidth: 120,
      },
      {
        field: "status",
        headerName: translate("delivery_notes.columns.status"),
        width: 130,
        renderCell: (params) => (
          <Chip
            size="small"
            color={remitoStatusChipColor(params.row.status)}
            label={translate(`enums.remito_status.${params.row.status}`)}
          />
        ),
      },
      {
        field: "picking_status",
        headerName: translate("delivery_notes.columns.picking"),
        width: 120,
        valueFormatter: (value: string) =>
          translate(`enums.picking_status.${value}`),
      },
      {
        field: "remito_type",
        headerName: translate("delivery_notes.columns.type"),
        width: 150,
        valueFormatter: (value: RemitoType) =>
          translate(`enums.remito_type.${value}`),
      },
      {
        field: "priority",
        headerName: translate("delivery_notes.columns.priority"),
        width: 110,
        renderCell: (params) => (
          <Chip
            size="small"
            color={remitoPriorityChipColor(params.row.priority)}
            label={translate(`enums.remito_priority.${params.row.priority}`)}
          />
        ),
      },
      {
        field: "line_count",
        headerName: translate("delivery_notes.columns.lines"),
        width: 90,
        valueGetter: (_value, row) => row.line_count ?? 0,
      },
      {
        field: "issued_date",
        headerName: translate("delivery_notes.columns.issued"),
        width: 120,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "client_name",
        headerName: translate("delivery_notes.columns.client"),
        flex: 1.2,
        minWidth: 160,
        valueGetter: (_value, row) => row.client_name ?? "—",
      },
    ],
    [translate],
  );

  return (
    <Box
      sx={{ display: "flex", flexDirection: "column", gap: 2, height: "100%" }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        alignItems={{ sm: "center" }}
        justifyContent="space-between"
      >
        <Box>
          <Typography variant="h5">
            {translate("delivery_notes.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {translate("delivery_notes.subtitle")}
          </Typography>
        </Box>
        {canWrite && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setError(null);
              setDrawerOpen(true);
            }}
          >
            {translate("delivery_notes.actions.new")}
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Autocomplete
          size="small"
          sx={{ maxWidth: 420, flex: 1 }}
          options={searchOptions}
          filterOptions={(options) => options}
          freeSolo
          value={selectedOption}
          inputValue={searchInput}
          loading={
            suggestQuery.length >= 1 &&
            (remitoSuggest.isFetching || clientSuggest.isFetching)
          }
          getOptionLabel={(option) => {
            if (typeof option === "string") return option;
            if (option.type === "remito") return remitoOptionLabel(option.note);
            return option.client.name;
          }}
          isOptionEqualToValue={(left, right) => {
            if (left.type !== right.type) return false;
            if (left.type === "remito" && right.type === "remito") {
              return left.note.id === right.note.id;
            }
            if (left.type === "client" && right.type === "client") {
              return left.client.id === right.client.id;
            }
            return false;
          }}
          groupBy={(option) =>
            option.type === "remito"
              ? translate("delivery_notes.filters.group_remitos")
              : translate("delivery_notes.filters.group_clients")
          }
          onInputChange={(_event, value, reason) => {
            if (reason === "reset") return;
            setSearchInput(value);
            if (reason === "input" || reason === "clear") {
              setSelectedOption(null);
            }
          }}
          onChange={(_event, value) => {
            if (value == null || typeof value === "string") {
              setSelectedOption(null);
              if (typeof value === "string") setSearchInput(value);
              resetPaging();
              return;
            }
            setSelectedOption(value);
            if (value.type === "remito") {
              setSearchInput(remitoOptionLabel(value.note));
              setDetailId(value.note.id);
            } else {
              setSearchInput(value.client.name);
            }
            resetPaging();
          }}
          renderOption={(props, option) => {
            const { key, ...rest } = props as typeof props & {
              key?: string;
            };
            if (option.type === "remito") {
              return (
                <li key={key ?? `remito-${option.note.id}`} {...rest}>
                  <Stack>
                    <Typography variant="body2">
                      {option.note.remito_number}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.note.client_name ??
                        translate("delivery_notes.filters.no_client")}
                      {" · "}
                      {translate(`enums.remito_status.${option.note.status}`)}
                    </Typography>
                  </Stack>
                </li>
              );
            }
            return (
              <li key={key ?? `client-${option.client.id}`} {...rest}>
                <Typography variant="body2">{option.client.name}</Typography>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={translate("delivery_notes.filters.q")}
            />
          )}
        />
        <TextField
          select
          size="small"
          label={translate("delivery_notes.filters.type")}
          value={typeFilter}
          onChange={(event) => {
            setTypeFilter(event.target.value as RemitoType | "");
            resetPaging();
          }}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
          {REMITO_TYPES.map((type) => (
            <MenuItem key={type} value={type}>
              {translate(`enums.remito_type.${type}`)}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          label={translate("delivery_notes.filters.status")}
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as RemitoStatus | "");
            resetPaging();
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
          {REMITO_STATUSES.map((status) => (
            <MenuItem key={status} value={status}>
              {translate(`enums.remito_status.${status}`)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      {notesQuery.isError && (
        <Alert severity="error">{translate("errors.generic")}</Alert>
      )}

      <DataGrid
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        loading={notesQuery.isFetching}
        disableRowSelectionOnClick
        onRowClick={(params) => setDetailId(params.row.id)}
        paginationMode="server"
        rowCount={cursorPageRowCount(
          paginationModel.page,
          paginationModel.pageSize,
          rows.length,
          pageMeta?.has_more ?? false,
        )}
        paginationModel={paginationModel}
        onPaginationModelChange={handlePaginationModelChange}
        pageSizeOptions={[25, 50, 100]}
        sx={{
          border: 0,
          [`& .${gridClasses.columnHeaders}`]: { bgcolor: "action.hover" },
          [`& .${gridClasses.row}`]: { cursor: "pointer" },
          flex: 1,
          minHeight: 360,
        }}
        localeText={{
          noRowsLabel: translate("delivery_notes.empty"),
        }}
      />

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 440 } } }}
      >
        <Box
          component="form"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          sx={{
            p: 3,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Typography variant="h6" sx={{ mb: 2 }}>
            {translate("delivery_notes.form.title")}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2} sx={{ flex: 1, overflow: "auto", pt: 0.5 }}>
            <TextField
              label={translate("delivery_notes.form.number")}
              value={
                nextRemitoNumber ??
                translate("delivery_notes.form.number_loading")
              }
              fullWidth
              InputProps={{ readOnly: true }}
              helperText={translate("delivery_notes.form.number_hint")}
            />
            <TextField
              select
              label={translate("delivery_notes.form.type")}
              value={remitoType}
              onChange={(event) =>
                setRemitoType(event.target.value as RemitoType)
              }
              fullWidth
              autoFocus
            >
              {REMITO_TYPES.map((type) => (
                <MenuItem key={type} value={type}>
                  {translate(`enums.remito_type.${type}`)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={translate("delivery_notes.form.priority")}
              value={priority}
              onChange={(event) =>
                setPriority(event.target.value as RemitoPriority)
              }
              fullWidth
            >
              {(["LOW", "NORMAL", "HIGH", "URGENT"] as RemitoPriority[]).map(
                (value) => (
                  <MenuItem key={value} value={value}>
                    {translate(`enums.remito_priority.${value}`)}
                  </MenuItem>
                ),
              )}
            </TextField>
            <DatePicker
              label={translate("delivery_notes.form.issued")}
              value={issuedDate ? dayjs(issuedDate) : null}
              onChange={(value: Dayjs | null) =>
                setIssuedDate(value ? value.format("YYYY-MM-DD") : "")
              }
              slotProps={{ textField: { fullWidth: true } }}
            />
            <DateTimePicker
              label={translate("delivery_notes.form.scheduled")}
              value={scheduledAt ? dayjs(scheduledAt) : null}
              onChange={(value: Dayjs | null) =>
                setScheduledAt(value ? value.toISOString() : null)
              }
              slotProps={{ textField: { fullWidth: true } }}
            />
            <Autocomplete
              options={clientsSearch.data?.data ?? []}
              loading={clientsSearch.isFetching}
              value={client}
              onInputChange={(_event, value) => setClientQuery(value)}
              onChange={(_event, value) => setClient(value)}
              getOptionLabel={(option) => option.name}
              isOptionEqualToValue={(option, value) => option.id === value.id}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={translate("delivery_notes.form.client")}
                />
              )}
            />
            <TextField
              label={translate("delivery_notes.form.observations")}
              value={observations}
              onChange={(event) => setObservations(event.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
          <Stack
            direction="row"
            spacing={2}
            justifyContent="flex-end"
            sx={{ pt: 2 }}
          >
            <Button onClick={() => setDrawerOpen(false)}>
              {translate("actions.cancel")}
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={create.isPending}
            >
              {translate("actions.save")}
            </Button>
          </Stack>
        </Box>
      </Drawer>

      <Drawer
        anchor="right"
        open={detailId != null}
        onClose={() => setDetailId(null)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        PaperProps={{ sx: { width: { xs: "100%", sm: 560 } } }}
      >
        <Box sx={{ p: 3 }}>
          {detailId != null && (
            <RemitoDetailPanel
              detailId={detailId}
              onClose={() => setDetailId(null)}
            />
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
