import { principal } from "../test-utils/fixtures";
import { ApiError } from "../common/errors/api-error";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  const repository = {
    createDraftRun: vi.fn(),
    listPeriodInvoices: vi.fn(),
    getRun: vi.fn(),
    getInvoiceById: vi.fn(),
    setDraftChargeLines: vi.fn(),
    approveRun: vi.fn(),
    approveInvoice: vi.fn(),
    exportRun: vi.fn(),
    saveArcaAuthorization: vi.fn(),
    resetInvoiceForSimulation: vi.fn(),
    nextArcaVoucherNumber: vi.fn(),
  };
  const arcaService = {
    getCompanyProfile: vi.fn(),
    createElectronicVoucher: vi.fn(),
    isSimulationModeEnabled: vi.fn(),
    getSimulationMode: vi.fn(),
  };
  const service = new BillingService(repository as never, arcaService as never);

  beforeEach(() => {
    vi.clearAllMocks();
    arcaService.isSimulationModeEnabled.mockResolvedValue(false);
  });

  it("normalizes history mode drafts", async () => {
    repository.createDraftRun.mockResolvedValue({ id: 1 });
    const user = principal();
    await service.createDraft(user, {
      mode: "history",
      client_party_id: undefined,
    } as never);
    expect(repository.createDraftRun).toHaveBeenCalledWith(
      {
        mode: "history",
        charges: "all",
        client_party_id: null,
        locality_id: null,
        territory_id: null,
      },
      user.id,
    );

    await service.createDraft(user, {
      mode: "history",
      charges: "sales",
      client_party_id: 9,
    } as never);
    expect(repository.createDraftRun).toHaveBeenLastCalledWith(
      {
        mode: "history",
        charges: "sales",
        client_party_id: 9,
        locality_id: null,
        territory_id: null,
      },
      user.id,
    );

    await service.createDraft(user, {
      mode: "period",
      period_start: "2026-01-01",
      period_end: "2026-01-31",
    } as never);
    expect(repository.createDraftRun).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "period" }),
      user.id,
    );
  });

  it("lists period invoices", async () => {
    repository.listPeriodInvoices.mockResolvedValue({
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      locked: true,
      invoices: [],
    });
    await expect(
      service.listPeriodInvoices({
        period_start: "2026-07-01",
        period_end: "2026-07-31",
        client_party_id: 1973,
      }),
    ).resolves.toMatchObject({ locked: true });
    expect(repository.listPeriodInvoices).toHaveBeenCalledWith({
      period_start: "2026-07-01",
      period_end: "2026-07-31",
      client_party_id: 1973,
    });
  });

  it("sets draft charge lines", async () => {
    repository.setDraftChargeLines.mockResolvedValue({
      id: 9,
      total: 21000,
      charge_lines: [{ id: 2 }],
    });
    await expect(
      service.setDraftChargeLines(9, { charge_line_ids: [2] }),
    ).resolves.toMatchObject({ total: 21000 });
    expect(repository.setDraftChargeLines).toHaveBeenCalledWith(9, [2]);
  });

  it("gets, approves, and exports runs", async () => {
    repository.getRun.mockResolvedValue(null);
    await expect(service.getRun(1)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    repository.getRun.mockResolvedValue({ id: 1 });
    expect(await service.getRun(1)).toEqual({ id: 1 });

    repository.approveRun.mockResolvedValue({ id: 1, status: "APPROVED" });
    await expect(service.approve(principal(), 1)).resolves.toMatchObject({
      status: "APPROVED",
    });

    repository.exportRun.mockResolvedValue({ invoices: [] });
    await expect(service.export(1)).resolves.toEqual({ invoices: [] });
  });

  it("rejects authorize when invoice is not approved", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 9,
      status: "DRAFT",
      total: 100,
      arca: { cae: null },
    });
    await expect(
      service.authorizeWithArca(principal(), 9),
    ).rejects.toMatchObject({ code: "INVOICE_NOT_APPROVED" });
  });

  it("approves a single draft before authorize via issue", async () => {
    repository.getInvoiceById
      .mockResolvedValueOnce({
        id: 9,
        status: "DRAFT",
        total: 121,
        period_start: "2026-07-01",
        period_end: "2026-07-24",
        client_cuit: null,
        arca: { cae: null },
      })
      .mockResolvedValue({
        id: 9,
        status: "APPROVED",
        total: 121,
        period_start: "2026-07-01",
        period_end: "2026-07-24",
        client_cuit: null,
        arca: { cae: null },
      });
    repository.approveInvoice.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      total: 121,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: null,
      arca: { cae: null },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 1,
    });
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: {
        cae: "71234567890123",
        caeFchVto: "20260803",
        cbteNro: 10,
      },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 1,
      },
      issuerCuitDigits: "30715525778",
    });
    repository.saveArcaAuthorization.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      arca: { cae: "71234567890123" },
    });

    await expect(
      service.approveAndAuthorize(principal(), 9),
    ).resolves.toMatchObject({
      arca: { cae: "71234567890123" },
    });
    expect(repository.approveInvoice).toHaveBeenCalledWith(9);
  });

  it("rejects PDF when CAE is missing", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      total: 100,
      arca: { cae: null },
    });
    await expect(service.printInvoicePdf(9)).rejects.toMatchObject({
      code: "INVOICE_NOT_AUTHORIZED",
    });
  });

  it("authorizes an approved invoice with ARCA (happy path)", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 12,
      status: "APPROVED",
      total: 605,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: null,
      arca: { cae: null },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 2,
    });
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: { cae: "71234567890123", caeFchVto: "20260803", cbteNro: 15 },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 2,
      },
      issuerCuitDigits: "30715525778",
    });
    repository.saveArcaAuthorization.mockResolvedValue({
      id: 12,
      status: "APPROVED",
      arca: { cae: "71234567890123" },
    });

    await expect(
      service.authorizeWithArca(principal(), 12),
    ).resolves.toMatchObject({ arca: { cae: "71234567890123" } });
    expect(repository.saveArcaAuthorization).toHaveBeenCalledWith(
      12,
      expect.objectContaining({
        cae: "71234567890123",
        ptoVta: 2,
        cbteNro: 15,
      }),
    );
    expect(repository.nextArcaVoucherNumber).not.toHaveBeenCalled();
    expect(arcaService.createElectronicVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ simulatedCbteNro: undefined }),
    );
  });

  it("allocates the next local voucher number in ARCA simulation mode", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 22,
      status: "APPROVED",
      total: 100,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: null,
      arca: { cae: null },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 1,
    });
    arcaService.isSimulationModeEnabled.mockResolvedValue(true);
    repository.nextArcaVoucherNumber
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(3);
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: { cae: "74111111111114", caeFchVto: "20260803", cbteNro: 3 },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 1,
      },
      issuerCuitDigits: "30715525778",
    });
    repository.saveArcaAuthorization.mockResolvedValue({
      id: 22,
      status: "APPROVED",
      arca: { cae: "74111111111114", cbte_nro: 3 },
    });

    await expect(
      service.authorizeWithArca(principal(), 22),
    ).resolves.toMatchObject({ arca: { cae: "74111111111114" } });
    expect(repository.nextArcaVoucherNumber).toHaveBeenCalledWith(1, 6);
    expect(arcaService.createElectronicVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ simulatedCbteNro: 3 }),
    );
    expect(repository.saveArcaAuthorization).toHaveBeenCalledWith(
      22,
      expect.objectContaining({ cbteNro: 3 }),
    );
  });

  it("retries the next voucher number when simulation hits a collision", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 23,
      status: "APPROVED",
      total: 100,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: null,
      arca: { cae: null },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 1,
    });
    arcaService.isSimulationModeEnabled.mockResolvedValue(true);
    repository.nextArcaVoucherNumber.mockResolvedValue(1);
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: { cae: "74111111111114", caeFchVto: "20260803", cbteNro: 1 },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 1,
      },
      issuerCuitDigits: "30715525778",
    });
    repository.saveArcaAuthorization
      .mockRejectedValueOnce(
        new ApiError(
          "ARCA_VOUCHER_NUMBER_TAKEN",
          "That ARCA voucher number is already used by another invoice",
          409,
        ),
      )
      .mockResolvedValueOnce({
        id: 23,
        status: "APPROVED",
        arca: { cae: "74111111111114", cbte_nro: 2 },
      });

    await expect(
      service.authorizeWithArca(principal(), 23),
    ).resolves.toMatchObject({ arca: { cbte_nro: 2 } });
    expect(repository.saveArcaAuthorization).toHaveBeenNthCalledWith(
      1,
      23,
      expect.objectContaining({ cbteNro: 1 }),
    );
    expect(repository.saveArcaAuthorization).toHaveBeenNthCalledWith(
      2,
      23,
      expect.objectContaining({ cbteNro: 2 }),
    );
  });

  it("rejects authorize when the invoice is already authorized", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 13,
      status: "APPROVED",
      total: 100,
      arca: { cae: "already-authorized" },
    });
    await expect(
      service.authorizeWithArca(principal(), 13),
    ).rejects.toMatchObject({ code: "INVOICE_ALREADY_AUTHORIZED" });
    expect(arcaService.createElectronicVoucher).not.toHaveBeenCalled();
  });

  it("rejects authorize when the invoice total is zero", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 14,
      status: "APPROVED",
      total: 0,
      arca: { cae: null },
    });
    await expect(
      service.authorizeWithArca(principal(), 14),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("throws ARCA_AUTHORIZATION_FAILED when ARCA does not return a voucher number", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 15,
      status: "APPROVED",
      total: 100,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: null,
      arca: { cae: null },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 1,
    });
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: { cae: "71234567890123", caeFchVto: "20260803", cbteNro: null },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 1,
      },
      issuerCuitDigits: "30715525778",
    });
    await expect(
      service.authorizeWithArca(principal(), 15),
    ).rejects.toMatchObject({ code: "ARCA_AUTHORIZATION_FAILED" });
  });

  it("prints an authorized invoice as a PDF", async () => {
    repository.getInvoiceById.mockResolvedValue({
      id: 16,
      status: "APPROVED",
      total: 605,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_name: "Cliente Demo",
      client_party_id: 3,
      client_cuit: "20-12345678-6",
      client_address: "Calle 1",
      client_locality_name: "Chacabuco",
      charge_lines: [
        {
          description: "Alquiler O2",
          quantity: 5,
          unit: "day",
          unit_price: 100,
          amount: 500,
        },
      ],
      arca: {
        cae: "71234567890123",
        cae_due_date: "2026-08-03",
        cbte_tipo: 6,
        pto_vta: 1,
        cbte_nro: 42,
        cbte_fch: "2026-07-24",
        imp_neto: 500,
        imp_iva: 105,
        imp_total: 605,
        arca_qr_url: "https://www.arca.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9",
        arca_environment: "HOMOLOGATION",
      },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld SRL",
      alias: null,
      point_of_sale: 1,
    });

    const result = await service.printInvoicePdf(16);
    expect(result.filename).toMatch(/factura-B-/);
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("rejects simulation reset when simulation mode is off", async () => {
    arcaService.isSimulationModeEnabled.mockResolvedValue(false);
    await expect(
      service.resetSimulationInvoice(principal(), 9),
    ).rejects.toMatchObject({ code: "SIMULATION_MODE_REQUIRED" });
    expect(repository.resetInvoiceForSimulation).not.toHaveBeenCalled();
  });

  it("resets approved invoice without CAE when simulation mode is on", async () => {
    arcaService.isSimulationModeEnabled.mockResolvedValue(true);
    repository.getInvoiceById.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      total: 100,
      arca: { cae: null },
    });
    repository.resetInvoiceForSimulation.mockResolvedValue({
      id: 9,
      status: "DRAFT",
      arca: { cae: null },
    });
    await expect(
      service.resetSimulationInvoice(principal(), 9),
    ).resolves.toMatchObject({ status: "DRAFT" });
    expect(arcaService.createElectronicVoucher).not.toHaveBeenCalled();
    expect(repository.resetInvoiceForSimulation).toHaveBeenCalledWith(9);
  });

  it("issues Nota de Crédito then resets when invoice has CAE", async () => {
    arcaService.isSimulationModeEnabled.mockResolvedValue(true);
    repository.getInvoiceById.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      total: 1210,
      period_start: "2026-07-01",
      period_end: "2026-07-24",
      client_cuit: "20-12345678-9",
      arca: {
        cae: "71234567890123",
        cae_due_date: "2026-08-03",
        cbte_tipo: 6,
        pto_vta: 1,
        cbte_nro: 42,
        cbte_fch: "2026-07-24",
        doc_tipo: 80,
        doc_nro: 20123456789,
        condicion_iva_receptor: 6,
        imp_total: 1210,
      },
    });
    arcaService.getCompanyProfile.mockResolvedValue({
      cuit: "30-71552577-8",
      legal_name: "Weld",
      alias: null,
      point_of_sale: 1,
    });
    arcaService.createElectronicVoucher.mockResolvedValue({
      result: { cae: "79999999999999", caeFchVto: "20260810", cbteNro: 3 },
      environment: "HOMOLOGATION",
      company: {
        cuit: "30-71552577-8",
        legal_name: "Weld",
        alias: null,
        point_of_sale: 1,
      },
      issuerCuitDigits: "30715525778",
    });
    repository.resetInvoiceForSimulation.mockResolvedValue({
      id: 9,
      status: "DRAFT",
      arca: { cae: null },
    });

    await expect(
      service.resetSimulationInvoice(principal(), 9),
    ).resolves.toMatchObject({ status: "DRAFT" });

    expect(arcaService.createElectronicVoucher).toHaveBeenCalledWith(
      expect.objectContaining({
        voucher: expect.objectContaining({
          CbteTipo: 8,
          CbtesAsoc: [
            expect.objectContaining({
              Tipo: 6,
              PtoVta: 1,
              Nro: 42,
            }),
          ],
        }),
      }),
    );
    expect(repository.resetInvoiceForSimulation).toHaveBeenCalledWith(9);
  });

  it("rejects void when CAE voucher fields are incomplete", async () => {
    arcaService.isSimulationModeEnabled.mockResolvedValue(true);
    repository.getInvoiceById.mockResolvedValue({
      id: 9,
      status: "APPROVED",
      total: 100,
      arca: { cae: "71234567890123", cbte_tipo: 6, pto_vta: null, cbte_nro: 1 },
    });
    await expect(
      service.resetSimulationInvoice(principal(), 9),
    ).rejects.toMatchObject({ code: "INVOICE_CANNOT_VOID_WITH_ARCA" });
    expect(repository.resetInvoiceForSimulation).not.toHaveBeenCalled();
  });

  it("proxies billing simulation mode from ARCA", async () => {
    arcaService.getSimulationMode.mockResolvedValue({ enabled: true });
    await expect(service.getSimulationMode()).resolves.toEqual({
      enabled: true,
    });
  });
});
