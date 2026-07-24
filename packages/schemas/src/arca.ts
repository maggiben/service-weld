import { z as zod } from "zod";
import { Cuit } from "./cuit";

/**
 * ARCA (ex-AFIP) credential onboarding — docs/specs/arca-integration.md.
 * No DTO ever includes a private key or decrypted certificate (R-49).
 */

export const ArcaEnvironment = zod.enum(["HOMOLOGATION", "PRODUCTION"]);
export type ArcaEnvironment = zod.infer<typeof ArcaEnvironment>;

export const ArcaOnboardingStatus = zod.enum([
  "NOT_STARTED",
  "KEY_READY",
  "CERT_UPLOADED",
  "VALIDATED",
  "CONNECTED",
  "EXPIRED",
]);
export type ArcaOnboardingStatus = zod.infer<typeof ArcaOnboardingStatus>;

export const ArcaConnectionStatus = zod.enum([
  "NOT_CONFIGURED",
  "CONNECTED",
  "FAILED",
]);
export type ArcaConnectionStatus = zod.infer<typeof ArcaConnectionStatus>;

export const ArcaValidationCheckId = zod.enum([
  "VALID_X509",
  "CORRECT_PEM",
  "NOT_EXPIRED",
  "PRIVATE_KEY_MATCH",
  "CUIT_MATCH",
  "ENVIRONMENT_MATCH",
]);
export type ArcaValidationCheckId = zod.infer<typeof ArcaValidationCheckId>;

export const ArcaConnectionStepId = zod.enum([
  "WSAA_OK",
  "LOGIN_TICKET",
  "WSFE_CONNECTED",
  "AUTH_SUCCESS",
]);
export type ArcaConnectionStepId = zod.infer<typeof ArcaConnectionStepId>;

export const ArcaStatusChecks = zod.object({
  has_private_key: zod.boolean(),
  has_csr: zod.boolean(),
  has_certificate: zod.boolean(),
  is_validated: zod.boolean(),
});
export type ArcaStatusChecks = zod.infer<typeof ArcaStatusChecks>;

export const ArcaCompanyProfile = zod.object({
  cuit: Cuit.nullable(),
  legal_name: zod.string().max(200).nullable(),
  alias: zod.string().max(100).nullable(),
  point_of_sale: zod.number().int().min(1).max(99999),
});
export type ArcaCompanyProfile = zod.infer<typeof ArcaCompanyProfile>;

export const UpdateArcaCompanyProfileInput = zod
  .object({
    /**
     * Pass a valid CUIT to set, or `null` / `""` to clear.
     * Empty string is accepted so clients that strip JSON null still work.
     */
    cuit: zod
      .union([Cuit, zod.literal(""), zod.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === "" || value === null) return null;
        return value;
      }),
    legal_name: zod
      .union([zod.string().max(200), zod.literal(""), zod.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      }),
    alias: zod
      .union([zod.string().max(100), zod.literal(""), zod.null()])
      .optional()
      .transform((value) => {
        if (value === undefined) return undefined;
        if (value === null) return null;
        const trimmed = value.trim();
        return trimmed === "" ? null : trimmed;
      }),
    point_of_sale: zod.number().int().min(1).max(99999).optional(),
  })
  .refine(
    (value) =>
      value.cuit !== undefined ||
      value.legal_name !== undefined ||
      value.alias !== undefined ||
      value.point_of_sale != null,
    { message: "At least one company profile field is required" },
  );
export type UpdateArcaCompanyProfileInput = zod.infer<
  typeof UpdateArcaCompanyProfileInput
>;

export const ArcaEnvironmentQuery = zod.object({
  environment: ArcaEnvironment.default("HOMOLOGATION"),
});
export type ArcaEnvironmentQuery = zod.infer<typeof ArcaEnvironmentQuery>;

export const GenerateArcaKeysInput = zod.object({
  environment: ArcaEnvironment,
  /** Explicit confirmation when regenerating over an existing certificate. */
  confirm_regenerate: zod.boolean().optional(),
});
export type GenerateArcaKeysInput = zod.infer<typeof GenerateArcaKeysInput>;

export const DeleteArcaCertificateInput = zod.object({
  environment: ArcaEnvironment,
  reason: zod.string().trim().min(1).max(500),
});
export type DeleteArcaCertificateInput = zod.infer<
  typeof DeleteArcaCertificateInput
>;

export const ArcaTestingMode = zod.object({
  enabled: zod.boolean(),
});
export type ArcaTestingMode = zod.infer<typeof ArcaTestingMode>;

export const UpdateArcaTestingModeInput = zod.object({
  enabled: zod.boolean(),
  /** Required when disabling testing mode (going live). */
  confirm_go_live: zod.boolean().optional(),
});
export type UpdateArcaTestingModeInput = zod.infer<
  typeof UpdateArcaTestingModeInput
>;

/** Dev/local: skip live WSAA/WSFE and treat ARCA as connected. */
export const ArcaSimulationMode = zod.object({
  enabled: zod.boolean(),
});
export type ArcaSimulationMode = zod.infer<typeof ArcaSimulationMode>;

export const UpdateArcaSimulationModeInput = zod.object({
  enabled: zod.boolean(),
});
export type UpdateArcaSimulationModeInput = zod.infer<
  typeof UpdateArcaSimulationModeInput
>;

export const ArcaValidationCheck = zod.object({
  id: ArcaValidationCheckId,
  passed: zod.boolean(),
  message: zod.string(),
});
export type ArcaValidationCheck = zod.infer<typeof ArcaValidationCheck>;

export const ValidateCertificateResult = zod.object({
  ok: zod.boolean(),
  checks: zod.array(ArcaValidationCheck),
  fingerprint: zod.string().nullable(),
  valid_until: zod.string().datetime().nullable(),
});
export type ValidateCertificateResult = zod.infer<
  typeof ValidateCertificateResult
>;

export const UploadCertificateResult = zod.object({
  ok: zod.boolean(),
  message: zod.string(),
  status: ArcaOnboardingStatus,
});
export type UploadCertificateResult = zod.infer<typeof UploadCertificateResult>;

export const ArcaConnectionStep = zod.object({
  id: ArcaConnectionStepId,
  passed: zod.boolean(),
  message: zod.string(),
});
export type ArcaConnectionStep = zod.infer<typeof ArcaConnectionStep>;

export const ConnectionTestResult = zod.object({
  ok: zod.boolean(),
  steps: zod.array(ArcaConnectionStep),
  last_voucher_number: zod.number().int().nullable(),
  connection_status: ArcaConnectionStatus,
});
export type ConnectionTestResult = zod.infer<typeof ConnectionTestResult>;

export const ArcaDashboard = zod.object({
  environment: ArcaEnvironment,
  status: ArcaOnboardingStatus,
  checks: ArcaStatusChecks,
  company: ArcaCompanyProfile,
  testing_mode: zod.boolean(),
  /** When true, no live ARCA calls; dashboard/auth behave as CONNECTED. */
  simulation_mode: zod.boolean(),
  effective_environment: ArcaEnvironment,
  certificate_fingerprint: zod.string().nullable(),
  valid_until: zod.string().datetime().nullable(),
  last_validation: zod.string().datetime().nullable(),
  last_authentication: zod.string().datetime().nullable(),
  connection_status: ArcaConnectionStatus,
  last_connection_error: zod.string().nullable(),
  /** Future invoicing module — placeholder until wired. */
  last_invoice: zod.string().nullable(),
  last_cae: zod.string().nullable(),
  point_of_sale: zod.number().int().nullable(),
});
export type ArcaDashboard = zod.infer<typeof ArcaDashboard>;
