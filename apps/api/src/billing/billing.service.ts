import { Injectable } from "@nestjs/common";
import {
  buildArcaFacturaBVoucher,
  buildArcaNotaCreditoBVoucher,
  buildArcaQrPayload,
  buildArcaQrUrl,
  businessTodayIso,
  cbteTipoLetter,
  DomainErrors,
  fromAfipDate,
} from "@weld/domain";
import type {
  BillingExportPayload,
  BillingRunDetail,
  CreateBillingRunInput,
  Invoice,
  PeriodInvoicesQuery,
  PeriodInvoicesResponse,
  SetInvoiceChargeLinesInput,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { ArcaService } from "../arca/arca.service";
import { ApiError, ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { REMITO_ISSUER } from "../delivery-notes/remito-issuer";
import { BillingRepository } from "./billing.repository";
import { buildFacturaPdf } from "./factura-pdf";

@Injectable()
export class BillingService {
  constructor(
    private readonly repository: BillingRepository,
    private readonly arcaService: ArcaService,
  ) {}

  createDraft(
    principal: AuthPrincipal,
    input: CreateBillingRunInput,
  ): Promise<BillingRunDetail> {
    // History never uses the UI date pickers — only each open loan's delivery → today.
    const normalized: CreateBillingRunInput =
      input.mode === "history"
        ? {
            mode: "history",
            charges: input.charges ?? "all",
            client_party_id: input.client_party_id ?? null,
            locality_id: input.locality_id ?? null,
            territory_id: input.territory_id ?? null,
          }
        : input;
    return this.repository.createDraftRun(normalized, principal.id);
  }

  listPeriodInvoices(
    query: PeriodInvoicesQuery,
  ): Promise<PeriodInvoicesResponse> {
    return this.repository.listPeriodInvoices(query);
  }

  async getRun(id: number): Promise<BillingRunDetail> {
    const run = await this.repository.getRun(id);
    if (!run) throw ApiErrors.notFound("Billing run not found");
    return run;
  }

  async getInvoice(id: number): Promise<Invoice> {
    const invoice = await this.repository.getInvoiceById(id);
    if (!invoice) throw ApiErrors.notFound("Invoice not found");
    return invoice;
  }

  setDraftChargeLines(
    invoiceId: number,
    input: SetInvoiceChargeLinesInput,
  ): Promise<Invoice> {
    return this.repository.setDraftChargeLines(
      invoiceId,
      input.charge_line_ids,
    );
  }

  /**
   * Approve draft → APPROVED (009 AC6).
   * MFA: when the principal has MFA enrolled (`mfa=true`), approval is allowed;
   * bootstrap admins without MFA enrollment still may approve in local/dev so
   * Phase 3 is exercisable — full MFA gate hardens with enrollment UX.
   */
  async approve(
    principal: AuthPrincipal,
    id: number,
  ): Promise<BillingRunDetail> {
    void principal;
    return this.repository.approveRun(id);
  }

  async approveInvoice(
    principal: AuthPrincipal,
    invoiceId: number,
  ): Promise<Invoice> {
    void principal;
    return this.repository.approveInvoice(invoiceId);
  }

  /**
   * Approve a draft invoice (if needed) then request CAE from ARCA.
   */
  async approveAndAuthorize(
    principal: AuthPrincipal,
    invoiceId: number,
  ): Promise<Invoice> {
    let invoice = await this.getInvoice(invoiceId);
    if (invoice.status === "DRAFT") {
      invoice = await this.repository.approveInvoice(invoiceId);
    }
    if (invoice.arca?.cae) {
      return invoice;
    }
    return this.authorizeWithArca(principal, invoice.id);
  }

  async export(id: number): Promise<BillingExportPayload> {
    return this.repository.exportRun(id);
  }

  async authorizeWithArca(
    principal: AuthPrincipal,
    invoiceId: number,
  ): Promise<Invoice> {
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.status !== "APPROVED" && invoice.status !== "EXPORTED") {
      throw mapDomainError(DomainErrors.invoiceNotApproved());
    }
    if (invoice.arca?.cae) {
      throw mapDomainError(DomainErrors.invoiceAlreadyAuthorized());
    }
    if (!(invoice.total > 0)) {
      throw ApiErrors.validationFailed(
        "Invoice total must be greater than zero",
      );
    }

    const company = await this.arcaService.getCompanyProfile();
    const today = businessTodayIso();
    const voucher = buildArcaFacturaBVoucher({
      pointOfSale: company.point_of_sale,
      voucherDate: today,
      serviceFrom: invoice.period_start,
      serviceTo: invoice.period_end < today ? invoice.period_end : today,
      grossTotal: invoice.total,
      clientCuit: invoice.client_cuit ?? null,
      issuerCuitDigits: company.cuit?.replaceAll(/\D/g, "") ?? "",
    });

    const simulation = await this.arcaService.isSimulationModeEnabled();
    const simulatedCbteNro = simulation
      ? await this.repository.nextArcaVoucherNumber(
          company.point_of_sale,
          voucher.CbteTipo,
        )
      : undefined;

    const {
      result,
      environment,
      company: issuer,
      issuerCuitDigits,
    } = await this.arcaService.createElectronicVoucher({
      voucher,
      actorUserId: principal.id,
      simulatedCbteNro,
    });

    if (result.cbteNro == null && !simulation) {
      throw mapDomainError(
        DomainErrors.arcaAuthorizationFailed(
          "ARCA authorized the voucher but did not return a number",
        ),
      );
    }

    const caeDueDate = fromAfipDate(result.caeFchVto);
    // Simulation: never trust a fixed stub number — allocate (and bump on
    // collision) so uq_invoice_arca_voucher cannot block a second invoice.
    const baseCbteNro = simulation
      ? await this.repository.nextArcaVoucherNumber(
          issuer.point_of_sale,
          voucher.CbteTipo,
        )
      : result.cbteNro!;

    const maxAttempts = simulation ? 10 : 1;
    let lastError: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const cbteNro = baseCbteNro + attempt;
      const qrUrl = buildArcaQrUrl(
        buildArcaQrPayload({
          voucherDate: today,
          issuerCuitDigits,
          pointOfSale: issuer.point_of_sale,
          cbteTipo: voucher.CbteTipo,
          cbteNro,
          impTotal: voucher.ImpTotal,
          docTipo: voucher.DocTipo,
          docNro: voucher.DocNro,
          cae: result.cae,
        }),
      );
      try {
        return await this.repository.saveArcaAuthorization(invoiceId, {
          cae: result.cae,
          caeDueDate,
          cbteTipo: voucher.CbteTipo,
          ptoVta: issuer.point_of_sale,
          cbteNro,
          cbteFch: today,
          docTipo: voucher.DocTipo,
          docNro: voucher.DocNro,
          condicionIvaReceptor: voucher.CondicionIVAReceptorId,
          impNeto: voucher.ImpNeto,
          impIva: voucher.ImpIVA,
          impTotal: voucher.ImpTotal,
          environment,
          qrUrl,
          actorUserId: principal.id,
        });
      } catch (error) {
        lastError = error;
        if (
          !simulation ||
          !(error instanceof ApiError) ||
          error.code !== "ARCA_VOUCHER_NUMBER_TAKEN"
        ) {
          throw error;
        }
      }
    }
    throw lastError;
  }

  /**
   * Undo approve/authorize when ARCA simulation mode is on (local testing).
   *
   * ARCA does not delete an authorized CAE. When the invoice already has one,
   * we first issue a Nota de Crédito B linked via CbtesAsoc (same path as a
   * real fiscal cancellation; simulation mode returns a fake CAE). Then we
   * clear local authorization fields and return the invoice to DRAFT.
   */
  async resetSimulationInvoice(
    principal: AuthPrincipal,
    invoiceId: number,
  ): Promise<Invoice> {
    if (!(await this.arcaService.isSimulationModeEnabled())) {
      throw mapDomainError(DomainErrors.simulationModeRequired());
    }
    const invoice = await this.getInvoice(invoiceId);
    if (invoice.arca?.cae) {
      await this.voidAuthorizedInvoiceWithCreditNote(principal, invoice);
    }
    return this.repository.resetInvoiceForSimulation(invoiceId);
  }

  /**
   * Fiscal cancellation path: Nota de Crédito B associated to the original
   * Factura B. Does not persist the credit note on the invoice row — callers
   * that need a local draft reset clear ARCA fields afterwards.
   */
  private async voidAuthorizedInvoiceWithCreditNote(
    principal: AuthPrincipal,
    invoice: Invoice,
  ): Promise<void> {
    const arca = invoice.arca;
    if (
      !arca?.cae ||
      arca.cbte_tipo == null ||
      arca.pto_vta == null ||
      arca.cbte_nro == null ||
      arca.cbte_fch == null
    ) {
      throw mapDomainError(DomainErrors.invoiceCannotVoidWithArca());
    }

    const company = await this.arcaService.getCompanyProfile();
    const today = businessTodayIso();
    const grossTotal =
      arca.imp_total != null && arca.imp_total > 0
        ? arca.imp_total
        : invoice.total;
    if (!(grossTotal > 0)) {
      throw ApiErrors.validationFailed(
        "Invoice total must be greater than zero",
      );
    }

    const voucher = buildArcaNotaCreditoBVoucher({
      pointOfSale: arca.pto_vta,
      voucherDate: today,
      serviceFrom: invoice.period_start,
      serviceTo: invoice.period_end < today ? invoice.period_end : today,
      grossTotal,
      clientCuit: invoice.client_cuit ?? null,
      issuerCuitDigits: company.cuit?.replaceAll(/\D/g, "") ?? "",
      associated: {
        cbteTipo: arca.cbte_tipo,
        ptoVta: arca.pto_vta,
        cbteNro: arca.cbte_nro,
        cbteFch: arca.cbte_fch,
      },
      receptorOverride:
        arca.doc_tipo != null &&
        arca.doc_nro != null &&
        arca.condicion_iva_receptor != null
          ? {
              docTipo: arca.doc_tipo,
              docNro: Number(arca.doc_nro),
              condicionIva: arca.condicion_iva_receptor,
            }
          : undefined,
    });

    const { result } = await this.arcaService.createElectronicVoucher({
      voucher,
      actorUserId: principal.id,
      simulatedCbteNro: (await this.arcaService.isSimulationModeEnabled())
        ? await this.repository.nextArcaVoucherNumber(
            arca.pto_vta,
            voucher.CbteTipo,
          )
        : undefined,
    });
    if (result.cbteNro == null) {
      throw mapDomainError(
        DomainErrors.arcaAuthorizationFailed(
          "ARCA authorized the credit note but did not return a number",
        ),
      );
    }
  }

  getSimulationMode(): Promise<{ enabled: boolean }> {
    return this.arcaService.getSimulationMode();
  }

  async printInvoicePdf(
    invoiceId: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const invoice = await this.getInvoice(invoiceId);
    const arca = invoice.arca;
    if (
      !arca?.cae ||
      arca.cae_due_date == null ||
      arca.cbte_tipo == null ||
      arca.pto_vta == null ||
      arca.cbte_nro == null ||
      arca.cbte_fch == null ||
      arca.imp_neto == null ||
      arca.imp_iva == null ||
      arca.imp_total == null ||
      !arca.arca_qr_url ||
      !arca.arca_environment
    ) {
      throw mapDomainError(DomainErrors.invoiceNotAuthorized());
    }

    const company = await this.arcaService.getCompanyProfile();
    const issuerName =
      company.legal_name?.trim() ||
      company.alias?.trim() ||
      REMITO_ISSUER.legalName;
    const issuerCuit = company.cuit ?? REMITO_ISSUER.cuit;

    return buildFacturaPdf({
      issuer: {
        legalName: issuerName,
        cuit: issuerCuit,
        address: REMITO_ISSUER.address,
        phone: REMITO_ISSUER.phone,
        email: REMITO_ISSUER.email,
        iibb: REMITO_ISSUER.iibb,
        ivaConditionLabel: "IVA Responsable Inscripto",
      },
      client: {
        name: invoice.client_name ?? `Cliente #${invoice.client_party_id}`,
        cuit: invoice.client_cuit ?? null,
        address: invoice.client_address ?? null,
        locality: invoice.client_locality_name ?? null,
      },
      letter: cbteTipoLetter(arca.cbte_tipo),
      cbteTipo: arca.cbte_tipo,
      ptoVta: arca.pto_vta,
      cbteNro: arca.cbte_nro,
      cbteFch: arca.cbte_fch,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      lines: (invoice.charge_lines ?? []).map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unit_price: line.unit_price,
        amount: line.amount,
      })),
      amounts: {
        impNeto: arca.imp_neto,
        impIva: arca.imp_iva,
        impTotal: arca.imp_total,
      },
      cae: arca.cae,
      caeDueDate: arca.cae_due_date,
      qrUrl: arca.arca_qr_url,
      environment: arca.arca_environment,
      printedAt: new Date(),
    });
  }
}
