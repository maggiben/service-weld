/**
 * ARCA / AFIP electronic invoice helpers (WSFE Factura B + RG 4291 QR).
 * Charge-line amounts are treated as IVA-incluido (gross) for Factura B.
 */

/** Factura B (servicios / productos a consumidor final / monotributo). */
export const CBTE_TIPO_FACTURA_B = 6;
/**
 * Nota de Crédito B — ARCA/AFIP has no true void for an authorized CAE;
 * fiscal cancellation is a credit note linked via CbtesAsoc.
 */
export const CBTE_TIPO_NOTA_CREDITO_B = 8;

/** CUIT. */
export const DOC_TIPO_CUIT = 80;
/** Consumidor final sin identificar. */
export const DOC_TIPO_SIN_IDENTIFICAR = 99;

/** Condición IVA receptor: Consumidor Final. */
export const CONDICION_IVA_CONSUMIDOR_FINAL = 5;
/** Condición IVA receptor: Responsable Monotributo. */
export const CONDICION_IVA_MONOTRIBUTO = 6;

/** Alícuota IVA 21% (Id AFIP = 5). */
export const IVA_ALICUOTA_21_ID = 5;
export const IVA_RATE_21 = 0.21;

export const AFIP_QR_BASE_URL = "https://www.arca.gob.ar/fe/qr/";

export interface ArcaFiscalAmounts {
  /** Net without IVA. */
  impNeto: number;
  /** IVA amount. */
  impIva: number;
  /** Gross total (IVA incluido). */
  impTotal: number;
}

export interface ArcaQrPayload {
  ver: 1;
  fecha: string;
  cuit: number;
  ptoVta: number;
  tipoCmp: number;
  nroCmp: number;
  importe: number;
  moneda: "PES";
  ctz: number;
  tipoDocRec: number;
  nroDocRec: number;
  tipoCodAut: "E";
  codAut: number;
}

export interface BuildArcaVoucherInput {
  pointOfSale: number;
  /** ISO date YYYY-MM-DD. */
  voucherDate: string;
  /** Service period start/end (Concepto 2 servicios). */
  serviceFrom: string;
  serviceTo: string;
  /** Gross total (IVA incluido). */
  grossTotal: number;
  /** Client CUIT with or without dashes; null → sin identificar. */
  clientCuit: string | null;
  /** Issuer CUIT digits (11). */
  issuerCuitDigits: string;
}

export interface ArcaAssociatedVoucher {
  Tipo: number;
  PtoVta: number;
  Nro: number;
  /** Issuer CUIT digits (11). */
  Cuit: string;
  /** Original voucher date as YYYYMMDD (optional for WSFE). */
  CbteFch?: string;
}

export interface BuiltArcaVoucher {
  CantReg: number;
  PtoVta: number;
  CbteTipo: number;
  Concepto: number;
  DocTipo: number;
  DocNro: number;
  CbteFch: string;
  ImpTotal: number;
  ImpTotConc: number;
  ImpNeto: number;
  ImpOpEx: number;
  ImpIVA: number;
  ImpTrib: number;
  FchServDesde: string;
  FchServHasta: string;
  FchVtoPago: string;
  MonId: string;
  MonCotiz: number;
  CondicionIVAReceptorId: number;
  Iva: Array<{ Id: number; BaseImp: number; Importe: number }>;
  /** Required for Nota de Crédito / Débito linked to a prior voucher. */
  CbtesAsoc?: ArcaAssociatedVoucher[];
}

export interface BuildArcaCreditNoteInput extends BuildArcaVoucherInput {
  /** Original authorized voucher to cancel fiscally. */
  associated: {
    cbteTipo: number;
    ptoVta: number;
    cbteNro: number;
    /** ISO date YYYY-MM-DD of the original voucher. */
    cbteFch: string;
  };
  /**
   * Prefer receptor fields from the original authorization when present so the
   * credit note mirrors the Factura B that ARCA already has on file.
   */
  receptorOverride?: {
    docTipo: number;
    docNro: number;
    condicionIva: number;
  };
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Split IVA-incluido gross into net + IVA at 21%. */
export function splitIvaIncluido(
  grossTotal: number,
  rate: number = IVA_RATE_21,
): ArcaFiscalAmounts {
  const gross = roundMoney(Math.max(0, grossTotal));
  if (gross === 0) {
    return { impNeto: 0, impIva: 0, impTotal: 0 };
  }
  const impNeto = roundMoney(gross / (1 + rate));
  const impIva = roundMoney(gross - impNeto);
  return { impNeto, impIva, impTotal: gross };
}

/** YYYY-MM-DD → YYYYMMDD for WSFE. */
export function toAfipDate(isoDate: string): string {
  return isoDate.replaceAll("-", "").slice(0, 8);
}

/** YYYYMMDD or ISO → YYYY-MM-DD. */
export function fromAfipDate(value: string): string {
  const digits = value.replaceAll("-", "").slice(0, 8);
  if (digits.length !== 8) return value.slice(0, 10);
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

export function resolveReceptorDocument(clientCuit: string | null): {
  docTipo: number;
  docNro: number;
  condicionIva: number;
} {
  const digits = (clientCuit ?? "").replaceAll(/\D/g, "");
  if (digits.length === 11) {
    return {
      docTipo: DOC_TIPO_CUIT,
      docNro: Number(digits),
      condicionIva: CONDICION_IVA_MONOTRIBUTO,
    };
  }
  return {
    docTipo: DOC_TIPO_SIN_IDENTIFICAR,
    docNro: 0,
    condicionIva: CONDICION_IVA_CONSUMIDOR_FINAL,
  };
}

export function buildArcaFacturaBVoucher(
  input: BuildArcaVoucherInput,
): BuiltArcaVoucher {
  if (input.grossTotal <= 0) {
    throw new Error("Invoice total must be greater than zero");
  }
  const amounts = splitIvaIncluido(input.grossTotal);
  const receptor = resolveReceptorDocument(input.clientCuit);
  const cbteFch = toAfipDate(input.voucherDate);
  return {
    CantReg: 1,
    PtoVta: input.pointOfSale,
    CbteTipo: CBTE_TIPO_FACTURA_B,
    Concepto: 2, // Servicios
    DocTipo: receptor.docTipo,
    DocNro: receptor.docNro,
    CbteFch: cbteFch,
    ImpTotal: amounts.impTotal,
    ImpTotConc: 0,
    ImpNeto: amounts.impNeto,
    ImpOpEx: 0,
    ImpIVA: amounts.impIva,
    ImpTrib: 0,
    FchServDesde: toAfipDate(input.serviceFrom),
    FchServHasta: toAfipDate(input.serviceTo),
    FchVtoPago: cbteFch,
    MonId: "PES",
    MonCotiz: 1,
    CondicionIVAReceptorId: receptor.condicionIva,
    Iva: [
      {
        Id: IVA_ALICUOTA_21_ID,
        BaseImp: amounts.impNeto,
        Importe: amounts.impIva,
      },
    ],
  };
}

/**
 * Build a Nota de Crédito B that fiscally cancels an authorized Factura B.
 * ARCA does not delete CAEs; the credit note is the supported cancellation path.
 */
export function buildArcaNotaCreditoBVoucher(
  input: BuildArcaCreditNoteInput,
): BuiltArcaVoucher {
  const base = buildArcaFacturaBVoucher(input);
  const issuerCuit = input.issuerCuitDigits.replaceAll(/\D/g, "");
  const voucher: BuiltArcaVoucher = {
    ...base,
    CbteTipo: CBTE_TIPO_NOTA_CREDITO_B,
    CbtesAsoc: [
      {
        Tipo: input.associated.cbteTipo,
        PtoVta: input.associated.ptoVta,
        Nro: input.associated.cbteNro,
        Cuit: issuerCuit,
        CbteFch: toAfipDate(input.associated.cbteFch),
      },
    ],
  };
  if (input.receptorOverride) {
    voucher.DocTipo = input.receptorOverride.docTipo;
    voucher.DocNro = input.receptorOverride.docNro;
    voucher.CondicionIVAReceptorId = input.receptorOverride.condicionIva;
  }
  return voucher;
}

export function buildArcaQrUrl(payload: ArcaQrPayload): string {
  const json = JSON.stringify(payload);
  const base64 = encodeAsciiBase64(json);
  return `${AFIP_QR_BASE_URL}?p=${base64}`;
}

/** AFIP QR JSON is ASCII-only; avoid Buffer / btoa for domain portability. */
function encodeAsciiBase64(text: string): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  let index = 0;
  while (index < text.length) {
    const byte1 = text.charCodeAt(index++);
    const byte2 = index < text.length ? text.charCodeAt(index++) : NaN;
    const byte3 = index < text.length ? text.charCodeAt(index++) : NaN;
    const enc1 = byte1 >> 2;
    const enc2 = ((byte1 & 3) << 4) | (Number.isNaN(byte2) ? 0 : byte2 >> 4);
    const enc3 = Number.isNaN(byte2)
      ? 64
      : ((byte2 & 15) << 2) | (Number.isNaN(byte3) ? 0 : byte3 >> 6);
    const enc4 = Number.isNaN(byte3) ? 64 : byte3 & 63;
    output +=
      alphabet.charAt(enc1) +
      alphabet.charAt(enc2) +
      (enc3 === 64 ? "=" : alphabet.charAt(enc3)) +
      (enc4 === 64 ? "=" : alphabet.charAt(enc4));
  }
  return output;
}

export function buildArcaQrPayload(input: {
  voucherDate: string;
  issuerCuitDigits: string;
  pointOfSale: number;
  cbteTipo: number;
  cbteNro: number;
  impTotal: number;
  docTipo: number;
  docNro: number;
  cae: string;
}): ArcaQrPayload {
  return {
    ver: 1,
    fecha: input.voucherDate.slice(0, 10),
    cuit: Number(input.issuerCuitDigits.replaceAll(/\D/g, "")),
    ptoVta: input.pointOfSale,
    tipoCmp: input.cbteTipo,
    nroCmp: input.cbteNro,
    importe: roundMoney(input.impTotal),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: input.docTipo,
    nroDocRec: input.docNro,
    tipoCodAut: "E",
    codAut: Number(input.cae),
  };
}

export function formatCbteNumber(ptoVta: number, cbteNro: number): string {
  return `${String(ptoVta).padStart(5, "0")}-${String(cbteNro).padStart(8, "0")}`;
}

export function cbteTipoLetter(cbteTipo: number): string {
  if (cbteTipo === 1 || cbteTipo === 2 || cbteTipo === 3) return "A";
  if (cbteTipo === 6 || cbteTipo === 7 || cbteTipo === 8) return "B";
  if (cbteTipo === 11 || cbteTipo === 12 || cbteTipo === 13) return "C";
  return String(cbteTipo);
}
