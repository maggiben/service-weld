"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { useSessionStore } from "@/store/sessionStore";
import { useOutboxStore } from "@/store/outboxStore";
import { api } from "@/api/client";

function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export default function HomePage() {
  const online = useOnline();
  const user = useSessionStore((state) => state.user);
  const clearSession = useSessionStore((state) => state.clearSession);
  const pending = useOutboxStore((state) => state.pendingCount());
  const conflicts = useOutboxStore((state) => state.conflictCount());
  const router = useRouter();

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      clearSession();
    }
    router.replace("/login");
  };

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Typography variant="h5">Reparto</Typography>
        <Typography variant="body2" color="text.secondary">
          {user?.username ?? "—"} · {(user?.roles ?? []).join(", ")}
        </Typography>
        <Chip
          color={online ? "success" : "warning"}
          label={online ? "En línea" : "Sin conexión — cola local activa"}
        />
        {!online && (
          <Alert severity="info">
            Las capturas se guardan en la cola offline y se sincronizan al
            reconectar.
          </Alert>
        )}
        <Stack direction="row" spacing={1}>
          <Chip label={`Pendientes: ${pending}`} />
          <Chip
            color={conflicts > 0 ? "error" : "default"}
            label={`Conflictos: ${conflicts}`}
          />
        </Stack>
        <Button variant="contained" size="large" href="/capture">
          Nueva captura
        </Button>
        <Button variant="outlined" onClick={logout}>
          Salir
        </Button>
      </Stack>
    </Box>
  );
}
