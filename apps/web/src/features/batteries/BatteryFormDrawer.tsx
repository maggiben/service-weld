"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Drawer from "@mui/material/Drawer";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Battery, Cylinder, GasCode } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

const STOCK_STATES = new Set(["IN_STOCK_EMPTY", "IN_STOCK_FULL"]);

export type MemberOption = {
  id: number;
  serial_number: string;
  gas_code?: string | null;
  owner_name?: string | null;
  owner_party_id?: number;
};

function memberLabel(option: MemberOption): string {
  const owner = option.owner_name ? ` · ${option.owner_name}` : "";
  const gas = option.gas_code ? ` · ${option.gas_code}` : "";
  return `${option.serial_number} (#${option.id})${owner}${gas}`;
}

function chipLabel(option: MemberOption): string {
  return `${option.serial_number} (#${option.id})`;
}

function fromCylinder(c: Cylinder): MemberOption {
  return {
    id: c.id,
    serial_number: c.serial_number,
    gas_code: c.gas_code,
    owner_name: c.owner_name,
    owner_party_id: c.owner_party_id,
  };
}

function fromBatteryMembers(battery: Battery): MemberOption[] {
  return (battery.members ?? []).map((m) => ({
    id: m.cylinder_id,
    serial_number: m.serial_number ?? String(m.cylinder_id),
    gas_code: m.gas_code,
    owner_name: battery.owner_name,
    owner_party_id: battery.owner_party_id,
  }));
}

function parseIdTokens(input: string): number[] {
  return [
    ...new Set(
      input
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ];
}

function isPackableCandidate(
  c: Cylinder,
  ownerPartyId: number | "" | undefined,
  allowBatteryId: number | null,
): boolean {
  if (c.packaging === "BATTERY") return false;
  if (
    c.packaging === "BATTERY_MEMBER" &&
    (allowBatteryId == null || c.battery_id !== allowBatteryId)
  ) {
    return false;
  }
  if (!STOCK_STATES.has(c.state) && c.packaging !== "BATTERY_MEMBER") {
    return false;
  }
  if (ownerPartyId !== "" && ownerPartyId != null) {
    return c.owner_party_id === ownerPartyId;
  }
  return true;
}

interface Props {
  open: boolean;
  mode: "create" | "edit";
  batteryId: number | null;
  onClose: () => void;
}

export function BatteryFormDrawer({ open, mode, batteryId, onClose }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [gas, setGas] = useState<GasCode | "">("O2");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initialMemberIds, setInitialMemberIds] = useState<number[]>([]);

  const isEdit = mode === "edit";

  const batteryQuery = useQuery({
    queryKey: ["battery", batteryId],
    queryFn: () => api.getBattery(batteryId!),
    enabled: open && isEdit && batteryId != null,
  });

  const ownersQuery = useQuery({
    queryKey: ["cylinders", "owners-hint"],
    queryFn: () => api.listCylinders({ limit: 100, sort: "serial_number" }),
    enabled: open && !isEdit,
  });

  const cylindersSearch = useQuery({
    queryKey: [
      "cylinders",
      "picker",
      "battery-members",
      ownerId,
      memberQuery,
      batteryId,
    ],
    queryFn: async () => {
      const res = await api.listCylinders({
        q: memberQuery || undefined,
        limit: 40,
        "filter[owner_party_id]": Number(ownerId),
      });
      return res.data.filter((c) =>
        isPackableCandidate(c, ownerId, isEdit ? batteryId : null),
      );
    },
    enabled: open && ownerId !== "",
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMemberQuery("");
    if (!isEdit) {
      setCode("");
      setOwnerId("");
      setGas("O2");
      setMembers([]);
      setInitialMemberIds([]);
    }
  }, [open, isEdit]);

  useEffect(() => {
    if (!open || !isEdit || !batteryQuery.data) return;
    const battery = batteryQuery.data;
    setCode(battery.battery_code);
    setOwnerId(battery.owner_party_id);
    setGas(battery.gas_code ?? "");
    const nextMembers = fromBatteryMembers(battery);
    setMembers(nextMembers);
    setInitialMemberIds(nextMembers.map((m) => m.id));
  }, [open, isEdit, batteryQuery.data]);

  const ownerOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const cyl of ownersQuery.data?.data ?? []) {
      if (cyl.owner_name) map.set(cyl.owner_party_id, cyl.owner_name);
    }
    if (isEdit && batteryQuery.data?.owner_name) {
      map.set(batteryQuery.data.owner_party_id, batteryQuery.data.owner_name);
    }
    return [...map.entries()];
  }, [ownersQuery.data, isEdit, batteryQuery.data]);

  const cylinderOptions = useMemo(() => {
    const byId = new Map<number, MemberOption>();
    for (const m of members) byId.set(m.id, m);
    for (const c of cylindersSearch.data ?? []) {
      if (!byId.has(c.id)) byId.set(c.id, fromCylinder(c));
    }
    return [...byId.values()];
  }, [cylindersSearch.data, members]);

  const mapError = (err: unknown) => {
    if (err instanceof ApiClientError) {
      if (err.code === "TOO_FEW_MEMBERS") {
        setError(t("errors.too_few_members"));
        return;
      }
      if (err.code === "MEMBER_ALREADY_PACKED") {
        setError(t("errors.member_already_packed"));
        return;
      }
      setError(err.message);
      return;
    }
    setError(t("errors.generic"));
  };

  const resolveTokens = async (
    tokens: Array<string | MemberOption>,
  ): Promise<MemberOption[]> => {
    const resolved: MemberOption[] = [];
    const seen = new Set<number>();

    for (const token of tokens) {
      if (typeof token !== "string") {
        if (!seen.has(token.id)) {
          seen.add(token.id);
          resolved.push(token);
        }
        continue;
      }

      const ids = parseIdTokens(token);
      if (ids.length === 0) continue;

      for (const id of ids) {
        if (seen.has(id)) continue;
        const existing = members.find((m) => m.id === id);
        if (existing) {
          seen.add(id);
          resolved.push(existing);
          continue;
        }
        try {
          const cyl = await api.getCylinder(id);
          if (!isPackableCandidate(cyl, ownerId, isEdit ? batteryId : null)) {
            setError(t("batteries.form.member_not_packable", { id }));
            continue;
          }
          seen.add(id);
          resolved.push(fromCylinder(cyl));
        } catch {
          setError(t("batteries.form.member_not_found", { id }));
        }
      }
    }

    return resolved;
  };

  const createMutation = useMutation({
    mutationFn: () => {
      if (ownerId === "") throw new Error("owner");
      return api.createBattery({
        battery_code: code.trim(),
        owner_party_id: Number(ownerId),
        gas_code: gas || null,
        member_cylinder_ids: members.map((m) => m.id),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batteries"] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      onClose();
    },
    onError: mapError,
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (batteryId == null) throw new Error("battery");
      if (members.length < 2) {
        throw Object.assign(new Error("too few"), { code: "TOO_FEW_MEMBERS" });
      }
      const nextIds = new Set(members.map((m) => m.id));
      const prevIds = new Set(initialMemberIds);
      const toAdd = [...nextIds].filter((id) => !prevIds.has(id));
      const toRemove = [...prevIds].filter((id) => !nextIds.has(id));

      for (const id of toAdd) {
        await api.addBatteryMember(batteryId, { cylinder_id: id });
      }
      for (const id of toRemove) {
        await api.removeBatteryMember(batteryId, id);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["batteries"] }),
        queryClient.invalidateQueries({ queryKey: ["battery", batteryId] }),
        queryClient.invalidateQueries({ queryKey: ["cylinders"] }),
      ]);
      onClose();
    },
    onError: (err) => {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "TOO_FEW_MEMBERS"
      ) {
        setError(t("errors.too_few_members"));
        return;
      }
      mapError(err);
    },
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const loadingBattery = isEdit && batteryQuery.isLoading;

  const canSave =
    !saving &&
    !loadingBattery &&
    code.trim().length > 0 &&
    ownerId !== "" &&
    members.length >= 2;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{ zIndex: (theme) => theme.zIndex.modal }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 440 }, p: 3 } }}
    >
      <Stack spacing={2}>
        <Typography variant="h6">
          {isEdit ? t("batteries.form.edit_title") : t("batteries.form.title")}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {batteryQuery.isError && (
          <Alert severity="error">{t("errors.load_failed")}</Alert>
        )}
        {loadingBattery ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={32} />
          </Stack>
        ) : (
          <>
            <TextField
              label={t("batteries.form.code")}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              fullWidth
              required
              disabled={isEdit}
            />
            <TextField
              select
              label={t("batteries.form.owner")}
              value={ownerId}
              onChange={(e) => {
                const next =
                  e.target.value === "" ? "" : Number(e.target.value);
                setOwnerId(next);
                if (!isEdit) setMembers([]);
              }}
              fullWidth
              required
              disabled={isEdit}
            >
              {ownerOptions.map(([id, name]) => (
                <MenuItem key={id} value={id}>
                  {name}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              label={t("batteries.form.gas")}
              value={gas}
              onChange={(e) => setGas(e.target.value as GasCode | "")}
              fullWidth
              disabled={isEdit}
            >
              {GASES.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </TextField>
            <Autocomplete
              multiple
              freeSolo
              options={cylinderOptions}
              value={members}
              loading={cylindersSearch.isFetching}
              disabled={ownerId === ""}
              filterSelectedOptions
              isOptionEqualToValue={(a, b) =>
                typeof a === "string" || typeof b === "string"
                  ? false
                  : a.id === b.id
              }
              getOptionLabel={(option) =>
                typeof option === "string" ? option : memberLabel(option)
              }
              onInputChange={(_event, value, reason) => {
                if (reason === "input" || reason === "clear") {
                  setMemberQuery(value);
                }
              }}
              onChange={async (_event, next) => {
                setError(null);
                const resolved = await resolveTokens(next);
                setMembers(resolved);
                setMemberQuery("");
              }}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  const label =
                    typeof option === "string" ? option : chipLabel(option);
                  return (
                    <Chip key={key} size="small" label={label} {...tagProps} />
                  );
                })
              }
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t("batteries.form.members")}
                  helperText={
                    ownerId === ""
                      ? t("batteries.form.members_owner_first")
                      : t("batteries.form.members_hint")
                  }
                  required
                  onPaste={(e) => {
                    if (ownerId === "") return;
                    const text = e.clipboardData.getData("text");
                    if (!/[,\s]/.test(text)) return;
                    e.preventDefault();
                    void (async () => {
                      setError(null);
                      const resolved = await resolveTokens([...members, text]);
                      setMembers(resolved);
                      setMemberQuery("");
                    })();
                  }}
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {cylindersSearch.isFetching ? (
                          <CircularProgress color="inherit" size={16} />
                        ) : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
            <Stack direction="row" spacing={1} justifyContent="flex-end">
              <Button onClick={onClose}>{t("actions.cancel")}</Button>
              <Button
                variant="contained"
                disabled={!canSave}
                onClick={() => {
                  setError(null);
                  if (isEdit) updateMutation.mutate();
                  else createMutation.mutate();
                }}
              >
                {t("actions.save")}
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Drawer>
  );
}
