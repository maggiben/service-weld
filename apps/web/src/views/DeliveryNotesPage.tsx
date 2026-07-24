"use client";

import AddIcon from "@mui/icons-material/Add";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
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
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Client, DeliveryNote, DeliveryNoteKind } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
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
  const [remitoNumber, setRemitoNumber] = useState("");
  const [noteKind, setNoteKind] = useState<DeliveryNoteKind>("DELIVERY");
  const [issuedDate, setIssuedDate] = useState(todayIso());
  const [kindFilter, setKindFilter] = useState<DeliveryNoteKind | "">("");
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
      ...(kindFilter ? { "filter[kind]": kindFilter } : {}),
    }),
    [
      paginationModel.pageSize,
      cursor,
      debouncedSearch,
      remitoFilter,
      clientPartyFilter,
      kindFilter,
    ],
  );

  const notesQuery = useQuery({
    queryKey: ["delivery-notes", queryParams],
    queryFn: () => api.listDeliveryNotes(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const suggestQuery = searchInput.trim();
  const remitoSuggest = useQuery({
    queryKey: ["delivery-notes", "suggest", suggestQuery, kindFilter],
    queryFn: () =>
      api.listDeliveryNotes({
        q: suggestQuery || undefined,
        limit: 8,
        sort: "-issued_date",
        ...(kindFilter ? { "filter[kind]": kindFilter } : {}),
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
      (client) => ({ type: "client", client }),
    );
    return [...remitos, ...clients];
  }, [remitoSuggest.data, clientSuggest.data]);

  const detailQuery = useQuery({
    queryKey: ["delivery-notes", "detail", detailId],
    queryFn: () => api.getDeliveryNote(detailId!),
    enabled: detailId != null,
  });

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

  const create = useMutation({
    mutationFn: () =>
      api.createDeliveryNote({
        remito_number: remitoNumber.trim(),
        kind: noteKind,
        issued_date: issuedDate || null,
        client_party_id: client?.id ?? null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["delivery-notes"] });
      setDrawerOpen(false);
      setRemitoNumber("");
      setNoteKind("DELIVERY");
      setIssuedDate(todayIso());
      setClient(null);
      setClientQuery("");
      setError(null);
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
        field: "kind",
        headerName: translate("delivery_notes.columns.kind"),
        width: 120,
        valueFormatter: (value: DeliveryNoteKind) =>
          translate(`enums.delivery_note_kind.${value}`),
      },
      {
        field: "issued_date",
        headerName: translate("delivery_notes.columns.issued"),
        width: 140,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "client_name",
        headerName: translate("delivery_notes.columns.client"),
        flex: 1.2,
        minWidth: 160,
        valueGetter: (_value, row) => row.client_name ?? "—",
      },
      {
        field: "movement_count",
        headerName: translate("delivery_notes.columns.movements"),
        width: 110,
        valueGetter: (_value, row) => row.movement_count ?? 0,
      },
      {
        field: "accessory_rental_count",
        headerName: translate("delivery_notes.columns.rentals"),
        width: 110,
        valueGetter: (_value, row) => row.accessory_rental_count ?? 0,
      },
    ],
    [translate],
  );

  const detail = detailQuery.data;

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
        <Typography variant="h5">
          {translate("delivery_notes.title")}
        </Typography>
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
                      {translate(
                        `enums.delivery_note_kind.${option.note.kind}`,
                      )}
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
          label={translate("delivery_notes.filters.kind")}
          value={kindFilter}
          onChange={(event) => {
            setKindFilter(event.target.value as DeliveryNoteKind | "");
            resetPaging();
          }}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="">{translate("clients.filters.all")}</MenuItem>
          <MenuItem value="DELIVERY">
            {translate("enums.delivery_note_kind.DELIVERY")}
          </MenuItem>
          <MenuItem value="RETURN">
            {translate("enums.delivery_note_kind.RETURN")}
          </MenuItem>
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
        PaperProps={{ sx: { width: { xs: "100%", sm: 420 } } }}
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
          <Stack spacing={2} sx={{ flex: 1 }}>
            <TextField
              label={translate("delivery_notes.form.number")}
              value={remitoNumber}
              onChange={(event) => setRemitoNumber(event.target.value)}
              required
              fullWidth
              autoFocus
            />
            <TextField
              select
              label={translate("delivery_notes.form.kind")}
              value={noteKind}
              onChange={(event) =>
                setNoteKind(event.target.value as DeliveryNoteKind)
              }
              fullWidth
            >
              <MenuItem value="DELIVERY">
                {translate("enums.delivery_note_kind.DELIVERY")}
              </MenuItem>
              <MenuItem value="RETURN">
                {translate("enums.delivery_note_kind.RETURN")}
              </MenuItem>
            </TextField>
            <DatePicker
              label={translate("delivery_notes.form.issued")}
              value={issuedDate ? dayjs(issuedDate) : null}
              onChange={(value: Dayjs | null) =>
                setIssuedDate(value ? value.format("YYYY-MM-DD") : "")
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
              disabled={!remitoNumber.trim() || create.isPending}
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
        PaperProps={{ sx: { width: { xs: "100%", sm: 480 } } }}
      >
        <Box sx={{ p: 3 }}>
          {detailQuery.isLoading && (
            <Typography color="text.secondary">
              {translate("delivery_notes.detail.loading")}
            </Typography>
          )}
          {detailQuery.isError && (
            <Alert severity="error">{translate("errors.generic")}</Alert>
          )}
          {detail && (
            <Stack spacing={2}>
              <Typography variant="h6">
                {translate("delivery_notes.detail.title", {
                  number: detail.remito_number,
                })}
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <Chip
                  size="small"
                  label={translate(`enums.delivery_note_kind.${detail.kind}`)}
                />
                <Chip
                  size="small"
                  label={
                    detail.issued_date ??
                    translate("delivery_notes.detail.no_date")
                  }
                />
                {detail.client_name && (
                  <Chip size="small" label={detail.client_name} />
                )}
              </Stack>

              <Stack direction="row" spacing={1}>
                <Button
                  component={NextLink}
                  href={`/movements?remito_id=${detail.id}`}
                  size="small"
                  variant="outlined"
                >
                  {translate("delivery_notes.detail.open_movements")}
                </Button>
                <Button
                  component={NextLink}
                  href={`/accessories?remito_id=${detail.id}`}
                  size="small"
                  variant="outlined"
                >
                  {translate("delivery_notes.detail.open_rentals")}
                </Button>
              </Stack>

              <Divider />
              <Typography variant="subtitle2">
                {translate("delivery_notes.detail.movements", {
                  count: detail.movements.length,
                })}
              </Typography>
              {detail.movements.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {translate("delivery_notes.detail.no_movements")}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {detail.movements.map((movement) => (
                    <ListItem key={movement.id} disableGutters>
                      <ListItemText
                        primary={`${movement.cylinder_serial ?? movement.cylinder_id} · ${movement.holder_name ?? movement.holder_party_id}`}
                        secondary={`${movement.delivery_date} · ${translate(`enums.movement_state.${movement.state}`)}`}
                      />
                      <Link
                        component={NextLink}
                        href={`/movements?remito_id=${detail.id}`}
                        underline="hover"
                        variant="body2"
                      >
                        {translate("delivery_notes.detail.view")}
                      </Link>
                    </ListItem>
                  ))}
                </List>
              )}

              <Divider />
              <Typography variant="subtitle2">
                {translate("delivery_notes.detail.rentals", {
                  count: detail.accessory_rentals.length,
                })}
              </Typography>
              {detail.accessory_rentals.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {translate("delivery_notes.detail.no_rentals")}
                </Typography>
              ) : (
                <List dense disablePadding>
                  {detail.accessory_rentals.map((rental) => (
                    <ListItem key={rental.id} disableGutters>
                      <ListItemText
                        primary={`${rental.accessory_type ? translate(`enums.accessory_type.${rental.accessory_type}`) : rental.accessory_id}${rental.accessory_identifier ? ` · ${rental.accessory_identifier}` : ""}`}
                        secondary={`${rental.client_name ?? rental.client_party_id} · ${rental.start_date}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}

              <Button onClick={() => setDetailId(null)}>
                {translate("actions.close")}
              </Button>
            </Stack>
          )}
        </Box>
      </Drawer>
    </Box>
  );
}
