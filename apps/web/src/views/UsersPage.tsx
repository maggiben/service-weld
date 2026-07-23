"use client";

import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Alert from "@mui/material/Alert";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Drawer from "@mui/material/Drawer";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import OutlinedInput from "@mui/material/OutlinedInput";
import Select from "@mui/material/Select";
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
import type { AdminUser, RoleCode } from "@weld/schemas";
import { normalizeTerritoryName, territoryMatchKey } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import { RequireCapability } from "../auth/RequireAuth";
import {
  GridActionsCell,
  gridActionsColumnWidth,
} from "../components/GridActionsCell";
import {
  stashNextCursor,
  cursorPageRowCount,
  paginationAfterChange,
} from "../lib/cursorPagination";
import {
  allTerritoriesSelected,
  emptyUserDraft,
  findExistingTerritory,
  nextTerritorySelection,
  type UserDraft,
} from "../features/users/userFormLogic";
import { useSessionStore } from "../store/sessionStore";
import { useLocations } from "../hooks/useLocations";

const ASSIGNABLE_ROLES: RoleCode[] = [
  "CLERK",
  "DRIVER",
  "PLANT",
  "INVENTORY",
  "BILLING",
  "MANAGER",
  "SUBDIST",
  "ADMIN",
  "MEDICAL",
];

type TerritoryOption = {
  id: number;
  name: string;
  /** When set, selecting this option creates a new territory with this name. */
  inputValue?: string;
  /** Fixed dropdown actions (not real territories). */
  action?: "prompt" | "select_all";
};

const CREATE_PROMPT_ID = -2;
const SELECT_ALL_ID = -3;

const filterTerritoryOptions = createFilterOptions<TerritoryOption>();

function UsersPageInner() {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const currentUserId = useSessionStore((state) => state.user?.id);
  const { territories, refetch: refetchLocations } = useLocations();
  const [paginationModel, setPaginationModel] = useState<GridPaginationModel>({
    page: 0,
    pageSize: 50,
  });
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [roleFilter, setRoleFilter] = useState<RoleCode | "">("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">(
    "all",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [draft, setDraft] = useState<UserDraft>(emptyUserDraft);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<AdminUser | null>(null);
  /** Extra labels for assigned territories not yet in the active list. */
  const [knownTerritories, setKnownTerritories] = useState<
    Array<{ id: number; name: string }>
  >([]);
  const [createTerritoryOpen, setCreateTerritoryOpen] = useState(false);
  const [createTerritoryName, setCreateTerritoryName] = useState("");
  const [createTerritoryError, setCreateTerritoryError] = useState<
    string | null
  >(null);

  const cursor = cursors[paginationModel.page];
  const queryParams = useMemo(
    () => ({
      limit: paginationModel.pageSize,
      cursor,
      sort: "username" as const,
      "filter[role]": roleFilter || undefined,
      "filter[is_active]":
        activeFilter === "all" ? undefined : (activeFilter as "true" | "false"),
    }),
    [paginationModel.pageSize, cursor, roleFilter, activeFilter],
  );

  const usersQuery = useQuery({
    queryKey: ["admin-users", queryParams],
    queryFn: () => api.listAdminUsers(queryParams),
    enabled: paginationModel.page === 0 || cursor != null,
  });

  const rows = usersQuery.data?.data ?? [];
  const pageMeta = usersQuery.data?.page;

  useEffect(() => {
    const next = usersQuery.data?.page.next_cursor;
    if (!next) return;
    setCursors((prev) => stashNextCursor(prev, paginationModel.page, next));
  }, [usersQuery.data?.page.next_cursor, paginationModel.page]);

  const handlePaginationModelChange = (model: GridPaginationModel) => {
    const { pagination, resetCursors } = paginationAfterChange(
      paginationModel,
      model,
    );
    if (resetCursors) setCursors([undefined]);
    setPaginationModel(pagination);
  };

  const territoryOptions = useMemo(() => {
    const byId = new Map<number, TerritoryOption>();
    for (const tr of territories) {
      byId.set(tr.id, { id: tr.id, name: tr.name });
    }
    for (const tr of knownTerritories) {
      if (!byId.has(tr.id)) byId.set(tr.id, { id: tr.id, name: tr.name });
    }
    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name, "es"),
    );
  }, [territories, knownTerritories]);

  const selectedTerritories = useMemo(
    () =>
      draft.territory_ids.map((id) => {
        const found = territoryOptions.find((tr) => tr.id === id);
        return found ?? { id, name: `#${id}` };
      }),
    [draft.territory_ids, territoryOptions],
  );

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyUserDraft());
    setKnownTerritories([]);
    setError(null);
    setDrawerOpen(true);
  };

  const openEdit = (user: AdminUser) => {
    setEditing(user);
    setDraft({
      username: user.username,
      email: user.email ?? "",
      password: "",
      roles: user.roles,
      territory_ids: user.territory_ids,
      mfa_enabled: user.mfa_enabled,
      is_active: user.is_active,
    });
    setKnownTerritories(
      user.territory_ids.map((id, index) => ({
        id,
        name: user.territories[index] ?? `#${id}`,
      })),
    );
    setError(null);
    setDrawerOpen(true);
  };

  const rememberTerritory = (row: { id: number; name: string }) => {
    setKnownTerritories((prev) => {
      if (prev.some((tr) => tr.id === row.id)) return prev;
      return [...prev, row];
    });
  };

  const openCreateTerritoryDialog = (seed = "") => {
    setCreateTerritoryName(seed);
    setCreateTerritoryError(null);
    setCreateTerritoryOpen(true);
  };

  const createTerritoryMutation = useMutation({
    mutationFn: async (rawName: string) => {
      const name = normalizeTerritoryName(rawName);
      if (!name) throw new Error("empty");
      const existing = findExistingTerritory(name, territoryOptions);
      if (existing) return existing;
      try {
        return await api.createTerritory({ name });
      } catch (err) {
        if (
          err instanceof ApiClientError &&
          err.code === "DUPLICATE_TERRITORY"
        ) {
          await refetchLocations();
          const listed = await api.listTerritories({
            limit: 200,
            "filter[is_active]": "true",
          });
          const match = listed.data.find(
            (tr) => territoryMatchKey(tr.name) === territoryMatchKey(name),
          );
          if (match) return { id: match.id, name: match.name };
        }
        throw err;
      }
    },
    onSuccess: async (row) => {
      rememberTerritory(row);
      setDraft((data) =>
        data.territory_ids.includes(row.id)
          ? data
          : { ...data, territory_ids: [...data.territory_ids, row.id] },
      );
      setCreateTerritoryOpen(false);
      setCreateTerritoryName("");
      setCreateTerritoryError(null);
      await queryClient.invalidateQueries({ queryKey: ["territories"] });
      await refetchLocations();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "empty") {
        setCreateTerritoryError(
          translate("users.form.create_territory_name_required"),
        );
        return;
      }
      if (err instanceof ApiClientError) {
        const message =
          err.code === "DUPLICATE_TERRITORY"
            ? translate("errors.duplicate_location")
            : err.message;
        if (createTerritoryOpen) {
          setCreateTerritoryError(message);
          return;
        }
        setError(message);
        return;
      }
      if (createTerritoryOpen) {
        setCreateTerritoryError(translate("errors.generic"));
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing) {
        return api.updateAdminUser(editing.id, {
          email: draft.email.trim() ? draft.email.trim() : null,
          password: draft.password || undefined,
          roles: draft.roles,
          territory_ids: draft.territory_ids,
          mfa_enabled: draft.mfa_enabled,
          is_active: draft.is_active,
        });
      }
      return api.createAdminUser({
        username: draft.username.trim(),
        email: draft.email.trim() ? draft.email.trim() : null,
        password: draft.password,
        roles: draft.roles,
        territory_ids: draft.territory_ids,
        mfa_enabled: draft.mfa_enabled,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setDrawerOpen(false);
      setError(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        if (err.code === "DUPLICATE_USERNAME") {
          setError(translate("errors.duplicate_username"));
          return;
        }
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => api.removeAdminUser(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setRemoveTarget(null);
    },
    onError: (err) => {
      if (err instanceof ApiClientError) {
        setError(err.message);
        return;
      }
      setError(translate("errors.generic"));
    },
  });

  const columns = useMemo<GridColDef<AdminUser>[]>(
    () => [
      {
        field: "username",
        headerName: translate("users.columns.username"),
        flex: 1,
        minWidth: 140,
      },
      {
        field: "email",
        headerName: translate("users.columns.email"),
        flex: 1,
        minWidth: 160,
        valueFormatter: (value: string | null) => value ?? "—",
      },
      {
        field: "roles",
        headerName: translate("users.columns.roles"),
        flex: 1.2,
        minWidth: 180,
        renderCell: (params) => (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", py: 1 }}>
            {params.row.roles.map((role) => (
              <Chip
                key={role}
                size="small"
                label={translate(`enums.role.${role}`)}
              />
            ))}
          </Stack>
        ),
      },
      {
        field: "territories",
        headerName: translate("users.columns.territories"),
        flex: 1,
        minWidth: 140,
        valueFormatter: (value: string[]) =>
          value.length > 0 ? value.join(", ") : "—",
      },
      {
        field: "is_active",
        headerName: translate("users.columns.active"),
        width: 100,
        renderCell: (params) =>
          params.value ? (
            <Chip
              size="small"
              color="success"
              label={translate("users.active_yes")}
            />
          ) : (
            <Chip size="small" label={translate("users.active_no")} />
          ),
      },
      {
        field: "actions",
        headerName: "",
        width: gridActionsColumnWidth(2),
        sortable: false,
        filterable: false,
        align: "right",
        headerAlign: "right",
        renderCell: (params) => (
          <GridActionsCell
            actions={[
              {
                key: "edit",
                label: translate("actions.edit"),
                icon: <EditOutlinedIcon fontSize="small" />,
                onClick: () => openEdit(params.row),
              },
              {
                key: "remove",
                label: translate("actions.remove"),
                icon: <DeleteOutlineIcon fontSize="small" />,
                color: "error",
                disabled: params.row.id === currentUserId,
                onClick: () => setRemoveTarget(params.row),
              },
            ]}
          />
        ),
      },
    ],
    [translate, currentUserId],
  );

  return (
    <Box>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={2}
        sx={{ mb: 2 }}
      >
        <Box>
          <Typography variant="h5">{translate("users.title")}</Typography>
          <Typography color="text.secondary">
            {translate("users.subtitle")}
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={openCreate}
        >
          {translate("actions.new_user")}
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{translate("users.filters.role")}</InputLabel>
          <Select
            label={translate("users.filters.role")}
            value={roleFilter}
            onChange={(event) => {
              setRoleFilter(event.target.value as RoleCode | "");
              setCursors([undefined]);
              setPaginationModel((part) => ({ ...part, page: 0 }));
            }}
          >
            <MenuItem value="">{translate("users.filters.all")}</MenuItem>
            {ASSIGNABLE_ROLES.map((role) => (
              <MenuItem key={role} value={role}>
                {translate(`enums.role.${role}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 160 }}>
          <InputLabel>{translate("users.filters.active")}</InputLabel>
          <Select
            label={translate("users.filters.active")}
            value={activeFilter}
            onChange={(event) => {
              setActiveFilter(event.target.value as "all" | "true" | "false");
              setCursors([undefined]);
              setPaginationModel((part) => ({ ...part, page: 0 }));
            }}
          >
            <MenuItem value="all">{translate("users.filters.all")}</MenuItem>
            <MenuItem value="true">{translate("users.active_yes")}</MenuItem>
            <MenuItem value="false">{translate("users.active_no")}</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ height: 560, width: "100%" }}>
        <DataGrid
          rows={rows}
          columns={columns}
          getRowId={(row) => row.id}
          loading={usersQuery.isLoading}
          paginationMode="server"
          sortingMode="server"
          rowCount={cursorPageRowCount(
            paginationModel.page,
            paginationModel.pageSize,
            rows.length,
            pageMeta?.has_more ?? false,
          )}
          paginationModel={paginationModel}
          onPaginationModelChange={handlePaginationModelChange}
          pageSizeOptions={[25, 50, 100]}
          disableRowSelectionOnClick
          getRowHeight={() => "auto"}
          sx={{
            [`& .${gridClasses.cell}`]: { alignItems: "flex-start", py: 1 },
          }}
        />
      </Box>

      <Drawer
        anchor="right"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        // Above the fixed AppBar (shell uses drawer + 1) so the title/labels are not clipped.
        sx={{ zIndex: (theme) => theme.zIndex.modal }}
        slotProps={{ paper: { sx: { width: { xs: "100%", sm: 420 }, p: 3 } } }}
      >
        <Typography variant="h6" gutterBottom>
          {editing
            ? translate("users.form.title_edit")
            : translate("users.form.title_create")}
        </Typography>
        <Stack spacing={2.5} sx={{ pt: 0.5 }}>
          <TextField
            label={translate("users.form.username")}
            value={draft.username}
            disabled={Boolean(editing)}
            onChange={(event) =>
              setDraft((data) => ({ ...data, username: event.target.value }))
            }
            required
            fullWidth
          />
          <TextField
            label={translate("users.form.email")}
            type="email"
            value={draft.email}
            onChange={(event) =>
              setDraft((data) => ({ ...data, email: event.target.value }))
            }
            fullWidth
          />
          <TextField
            label={
              editing
                ? translate("users.form.password_optional")
                : translate("users.form.password")
            }
            type="password"
            value={draft.password}
            onChange={(event) =>
              setDraft((data) => ({ ...data, password: event.target.value }))
            }
            required={!editing}
            helperText={
              editing
                ? translate("users.form.password_optional_help")
                : undefined
            }
            fullWidth
          />
          <FormControl fullWidth>
            <InputLabel id="users-form-roles-label">
              {translate("users.form.roles")}
            </InputLabel>
            <Select
              labelId="users-form-roles-label"
              multiple
              label={translate("users.form.roles")}
              value={draft.roles}
              onChange={(event) =>
                setDraft((data) => ({
                  ...data,
                  roles: event.target.value as RoleCode[],
                }))
              }
              input={<OutlinedInput label={translate("users.form.roles")} />}
              renderValue={(selected) =>
                selected
                  .map((role) => translate(`enums.role.${role}`))
                  .join(", ")
              }
            >
              {ASSIGNABLE_ROLES.map((role) => (
                <MenuItem key={role} value={role}>
                  <Checkbox checked={draft.roles.includes(role)} />
                  {translate(`enums.role.${role}`)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Autocomplete
            multiple
            disableCloseOnSelect
            options={territoryOptions}
            value={selectedTerritories}
            loading={createTerritoryMutation.isPending}
            disabled={createTerritoryMutation.isPending}
            isOptionEqualToValue={(left, right) => left.id === right.id}
            getOptionLabel={(option) => {
              if (option.action === "prompt") {
                return translate("users.form.create_territory_option");
              }
              if (option.action === "select_all") {
                return allTerritoriesSelected(
                  draft.territory_ids,
                  territoryOptions.map((tr) => tr.id),
                )
                  ? translate("users.form.clear_all_territories")
                  : translate("users.form.select_all_territories");
              }
              return option.name;
            }}
            filterOptions={(options, params) => {
              const filtered = filterTerritoryOptions(options, params);
              const normalized = normalizeTerritoryName(params.inputValue);
              if (normalized) {
                const exists = options.some(
                  (opt) =>
                    territoryMatchKey(opt.name) ===
                    territoryMatchKey(normalized),
                );
                if (!exists) {
                  filtered.push({
                    id: -1,
                    name: normalized,
                    inputValue: normalized,
                  });
                }
              }
              if (territoryOptions.length > 0 && !normalized) {
                filtered.unshift({
                  id: SELECT_ALL_ID,
                  name: translate("users.form.select_all_territories"),
                  action: "select_all",
                });
              }
              filtered.push({
                id: CREATE_PROMPT_ID,
                name: translate("users.form.create_territory_option"),
                action: "prompt",
              });
              return filtered;
            }}
            onChange={(_event, next) => {
              const selectAll = next.find((opt) => opt.action === "select_all");
              if (selectAll) {
                setDraft((data) => ({
                  ...data,
                  territory_ids: nextTerritorySelection(
                    data.territory_ids,
                    territoryOptions.map((tr) => tr.id),
                  ),
                }));
                return;
              }
              const prompt = next.find((opt) => opt.action === "prompt");
              const pendingCreate = next.find((opt) => opt.inputValue);
              const kept = next.filter(
                (opt) => !opt.inputValue && !opt.action && opt.id > 0,
              );
              setDraft((data) => ({
                ...data,
                territory_ids: kept.map((opt) => opt.id),
              }));
              if (prompt) {
                openCreateTerritoryDialog();
                return;
              }
              if (pendingCreate?.inputValue) {
                const existing = findExistingTerritory(
                  pendingCreate.inputValue,
                  territoryOptions,
                );
                if (existing) {
                  rememberTerritory(existing);
                  setDraft((data) =>
                    data.territory_ids.includes(existing.id)
                      ? data
                      : {
                          ...data,
                          territory_ids: [...data.territory_ids, existing.id],
                        },
                  );
                  return;
                }
                createTerritoryMutation.mutate(pendingCreate.inputValue);
              }
            }}
            renderOption={(props, option, { selected }) => {
              const { key, ...rest } = props;
              if (option.action === "prompt") {
                return (
                  <li key={key} {...rest}>
                    <AddIcon fontSize="small" sx={{ mr: 1, opacity: 0.8 }} />
                    {translate("users.form.create_territory_option")}
                  </li>
                );
              }
              if (option.action === "select_all") {
                const allSelected = allTerritoriesSelected(
                  draft.territory_ids,
                  territoryOptions.map((tr) => tr.id),
                );
                return (
                  <li key={key} {...rest}>
                    <Checkbox
                      size="small"
                      checked={allSelected}
                      indeterminate={
                        draft.territory_ids.length > 0 && !allSelected
                      }
                      sx={{ mr: 1, p: 0.5 }}
                    />
                    {allSelected
                      ? translate("users.form.clear_all_territories")
                      : translate("users.form.select_all_territories")}
                  </li>
                );
              }
              return (
                <li key={key} {...rest}>
                  {option.inputValue ? (
                    <>
                      <AddIcon fontSize="small" sx={{ mr: 1, opacity: 0.8 }} />
                      {translate("users.form.create_territory", {
                        name: option.name,
                      })}
                    </>
                  ) : (
                    <>
                      <Checkbox
                        size="small"
                        checked={selected}
                        sx={{ mr: 1, p: 0.5 }}
                      />
                      {option.name}
                    </>
                  )}
                </li>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("users.form.territories")}
                helperText={translate("users.form.territories_hint")}
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {createTerritoryMutation.isPending ? (
                        <CircularProgress color="inherit" size={18} />
                      ) : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <FormControlLabel
            control={
              <Switch
                checked={draft.mfa_enabled}
                onChange={(event) =>
                  setDraft((data) => ({
                    ...data,
                    mfa_enabled: event.target.checked,
                  }))
                }
              />
            }
            label={translate("users.form.mfa_enabled")}
          />
          {editing && (
            <FormControlLabel
              control={
                <Switch
                  checked={draft.is_active}
                  disabled={editing.id === currentUserId}
                  onChange={(event) =>
                    setDraft((data) => ({
                      ...data,
                      is_active: event.target.checked,
                    }))
                  }
                />
              }
              label={translate("users.form.is_active")}
            />
          )}
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                createTerritoryMutation.isPending ||
                draft.roles.length < 1 ||
                (!editing && draft.password.length < 8) ||
                (!editing && draft.username.trim().length < 2)
              }
            >
              {translate("actions.save")}
            </Button>
            <Button onClick={() => setDrawerOpen(false)}>
              {translate("actions.cancel")}
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog
        open={createTerritoryOpen}
        onClose={() => {
          if (createTerritoryMutation.isPending) return;
          setCreateTerritoryOpen(false);
        }}
        // Above the user form drawer.
        sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>
          {translate("users.form.create_territory_title")}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {createTerritoryError && (
              <Alert severity="error">{createTerritoryError}</Alert>
            )}
            <TextField
              autoFocus
              label={translate("users.form.create_territory_name")}
              value={createTerritoryName}
              onChange={(event) => setCreateTerritoryName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  createTerritoryMutation.mutate(createTerritoryName);
                }
              }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setCreateTerritoryOpen(false)}
            disabled={createTerritoryMutation.isPending}
          >
            {translate("actions.cancel")}
          </Button>
          <Button
            variant="contained"
            disabled={createTerritoryMutation.isPending}
            onClick={() => createTerritoryMutation.mutate(createTerritoryName)}
          >
            {translate("actions.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
      >
        <DialogTitle>{translate("users.remove_title")}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {translate("users.remove_confirm", {
              username: removeTarget?.username,
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveTarget(null)}>
            {translate("actions.cancel")}
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={removeMutation.isPending}
            onClick={() => {
              if (removeTarget) removeMutation.mutate(removeTarget.id);
            }}
          >
            {translate("actions.remove")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function UsersPage() {
  return (
    <RequireCapability capability="admin:write">
      <UsersPageInner />
    </RequireCapability>
  );
}
