"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
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
  const enqueue = useOutboxStore((s) => s.enqueue);
  const [mode, setMode] = useState<"DELIVER" | "RETURN">("DELIVER");
  const [cylinderId, setCylinderId] = useState("");
  const [clientId, setClientId] = useState("");
  const [movementId, setMovementId] = useState("");
  const [gas, setGas] = useState<GasCode>("O2");
  const [kind, setKind] = useState<MovementKind>("RENTAL");
  const [date, setDate] = useState(todayIso());
  const [note, setNote] = useState("");
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
          onChange={(e) => setMode(e.target.value as "DELIVER" | "RETURN")}
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
              onChange={(e) => setCylinderId(e.target.value)}
              required
            />
            <TextField
              label="ID cliente (party)"
              type="number"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            />
            <TextField
              select
              label="Tipo movimiento"
              value={kind}
              onChange={(e) => setKind(e.target.value as MovementKind)}
            >
              <MenuItem value="RENTAL">Alquiler</MenuItem>
              <MenuItem value="REFILL">Recarga</MenuItem>
            </TextField>
            <TextField
              select
              label="Gas"
              value={gas}
              onChange={(e) => setGas(e.target.value as GasCode)}
            >
              {GASES.map((g) => (
                <MenuItem key={g} value={g}>
                  {g}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              label="Nota"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={2}
            />
          </>
        ) : (
          <TextField
            label="ID movimiento abierto"
            type="number"
            value={movementId}
            onChange={(e) => setMovementId(e.target.value)}
            required
          />
        )}

        <TextField
          label="Fecha"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
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
