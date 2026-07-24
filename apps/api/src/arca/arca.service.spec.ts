import type { Mock } from "vitest";
import { randomBytes } from "node:crypto";
import {
  encryptSecret,
  parseEncryptionKeyFromEnv,
} from "./crypto/secret-crypto";
import type { ArcaCredentialRow } from "./storage/arca.repository";

vi.mock("./csr/generate-csr", () => ({
  generateArcaKeyAndCsr: vi.fn().mockResolvedValue({
    privateKeyPem:
      "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----\n",
    csrPem:
      "-----BEGIN CERTIFICATE REQUEST-----\nY\n-----END CERTIFICATE REQUEST-----\n",
  }),
}));
vi.mock("./certificate/certificate-parse", () => ({
  assertCertificateUploadSize: vi.fn(),
  normalizeCertificatePem: vi
    .fn()
    .mockReturnValue(
      "-----BEGIN CERTIFICATE-----\nZ\n-----END CERTIFICATE-----\n",
    ),
  runCertificateValidation: vi.fn(),
}));

import { generateArcaKeyAndCsr } from "./csr/generate-csr";
import {
  assertCertificateUploadSize,
  normalizeCertificatePem,
  runCertificateValidation,
} from "./certificate/certificate-parse";
import { ArcaService } from "./arca.service";

const keyB64 = randomBytes(32).toString("base64");
const cryptoMaterial = parseEncryptionKeyFromEnv(keyB64);

function credentialRow(
  overrides: Partial<ArcaCredentialRow> = {},
): ArcaCredentialRow {
  return {
    id: 1,
    company_id: 1,
    environment: "HOMOLOGATION",
    cuit: "30715525778",
    certificate_encrypted: null,
    private_key_encrypted: null,
    csr_pem: null,
    certificate_fingerprint: null,
    valid_until: null,
    last_validation: null,
    last_authentication: null,
    last_connection_status: "NOT_CONFIGURED",
    last_connection_error: null,
    version: 1,
    ...overrides,
  };
}

describe("ArcaService", () => {
  const repository = {
    findCredential: vi.fn(),
    getSetting: vi.fn(),
    setSetting: vi.fn(),
    softDeleteAllEnvironments: vi.fn(),
    upsertKeys: vi.fn(),
    storeCertificate: vi.fn(),
    markValidated: vi.fn(),
    markConnectionResult: vi.fn(),
    softDelete: vi.fn(),
  };
  const connection = {
    testConnection: vi.fn(),
    createNextVoucher: vi.fn(),
  };
  const config = {
    get: vi.fn().mockReturnValue(keyB64),
  };

  function createService(): ArcaService {
    return new ArcaService(
      repository as never,
      connection as never,
      config as never,
    );
  }

  let service: ArcaService;

  beforeEach(() => {
    vi.clearAllMocks();
    config.get.mockReturnValue(keyB64);
    repository.getSetting.mockImplementation((key: string) =>
      Promise.resolve(key === "arca_simulation_mode" ? "false" : null),
    );
    repository.findCredential.mockResolvedValue(null);
    (assertCertificateUploadSize as Mock).mockReset();
    (runCertificateValidation as Mock).mockReset();
    (normalizeCertificatePem as Mock)
      .mockReset()
      .mockReturnValue(
        "-----BEGIN CERTIFICATE-----\nZ\n-----END CERTIFICATE-----\n",
      );
    (generateArcaKeyAndCsr as Mock).mockReset().mockResolvedValue({
      privateKeyPem:
        "-----BEGIN PRIVATE KEY-----\nX\n-----END PRIVATE KEY-----\n",
      csrPem:
        "-----BEGIN CERTIFICATE REQUEST-----\nY\n-----END CERTIFICATE REQUEST-----\n",
    });
    service = createService();
  });

  describe("getCompanyProfile / getDashboard", () => {
    it("returns null cuit and defaults when settings are empty", async () => {
      const profile = await service.getCompanyProfile();
      expect(profile).toEqual({
        cuit: null,
        legal_name: null,
        alias: null,
        point_of_sale: 1,
      });
    });

    it("returns a valid cuit and trimmed fields when set", async () => {
      repository.getSetting.mockImplementation((key: string) => {
        if (key === "arca_company_cuit")
          return Promise.resolve("30-71552577-8");
        if (key === "arca_company_legal_name")
          return Promise.resolve("  Weld SRL  ");
        if (key === "arca_company_alias") return Promise.resolve("  Weld  ");
        if (key === "arca_point_of_sale") return Promise.resolve("4");
        return Promise.resolve(null);
      });
      const profile = await service.getCompanyProfile();
      expect(profile).toEqual({
        cuit: "30-71552577-8",
        legal_name: "Weld SRL",
        alias: "Weld",
        point_of_sale: 4,
      });
    });

    it("treats an invalid cuit as absent", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_company_cuit"
          ? Promise.resolve("not-a-cuit")
          : Promise.resolve(null),
      );
      const profile = await service.getCompanyProfile();
      expect(profile.cuit).toBeNull();
    });

    it("falls back to point_of_sale 1 for an invalid stored value", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_point_of_sale"
          ? Promise.resolve("not-a-number")
          : Promise.resolve(null),
      );
      const profile = await service.getCompanyProfile();
      expect(profile.point_of_sale).toBe(1);
    });

    it("builds a dashboard combining credential, company, and mode settings", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ last_connection_status: "CONNECTED" }),
      );
      repository.getSetting.mockImplementation((key: string) => {
        if (key === "arca_simulation_mode") return Promise.resolve("false");
        if (key === "arca_testing_mode") return Promise.resolve("false");
        return Promise.resolve(null);
      });
      const dashboard = await service.getDashboard("HOMOLOGATION");
      expect(dashboard.environment).toBe("HOMOLOGATION");
      expect(dashboard.testing_mode).toBe(false);
      expect(dashboard.simulation_mode).toBe(false);
      expect(dashboard.connection_status).toBe("CONNECTED");
    });

    it("returns a simulated dashboard when simulation mode is enabled", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_simulation_mode"
          ? Promise.resolve("true")
          : Promise.resolve(null),
      );
      const dashboard = await service.getDashboard("PRODUCTION");
      expect(dashboard.simulation_mode).toBe(true);
      expect(dashboard.connection_status).toBe("CONNECTED");
      expect(dashboard.certificate_fingerprint).toBe("SIMULATION");
    });
  });

  describe("updateCompanyProfile", () => {
    it("sets provided fields", async () => {
      repository.getSetting.mockResolvedValue(null);
      await service.updateCompanyProfile({
        legal_name: "Weld SRL",
        alias: "Weld",
        point_of_sale: 2,
      });
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_company_legal_name",
        "Weld SRL",
      );
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_company_alias",
        "Weld",
      );
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_point_of_sale",
        "2",
      );
    });

    it("wipes all environments when cuit is cleared", async () => {
      let stored = "30-71552577-8";
      repository.getSetting.mockImplementation((key: string) =>
        Promise.resolve(key === "arca_company_cuit" ? stored : null),
      );
      repository.setSetting.mockImplementation((key: string, value: string) => {
        if (key === "arca_company_cuit") stored = value;
        return Promise.resolve();
      });
      await service.updateCompanyProfile({ cuit: null }, 5);
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_company_cuit",
        "",
      );
      expect(repository.softDeleteAllEnvironments).toHaveBeenCalledWith({
        actorUserId: 5,
      });
    });

    it("wipes all environments when cuit changes", async () => {
      let stored = "30-71552577-8";
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_company_cuit"
          ? Promise.resolve(stored)
          : Promise.resolve(null),
      );
      repository.setSetting.mockImplementation((key: string, value: string) => {
        if (key === "arca_company_cuit") stored = value;
        return Promise.resolve();
      });
      await service.updateCompanyProfile({ cuit: "20-12345678-6" }, 9);
      expect(repository.softDeleteAllEnvironments).toHaveBeenCalledWith({
        actorUserId: 9,
      });
    });

    it("does not wipe when cuit is unchanged", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_company_cuit"
          ? Promise.resolve("30-71552577-8")
          : Promise.resolve(null),
      );
      await service.updateCompanyProfile({ legal_name: "Weld" });
      expect(repository.softDeleteAllEnvironments).not.toHaveBeenCalled();
    });
  });

  describe("testing mode", () => {
    it("defaults to enabled when unset", async () => {
      await expect(service.isTestingModeEnabled()).resolves.toBe(true);
      await expect(service.getTestingMode()).resolves.toEqual({
        enabled: true,
      });
    });

    it("enables testing mode without confirmation", async () => {
      const result = await service.updateTestingMode({ enabled: true });
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_testing_mode",
        "true",
      );
      expect(result).toEqual({ enabled: true });
    });

    it("rejects disabling without confirm_go_live", async () => {
      await expect(
        service.updateTestingMode({ enabled: false }),
      ).rejects.toMatchObject({ code: "ARCA_GO_LIVE_REQUIRES_CONFIRM" });
    });

    it("rejects disabling when production is not CONNECTED", async () => {
      repository.findCredential.mockResolvedValue(null);
      await expect(
        service.updateTestingMode({ enabled: false, confirm_go_live: true }),
      ).rejects.toMatchObject({ code: "ARCA_GO_LIVE_REQUIRES_PRODUCTION" });
    });

    it("disables testing mode when production is CONNECTED", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({
          environment: "PRODUCTION",
          last_connection_status: "CONNECTED",
          last_validation: new Date(),
          certificate_fingerprint: "abc",
          last_authentication: new Date(),
          private_key_encrypted: "v1:default:iv:tag:ct",
          certificate_encrypted: "v1:default:iv:tag:ct",
        }),
      );
      repository.getSetting.mockImplementation((key: string) =>
        Promise.resolve(
          key === "arca_testing_mode"
            ? "false"
            : key === "arca_simulation_mode"
              ? "false"
              : null,
        ),
      );
      const result = await service.updateTestingMode({
        enabled: false,
        confirm_go_live: true,
      });
      expect(repository.setSetting).toHaveBeenCalledWith(
        "arca_testing_mode",
        "false",
      );
      expect(result).toEqual({ enabled: false });
    });
  });

  describe("generateKeys", () => {
    it("generates and stores a new key/CSR pair", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_company_cuit"
          ? Promise.resolve("30-71552577-8")
          : Promise.resolve(null),
      );
      repository.findCredential.mockResolvedValue(null);
      repository.upsertKeys.mockResolvedValue(credentialRow());

      await service.generateKeys({ environment: "HOMOLOGATION" }, 7);

      expect(generateArcaKeyAndCsr).toHaveBeenCalledWith(
        expect.objectContaining({ cuit: "30-71552577-8" }),
      );
      expect(repository.upsertKeys).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "HOMOLOGATION",
          cuitDigits: "30715525778",
          actorUserId: 7,
        }),
      );
    });

    it("rejects when the company has no cuit", async () => {
      repository.getSetting.mockResolvedValue(null);
      await expect(
        service.generateKeys({ environment: "HOMOLOGATION" }, null),
      ).rejects.toMatchObject({ code: "ARCA_CUIT_REQUIRED" });
      expect(generateArcaKeyAndCsr).not.toHaveBeenCalled();
    });

    it("requires confirmation to regenerate over an existing certificate", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_company_cuit"
          ? Promise.resolve("30-71552577-8")
          : Promise.resolve(null),
      );
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: "v1:default:iv:tag:ct",
          certificate_encrypted: "v1:default:iv:tag:ct",
          certificate_fingerprint: "abc",
          last_validation: new Date(),
        }),
      );
      await expect(
        service.generateKeys(
          { environment: "HOMOLOGATION", confirm_regenerate: false },
          null,
        ),
      ).rejects.toMatchObject({ code: "ARCA_REGENERATE_REQUIRES_CONFIRM" });
    });
  });

  describe("getCsrPem", () => {
    it("throws NOT_FOUND when there is no csr", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ csr_pem: null }),
      );
      await expect(service.getCsrPem("HOMOLOGATION")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("returns the stored csr", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ csr_pem: "-----BEGIN CERTIFICATE REQUEST-----\nY\n" }),
      );
      await expect(service.getCsrPem("HOMOLOGATION")).resolves.toContain(
        "BEGIN CERTIFICATE REQUEST",
      );
    });
  });

  describe("uploadCertificate", () => {
    const file = {
      size: 1024,
      buffer: Buffer.from("cert-bytes"),
    } as Express.Multer.File;

    it("requires a file", async () => {
      await expect(
        service.uploadCertificate("HOMOLOGATION", undefined, null),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("rejects files that exceed the size limit", async () => {
      (assertCertificateUploadSize as Mock).mockImplementation(() => {
        throw new Error("too big");
      });
      repository.findCredential.mockResolvedValue(
        credentialRow({ private_key_encrypted: "v1:default:iv:tag:ct" }),
      );
      await expect(
        service.uploadCertificate("HOMOLOGATION", file, null),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("rejects an action that is illegal for NOT_STARTED status", async () => {
      repository.findCredential.mockResolvedValue(null);
      await expect(
        service.uploadCertificate("HOMOLOGATION", file, null),
      ).rejects.toMatchObject({ code: "ILLEGAL_STATE_TRANSITION" });
    });

    it("rejects a file that fails certificate parsing", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ private_key_encrypted: "v1:default:iv:tag:ct" }),
      );
      (runCertificateValidation as Mock).mockReturnValue({
        checks: [],
        ok: false,
        facts: { parsedOk: false },
      });
      await expect(
        service.uploadCertificate("HOMOLOGATION", file, null),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    });

    it("stores a certificate that parses successfully", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ private_key_encrypted: "v1:default:iv:tag:ct" }),
      );
      (runCertificateValidation as Mock).mockReturnValue({
        checks: [],
        ok: true,
        facts: { parsedOk: true },
      });
      repository.storeCertificate.mockResolvedValue(
        credentialRow({ private_key_encrypted: "v1:default:iv:tag:ct" }),
      );

      const result = await service.uploadCertificate("HOMOLOGATION", file, 3);

      expect(normalizeCertificatePem).toHaveBeenCalledWith(file.buffer);
      expect(repository.storeCertificate).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "HOMOLOGATION",
          actorUserId: 3,
        }),
      );
      expect(result).toEqual(
        expect.objectContaining({ ok: true, message: "Certificate uploaded." }),
      );
    });
  });

  describe("validateCertificate", () => {
    it("throws NOT_FOUND when the certificate is missing", async () => {
      // Previously validated (action allowed) but the certificate was wiped.
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: "v1:default:iv:tag:ct",
          certificate_encrypted: null,
          certificate_fingerprint: "abc",
          last_validation: new Date(),
        }),
      );
      await expect(
        service.validateCertificate("HOMOLOGATION", null),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("marks the credential validated on success", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
        }),
      );
      const validUntil = new Date("2030-01-01T00:00:00.000Z");
      (runCertificateValidation as Mock).mockReturnValue({
        checks: [{ id: "VALID_X509", passed: true, message: "ok" }],
        ok: true,
        facts: {
          parsedOk: true,
          fingerprintSha256: "abc123",
          notAfter: validUntil,
        },
      });

      const result = await service.validateCertificate("HOMOLOGATION", 4);

      expect(repository.markValidated).toHaveBeenCalledWith(
        expect.objectContaining({
          environment: "HOMOLOGATION",
          fingerprint: "abc123",
          validUntil,
          actorUserId: 4,
        }),
      );
      expect(result.ok).toBe(true);
      expect(result.valid_until).toBe(validUntil.toISOString());
    });

    it("does not mark validated when the certificate fails checks", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
        }),
      );
      (runCertificateValidation as Mock).mockReturnValue({
        checks: [{ id: "VALID_X509", passed: false, message: "bad" }],
        ok: false,
        facts: { parsedOk: false, fingerprintSha256: null, notAfter: null },
      });

      const result = await service.validateCertificate("HOMOLOGATION", null);
      expect(repository.markValidated).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      expect(result.valid_until).toBeNull();
    });
  });

  describe("testConnection", () => {
    it("short-circuits successfully when simulation mode is enabled", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_simulation_mode"
          ? Promise.resolve("true")
          : Promise.resolve(null),
      );
      repository.findCredential.mockResolvedValue(credentialRow());

      const result = await service.testConnection("HOMOLOGATION", 1);

      expect(result.ok).toBe(true);
      expect(result.connection_status).toBe("CONNECTED");
      expect(repository.markConnectionResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "CONNECTED" }),
      );
      expect(connection.testConnection).not.toHaveBeenCalled();
    });

    it("marks CONNECTED on a successful live probe", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
          last_connection_status: "VALIDATED" as never,
          certificate_fingerprint: "abc",
          last_validation: new Date(),
        }),
      );
      connection.testConnection.mockResolvedValue({
        ok: true,
        steps: [{ id: "WSAA_OK", passed: true, message: "ok" }],
        lastVoucherNumber: 5,
      });

      const result = await service.testConnection("HOMOLOGATION", 2);

      expect(result.ok).toBe(true);
      expect(result.connection_status).toBe("CONNECTED");
      expect(repository.markConnectionResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "CONNECTED", authenticated: true }),
      );
    });

    it("marks FAILED and surfaces the first failing step message", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
          certificate_fingerprint: "abc",
          last_validation: new Date(),
        }),
      );
      connection.testConnection.mockResolvedValue({
        ok: false,
        steps: [
          { id: "WSAA_OK", passed: false, message: "Certificate invalid." },
        ],
        lastVoucherNumber: null,
      });

      const result = await service.testConnection("HOMOLOGATION", null);

      expect(result.ok).toBe(false);
      expect(result.connection_status).toBe("FAILED");
      expect(repository.markConnectionResult).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "FAILED",
          error: "Certificate invalid.",
        }),
      );
    });

    it("rejects test_connection for an illegal status", async () => {
      repository.findCredential.mockResolvedValue(null);
      await expect(
        service.testConnection("HOMOLOGATION", null),
      ).rejects.toMatchObject({ code: "ILLEGAL_STATE_TRANSITION" });
    });
  });

  describe("createElectronicVoucher", () => {
    const voucher = {
      CantReg: 1,
      CbteTipo: 6,
      PtoVta: 1,
      Concepto: 2,
      DocTipo: 99,
      DocNro: 0,
      CbteFch: "20260101",
      ImpTotal: 100,
      ImpTotConc: 0,
      ImpNeto: 100,
      ImpOpEx: 0,
      ImpIVA: 0,
      ImpTrib: 0,
      MonId: "PES",
      MonCotiz: 1,
      CondicionIVAReceptorId: 5,
      FchServDesde: "20260101",
      FchServHasta: "20260101",
      FchVtoPago: "20260101",
      Iva: [],
    };

    it("returns a simulated CAE when simulation mode is enabled", async () => {
      repository.getSetting.mockImplementation((key: string) =>
        key === "arca_simulation_mode"
          ? Promise.resolve("true")
          : Promise.resolve(null),
      );
      const result = await service.createElectronicVoucher({
        voucher,
        actorUserId: 1,
      });
      expect(result.result.cae).toBeDefined();
      expect(connection.createNextVoucher).not.toHaveBeenCalled();
    });

    it("rejects when credentials are not CONNECTED", async () => {
      repository.findCredential.mockResolvedValue(null);
      await expect(
        service.createElectronicVoucher({ voucher, actorUserId: 1 }),
      ).rejects.toMatchObject({ code: "ARCA_NOT_CONNECTED" });
    });

    it("authorizes a voucher and marks the credential CONNECTED", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          environment: "HOMOLOGATION",
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
          certificate_fingerprint: "abc",
          last_validation: new Date(),
          last_connection_status: "CONNECTED",
          last_authentication: new Date(),
        }),
      );
      connection.createNextVoucher.mockResolvedValue({
        cae: "12345678901234",
        caeFchVto: "20260201",
        cbteNro: 10,
      });

      const result = await service.createElectronicVoucher({
        voucher,
        actorUserId: 6,
      });

      expect(result.result.cae).toBe("12345678901234");
      expect(repository.markConnectionResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "CONNECTED", authenticated: true }),
      );
    });

    it("marks FAILED and rethrows a domain error when authorization throws", async () => {
      const certPem = encryptSecret("cert-pem", cryptoMaterial);
      const privateKeyPem = encryptSecret("key-pem", cryptoMaterial);
      repository.findCredential.mockResolvedValue(
        credentialRow({
          environment: "HOMOLOGATION",
          private_key_encrypted: privateKeyPem,
          certificate_encrypted: certPem,
          certificate_fingerprint: "abc",
          last_validation: new Date(),
          last_connection_status: "CONNECTED",
          last_authentication: new Date(),
        }),
      );
      connection.createNextVoucher.mockRejectedValue(
        new Error("ARCA rejected voucher"),
      );

      await expect(
        service.createElectronicVoucher({ voucher, actorUserId: 6 }),
      ).rejects.toMatchObject({ code: "ARCA_AUTHORIZATION_FAILED" });
      expect(repository.markConnectionResult).toHaveBeenCalledWith(
        expect.objectContaining({ status: "FAILED", authenticated: false }),
      );
    });
  });

  describe("deleteCertificate", () => {
    it("rejects when there is nothing configured", async () => {
      repository.findCredential.mockResolvedValue(null);
      await expect(
        service.deleteCertificate(
          { environment: "HOMOLOGATION", reason: "cleanup" },
          1,
        ),
      ).rejects.toMatchObject({ code: "ILLEGAL_STATE_TRANSITION" });
    });

    it("soft-deletes an existing credential", async () => {
      repository.findCredential.mockResolvedValue(
        credentialRow({ private_key_encrypted: "v1:default:iv:tag:ct" }),
      );
      await service.deleteCertificate(
        { environment: "HOMOLOGATION", reason: "cleanup" },
        1,
      );
      expect(repository.softDelete).toHaveBeenCalledWith({
        environment: "HOMOLOGATION",
        actorUserId: 1,
      });
    });
  });
});
