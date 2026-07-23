"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useSyncExternalStore } from "react";
import { useOutboxStore } from "@/store/outboxStore";
import { drainOutbox } from "@/sync/syncer";

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

const STATUS_COLOR: Record<
  string,
  "default" | "warning" | "success" | "error" | "info"
> = {
  queued: "warning",
  syncing: "info",
  synced: "success",
  conflict: "error",
  error: "error",
};

export default function SyncPage() {
  const online = useOnline();
  const items = useOutboxStore((state) => state.items);
  const discard = useOutboxStore((state) => state.discard);
  const requeue = useOutboxStore((state) => state.requeue);

  const active = items.filter((item) => item.status !== "synced");
  const synced = items.filter((item) => item.status === "synced").slice(0, 20);

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography variant="h5">Sincronización</Typography>
          <Button
            variant="contained"
            onClick={() => void drainOutbox()}
            disabled={!online}
          >
            Sincronizar ahora
          </Button>
        </Stack>

        {!online && (
          <Alert severity="warning">
            Sin conexión — la cola queda en espera.
          </Alert>
        )}

        {active.length === 0 && (
          <Alert severity="success">Todo sincronizado.</Alert>
        )}

        <List dense>
          {active.map((item) => (
            <ListItem
              key={item.id}
              secondaryAction={
                <Stack direction="row" spacing={1}>
                  {(item.status === "conflict" || item.status === "error") && (
                    <Button size="small" onClick={() => requeue(item.id)}>
                      Reintentar
                    </Button>
                  )}
                  {item.status === "conflict" && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => discard(item.id)}
                    >
                      Descartar
                    </Button>
                  )}
                </Stack>
              }
            >
              <ListItemText
                primary={item.label}
                secondary={
                  <>
                    <Chip
                      size="small"
                      color={STATUS_COLOR[item.status] ?? "default"}
                      label={item.status}
                      sx={{ mr: 1 }}
                    />
                    {item.errorMessage ?? item.kind}
                  </>
                }
              />
            </ListItem>
          ))}
        </List>

        {synced.length > 0 && (
          <>
            <Typography variant="subtitle2">Recientes sincronizados</Typography>
            <List dense>
              {synced.map((item) => (
                <ListItem key={item.id}>
                  <ListItemText
                    primary={item.label}
                    secondary={item.updatedAt.slice(0, 19).replace("T", " ")}
                  />
                </ListItem>
              ))}
            </List>
          </>
        )}
      </Stack>
    </Box>
  );
}
