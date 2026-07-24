import assert from "node:assert/strict";
import {
  AFIP_QR_BASE_URL,
  CBTE_TIPO_NOTA_CREDITO_B,
  buildArcaFacturaBVoucher,
  buildArcaNotaCreditoBVoucher,
  buildArcaQrPayload,
  buildArcaQrUrl,
  cbteTipoLetter,
  formatCbteNumber,
  fromAfipDate,
  resolveReceptorDocument,
  splitIvaIncluido,
  toAfipDate,
} from "./arca-invoice.js";

describe("arca-invoice", () => {
  it("splits IVA-incluido amounts at 21%", () => {
    const amounts = splitIvaIncluido(121);
    assert.equal(amounts.impNeto, 100);
    assert.equal(amounts.impIva, 21);
    assert.equal(amounts.impTotal, 121);
  });

  it("resolves CUIT receptor vs sin identificar", () => {
    const withCuit = resolveReceptorDocument("30-71552577-8");
    assert.equal(withCuit.docTipo, 80);
    assert.equal(withCuit.docNro, 30715525778);

    const anon = resolveReceptorDocument(null);
    assert.equal(anon.docTipo, 99);
    assert.equal(anon.docNro, 0);
  });

  it("builds Factura B voucher with service dates", () => {
    const voucher = buildArcaFacturaBVoucher({
      pointOfSale: 1,
      voucherDate: "2026-07-24",
      serviceFrom: "2026-07-01",
      serviceTo: "2026-07-24",
      grossTotal: 1210,
      clientCuit: "20-12345678-9",
      issuerCuitDigits: "30715525778",
    });
    assert.equal(voucher.CbteTipo, 6);
    assert.equal(voucher.Concepto, 2);
    assert.equal(voucher.CbteFch, "20260724");
    assert.equal(voucher.ImpTotal, 1210);
    assert.equal(voucher.Iva?.[0]?.Id, 5);
  });

  it("rejects zero totals", () => {
    assert.throws(() =>
      buildArcaFacturaBVoucher({
        pointOfSale: 1,
        voucherDate: "2026-07-24",
        serviceFrom: "2026-07-01",
        serviceTo: "2026-07-24",
        grossTotal: 0,
        clientCuit: null,
        issuerCuitDigits: "30715525778",
      }),
    );
  });

  it("builds Nota de Crédito B linked to the original Factura B", () => {
    const voucher = buildArcaNotaCreditoBVoucher({
      pointOfSale: 1,
      voucherDate: "2026-07-25",
      serviceFrom: "2026-07-01",
      serviceTo: "2026-07-24",
      grossTotal: 1210,
      clientCuit: "20-12345678-9",
      issuerCuitDigits: "30-71552577-8",
      associated: {
        cbteTipo: 6,
        ptoVta: 1,
        cbteNro: 42,
        cbteFch: "2026-07-24",
      },
      receptorOverride: {
        docTipo: 80,
        docNro: 20123456789,
        condicionIva: 6,
      },
    });
    assert.equal(voucher.CbteTipo, CBTE_TIPO_NOTA_CREDITO_B);
    assert.equal(voucher.DocTipo, 80);
    assert.equal(voucher.DocNro, 20123456789);
    assert.deepEqual(voucher.CbtesAsoc, [
      {
        Tipo: 6,
        PtoVta: 1,
        Nro: 42,
        Cuit: "30715525778",
        CbteFch: "20260724",
      },
    ]);
  });

  it("builds AFIP QR URL with base64 payload", () => {
    const payload = buildArcaQrPayload({
      voucherDate: "2026-07-24",
      issuerCuitDigits: "30715525778",
      pointOfSale: 3,
      cbteTipo: 6,
      cbteNro: 42,
      impTotal: 1500.5,
      docTipo: 80,
      docNro: 20123456789,
      cae: "71234567890123",
    });
    const url = buildArcaQrUrl(payload);
    assert.ok(url.startsWith(`${AFIP_QR_BASE_URL}?p=`));
    const encoded = url.slice(`${AFIP_QR_BASE_URL}?p=`.length);
    const decoded = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    assert.equal(decoded.ver, 1);
    assert.equal(decoded.nroCmp, 42);
    assert.equal(decoded.tipoCodAut, "E");
  });

  it("formats voucher helpers", () => {
    assert.equal(toAfipDate("2026-07-24"), "20260724");
    assert.equal(fromAfipDate("20260724"), "2026-07-24");
    assert.equal(formatCbteNumber(1, 42), "00001-00000042");
    assert.equal(cbteTipoLetter(6), "B");
    assert.equal(cbteTipoLetter(1), "A");
    assert.equal(cbteTipoLetter(11), "C");
  });
});
