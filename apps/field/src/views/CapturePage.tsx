"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import dayjs, { type Dayjs } from "dayjs";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import type { GasCode, MovementKind } from "@weld/schemas";
import { useOutboxStore } from "@/store/outboxStore";
import { drainOutbox } from "@/sync/syncer";

const GASES: GasCode[] = ["O2", "O2_MED", "CO2", "N2", "AR", "ATAL", "ACET"];

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date());
}

export default function CapturePage() {
  const enqueue = useOutboxStore((state) => state.enqueue);
  const [mode, setMode] = useState<"DELIVER" | "RETURN">("DELIVER");
  const [cylinderId, setCylinderId] = useState("");
  const [clientId, setClientId] = useState("");
  const [movementId, setMovementId] = useState("");
  const [gas, setGas] = useState<GasCode>("O2");
  const [kind, setKind] = useState<MovementKind>("RENTAL");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
  const [remitoNumber, setRemitoNumber] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  const onQueue = async () => {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    if (mode === "DELIVER") {
      enqueue({
        id,
        kind: "DELIVER",
        label: `Entrega cyl #${cylinderId} → cliente #${clientId}`,
        createdAt,
        payload: {
          kind: "DELIVER",
          body: {
            cylinder_id: Number(cylinderId),
            holder_party_id: Number(clientId),
            movement_kind: kind,
            gas_code: gas,
            delivery_date: date,
            remito_number: remitoNumber.trim() || null,
            note: note.trim() || null,
            request_id: id,
          },
        },
      });
    } else {
      enqueue({
        id,
        kind: "RETURN",
        label: `Devolución movimiento #${movementId}`,
        createdAt,
        payload: {
          kind: "RETURN",
          movementId: Number(movementId),
          body: { return_date: date },
        },
      });
    }

    setSaved(id.slice(0, 8));
    if (navigator.onLine) {
      void drainOutbox();
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Captura</Typography>
        <TextField
          select
          label="Tipo"
          value={mode}
          onChange={(event) =>
            setMode(event.target.value as "DELIVER" | "RETURN")
          }
        >
          <MenuItem value="DELIVER">Entrega</MenuItem>
          <MenuItem value="RETURN">Devolución</MenuItem>
        </TextField>

        {mode === "DELIVER" ? (
          <>
            <TextField
              label="ID cilindro"
              type="number"
              value={cylinderId}
              onChange={(event) => setCylinderId(event.target.value)}
              required
            />
            <TextField
              label="ID cliente (party)"
              type="number"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              required
            />
            <TextField
              select
              label="Tipo movimiento"
              value={kind}
              onChange={(event) => setKind(event.target.value as MovementKind)}
            >
              <MenuItem value="RENTAL">Alquiler</MenuItem>
              <MenuItem value="REFILL">Recarga</MenuItem>
            </TextField>
            <TextField
              select
              label="Gas"
              value={gas}
              onChange={(event) => setGas(event.target.value as GasCode)}
            >
              {GASES.map((gas) => (
                <MenuItem key={gas} value={gas}>
                  {gas}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Nota"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              multiline
              minRows={2}
            />
            <TextField
              label="Nº remito"
              value={remitoNumber}
              onChange={(event) => setRemitoNumber(event.target.value)}
              helperText="Opcional. Crea o vincula el remito de entrega."
            />
          </>
        ) : (
          <TextField
            label="ID movimiento abierto"
            type="number"
            value={movementId}
            onChange={(event) => setMovementId(event.target.value)}
            required
          />
        )}

        <DatePicker
          label="Fecha"
          value={dayjs(date)}
          onChange={(value: Dayjs | null) => {
            if (value) setDate(value.format("YYYY-MM-DD"));
          }}
          slotProps={{ textField: { fullWidth: true } }}
        />

        {saved && (
          <Alert severity="success">
            Guardado en cola offline (…{saved}). Se sincroniza al estar en
            línea.
          </Alert>
        )}

        <Button
          variant="contained"
          size="large"
          onClick={() => void onQueue()}
          disabled={mode === "DELIVER" ? !cylinderId || !clientId : !movementId}
        >
          Guardar en cola
        </Button>
      </Stack>
    </Box>
  );
}
