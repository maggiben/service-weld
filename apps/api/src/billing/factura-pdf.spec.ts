import { buildFacturaPdf } from "./factura-pdf";

describe("buildFacturaPdf", () => {
  it("renders a Factura B PDF with CAE footer", async () => {
    const result = await buildFacturaPdf({
      issuer: {
        legalName: "Service Weld S.R.L.",
        cuit: "30-71552577-8",
        address: "Chacabuco",
        ivaConditionLabel: "IVA Responsable Inscripto",
      },
      client: {
        name: "Cliente Demo",
        cuit: "20-12345678-6",
        address: "Calle 1",
        locality: "Chacabuco",
      },
      letter: "B",
      cbteTipo: 6,
      ptoVta: 1,
      cbteNro: 42,
      cbteFch: "2026-07-24",
      periodStart: "2026-07-01",
      periodEnd: "2026-07-24",
      lines: [
        {
          description: "Alquiler O2 · 10 m³ (5 d)",
          quantity: 5,
          unit: "day",
          unit_price: 100,
          amount: 500,
        },
        {
          description: "Recarga CO2",
          quantity: 1,
          unit: "fill",
          unit_price: 210,
          amount: 210,
        },
      ],
      amounts: { impNeto: 586.78, impIva: 123.22, impTotal: 710 },
      cae: "71234567890123",
      caeDueDate: "2026-08-03",
      qrUrl: "https://www.arca.gob.ar/fe/qr/?p=eyJ2ZXIiOjF9",
      environment: "HOMOLOGATION",
      printedAt: new Date("2026-07-24T12:00:00.000Z"),
    });

    expect(result.filename).toMatch(/factura-B-/);
    expect(result.buffer.length).toBeGreaterThan(1000);
    expect(result.buffer.subarray(0, 4).toString()).toBe("%PDF");
  });
});
