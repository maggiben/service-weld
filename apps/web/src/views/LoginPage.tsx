"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z as zod } from "zod";
import { api, ApiError } from "@/api/client";
import { homePathForCapabilities } from "@/auth/homePath";
import { RedirectIfAuthed } from "@/auth/RequireAuth";
import { useSessionStore } from "@/store/sessionStore";
import { useUiStore } from "@/store/uiStore";

const loginSchema = zod.object({
  username: zod.string().min(1),
  password: zod.string().min(1),
});

type LoginForm = zod.infer<typeof loginSchema>;

export default function LoginPage() {
  const { t: translate } = useTranslation();
  const router = useRouter();
  const setUser = useSessionStore((state) => state.setUser);
  const { locale, setLocale } = useUiStore();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("from");
    if (raw && raw.startsWith("/") && raw !== "/forbidden") setFrom(raw);
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null);
    try {
      // Drop any stale profile before tokens land so RedirectIfAuthed cannot
      // treat a half-finished login as authenticated.
      setUser(null);
      await api.login(values.username, values.password);
      const me = await api.me();
      setUser(me);
      router.replace(from ?? homePathForCapabilities(me.capabilities));
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.httpStatus === 401 &&
        error.code === "INVALID_CREDENTIALS"
      ) {
        setSubmitError(translate("errors.invalid_credentials"));
        return;
      }
      setSubmitError(translate("errors.generic"));
    }
  });

  return (
    <RedirectIfAuthed>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "background.default",
          p: 2,
        }}
      >
        <Card sx={{ width: "100%", maxWidth: 420 }}>
          <CardContent>
            <Stack spacing={3}>
              <Box sx={{ textAlign: "center" }}>
                <Box
                  component="img"
                  src="/service-weld-logo.png"
                  alt="Service Weld S.R.L."
                  sx={{
                    width: "100%",
                    maxWidth: 280,
                    height: "auto",
                    display: "block",
                    mx: "auto",
                    borderRadius: 1,
                    bgcolor: "#000",
                  }}
                />
                <Typography variant="h5" sx={{ mt: 2 }}>
                  {translate("login.title")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {translate("login.subtitle")}
                </Typography>
              </Box>

              {submitError && <Alert severity="error">{submitError}</Alert>}

              <Stack component="form" spacing={2} onSubmit={onSubmit}>
                <Controller
                  name="username"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={translate("login.username")}
                      autoComplete="username"
                      autoFocus
                      fullWidth
                      error={Boolean(errors.username)}
                      helperText={
                        errors.username
                          ? translate("validation.required")
                          : undefined
                      }
                    />
                  )}
                />
                <Controller
                  name="password"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      type="password"
                      label={translate("login.password")}
                      autoComplete="current-password"
                      fullWidth
                      error={Boolean(errors.password)}
                      helperText={
                        errors.password
                          ? translate("validation.required")
                          : undefined
                      }
                    />
                  )}
                />
                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  disabled={isSubmitting}
                >
                  {translate("login.submit")}
                </Button>
              </Stack>

              <Button
                variant="text"
                onClick={() => setLocale(locale === "es" ? "en" : "es")}
              >
                {translate("actions.toggle_language")} ({locale})
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Box>
    </RedirectIfAuthed>
  );
}
