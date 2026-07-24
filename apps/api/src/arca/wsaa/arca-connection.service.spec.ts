import type { Mock } from "vitest";
vi.mock("@arcasdk/core", () => ({
  Arca: vi.fn().mockImplementation(() => ({
    electronicBillingService: {
      getSalesPoints: vi.fn(),
      getLastVoucher: vi.fn(),
      createNextVoucher: vi.fn(),
    },
  })),
  MemoryTicketStorage: vi.fn(),
}));

import { Arca } from "@arcasdk/core";
import { ArcaConnectionService } from "./arca-connection.service";

type MockedElectronicBillingService = {
  getSalesPoints: Mock;
  getLastVoucher: Mock;
  createNextVoucher: Mock;
};

function latestBillingService(): MockedElectronicBillingService {
  const mockedArca = Arca as unknown as Mock;
  const instance = mockedArca.mock.results.at(-1)?.value as {
    electronicBillingService: MockedElectronicBillingService;
  };
  return instance.electronicBillingService;
}

describe("ArcaConnectionService", () => {
  const service = new ArcaConnectionService();
  const baseInput = {
    environment: "HOMOLOGATION" as const,
    certPem: "cert-pem",
    privateKeyPem: "key-pem",
    cuit: "20-30405060-7",
    pointOfSale: 3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("testConnection", () => {
    it("passes every step and returns the last voucher number on success", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn().mockResolvedValue([{ id: 1 }]),
          getLastVoucher: vi.fn().mockResolvedValue({ cbteNro: 42 }),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);

      expect(result.ok).toBe(true);
      expect(result.lastVoucherNumber).toBe(42);
      expect(result.steps.every((step) => step.passed)).toBe(true);
      expect(result.steps.map((step) => step.id)).toEqual([
        "WSAA_OK",
        "LOGIN_TICKET",
        "WSFE_CONNECTED",
        "AUTH_SUCCESS",
      ]);
    });

    it("reports WSFE_CONNECTED failed when getSalesPoints returns nullish", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn().mockResolvedValue(null),
          getLastVoucher: vi.fn().mockResolvedValue({ cbteNro: 1 }),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.ok).toBe(false);
      expect(
        result.steps.find((step) => step.id === "WSFE_CONNECTED")?.passed,
      ).toBe(false);
    });

    it("returns a friendly certificate error when WSAA fails on certificate issues", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi
            .fn()
            .mockRejectedValue(new Error("Invalid CMS signature")),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.ok).toBe(false);
      expect(result.steps[0]?.message).toBe("Certificate invalid.");
      expect(result.lastVoucherNumber).toBeNull();
    });

    it("returns a friendly unauthorized error", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi
            .fn()
            .mockRejectedValue(new Error("Service not authorized for CUIT")),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.steps[0]?.message).toBe(
        "Service not authorized for this CUIT.",
      );
    });

    it("returns a friendly network error", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi
            .fn()
            .mockRejectedValue(new Error("ENOTFOUND wsaa")),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.steps[0]?.message).toBe("Connection error.");
    });

    it("returns a generic authentication failure for unknown errors", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn().mockRejectedValue(new Error("boom")),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.steps[0]?.message).toBe("Authentication failed.");
    });

    it("marks AUTH_SUCCESS failed with a friendly message when getLastVoucher fails", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn().mockResolvedValue([{ id: 1 }]),
          getLastVoucher: vi.fn().mockRejectedValue(new Error("timeout")),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.ok).toBe(false);
      expect(
        result.steps.find((step) => step.id === "AUTH_SUCCESS")?.message,
      ).toBe("Connection error.");
    });

    it("handles a non-Error rejection", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn().mockRejectedValue("plain-string-error"),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn(),
        },
      }));

      const result = await service.testConnection(baseInput);
      expect(result.ok).toBe(false);
    });
  });

  describe("createNextVoucher", () => {
    const voucher = {
      CantReg: 1,
      CbteTipo: 6,
      PtoVta: 3,
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

    it("returns cae and cbteNro from CbteDesde when present", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: "12345678901234",
            caeFchVto: "20260201",
            response: {
              FeDetResp: {
                FECAEDetResponse: [{ CbteDesde: 11 }],
              },
            },
          }),
        },
      }));

      const result = await service.createNextVoucher({
        ...baseInput,
        voucher,
      });

      expect(result).toEqual({
        cae: "12345678901234",
        caeFchVto: "20260201",
        cbteNro: 11,
      });
      expect(latestBillingService().getLastVoucher).not.toHaveBeenCalled();
    });

    it("falls back to getLastVoucher when CbteDesde is missing", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn().mockResolvedValue({ cbteNro: 77 }),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: "12345678901234",
            caeFchVto: "20260201",
            response: {},
          }),
        },
      }));

      const result = await service.createNextVoucher({
        ...baseInput,
        voucher,
      });

      expect(result.cbteNro).toBe(77);
      expect(latestBillingService().getLastVoucher).toHaveBeenCalledWith(
        voucher.PtoVta,
        voucher.CbteTipo,
      );
    });

    it("returns null cbteNro when both CbteDesde and getLastVoucher are unavailable", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn().mockResolvedValue(null),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: "12345678901234",
            caeFchVto: "20260201",
            response: {},
          }),
        },
      }));

      const result = await service.createNextVoucher({
        ...baseInput,
        voucher,
      });
      expect(result.cbteNro).toBeNull();
    });

    it("throws with the ARCA Errors message when there is no cae", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: null,
            response: {
              Errors: { Err: [{ Msg: "CUIT not authorized" }] },
            },
          }),
        },
      }));

      await expect(
        service.createNextVoucher({ ...baseInput, voucher }),
      ).rejects.toThrow("CUIT not authorized");
    });

    it("throws with the Observaciones message when there are no top-level Errors", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: null,
            response: {
              FeDetResp: {
                FECAEDetResponse: [
                  { Observaciones: { Obs: [{ Msg: "Invalid amount" }] } },
                ],
              },
            },
          }),
        },
      }));

      await expect(
        service.createNextVoucher({ ...baseInput, voucher }),
      ).rejects.toThrow("Invalid amount");
    });

    it("throws a generic message when no error detail is available", async () => {
      (Arca as unknown as Mock).mockImplementationOnce(() => ({
        electronicBillingService: {
          getSalesPoints: vi.fn(),
          getLastVoucher: vi.fn(),
          createNextVoucher: vi.fn().mockResolvedValue({
            cae: null,
            response: {},
          }),
        },
      }));

      await expect(
        service.createNextVoucher({ ...baseInput, voucher }),
      ).rejects.toThrow("ARCA did not return a CAE");
    });
  });
});
