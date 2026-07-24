import { Injectable } from "@nestjs/common";
import { Arca, MemoryTicketStorage } from "@arcasdk/core";
import {
  arcaSdkProductionFlag,
  cuitAsNumber,
  type BuiltArcaVoucher,
} from "@weld/domain";
import type { ArcaEnvironment, ArcaConnectionStep } from "@weld/schemas";

export interface ArcaConnectionProbeResult {
  ok: boolean;
  steps: ArcaConnectionStep[];
  lastVoucherNumber: number | null;
}

export interface ArcaCreateVoucherResult {
  cae: string;
  caeFchVto: string;
  cbteNro: number | null;
}

/**
 * WSAA + WSFE connectivity via @arcasdk/core (R-5 / R-37).
 * Ticket storage is in-memory only — never on disk.
 */
@Injectable()
export class ArcaConnectionService {
  private createClient(input: {
    environment: ArcaEnvironment;
    certPem: string;
    privateKeyPem: string;
    cuit: string;
  }): Arca {
    const production = arcaSdkProductionFlag(input.environment);
    return new Arca({
      cert: input.certPem,
      key: input.privateKeyPem,
      cuit: cuitAsNumber(input.cuit),
      production,
      ticketStorage: new MemoryTicketStorage({
        cuit: cuitAsNumber(input.cuit),
        production,
      }),
    });
  }

  async testConnection(input: {
    environment: ArcaEnvironment;
    certPem: string;
    privateKeyPem: string;
    cuit: string;
    pointOfSale: number;
    /** Voucher type for last-voucher probe (default Factura B = 6). */
    voucherType?: number;
  }): Promise<ArcaConnectionProbeResult> {
    const steps: ArcaConnectionStep[] = [];
    let lastVoucherNumber: number | null = null;

    try {
      const arca = this.createClient(input);

      // Force WSAA by calling a WSFE method that requires a ticket.
      const salesPoints = await arca.electronicBillingService.getSalesPoints();
      steps.push({
        id: "WSAA_OK",
        passed: true,
        message: "Secure login to ARCA succeeded.",
      });
      steps.push({
        id: "LOGIN_TICKET",
        passed: true,
        message: "Access ticket generated.",
      });

      const connected = salesPoints != null;
      steps.push({
        id: "WSFE_CONNECTED",
        passed: connected,
        message: connected
          ? "Electronic invoicing service reached."
          : "Electronic invoicing service did not respond.",
      });

      const voucherType = input.voucherType ?? 6;
      const last = await arca.electronicBillingService.getLastVoucher(
        input.pointOfSale,
        voucherType,
      );
      lastVoucherNumber =
        typeof last?.cbteNro === "number" ? last.cbteNro : null;

      steps.push({
        id: "AUTH_SUCCESS",
        passed: true,
        message: "Authentication successful.",
      });

      return {
        ok: steps.every((step) => step.passed),
        steps,
        lastVoucherNumber,
      };
    } catch (error) {
      const message = friendlyArcaError(error);
      if (steps.length === 0) {
        steps.push({
          id: "WSAA_OK",
          passed: false,
          message,
        });
        steps.push({
          id: "LOGIN_TICKET",
          passed: false,
          message: "Access ticket was not generated.",
        });
        steps.push({
          id: "WSFE_CONNECTED",
          passed: false,
          message: "Electronic invoicing service not reached.",
        });
        steps.push({
          id: "AUTH_SUCCESS",
          passed: false,
          message: "Authentication failed.",
        });
      } else if (!steps.some((step) => step.id === "AUTH_SUCCESS")) {
        steps.push({
          id: "AUTH_SUCCESS",
          passed: false,
          message,
        });
      }
      return { ok: false, steps, lastVoucherNumber: null };
    }
  }

  async createNextVoucher(input: {
    environment: ArcaEnvironment;
    certPem: string;
    privateKeyPem: string;
    cuit: string;
    voucher: BuiltArcaVoucher;
  }): Promise<ArcaCreateVoucherResult> {
    const arca = this.createClient(input);
    const result = await arca.electronicBillingService.createNextVoucher(
      input.voucher,
    );
    if (!result.cae) {
      throw new Error(
        extractArcaRejectMessage(result) ?? "ARCA did not return a CAE",
      );
    }
    const det = result.response?.FeDetResp?.FECAEDetResponse?.[0];
    let cbteNro = typeof det?.CbteDesde === "number" ? det.CbteDesde : null;
    if (cbteNro == null) {
      const last = await arca.electronicBillingService.getLastVoucher(
        input.voucher.PtoVta,
        input.voucher.CbteTipo,
      );
      cbteNro = typeof last?.cbteNro === "number" ? last.cbteNro : null;
    }
    return {
      cae: result.cae,
      caeFchVto: result.caeFchVto,
      cbteNro,
    };
  }
}

function friendlyArcaError(error: unknown): string {
  const raw =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = raw.toLowerCase();
  if (
    lower.includes("cert") ||
    lower.includes("cms") ||
    lower.includes("x509")
  ) {
    return "Certificate invalid.";
  }
  if (
    lower.includes("not authorized") ||
    lower.includes("no autorizado") ||
    lower.includes("unauthorized")
  ) {
    return "Service not authorized for this CUIT.";
  }
  if (
    lower.includes("enotfound") ||
    lower.includes("timeout") ||
    lower.includes("econn") ||
    lower.includes("network")
  ) {
    return "Connection error.";
  }
  return "Authentication failed.";
}

function extractArcaRejectMessage(result: {
  response?: {
    Errors?: { Err?: Array<{ Msg?: string }> };
    FeDetResp?: {
      FECAEDetResponse?: Array<{
        Observaciones?: { Obs?: Array<{ Msg?: string }> };
      }>;
    };
  };
}): string | null {
  const err = result.response?.Errors?.Err?.[0]?.Msg;
  if (err) return err;
  const obs =
    result.response?.FeDetResp?.FECAEDetResponse?.[0]?.Observaciones?.Obs?.[0]
      ?.Msg;
  return obs ?? null;
}
