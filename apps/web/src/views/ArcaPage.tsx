"use client";

import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import Link from "@mui/material/Link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ArcaEnvironment } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../api/client";
import {
  ARCA_WIZARD_STEPS,
  arcaActionDisabledReason,
  arcaPortalLinksForEnvironment,
  connectionLabelKey,
  isArcaActionEnabled,
  nextArcaWizardAction,
  shouldConfirmRegenerate,
  statusCheckRows,
} from "../features/arca/arcaLogic";
import { useSessionStore } from "../store/sessionStore";

function ArcaPageInner() {
  const { t: translate } = useTranslation();
  const queryClient = useQueryClient();
  const canManage = useSessionStore((state) =>
    state.hasCapability("arca:manage"),
  );
  const [environment, setEnvironment] =
    useState<ArcaEnvironment>("HOMOLOGATION");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cuit, setCuit] = useState("");
  const [legalName, setLegalName] = useState("");
  const [alias, setAlias] = useState("");
  const [pointOfSale, setPointOfSale] = useState("1");
  const [companyDirty, setCompanyDirty] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dashboardQuery = useQuery({
    queryKey: ["arca", environment],
    queryFn: () => api.getArcaDashboard(environment),
  });

  const dashboard = dashboardQuery.data;
  const status = dashboard?.status ?? "NOT_STARTED";
  const hasCompanyCuit = Boolean(dashboard?.company.cuit ?? cuit.trim());

  const applyCompanyToForm = (company: {
    cuit: string | null;
    legal_name: string | null;
    alias: string | null;
    point_of_sale: number;
  }) => {
    setCuit(company.cuit ?? "");
    setLegalName(company.legal_name ?? "");
    setAlias(company.alias ?? "");
    setPointOfSale(String(company.point_of_sale ?? 1));
    setCompanyDirty(false);
  };

  // Hydrate from server only when the user isn't mid-edit.
  useEffect(() => {
    if (!dashboard || companyDirty) return;
    applyCompanyToForm(dashboard.company);
  }, [
    companyDirty,
    dashboard?.company.cuit,
    dashboard?.company.legal_name,
    dashboard?.company.alias,
    dashboard?.company.point_of_sale,
  ]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["arca"] });
  };

  const wrap = async (action: () => Promise<void>) => {
    setError(null);
    setInfo(null);
    try {
      await action();
      await invalidate();
    } catch (caught) {
      if (caught instanceof ApiClientError) {
        setError(caught.message);
      } else if (caught instanceof Error) {
        setError(caught.message);
      } else {
        setError(translate("arca.errors.generic"));
      }
    }
  };

  const saveCompany = useMutation({
    mutationFn: () => {
      const trimmedCuit = cuit.trim();
      return api.updateArcaCompanyProfile({
        cuit: trimmedCuit === "" ? "" : trimmedCuit,
        legal_name: legalName.trim(),
        alias: alias.trim(),
        point_of_sale: Number(pointOfSale) || 1,
      });
    },
    onSuccess: async (profile) => {
      applyCompanyToForm(profile);
      setInfo(translate("arca.company.saved"));
      await invalidate();
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : translate("arca.errors.generic"),
      );
    },
  });

  const clearCompany = useMutation({
    mutationFn: () =>
      api.updateArcaCompanyProfile({
        cuit: "",
        legal_name: "",
        alias: "",
        point_of_sale: 1,
      }),
    onSuccess: async (profile) => {
      applyCompanyToForm(profile);
      setInfo(translate("arca.company.cleared"));
      await invalidate();
    },
    onError: (caught) => {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : translate("arca.errors.generic"),
      );
    },
  });

  const actionEnabled = (action: Parameters<typeof isArcaActionEnabled>[1]) =>
    canManage && isArcaActionEnabled(status, action, { hasCompanyCuit });

  const disabledTitle = (
    action: Parameters<typeof isArcaActionEnabled>[1],
  ): string | undefined => {
    if (!canManage) return translate("arca.errors.read_only");
    return (
      arcaActionDisabledReason(status, action, { hasCompanyCuit }) ?? undefined
    );
  };

  return (
    <Stack spacing={2} sx={{ maxWidth: 880 }}>
      <Typography variant="h5">{translate("arca.title")}</Typography>
      <Typography color="text.secondary">
        {translate("arca.subtitle")}
      </Typography>

      {dashboard?.simulation_mode && (
        <Alert severity="info" variant="outlined">
          <Typography fontWeight={700}>
            {translate("arca.simulation_banner.title")}
          </Typography>
          <Typography variant="body2">
            {translate("arca.simulation_banner.body")}
          </Typography>
        </Alert>
      )}

      {dashboard?.testing_mode && !dashboard?.simulation_mode && (
        <Alert severity="warning" variant="outlined">
          <Typography fontWeight={700}>
            {translate("arca.testing_banner.title")}
          </Typography>
          <Typography variant="body2">
            {translate("arca.testing_banner.body")}
          </Typography>
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}
      {info && <Alert severity="success">{info}</Alert>}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.simulation.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {translate("arca.simulation.help")}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={dashboard?.simulation_mode ?? true}
                disabled={!canManage}
                onChange={(event) =>
                  void wrap(async () => {
                    await api.updateArcaSimulationMode({
                      enabled: event.target.checked,
                    });
                    setInfo(
                      event.target.checked
                        ? translate("arca.simulation.enabled_done")
                        : translate("arca.simulation.disabled_done"),
                    );
                  })
                }
              />
            }
            label={translate("arca.simulation.enable")}
          />
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.company.title")}
          </Typography>
          <Stack spacing={2}>
            <TextField
              label={translate("arca.company.cuit")}
              value={cuit}
              onChange={(event) => {
                setCompanyDirty(true);
                setCuit(event.target.value);
              }}
              disabled={!canManage}
              helperText={translate("arca.company.cuit_help")}
            />
            <TextField
              label={translate("arca.company.legal_name")}
              value={legalName}
              onChange={(event) => {
                setCompanyDirty(true);
                setLegalName(event.target.value);
              }}
              disabled={!canManage}
            />
            <TextField
              label={translate("arca.company.alias")}
              value={alias}
              onChange={(event) => {
                setCompanyDirty(true);
                setAlias(event.target.value);
              }}
              disabled={!canManage}
            />
            <TextField
              label={translate("arca.company.point_of_sale")}
              value={pointOfSale}
              onChange={(event) => {
                setCompanyDirty(true);
                setPointOfSale(event.target.value);
              }}
              disabled={!canManage}
              type="number"
            />
            {canManage && (
              <Stack direction="row" spacing={1}>
                <Button
                  variant="outlined"
                  onClick={() => saveCompany.mutate()}
                  disabled={saveCompany.isPending || clearCompany.isPending}
                >
                  {translate("arca.company.save")}
                </Button>
                <Button
                  variant="text"
                  color="inherit"
                  onClick={() => {
                    if (
                      window.confirm(translate("arca.company.clear_confirm"))
                    ) {
                      clearCompany.mutate();
                    }
                  }}
                  disabled={saveCompany.isPending || clearCompany.isPending}
                >
                  {translate("arca.company.clear")}
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.environment.title")}
          </Typography>
          <RadioGroup
            row
            value={environment}
            onChange={(event) =>
              setEnvironment(event.target.value as ArcaEnvironment)
            }
          >
            <FormControlLabel
              value="HOMOLOGATION"
              control={<Radio />}
              label={translate("arca.environment.homologation")}
            />
            <FormControlLabel
              value="PRODUCTION"
              control={<Radio />}
              label={translate("arca.environment.production")}
            />
          </RadioGroup>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.status.title")}
          </Typography>
          <Stack spacing={1}>
            {statusCheckRows(
              dashboard?.checks ?? {
                has_private_key: false,
                has_csr: false,
                has_certificate: false,
                is_validated: false,
              },
            ).map((row) => (
              <Stack
                key={row.key}
                direction="row"
                spacing={1}
                alignItems="center"
              >
                {row.ok ? (
                  <CheckCircleOutlineIcon color="success" fontSize="small" />
                ) : (
                  <HighlightOffIcon color="disabled" fontSize="small" />
                )}
                <Typography>
                  {translate(`arca.status.checks.${row.key}`)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.actions.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {translate("arca.actions.subtitle")}
          </Typography>

          <Stack spacing={1.5}>
            {ARCA_WIZARD_STEPS.map((step, index) => {
              const enabled = actionEnabled(step.action);
              const isNext = nextArcaWizardAction(status) === step.action;
              const reason = disabledTitle(step.action);
              return (
                <Box
                  key={step.action}
                  sx={{
                    display: "grid",
                    gridTemplateColumns: {
                      xs: "auto 1fr",
                      sm: "auto minmax(0, 1fr) minmax(12rem, auto)",
                    },
                    gridTemplateAreas: {
                      xs: `"num copy" "btn btn"`,
                      sm: `"num copy btn"`,
                    },
                    columnGap: 2,
                    rowGap: 1.5,
                    alignItems: "center",
                    p: 1.5,
                    borderRadius: 1,
                    border: 1,
                    borderColor: isNext ? "primary.main" : "divider",
                    bgcolor: isNext ? "action.selected" : "background.paper",
                  }}
                >
                  <Box
                    aria-hidden
                    sx={{
                      gridArea: "num",
                      width: 32,
                      height: 32,
                      borderRadius: "50%",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      typography: "subtitle2",
                      fontWeight: 700,
                      bgcolor: isNext ? "primary.main" : "action.hover",
                      color: isNext ? "primary.contrastText" : "text.secondary",
                    }}
                  >
                    {index + 1}
                  </Box>
                  <Box sx={{ gridArea: "copy", minWidth: 0 }}>
                    <Typography variant="subtitle2" component="div">
                      {translate(step.labelKey)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {translate(step.hintKey)}
                    </Typography>
                    {!enabled && reason ? (
                      <Typography
                        variant="caption"
                        color="text.disabled"
                        display="block"
                        sx={{ mt: 0.5 }}
                      >
                        {reason}
                      </Typography>
                    ) : null}
                  </Box>
                  <Button
                    sx={{
                      gridArea: "btn",
                      justifySelf: { xs: "stretch", sm: "end" },
                      whiteSpace: "nowrap",
                    }}
                    variant={isNext ? "contained" : "outlined"}
                    disabled={!enabled}
                    title={reason}
                    onClick={() => {
                      if (step.action === "generate_keys") {
                        void wrap(async () => {
                          const confirmRegenerate =
                            shouldConfirmRegenerate(status);
                          if (
                            confirmRegenerate &&
                            !window.confirm(
                              translate("arca.actions.regenerate_confirm"),
                            )
                          ) {
                            return;
                          }
                          await api.generateArcaKeys({
                            environment,
                            confirm_regenerate: confirmRegenerate || undefined,
                          });
                          setInfo(translate("arca.actions.generate_done"));
                        });
                        return;
                      }
                      if (step.action === "download_csr") {
                        void wrap(async () => {
                          const blob = await api.downloadArcaCsr(environment);
                          const url = URL.createObjectURL(blob);
                          const anchor = document.createElement("a");
                          anchor.href = url;
                          anchor.download = "company.csr";
                          anchor.click();
                          URL.revokeObjectURL(url);
                          setInfo(translate("arca.actions.download_done"));
                        });
                        return;
                      }
                      if (step.action === "upload_certificate") {
                        fileInputRef.current?.click();
                        return;
                      }
                      if (step.action === "validate_certificate") {
                        void wrap(async () => {
                          const result =
                            await api.validateArcaCertificate(environment);
                          if (result.ok) {
                            setInfo(translate("arca.actions.validate_ok"));
                          } else {
                            setError(
                              result.checks
                                .filter((check) => !check.passed)
                                .map((check) => check.message)
                                .join(" · "),
                            );
                          }
                        });
                        return;
                      }
                      void wrap(async () => {
                        const result =
                          await api.testArcaConnection(environment);
                        if (result.ok) {
                          setInfo(translate("arca.actions.connection_ok"));
                        } else {
                          setError(
                            result.steps
                              .filter((stepResult) => !stepResult.passed)
                              .map((stepResult) => stepResult.message)
                              .join(" · "),
                          );
                        }
                      });
                    }}
                  >
                    {translate(step.labelKey)}
                  </Button>
                </Box>
              );
            })}
          </Stack>

          <input
            ref={fileInputRef}
            type="file"
            accept=".crt,.pem,application/x-pem-file,application/x-x509-ca-cert"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void wrap(async () => {
                await api.uploadArcaCertificate(environment, file, file.name);
                setInfo(translate("arca.actions.upload_done"));
              });
            }}
          />

          <Box
            sx={{
              mt: 3,
              pt: 2.5,
              borderTop: 1,
              borderColor: "divider",
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "minmax(0, 1fr) auto",
              },
              gap: 2,
              alignItems: "center",
            }}
          >
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" color="error">
                {translate("arca.actions.danger_zone")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {translate("arca.actions.danger_hint")}
              </Typography>
            </Box>
            <Button
              color="error"
              variant="outlined"
              disabled={!actionEnabled("delete_certificate")}
              title={disabledTitle("delete_certificate")}
              sx={{ justifySelf: { xs: "stretch", sm: "end" } }}
              onClick={() =>
                void wrap(async () => {
                  const reason = window.prompt(
                    translate("arca.actions.delete_reason"),
                  );
                  if (!reason?.trim()) return;
                  await api.deleteArcaCertificate({
                    environment,
                    reason: reason.trim(),
                  });
                  setInfo(translate("arca.actions.delete_done"));
                })
              }
            >
              {translate("arca.actions.delete_certificate")}
            </Button>
          </Box>

          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              {translate("arca.instructions.title")}
            </Typography>
            <Stack
              direction="row"
              spacing={1.5}
              flexWrap="wrap"
              useFlexGap
              sx={{ mb: 1.5 }}
            >
              {arcaPortalLinksForEnvironment(environment).map((link) => (
                <Button
                  key={link.href}
                  component={Link}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="outlined"
                  size="small"
                  endIcon={<OpenInNewIcon fontSize="small" />}
                >
                  {translate(link.labelKey)}
                </Button>
              ))}
            </Stack>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              {translate(
                environment === "PRODUCTION"
                  ? "arca.links.production_hint"
                  : "arca.links.homologation_hint",
              )}
            </Typography>
            <Typography variant="body2" component="ol" sx={{ pl: 2, m: 0 }}>
              {(
                translate(
                  environment === "PRODUCTION"
                    ? "arca.instructions.production"
                    : "arca.instructions.homologation",
                  { returnObjects: true },
                ) as string[]
              ).map((step) => (
                <li key={step}>{step}</li>
              ))}
            </Typography>
          </Box>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.testing.title")}
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={dashboard?.testing_mode ?? true}
                disabled={!canManage || Boolean(dashboard?.simulation_mode)}
                onChange={(event) =>
                  void wrap(async () => {
                    const enabled = event.target.checked;
                    await api.updateArcaTestingMode({
                      enabled,
                      confirm_go_live: enabled ? undefined : true,
                    });
                  })
                }
              />
            }
            label={translate("arca.testing.enable")}
          />
          {dashboard?.simulation_mode ? (
            <Typography
              variant="caption"
              color="text.secondary"
              display="block"
            >
              {translate("arca.simulation.testing_locked")}
            </Typography>
          ) : null}
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            {translate("arca.dashboard.title")}
          </Typography>
          <Stack spacing={0.5}>
            <Typography>
              {translate("arca.dashboard.status")}: {status}
            </Typography>
            <Typography>
              {translate("arca.dashboard.environment")}:{" "}
              {translate(
                environment === "PRODUCTION"
                  ? "arca.environment.production"
                  : "arca.environment.homologation",
              )}
            </Typography>
            <Typography>
              {translate("arca.dashboard.cuit")}:{" "}
              {dashboard?.company.cuit ?? "—"}
            </Typography>
            <Typography>
              {translate("arca.dashboard.fingerprint")}:{" "}
              {dashboard?.certificate_fingerprint ?? "—"}
            </Typography>
            <Typography>
              {translate("arca.dashboard.valid_until")}:{" "}
              {dashboard?.valid_until
                ? new Date(dashboard.valid_until).toLocaleString()
                : "—"}
            </Typography>
            <Typography>
              {translate("arca.dashboard.last_validation")}:{" "}
              {dashboard?.last_validation
                ? new Date(dashboard.last_validation).toLocaleString()
                : "—"}
            </Typography>
            <Typography>
              {translate("arca.dashboard.last_authentication")}:{" "}
              {dashboard?.last_authentication
                ? new Date(dashboard.last_authentication).toLocaleString()
                : "—"}
            </Typography>
            <Typography>
              {translate("arca.dashboard.connection")}:{" "}
              {translate(
                connectionLabelKey(
                  dashboard?.connection_status ?? "NOT_CONFIGURED",
                ),
              )}
            </Typography>
            <Typography>
              {translate("arca.dashboard.last_invoice")}: —
            </Typography>
            <Typography>{translate("arca.dashboard.last_cae")}: —</Typography>
            <Typography>
              {translate("arca.dashboard.point_of_sale")}:{" "}
              {dashboard?.point_of_sale ?? "—"}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Stack>
  );
}

export default function ArcaPage() {
  return <ArcaPageInner />;
}
