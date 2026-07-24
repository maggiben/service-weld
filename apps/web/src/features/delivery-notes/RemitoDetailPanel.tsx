"use client";

import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs, { type Dayjs } from "dayjs";
import NextLink from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  Cylinder,
  DriverProfile,
  IncidentType,
  Vehicle,
} from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { useSessionStore } from "../../store/sessionStore";
import {
  canCancelRemito,
  capabilityForRemitoAction,
  primaryNextAction,
  remitoPriorityChipColor,
  remitoStatusChipColor,
  type RemitoLifecycleAction,
} from "./remitoLogic";

const INCIDENT_TYPES: IncidentType[] = [
  "CUSTOMER_ABSENT",
  "CYLINDER_DAMAGED",
  "WRONG_QUANTITY",
  "LEAK",
  "WRONG_GAS",
  "WRONG_SERIAL",
  "DELIVERY_REJECTED",
  "LATE_DELIVERY",
  "OTHER",
];

export function RemitoDetailPanel(props: {
  detailId: number;
  onClose: () => void;
}) {
  const { detailId, onClose } = props;
  const { t: translate } = useTranslation();
  const hasCapability = useSessionStore((state) => state.hasCapability);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [assignSchedule, setAssignSchedule] = useState<string | null>(null);
  const [assignDriver, setAssignDriver] = useState<DriverProfile | null>(null);
  const [assignHelper, setAssignHelper] = useState<DriverProfile | null>(null);
  const [assignVehicle, setAssignVehicle] = useState<Vehicle | null>(null);
  const [cylinderQuery, setCylinderQuery] = useState("");
  const [cylinder, setCylinder] = useState<Cylinder | null>(null);
  const [incidentType, setIncidentType] = useState<IncidentType>("OTHER");
  const [incidentText, setIncidentText] = useState("");
  const [printCopy, setPrintCopy] = useState<
    "ORIGINAL" | "DUPLICADO" | "TRIPLICADO" | "REIMPRESION"
  >("ORIGINAL");
  const [printReason, setPrintReason] = useState("");
  const [printOpen, setPrintOpen] = useState(false);

  const detailQuery = useQuery({
    queryKey: ["delivery-notes", "detail", detailId],
    queryFn: () => api.getDeliveryNote(detailId),
  });

  const driversQuery = useQuery({
    queryKey: ["drivers", "remito"],
    queryFn: () => api.listDrivers({ limit: 100 }),
  });
  const vehiclesQuery = useQuery({
    queryKey: ["vehicles", "remito"],
    queryFn: () => api.listVehicles({ limit: 100 }),
  });
  const cylindersQuery = useQuery({
    queryKey: ["cylinders", "remito-line", cylinderQuery],
    queryFn: () =>
      api.listCylinders({ q: cylinderQuery || undefined, limit: 20 }),
    enabled: detailQuery.data?.status === "DRAFT",
  });

  const detail = detailQuery.data;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["delivery-notes"] });
    await queryClient.invalidateQueries({
      queryKey: ["delivery-notes", "detail", detailId],
    });
  };

  const runTransition = useMutation({
    mutationFn: async (input: {
      action: RemitoLifecycleAction | "pick_start" | "pick_complete";
      version: number;
      cancel_reason?: string;
      scheduled_delivery_at?: string | null;
      driver_id?: number | null;
      helper_id?: number | null;
      vehicle_id?: number | null;
    }) => {
      const body = {
        version: input.version,
        cancel_reason: input.cancel_reason,
        scheduled_delivery_at: input.scheduled_delivery_at,
        driver_id: input.driver_id,
        helper_id: input.helper_id,
        vehicle_id: input.vehicle_id,
      };
      switch (input.action) {
        case "prepare":
          return api.prepareDeliveryNote(detailId, body);
        case "assign":
          return api.assignDeliveryNote(detailId, body);
        case "load":
          return api.loadDeliveryNote(detailId, body);
        case "dispatch":
          return api.dispatchDeliveryNote(detailId, body);
        case "deliver":
          return api.deliverDeliveryNote(detailId, body);
        case "sign":
          return api.signDeliveryNote(detailId, body);
        case "close":
          return api.closeDeliveryNote(detailId, body);
        case "cancel":
          return api.cancelDeliveryNote(detailId, body);
        case "pick_start":
          return api.startDeliveryNotePicking(detailId, body);
        case "pick_complete":
          return api.completeDeliveryNotePicking(detailId, body);
        default:
          throw new Error(`Unknown action ${input.action as string}`);
      }
    },
    onSuccess: async () => {
      await invalidate();
      setCancelOpen(false);
      setCancelReason("");
      setError(null);
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const addLine = useMutation({
    mutationFn: () =>
      api.addDeliveryNoteLine(detailId, {
        item_kind: "CYLINDER",
        cylinder_id: cylinder!.id,
        qty: 1,
      }),
    onSuccess: async () => {
      setCylinder(null);
      setCylinderQuery("");
      await invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const deleteLine = useMutation({
    mutationFn: (lineId: number) =>
      api.deleteDeliveryNoteLine(detailId, lineId),
    onSuccess: () => invalidate(),
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const addIncident = useMutation({
    mutationFn: () =>
      api.addDeliveryNoteIncident(detailId, {
        type: incidentType,
        severity: "MEDIUM",
        description: incidentText.trim(),
      }),
    onSuccess: async () => {
      setIncidentText("");
      await invalidate();
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  const printPdf = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await api.downloadDeliveryNotePdf(detailId, {
        copy: printCopy,
        reason: printCopy === "REIMPRESION" ? printReason.trim() : undefined,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    },
    onSuccess: () => {
      setPrintOpen(false);
      setPrintReason("");
    },
    onError: (err) => {
      setError(
        err instanceof ApiClientError
          ? err.message
          : translate("errors.generic"),
      );
    },
  });

  if (detailQuery.isLoading) {
    return (
      <Typography color="text.secondary">
        {translate("delivery_notes.detail.loading")}
      </Typography>
    );
  }
  if (detailQuery.isError || !detail) {
    return <Alert severity="error">{translate("errors.generic")}</Alert>;
  }

  const nextAction = primaryNextAction(detail.status, detail.remito_type);
  const canRunNext =
    nextAction != null && hasCapability(capabilityForRemitoAction(nextAction));
  const canCancel =
    canCancelRemito(detail.status) && hasCapability("delivery_notes:cancel");
  const canPick = hasCapability("delivery_notes:pick");
  const canIncident = hasCapability("delivery_notes:incident");
  const canPrint = hasCapability("delivery_notes:pdf");
  const canReprint = hasCapability("delivery_notes:pdf:reprint");
  const isDraft = detail.status === "DRAFT";
  const lines = detail.lines ?? [];
  const incidents = detail.incidents ?? [];

  return (
    <Stack spacing={2}>
      <Typography variant="h6">
        {translate("delivery_notes.detail.title", {
          number: detail.remito_number,
        })}
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip
          size="small"
          color={remitoStatusChipColor(detail.status)}
          label={translate(`enums.remito_status.${detail.status}`)}
        />
        <Chip
          size="small"
          label={translate(`enums.picking_status.${detail.picking_status}`)}
        />
        <Chip
          size="small"
          label={translate(`enums.remito_type.${detail.remito_type}`)}
        />
        <Chip
          size="small"
          color={remitoPriorityChipColor(detail.priority)}
          label={translate(`enums.remito_priority.${detail.priority}`)}
        />
        {detail.client_name && <Chip size="small" label={detail.client_name} />}
        {detail.vehicle_plate && (
          <Chip
            size="small"
            label={translate("delivery_notes.detail.truck", {
              plate: detail.vehicle_plate,
            })}
          />
        )}
        {detail.driver_name && (
          <Chip
            size="small"
            label={translate("delivery_notes.detail.driver", {
              name: detail.driver_name,
            })}
          />
        )}
      </Stack>

      {detail.observations && (
        <Typography variant="body2" color="text.secondary">
          {detail.observations}
        </Typography>
      )}
      {detail.scheduled_delivery_at && (
        <Typography variant="body2">
          {translate("delivery_notes.detail.scheduled", {
            at: dayjs(detail.scheduled_delivery_at).format("YYYY-MM-DD HH:mm"),
          })}
        </Typography>
      )}
      {detail.cancel_reason && (
        <Alert severity="warning">
          {translate("delivery_notes.detail.cancel_reason", {
            reason: detail.cancel_reason,
          })}
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {canPrint && !printOpen && (
          <Button
            size="small"
            variant="outlined"
            onClick={() => setPrintOpen(true)}
          >
            {translate("delivery_notes.actions.print")}
          </Button>
        )}
        {canPick &&
          (detail.status === "DRAFT" || detail.status === "PREPARED") &&
          detail.picking_status === "PENDING" && (
            <Button
              size="small"
              variant="outlined"
              disabled={runTransition.isPending}
              onClick={() =>
                runTransition.mutate({
                  action: "pick_start",
                  version: detail.version ?? 1,
                })
              }
            >
              {translate("delivery_notes.lifecycle.pick_start")}
            </Button>
          )}
        {canPick && detail.picking_status === "PREPARING" && (
          <Button
            size="small"
            variant="outlined"
            disabled={runTransition.isPending}
            onClick={() =>
              runTransition.mutate({
                action: "pick_complete",
                version: detail.version ?? 1,
              })
            }
          >
            {translate("delivery_notes.lifecycle.pick_complete")}
          </Button>
        )}
        {canRunNext && nextAction && nextAction !== "assign" && (
          <Button
            size="small"
            variant="contained"
            disabled={runTransition.isPending}
            onClick={() =>
              runTransition.mutate({
                action: nextAction,
                version: detail.version ?? 1,
              })
            }
          >
            {translate(`delivery_notes.lifecycle.${nextAction}`)}
          </Button>
        )}
        {canCancel && !cancelOpen && (
          <Button
            size="small"
            color="error"
            variant="outlined"
            onClick={() => setCancelOpen(true)}
          >
            {translate("delivery_notes.lifecycle.cancel")}
          </Button>
        )}
      </Stack>

      {printOpen && canPrint && (
        <Stack spacing={1} sx={{ maxWidth: 420 }}>
          <Typography variant="subtitle2">
            {translate("delivery_notes.print.title")}
          </Typography>
          <TextField
            select
            size="small"
            label={translate("delivery_notes.print.copy")}
            value={printCopy}
            onChange={(event) =>
              setPrintCopy(
                event.target.value as
                  "ORIGINAL" | "DUPLICADO" | "TRIPLICADO" | "REIMPRESION",
              )
            }
          >
            <MenuItem value="ORIGINAL">
              {translate("enums.print_copy_kind.ORIGINAL")}
            </MenuItem>
            <MenuItem value="DUPLICADO">
              {translate("enums.print_copy_kind.DUPLICADO")}
            </MenuItem>
            <MenuItem value="TRIPLICADO">
              {translate("enums.print_copy_kind.TRIPLICADO")}
            </MenuItem>
            {canReprint && (
              <MenuItem value="REIMPRESION">
                {translate("enums.print_copy_kind.REIMPRESION")}
              </MenuItem>
            )}
          </TextField>
          {printCopy === "REIMPRESION" && (
            <TextField
              size="small"
              required
              label={translate("delivery_notes.print.reason")}
              value={printReason}
              onChange={(event) => setPrintReason(event.target.value)}
            />
          )}
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              variant="contained"
              disabled={
                printPdf.isPending ||
                (printCopy === "REIMPRESION" && !printReason.trim())
              }
              onClick={() => printPdf.mutate()}
            >
              {translate("delivery_notes.actions.print_now")}
            </Button>
            <Button
              size="small"
              onClick={() => {
                setPrintOpen(false);
                setPrintReason("");
              }}
            >
              {translate("actions.cancel")}
            </Button>
          </Stack>
        </Stack>
      )}

      {canRunNext && nextAction === "assign" && (
        <Stack spacing={1}>
          <Typography variant="subtitle2">
            {translate("delivery_notes.detail.assign_fleet")}
          </Typography>
          <DateTimePicker
            label={translate("delivery_notes.form.scheduled")}
            value={
              assignSchedule
                ? dayjs(assignSchedule)
                : detail.scheduled_delivery_at
                  ? dayjs(detail.scheduled_delivery_at)
                  : null
            }
            onChange={(value: Dayjs | null) =>
              setAssignSchedule(value ? value.toISOString() : null)
            }
            slotProps={{ textField: { size: "small", fullWidth: true } }}
          />
          <Autocomplete
            size="small"
            options={driversQuery.data?.data ?? []}
            value={assignDriver}
            onChange={(_event, value) => setAssignDriver(value)}
            getOptionLabel={(option) => option.display_name}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("delivery_notes.form.driver")}
              />
            )}
          />
          <Autocomplete
            size="small"
            options={(driversQuery.data?.data ?? []).filter(
              (driver) => driver.is_helper_eligible,
            )}
            value={assignHelper}
            onChange={(_event, value) => setAssignHelper(value)}
            getOptionLabel={(option) => option.display_name}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("delivery_notes.form.helper")}
              />
            )}
          />
          <Autocomplete
            size="small"
            options={vehiclesQuery.data?.data ?? []}
            value={assignVehicle}
            onChange={(_event, value) => setAssignVehicle(value)}
            getOptionLabel={(option) =>
              option.name ? `${option.plate} · ${option.name}` : option.plate
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("delivery_notes.form.vehicle")}
              />
            )}
          />
          <Button
            size="small"
            variant="contained"
            disabled={
              runTransition.isPending ||
              !(assignSchedule ?? detail.scheduled_delivery_at) ||
              (assignDriver == null &&
                assignVehicle == null &&
                detail.driver_id == null &&
                detail.vehicle_id == null)
            }
            onClick={() =>
              runTransition.mutate({
                action: "assign",
                version: detail.version ?? 1,
                scheduled_delivery_at:
                  assignSchedule ?? detail.scheduled_delivery_at,
                driver_id: assignDriver?.id ?? detail.driver_id ?? null,
                helper_id: assignHelper?.id ?? detail.helper_id ?? null,
                vehicle_id: assignVehicle?.id ?? detail.vehicle_id ?? null,
              })
            }
          >
            {translate("delivery_notes.lifecycle.assign")}
          </Button>
        </Stack>
      )}

      {cancelOpen && (
        <Stack spacing={1}>
          <TextField
            label={translate("delivery_notes.form.cancel_reason")}
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            required
            fullWidth
            multiline
            minRows={2}
          />
          <Stack direction="row" spacing={1}>
            <Button
              size="small"
              color="error"
              variant="contained"
              disabled={!cancelReason.trim() || runTransition.isPending}
              onClick={() =>
                runTransition.mutate({
                  action: "cancel",
                  version: detail.version ?? 1,
                  cancel_reason: cancelReason.trim(),
                })
              }
            >
              {translate("delivery_notes.lifecycle.confirm_cancel")}
            </Button>
            <Button size="small" onClick={() => setCancelOpen(false)}>
              {translate("actions.cancel")}
            </Button>
          </Stack>
        </Stack>
      )}

      <Divider />
      <Typography variant="subtitle2">
        {translate("delivery_notes.detail.lines", { count: lines.length })}
      </Typography>
      {isDraft && (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Autocomplete
            size="small"
            sx={{ flex: 1 }}
            options={cylindersQuery.data?.data ?? []}
            loading={cylindersQuery.isFetching}
            value={cylinder}
            onInputChange={(_event, value) => setCylinderQuery(value)}
            onChange={(_event, value) => setCylinder(value)}
            getOptionLabel={(option) =>
              `${option.serial_number}${option.gas_code ? ` · ${option.gas_code}` : ""}`
            }
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label={translate("delivery_notes.form.add_cylinder")}
              />
            )}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!cylinder || addLine.isPending}
            onClick={() => addLine.mutate()}
          >
            {translate("delivery_notes.actions.add_line")}
          </Button>
        </Stack>
      )}
      {lines.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {translate("delivery_notes.detail.no_lines")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {lines.map((line) => (
            <ListItem
              key={line.id}
              disableGutters
              secondaryAction={
                isDraft ? (
                  <IconButton
                    edge="end"
                    aria-label="delete"
                    onClick={() => deleteLine.mutate(line.id)}
                    disabled={deleteLine.isPending}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                ) : undefined
              }
            >
              <ListItemText
                primary={`${line.line_no}. ${line.serial_number ?? line.cylinder_id ?? line.item_kind}`}
                secondary={`${line.gas_code ?? "—"} · qty ${line.qty}${line.is_rental ? ` · ${translate("delivery_notes.detail.rental")}` : ""}`}
              />
            </ListItem>
          ))}
        </List>
      )}

      <Divider />
      <Typography variant="subtitle2">
        {translate("delivery_notes.detail.incidents", {
          count: incidents.length,
        })}
      </Typography>
      {canIncident && (
        <Stack spacing={1}>
          <TextField
            select
            size="small"
            label={translate("delivery_notes.form.incident_type")}
            value={incidentType}
            onChange={(event) =>
              setIncidentType(event.target.value as IncidentType)
            }
          >
            {INCIDENT_TYPES.map((type) => (
              <MenuItem key={type} value={type}>
                {translate(`enums.incident_type.${type}`)}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label={translate("delivery_notes.form.incident_description")}
            value={incidentText}
            onChange={(event) => setIncidentText(event.target.value)}
            multiline
            minRows={2}
          />
          <Button
            size="small"
            variant="outlined"
            disabled={!incidentText.trim() || addIncident.isPending}
            onClick={() => addIncident.mutate()}
          >
            {translate("delivery_notes.actions.add_incident")}
          </Button>
        </Stack>
      )}
      {incidents.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {translate("delivery_notes.detail.no_incidents")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {incidents.map((incident) => (
            <ListItem key={incident.id} disableGutters>
              <ListItemText
                primary={`${translate(`enums.incident_type.${incident.type}`)} · ${translate(`enums.incident_severity.${incident.severity}`)}`}
                secondary={`${translate(`enums.incident_status.${incident.status}`)} — ${incident.description}`}
              />
            </ListItem>
          ))}
        </List>
      )}

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
        {translate("delivery_notes.detail.history")}
      </Typography>
      {(detail.status_history?.length ?? 0) === 0 ? (
        <Typography variant="body2" color="text.secondary">
          {translate("delivery_notes.detail.no_history")}
        </Typography>
      ) : (
        <List dense disablePadding>
          {detail.status_history!.map((entry) => (
            <ListItem key={entry.id} disableGutters>
              <ListItemText
                primary={`${entry.from_status ? translate(`enums.remito_status.${entry.from_status}`) : "—"} → ${translate(`enums.remito_status.${entry.to_status}`)}`}
                secondary={`${dayjs(entry.at).format("YYYY-MM-DD HH:mm")}${entry.note ? ` · ${entry.note}` : ""}`}
              />
            </ListItem>
          ))}
        </List>
      )}

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

      <Button onClick={onClose}>{translate("actions.close")}</Button>
    </Stack>
  );
}
