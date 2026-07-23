"use client";

import LocalGasStationIcon from "@mui/icons-material/LocalGasStation";
import WaterDropOutlinedIcon from "@mui/icons-material/WaterDropOutlined";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { GasCode } from "@weld/schemas";
import { api } from "../../api/client";
import {
  batteryFormErrorMessage,
  buildOwnerOptions,
  canMarkBatteryEmpty,
  canMarkBatteryFull,
  canSaveBatteryForm,
  chipLabel,
  fromBatteryMembers,
  fromCylinder,
  isPackableCandidate,
  memberIdDiff,
  memberLabel,
  mergeMemberOptions,
  resolveMemberTokens,
  type MemberOption,
} from "./batteryFormLogic";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

interface Props {
  open: boolean;
  mode: "create" | "edit";
  batteryId: number | null;
  onClose: () => void;
}

export function BatteryFormDrawer({ open, mode, batteryId, onClose }: Props) {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [ownerId, setOwnerId] = useState<number | "">("");
  const [gas, setGas] = useState<GasCode | "">("O2");
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [initialMemberIds, setInitialMemberIds] = useState<number[]>([]);
  const [markFull, setMarkFull] = useState(false);
  const [markEmpty, setMarkEmpty] = useState(false);

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
      return res.data.filter((item) =>
        isPackableCandidate(item, ownerId, isEdit ? batteryId : null),
      );
    },
    enabled: open && ownerId !== "",
  });

  useEffect(() => {
    if (!open) return;
    setError(null);
    setMemberQuery("");
    setMarkFull(false);
    setMarkEmpty(false);
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
    setInitialMemberIds(nextMembers.map((member) => member.id));
    setMarkFull(false);
    setMarkEmpty(false);
  }, [open, isEdit, batteryQuery.data]);

  const ownerOptions = useMemo(
    () =>
      buildOwnerOptions(
        ownersQuery.data?.data ?? [],
        isEdit ? batteryQuery.data : null,
      ),
    [ownersQuery.data, isEdit, batteryQuery.data],
  );

  const cylinderOptions = useMemo(
    () => mergeMemberOptions(members, cylindersSearch.data ?? []),
    [cylindersSearch.data, members],
  );

  const mapError = (err: unknown) => {
    setError(batteryFormErrorMessage(err, translate));
  };

  const resolveTokens = (tokens: Array<string | MemberOption>) =>
    resolveMemberTokens(tokens, members, ownerId, isEdit ? batteryId : null, {
      fetchCylinder: (id) => api.getCylinder(id),
      onNotPackable: (id) =>
        setError(translate("batteries.form.member_not_packable", { id })),
      onNotFound: (id) =>
        setError(translate("batteries.form.member_not_found", { id })),
    });

  const createMutation = useMutation({
    mutationFn: () => {
      if (ownerId === "") throw new Error("owner");
      return api.createBattery({
        battery_code: code.trim(),
        owner_party_id: Number(ownerId),
        gas_code: gas || null,
        member_cylinder_ids: members.map((member) => member.id),
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
      let current = batteryQuery.data;
      if (!current) throw new Error("battery");

      const { toAdd, toRemove } = memberIdDiff(
        initialMemberIds,
        members.map((member) => member.id),
      );

      for (const id of toAdd) {
        current = await api.addBatteryMember(batteryId, { cylinder_id: id });
      }
      for (const id of toRemove) {
        current = await api.removeBatteryMember(batteryId, id);
      }

      if (markFull && current.state === "IN_STOCK_EMPTY") {
        await api.fillBattery(current.id, { ifMatch: current.version });
      } else if (markEmpty && current.state === "IN_STOCK_FULL") {
        await api.emptyBattery(current.id, { ifMatch: current.version });
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
    onError: mapError,
  });

  const saving = createMutation.isPending || updateMutation.isPending;
  const loadingBattery = isEdit && batteryQuery.isLoading;
  const batteryState = batteryQuery.data?.state;
  const showMarkFull = isEdit && canMarkBatteryFull(batteryState);
  const showMarkEmpty = isEdit && canMarkBatteryEmpty(batteryState);
  const conditionDirty = markFull || markEmpty;
  const membersChanged = (() => {
    if (!isEdit) return false;
    const { toAdd, toRemove } = memberIdDiff(
      initialMemberIds,
      members.map((member) => member.id),
    );
    return toAdd.length > 0 || toRemove.length > 0;
  })();

  const canSave = canSaveBatteryForm({
    saving,
    loadingBattery,
    code,
    ownerId,
    memberCount: members.length,
    isEdit,
    hasChanges: membersChanged || conditionDirty,
  });

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
          {isEdit
            ? translate("batteries.form.edit_title")
            : translate("batteries.form.title")}
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}
        {batteryQuery.isError && (
          <Alert severity="error">{translate("errors.load_failed")}</Alert>
        )}
        {loadingBattery ? (
          <Stack alignItems="center" py={4}>
            <CircularProgress size={32} />
          </Stack>
        ) : (
          <>
            {(showMarkFull || showMarkEmpty) && (
              <>
                <Box
                  sx={{
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                    px: 1.5,
                    py: 1,
                  }}
                >
                  {showMarkFull && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={markFull}
                          onChange={(event) =>
                            setMarkFull(event.target.checked)
                          }
                          color="success"
                        />
                      }
                      label={
                        <Stack spacing={0.25}>
                          <Stack
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                          >
                            <LocalGasStationIcon
                              fontSize="small"
                              color="success"
                            />
                            <Typography variant="body2" fontWeight={600}>
                              {translate("batteries.form.mark_full")}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {translate("batteries.form.mark_full_hint")}
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                  )}
                  {showMarkEmpty && (
                    <FormControlLabel
                      control={
                        <Switch
                          checked={markEmpty}
                          onChange={(event) =>
                            setMarkEmpty(event.target.checked)
                          }
                        />
                      }
                      label={
                        <Stack spacing={0.25}>
                          <Stack
                            direction="row"
                            spacing={0.75}
                            alignItems="center"
                          >
                            <WaterDropOutlinedIcon fontSize="small" />
                            <Typography variant="body2" fontWeight={600}>
                              {translate("batteries.form.mark_empty")}
                            </Typography>
                          </Stack>
                          <Typography variant="caption" color="text.secondary">
                            {translate("batteries.form.mark_empty_hint")}
                          </Typography>
                        </Stack>
                      }
                      sx={{ alignItems: "flex-start", m: 0 }}
                    />
                  )}
                </Box>
                <Divider />
              </>
            )}
            <TextField
              label={translate("batteries.form.code")}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              fullWidth
              required
              disabled={isEdit}
            />
            <TextField
              select
              label={translate("batteries.form.owner")}
              value={ownerId}
              onChange={(event) => {
                const next =
                  event.target.value === "" ? "" : Number(event.target.value);
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
              label={translate("batteries.form.gas")}
              value={gas}
              onChange={(event) => setGas(event.target.value as GasCode | "")}
              fullWidth
              disabled={isEdit}
            >
              {GASES.map((gas) => (
                <MenuItem key={gas} value={gas}>
                  {gas}
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
              isOptionEqualToValue={(left, right) =>
                typeof left === "string" || typeof right === "string"
                  ? false
                  : left.id === right.id
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
                  label={translate("batteries.form.members")}
                  helperText={
                    ownerId === ""
                      ? translate("batteries.form.members_owner_first")
                      : translate("batteries.form.members_hint")
                  }
                  required
                  onPaste={(event) => {
                    if (ownerId === "") return;
                    const text = event.clipboardData.getData("text");
                    if (!/[,\s]/.test(text)) return;
                    event.preventDefault();
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
              <Button onClick={onClose}>{translate("actions.cancel")}</Button>
              <Button
                variant="contained"
                disabled={!canSave}
                onClick={() => {
                  setError(null);
                  if (isEdit) updateMutation.mutate();
                  else createMutation.mutate();
                }}
              >
                {translate("actions.save")}
              </Button>
            </Stack>
          </>
        )}
      </Stack>
    </Drawer>
  );
}
