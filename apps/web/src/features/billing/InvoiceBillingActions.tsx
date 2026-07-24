"use client";

import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Invoice } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import { api } from "../../api/client";
import { useSessionStore } from "../../store/sessionStore";

export interface InvoiceBillingActionsProps {
  invoice: Invoice;
  onInvoiceUpdated: (invoice: Invoice) => void;
  /** Compact layout for embedding in the client ledger drawer. */
  compact?: boolean;
}

function formatMoney(value: number): string {
  return `${Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} ARS`;
}

export function InvoiceBillingActions({
  invoice,
  onInvoiceUpdated,
  compact = false,
}: InvoiceBillingActionsProps) {
  const { t: translate } = useTranslation();
  const canWrite = useSessionStore((state) =>
    state.hasCapability("billing:write"),
  );
  const canApprove = useSessionStore((state) =>
    state.hasCapability("billing:approve"),
  );
  const canReadBilling = useSessionStore((state) =>
    state.hasCapability("billing:read"),
  );
  const [error, setError] = useState<string | null>(null);

  const simulationQuery = useQuery({
    queryKey: ["billing", "simulation-mode"],
    queryFn: () => api.getBillingSimulationMode(),
    enabled: canReadBilling,
    staleTime: 30_000,
  });
  const simulationMode = simulationQuery.data?.enabled === true;

  const onApiError = (err: unknown) => {
    if (err instanceof ApiClientError) {
      setError(err.message);
      return;
    }
    setError(translate("errors.generic"));
  };

  const approveMutation = useMutation({
    mutationFn: () => api.approveInvoice(invoice.id),
    onSuccess: (updated) => {
      setError(null);
      onInvoiceUpdated(updated);
    },
    onError: onApiError,
  });

  const issueMutation = useMutation({
    mutationFn: () => api.issueInvoice(invoice.id),
    onSuccess: (updated) => {
      setError(null);
      onInvoiceUpdated(updated);
    },
    onError: onApiError,
  });

  const authorizeMutation = useMutation({
    mutationFn: () => api.authorizeInvoice(invoice.id),
    onSuccess: (updated) => {
      setError(null);
      onInvoiceUpdated(updated);
    },
    onError: onApiError,
  });

  const resetMutation = useMutation({
    mutationFn: () => api.resetSimulationInvoice(invoice.id),
    onSuccess: (updated) => {
      setError(null);
      onInvoiceUpdated(updated);
    },
    onError: onApiError,
  });

  const printMutation = useMutation({
    mutationFn: async () => {
      const { blob, filename } = await api.downloadInvoicePdf(invoice.id);
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
    onError: onApiError,
  });

  const arca = invoice.arca;
  const hasCae = Boolean(arca?.cae);
  const isDraft = invoice.status === "DRAFT";
  const isApproved =
    invoice.status === "APPROVED" || invoice.status === "EXPORTED";
  const canApproveOne = canApprove && isDraft && invoice.total > 0;
  const canIssue =
    canApprove &&
    canWrite &&
    invoice.total > 0 &&
    !hasCae &&
    (isDraft || isApproved);
  const canAuthorize = canWrite && isApproved && !hasCae && invoice.total > 0;
  const canResetSimulation =
    simulationMode && canApprove && canWrite && (!isDraft || hasCae);
  const resetLabel = hasCae
    ? translate("billing.invoice_drawer.reset_simulation_with_cae")
    : translate("billing.invoice_drawer.reset_simulation");
  const busy =
    approveMutation.isPending ||
    issueMutation.isPending ||
    authorizeMutation.isPending ||
    resetMutation.isPending ||
    printMutation.isPending;

  return (
    <Stack spacing={compact ? 1 : 1.5}>
      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        flexWrap="wrap"
        useFlexGap
      >
        <Chip
          size="small"
          label={translate(`enums.invoice_status.${invoice.status}`)}
        />
        {hasCae ? (
          <Chip
            size="small"
            color="success"
            label={translate("billing.invoice_drawer.cae_ready")}
          />
        ) : (
          <Chip
            size="small"
            variant="outlined"
            label={translate("billing.invoice_drawer.cae_pending")}
          />
        )}
        <Typography variant="body2" color="text.secondary">
          {translate("billing.invoice_drawer.subtitle", {
            from: invoice.period_start,
            to: invoice.period_end,
            total: formatMoney(invoice.total),
          })}
        </Typography>
      </Stack>

      {error && <Alert severity="error">{error}</Alert>}

      {isDraft && (
        <Alert severity="info">
          {translate("billing.invoice_drawer.draft_hint")}
        </Alert>
      )}

      {hasCae && arca && (
        <Alert severity="success">
          <Typography variant="body2">
            {translate("billing.invoice_drawer.cae_detail", {
              cae: arca.cae,
              due: arca.cae_due_date,
              number: `${String(arca.pto_vta).padStart(5, "0")}-${String(arca.cbte_nro).padStart(8, "0")}`,
              env:
                arca.arca_environment === "HOMOLOGATION"
                  ? translate("billing.invoice_drawer.env_homo")
                  : translate("billing.invoice_drawer.env_prod"),
            })}
          </Typography>
        </Alert>
      )}

      {canResetSimulation && (
        <Alert severity="warning">
          {translate("billing.invoice_drawer.reset_simulation_hint")}
        </Alert>
      )}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        {canIssue && (
          <Button
            size={compact ? "small" : "medium"}
            variant="contained"
            disabled={busy}
            onClick={() => issueMutation.mutate()}
          >
            {isDraft
              ? translate("billing.invoice_drawer.approve_and_issue")
              : translate("billing.invoice_drawer.authorize")}
          </Button>
        )}
        {canApproveOne && (
          <Button
            size={compact ? "small" : "medium"}
            variant="outlined"
            disabled={busy}
            onClick={() => approveMutation.mutate()}
          >
            {translate("billing.invoice_drawer.approve_only")}
          </Button>
        )}
        {canAuthorize && !canIssue && (
          <Button
            size={compact ? "small" : "medium"}
            variant="contained"
            disabled={busy}
            onClick={() => authorizeMutation.mutate()}
          >
            {translate("billing.invoice_drawer.authorize")}
          </Button>
        )}
        <Button
          size={compact ? "small" : "medium"}
          variant={hasCae ? "contained" : "outlined"}
          disabled={busy || !hasCae}
          onClick={() => printMutation.mutate()}
        >
          {translate("billing.invoice_drawer.print")}
        </Button>
        {canResetSimulation && (
          <Button
            size={compact ? "small" : "medium"}
            variant="outlined"
            color="warning"
            disabled={busy}
            onClick={() => resetMutation.mutate()}
          >
            {resetLabel}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
