"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/api/client";
import { RedirectIfAuthed } from "@/auth/RequireAuth";
import { useSessionStore } from "@/store/sessionStore";

export default function LoginPage() {
  const router = useRouter();
  const setUser = useSessionStore((s) => s.setUser);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("/");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("from");
    if (raw && raw.startsWith("/")) setFrom(raw);
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(username, password);
      const me = await api.me();
      setUser(me);
      router.replace(from);
    } catch (err) {
      if (err instanceof ApiError && err.code === "INVALID_CREDENTIALS") {
        setError("Usuario o contraseña incorrectos");
      } else {
        setError("No se pudo iniciar sesión");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <RedirectIfAuthed>
      <Box sx={{ p: 3, maxWidth: 420, mx: "auto", mt: 6 }}>
        <Typography variant="h5" gutterBottom>
          Reparto — ingreso
        </Typography>
        <Stack component="form" spacing={2} onSubmit={onSubmit}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            fullWidth
          />
          <TextField
            label="Contraseña"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button
            type="submit"
            variant="contained"
            disabled={busy}
            size="large"
          >
            Entrar
          </Button>
        </Stack>
      </Box>
    </RedirectIfAuthed>
  );
}
