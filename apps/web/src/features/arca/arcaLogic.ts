import type {
  ArcaDashboard,
  ArcaEnvironment,
  ArcaOnboardingStatus,
  ArcaStatusChecks,
} from "@weld/schemas";

export type ArcaWizardAction =
  | "generate_keys"
  | "download_csr"
  | "upload_certificate"
  | "validate_certificate"
  | "test_connection"
  | "delete_certificate";

/** Progressive enablement of wizard buttons (R-13). */
export function isArcaActionEnabled(
  status: ArcaOnboardingStatus,
  action: ArcaWizardAction,
  options: { hasCompanyCuit: boolean } = { hasCompanyCuit: false },
): boolean {
  switch (action) {
    case "generate_keys":
      return options.hasCompanyCuit;
    case "download_csr":
      return (
        status === "KEY_READY" ||
        status === "CERT_UPLOADED" ||
        status === "VALIDATED" ||
        status === "CONNECTED" ||
        status === "EXPIRED"
      );
    case "upload_certificate":
      return status !== "NOT_STARTED";
    case "validate_certificate":
      return (
        status === "CERT_UPLOADED" ||
        status === "VALIDATED" ||
        status === "CONNECTED" ||
        status === "EXPIRED"
      );
    case "test_connection":
      return status === "VALIDATED" || status === "CONNECTED";
    case "delete_certificate":
      return status !== "NOT_STARTED";
    default: {
      const _exhaustive: never = action;
      return Boolean(_exhaustive);
    }
  }
}

export function arcaActionDisabledReason(
  status: ArcaOnboardingStatus,
  action: ArcaWizardAction,
  options: { hasCompanyCuit: boolean },
): string | null {
  if (isArcaActionEnabled(status, action, options)) return null;
  switch (action) {
    case "generate_keys":
      return "Configure the company CUIT first.";
    case "download_csr":
      return "Generate keys to create an Access Request.";
    case "upload_certificate":
      return "Generate keys before uploading a certificate.";
    case "validate_certificate":
      return "Upload a certificate before validating.";
    case "test_connection":
      return "Validate the certificate before testing the connection.";
    case "delete_certificate":
      return "Nothing to delete yet.";
    default:
      return "Action not available.";
  }
}

export function statusCheckRows(checks: ArcaStatusChecks): Array<{
  key: keyof ArcaStatusChecks;
  ok: boolean;
}> {
  return [
    { key: "has_private_key", ok: checks.has_private_key },
    { key: "has_csr", ok: checks.has_csr },
    { key: "has_certificate", ok: checks.has_certificate },
    { key: "is_validated", ok: checks.is_validated },
  ];
}

export function connectionLabelKey(
  status: ArcaDashboard["connection_status"],
): string {
  switch (status) {
    case "CONNECTED":
      return "arca.connection.connected";
    case "FAILED":
      return "arca.connection.failed";
    default:
      return "arca.connection.not_configured";
  }
}

export function environmentLabelKey(environment: ArcaEnvironment): string {
  return environment === "PRODUCTION"
    ? "arca.environment.production"
    : "arca.environment.homologation";
}

export function shouldConfirmRegenerate(status: ArcaOnboardingStatus): boolean {
  return (
    status === "CERT_UPLOADED" ||
    status === "VALIDATED" ||
    status === "CONNECTED" ||
    status === "EXPIRED"
  );
}

/** Ordered wizard steps shown in the UI (destructive delete is separate). */
export const ARCA_WIZARD_STEPS: ReadonlyArray<{
  action: Exclude<ArcaWizardAction, "delete_certificate">;
  labelKey: string;
  hintKey: string;
}> = [
  {
    action: "generate_keys",
    labelKey: "arca.actions.generate_keys",
    hintKey: "arca.actions.hints.generate_keys",
  },
  {
    action: "download_csr",
    labelKey: "arca.actions.download_csr",
    hintKey: "arca.actions.hints.download_csr",
  },
  {
    action: "upload_certificate",
    labelKey: "arca.actions.upload_certificate",
    hintKey: "arca.actions.hints.upload_certificate",
  },
  {
    action: "validate_certificate",
    labelKey: "arca.actions.validate_certificate",
    hintKey: "arca.actions.hints.validate_certificate",
  },
  {
    action: "test_connection",
    labelKey: "arca.actions.test_connection",
    hintKey: "arca.actions.hints.test_connection",
  },
] as const;

/** Next recommended step for progressive disclosure / highlight. */
export function nextArcaWizardAction(
  status: ArcaOnboardingStatus,
): Exclude<ArcaWizardAction, "delete_certificate"> | null {
  switch (status) {
    case "NOT_STARTED":
      return "generate_keys";
    case "KEY_READY":
      return "download_csr";
    case "CERT_UPLOADED":
      return "validate_certificate";
    case "VALIDATED":
      return "test_connection";
    case "CONNECTED":
      return null;
    case "EXPIRED":
      return "generate_keys";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/** Official ARCA / AFIP portals used by the wizard (open in a new tab). */
export const ARCA_PORTAL_LINKS = {
  /** Clave Fiscal / Mis Servicios entry point. */
  login: "https://www.arca.gob.ar",
  /** Homologation certificate self-service docs + create-cert guide. */
  wsassGuide: "https://www.afip.gob.ar/ws/WSASS/html/crearcertificado.html",
  wsassHowToJoin: "https://www.afip.gob.ar/ws/WSASS/WSASS_como_adherirse.pdf",
  /** Certificates overview (homologation + production). */
  certificatesDocs: "https://www.afip.gob.ar/ws/documentacion/certificados.asp",
} as const;

export function arcaPortalLinksForEnvironment(
  environment: ArcaEnvironment,
): Array<{
  href: string;
  labelKey: string;
}> {
  if (environment === "PRODUCTION") {
    return [
      { href: ARCA_PORTAL_LINKS.login, labelKey: "arca.links.open_arca" },
      {
        href: ARCA_PORTAL_LINKS.certificatesDocs,
        labelKey: "arca.links.production_certs",
      },
    ];
  }
  return [
    { href: ARCA_PORTAL_LINKS.login, labelKey: "arca.links.open_arca" },
    { href: ARCA_PORTAL_LINKS.wsassGuide, labelKey: "arca.links.open_wsass" },
    {
      href: ARCA_PORTAL_LINKS.wsassHowToJoin,
      labelKey: "arca.links.wsass_join",
    },
  ];
}
