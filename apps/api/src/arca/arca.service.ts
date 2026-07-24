import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ARCA_SIMULATION_FINGERPRINT,
  assertArcaActionAllowed,
  buildSimulatedArcaCae,
  cuitDigits,
  deriveArcaStatus,
  deriveArcaStatusChecks,
  effectiveArcaEnvironment,
  DomainErrors,
  simulatedArcaCredentialFacts,
  type BuiltArcaVoucher,
} from "@weld/domain";
import { isValidCuit } from "@weld/schemas";
import type {
  ArcaCompanyProfile,
  ArcaDashboard,
  ArcaEnvironment,
  ArcaSimulationMode,
  ArcaTestingMode,
  ConnectionTestResult,
  DeleteArcaCertificateInput,
  GenerateArcaKeysInput,
  UpdateArcaCompanyProfileInput,
  UpdateArcaSimulationModeInput,
  UpdateArcaTestingModeInput,
  UploadCertificateResult,
  ValidateCertificateResult,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { assertOrApi, mapDomainError } from "../common/errors/map-domain-error";
import type { Env } from "../config/config.schema";
import {
  assertCertificateUploadSize,
  normalizeCertificatePem,
  runCertificateValidation,
} from "./certificate/certificate-parse";
import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKeyFromEnv,
  type ArcaCryptoKeyMaterial,
} from "./crypto/secret-crypto";
import { generateArcaKeyAndCsr } from "./csr/generate-csr";
import {
  ArcaRepository,
  SETTING_ARCA_COMPANY_ALIAS,
  SETTING_ARCA_COMPANY_CUIT,
  SETTING_ARCA_COMPANY_LEGAL_NAME,
  SETTING_ARCA_POINT_OF_SALE,
  SETTING_ARCA_SIMULATION_MODE,
  SETTING_ARCA_TESTING_MODE,
  type ArcaCredentialRow,
} from "./storage/arca.repository";
import {
  ArcaConnectionService,
  type ArcaCreateVoucherResult,
} from "./wsaa/arca-connection.service";

@Injectable()
export class ArcaService {
  private cryptoMaterialCache: ArcaCryptoKeyMaterial | null = null;

  constructor(
    private readonly repository: ArcaRepository,
    private readonly connection: ArcaConnectionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private cryptoMaterial(): ArcaCryptoKeyMaterial {
    if (!this.cryptoMaterialCache) {
      this.cryptoMaterialCache = parseEncryptionKeyFromEnv(
        this.config.get("ARCA_ENCRYPTION_KEY", { infer: true }),
      );
    }
    return this.cryptoMaterialCache;
  }

  async getDashboard(environment: ArcaEnvironment): Promise<ArcaDashboard> {
    const [row, company, testingMode, simulationMode] = await Promise.all([
      this.repository.findCredential(environment),
      this.getCompanyProfile(),
      this.isTestingModeEnabled(),
      this.isSimulationModeEnabled(),
    ]);
    return this.toDashboard(
      environment,
      row,
      company,
      testingMode,
      simulationMode,
    );
  }

  async getCompanyProfile(): Promise<ArcaCompanyProfile> {
    const [cuitRaw, legalName, alias, posRaw] = await Promise.all([
      this.repository.getSetting(SETTING_ARCA_COMPANY_CUIT),
      this.repository.getSetting(SETTING_ARCA_COMPANY_LEGAL_NAME),
      this.repository.getSetting(SETTING_ARCA_COMPANY_ALIAS),
      this.repository.getSetting(SETTING_ARCA_POINT_OF_SALE),
    ]);
    const cuit =
      cuitRaw && cuitRaw.trim() !== "" && isValidCuit(cuitRaw.trim())
        ? cuitRaw.trim()
        : null;
    const pointOfSale = Number(posRaw ?? "1");
    return {
      cuit,
      legal_name: legalName?.trim() ? legalName.trim() : null,
      alias: alias?.trim() ? alias.trim() : null,
      point_of_sale:
        Number.isFinite(pointOfSale) && pointOfSale >= 1 ? pointOfSale : 1,
    };
  }

  async updateCompanyProfile(
    input: UpdateArcaCompanyProfileInput,
    actorUserId: number | null = null,
  ): Promise<ArcaCompanyProfile> {
    const before = await this.getCompanyProfile();

    if (input.cuit !== undefined) {
      await this.repository.setSetting(
        SETTING_ARCA_COMPANY_CUIT,
        input.cuit ?? "",
      );
    }
    if (input.legal_name !== undefined) {
      await this.repository.setSetting(
        SETTING_ARCA_COMPANY_LEGAL_NAME,
        input.legal_name ?? "",
      );
    }
    if (input.alias !== undefined) {
      await this.repository.setSetting(
        SETTING_ARCA_COMPANY_ALIAS,
        input.alias ?? "",
      );
    }
    if (input.point_of_sale != null) {
      await this.repository.setSetting(
        SETTING_ARCA_POINT_OF_SALE,
        String(input.point_of_sale),
      );
    }

    const after = await this.getCompanyProfile();
    const cuitChanged =
      before.cuit != null && after.cuit != null && before.cuit !== after.cuit;
    // Credentials are bound to CUIT. Wipe when identity changes, is cleared, or is
    // already absent (heals orphaned key/CSR rows left by an earlier failed reset).
    if (after.cuit == null || cuitChanged) {
      await this.repository.softDeleteAllEnvironments({ actorUserId });
    }

    return after;
  }

  async isTestingModeEnabled(): Promise<boolean> {
    const value = await this.repository.getSetting(SETTING_ARCA_TESTING_MODE);
    if (value == null) return true;
    return value === "true" || value === "1";
  }

  async getTestingMode(): Promise<ArcaTestingMode> {
    return { enabled: await this.isTestingModeEnabled() };
  }

  async updateTestingMode(
    input: UpdateArcaTestingModeInput,
  ): Promise<ArcaTestingMode> {
    if (input.enabled === false) {
      if (!input.confirm_go_live) {
        throw mapDomainError(DomainErrors.arcaGoLiveRequiresConfirm());
      }
      const production = await this.repository.findCredential("PRODUCTION");
      const status = this.statusFromRow(production);
      if (status !== "CONNECTED") {
        throw mapDomainError(DomainErrors.arcaGoLiveRequiresProduction());
      }
    }
    await this.repository.setSetting(
      SETTING_ARCA_TESTING_MODE,
      input.enabled ? "true" : "false",
    );
    return this.getTestingMode();
  }

  async isSimulationModeEnabled(): Promise<boolean> {
    const value = await this.repository.getSetting(
      SETTING_ARCA_SIMULATION_MODE,
    );
    if (value == null) return true;
    return value === "true" || value === "1";
  }

  async getSimulationMode(): Promise<ArcaSimulationMode> {
    return { enabled: await this.isSimulationModeEnabled() };
  }

  async updateSimulationMode(
    input: UpdateArcaSimulationModeInput,
  ): Promise<ArcaSimulationMode> {
    await this.repository.setSetting(
      SETTING_ARCA_SIMULATION_MODE,
      input.enabled ? "true" : "false",
    );
    return this.getSimulationMode();
  }

  async generateKeys(
    input: GenerateArcaKeysInput,
    actorUserId: number | null,
  ): Promise<ArcaDashboard> {
    const company = await this.getCompanyProfile();
    const row = await this.repository.findCredential(input.environment);
    const status = this.statusFromRow(row);
    try {
      assertArcaActionAllowed(status, "generate_keys", {
        hasCompanyCuit: company.cuit != null,
        confirmRegenerate: input.confirm_regenerate,
      });
    } catch (error) {
      mapDomainError(error);
    }

    const generated = await generateArcaKeyAndCsr({
      cuit: company.cuit!,
      legalName: company.legal_name ?? company.alias ?? `CUIT ${company.cuit}`,
      alias: company.alias ?? company.legal_name ?? `CUIT ${company.cuit}`,
    });
    const privateKeyEncrypted = encryptSecret(
      generated.privateKeyPem,
      this.cryptoMaterial(),
    );
    await this.repository.upsertKeys({
      environment: input.environment,
      cuitDigits: cuitDigits(company.cuit!),
      privateKeyEncrypted,
      csrPem: generated.csrPem,
      actorUserId,
    });
    return this.getDashboard(input.environment);
  }

  async getCsrPem(environment: ArcaEnvironment): Promise<string> {
    const row = await this.repository.findCredential(environment);
    if (!row?.csr_pem) {
      throw ApiErrors.notFound(
        "Access Request not found. Generate keys first.",
      );
    }
    return row.csr_pem;
  }

  async uploadCertificate(
    environment: ArcaEnvironment,
    file: Express.Multer.File | undefined,
    actorUserId: number | null,
  ): Promise<UploadCertificateResult> {
    if (!file) {
      throw ApiErrors.validationFailed("Certificate file is required.", [
        { field: "file", issue: "required" },
      ]);
    }
    try {
      assertCertificateUploadSize(file.size);
    } catch {
      throw ApiErrors.validationFailed(
        "Certificate file must be at most 100 KB.",
        [{ field: "file", issue: "max_size" }],
      );
    }

    const row = await this.repository.findCredential(environment);
    const status = this.statusFromRow(row);
    assertOrApi(() => assertArcaActionAllowed(status, "upload_certificate"));

    let certPem: string;
    try {
      certPem = normalizeCertificatePem(file.buffer);
      const probe = runCertificateValidation({
        certPem,
        privateKeyPem: null,
        cuit: row?.cuit ? formatCuit(row.cuit) : "20-00000000-0",
        environment,
      });
      if (!probe.facts.parsedOk) {
        throw new Error("parse");
      }
    } catch {
      throw ApiErrors.validationFailed(
        "This file doesn't look like a valid certificate.",
        [{ field: "file", issue: "invalid_certificate" }],
      );
    }

    const certificateEncrypted = encryptSecret(certPem, this.cryptoMaterial());
    await this.repository.storeCertificate({
      environment,
      certificateEncrypted,
      actorUserId,
    });
    const dashboard = await this.getDashboard(environment);
    return {
      ok: true,
      message: "Certificate uploaded.",
      status: dashboard.status,
    };
  }

  async validateCertificate(
    environment: ArcaEnvironment,
    actorUserId: number | null,
  ): Promise<ValidateCertificateResult> {
    const row = await this.repository.findCredential(environment);
    const status = this.statusFromRow(row);
    assertOrApi(() => assertArcaActionAllowed(status, "validate_certificate"));
    if (!row?.certificate_encrypted || !row.private_key_encrypted) {
      throw ApiErrors.notFound("Certificate or key missing.");
    }

    const certPem = decryptSecret(row.certificate_encrypted, () =>
      this.cryptoMaterial(),
    );
    const privateKeyPem = decryptSecret(row.private_key_encrypted, () =>
      this.cryptoMaterial(),
    );
    const company = await this.getCompanyProfile();
    const cuit = company.cuit ?? formatCuit(row.cuit);
    const { checks, ok, facts } = runCertificateValidation({
      certPem,
      privateKeyPem,
      cuit,
      environment,
    });

    if (ok && facts.fingerprintSha256 && facts.notAfter) {
      await this.repository.markValidated({
        environment,
        fingerprint: facts.fingerprintSha256,
        validUntil: facts.notAfter,
        actorUserId,
      });
    }

    return {
      ok,
      checks,
      fingerprint: facts.fingerprintSha256,
      valid_until: facts.parsedOk ? facts.notAfter.toISOString() : null,
    };
  }

  async testConnection(
    environment: ArcaEnvironment,
    actorUserId: number | null,
  ): Promise<ConnectionTestResult> {
    if (await this.isSimulationModeEnabled()) {
      const steps = [
        { id: "WSAA_OK" as const, passed: true, message: "Simulated WSAA OK" },
        {
          id: "LOGIN_TICKET" as const,
          passed: true,
          message: "Simulated login ticket",
        },
        {
          id: "WSFE_CONNECTED" as const,
          passed: true,
          message: "Simulated WSFE connected",
        },
        {
          id: "AUTH_SUCCESS" as const,
          passed: true,
          message: "Simulated authentication successful",
        },
      ];
      const row = await this.repository.findCredential(environment);
      if (row) {
        await this.repository.markConnectionResult({
          environment,
          status: "CONNECTED",
          error: null,
          authenticated: true,
          actorUserId,
        });
      }
      return {
        ok: true,
        steps,
        last_voucher_number: 1,
        connection_status: "CONNECTED",
      };
    }

    const row = await this.repository.findCredential(environment);
    const status = this.statusFromRow(row);
    assertOrApi(() => assertArcaActionAllowed(status, "test_connection"));
    if (!row?.certificate_encrypted || !row.private_key_encrypted) {
      throw ApiErrors.notFound("Validated certificate required.");
    }

    const company = await this.getCompanyProfile();
    const certPem = decryptSecret(row.certificate_encrypted, () =>
      this.cryptoMaterial(),
    );
    const privateKeyPem = decryptSecret(row.private_key_encrypted, () =>
      this.cryptoMaterial(),
    );

    const result = await this.connection.testConnection({
      environment,
      certPem,
      privateKeyPem,
      cuit: formatCuit(row.cuit),
      pointOfSale: company.point_of_sale,
    });

    await this.repository.markConnectionResult({
      environment,
      status: result.ok ? "CONNECTED" : "FAILED",
      error: result.ok
        ? null
        : (result.steps.find((step) => !step.passed)?.message ??
          "Authentication failed."),
      authenticated: result.ok,
      actorUserId,
    });

    return {
      ok: result.ok,
      steps: result.steps,
      last_voucher_number: result.lastVoucherNumber,
      connection_status: result.ok ? "CONNECTED" : "FAILED",
    };
  }

  /**
   * Authorize a WSFE voucher with the effective ARCA environment
   * (respects Testing Mode). Requires CONNECTED credentials unless simulation.
   */
  async createElectronicVoucher(input: {
    voucher: BuiltArcaVoucher;
    actorUserId: number | null;
    /**
     * Simulation only: unique local voucher number. Callers must allocate
     * sequentially so `uq_invoice_arca_voucher` is not violated when many
     * invoices are authorized under simulation mode.
     */
    simulatedCbteNro?: number;
  }): Promise<{
    result: ArcaCreateVoucherResult;
    environment: ArcaEnvironment;
    company: ArcaCompanyProfile;
    issuerCuitDigits: string;
  }> {
    const testingMode = await this.isTestingModeEnabled();
    const preferred: ArcaEnvironment = testingMode
      ? "HOMOLOGATION"
      : "PRODUCTION";
    const environment = effectiveArcaEnvironment(preferred, testingMode);
    const company = await this.getCompanyProfile();

    if (await this.isSimulationModeEnabled()) {
      const simulated = buildSimulatedArcaCae(
        new Date(),
        input.simulatedCbteNro ?? 1,
      );
      const issuerCuitDigits = company.cuit
        ? cuitDigits(company.cuit)
        : "20000000001";
      return {
        result: simulated,
        environment,
        company,
        issuerCuitDigits,
      };
    }

    const row = await this.repository.findCredential(environment);
    const status = this.statusFromRow(row);
    if (status !== "CONNECTED") {
      throw mapDomainError(DomainErrors.arcaNotConnected());
    }
    if (!row?.certificate_encrypted || !row.private_key_encrypted) {
      throw ApiErrors.notFound("Validated certificate required.");
    }

    const issuerCuitDigits = cuitDigits(formatCuit(row.cuit));
    const certPem = decryptSecret(row.certificate_encrypted, () =>
      this.cryptoMaterial(),
    );
    const privateKeyPem = decryptSecret(row.private_key_encrypted, () =>
      this.cryptoMaterial(),
    );

    try {
      const result = await this.connection.createNextVoucher({
        environment,
        certPem,
        privateKeyPem,
        cuit: formatCuit(row.cuit),
        voucher: {
          ...input.voucher,
          PtoVta: company.point_of_sale,
        },
      });
      await this.repository.markConnectionResult({
        environment,
        status: "CONNECTED",
        error: null,
        authenticated: true,
        actorUserId: input.actorUserId,
      });
      return { result, environment, company, issuerCuitDigits };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "ARCA authorization failed";
      await this.repository.markConnectionResult({
        environment,
        status: "FAILED",
        error: message,
        authenticated: false,
        actorUserId: input.actorUserId,
      });
      throw mapDomainError(DomainErrors.arcaAuthorizationFailed(message));
    }
  }

  async deleteCertificate(
    input: DeleteArcaCertificateInput,
    actorUserId: number | null,
  ): Promise<ArcaDashboard> {
    const row = await this.repository.findCredential(input.environment);
    const status = this.statusFromRow(row);
    assertOrApi(() => assertArcaActionAllowed(status, "delete_certificate"));
    // Reason is required by schema; keep for audit trail via soft-delete actor.
    void input.reason;
    await this.repository.softDelete({
      environment: input.environment,
      actorUserId,
    });
    return this.getDashboard(input.environment);
  }

  private statusFromRow(row: ArcaCredentialRow | null) {
    return deriveArcaStatus(this.factsFromRow(row));
  }

  private factsFromRow(row: ArcaCredentialRow | null) {
    return {
      hasPrivateKey: Boolean(row?.private_key_encrypted),
      hasCsr: Boolean(row?.csr_pem),
      hasCertificate: Boolean(row?.certificate_encrypted),
      isValidated: Boolean(row?.last_validation && row.certificate_fingerprint),
      validUntil: row?.valid_until ?? null,
      lastAuthentication: row?.last_authentication ?? null,
      connectionStatus: row?.last_connection_status ?? "NOT_CONFIGURED",
    };
  }

  private toDashboard(
    environment: ArcaEnvironment,
    row: ArcaCredentialRow | null,
    company: ArcaCompanyProfile,
    testingMode: boolean,
    simulationMode: boolean,
  ): ArcaDashboard {
    if (simulationMode) {
      const now = new Date();
      const facts = simulatedArcaCredentialFacts(now);
      return {
        environment,
        status: deriveArcaStatus(facts),
        checks: deriveArcaStatusChecks(facts),
        company,
        testing_mode: testingMode,
        simulation_mode: true,
        effective_environment: effectiveArcaEnvironment(
          environment,
          testingMode,
        ),
        certificate_fingerprint: ARCA_SIMULATION_FINGERPRINT,
        valid_until: facts.validUntil?.toISOString() ?? null,
        last_validation: now.toISOString(),
        last_authentication: now.toISOString(),
        connection_status: "CONNECTED",
        last_connection_error: null,
        last_invoice: null,
        last_cae: null,
        point_of_sale: company.point_of_sale,
      };
    }

    const facts = this.factsFromRow(row);
    return {
      environment,
      status: deriveArcaStatus(facts),
      checks: deriveArcaStatusChecks(facts),
      company,
      testing_mode: testingMode,
      simulation_mode: false,
      effective_environment: effectiveArcaEnvironment(environment, testingMode),
      certificate_fingerprint: row?.certificate_fingerprint ?? null,
      valid_until: row?.valid_until?.toISOString() ?? null,
      last_validation: row?.last_validation?.toISOString() ?? null,
      last_authentication: row?.last_authentication?.toISOString() ?? null,
      connection_status: row?.last_connection_status ?? "NOT_CONFIGURED",
      last_connection_error: row?.last_connection_error ?? null,
      last_invoice: null,
      last_cae: null,
      point_of_sale: company.point_of_sale,
    };
  }
}

/** Format 11-digit CUIT as NN-NNNNNNNN-N for schema validation helpers. */
function formatCuit(digits: string): string {
  if (/^\d{2}-\d{8}-\d$/.test(digits)) return digits;
  const clean = digits.replaceAll("-", "");
  if (clean.length !== 11) return digits;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}
