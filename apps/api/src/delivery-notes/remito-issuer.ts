/**
 * Issuer snapshot for remito PDFs (docs/specs/remitos.md §15.1).
 * Mirrors public company facts until a Branch/Company aggregate exists.
 */
export const REMITO_ISSUER = {
  legalName: "Service Weld S.R.L.",
  cuit: "30-71552577-8",
  address: "Acceso Juan XXIII 274, Chacabuco, Buenos Aires",
  phone: "02352 54-3810",
  email: "mymgases@hotmail.com",
  iibb: null as string | null,
  legalLegend:
    "Documento no fiscal. Comprobante de remito / entrega. Conserve este ejemplar.",
} as const;

export type RemitoIssuer = typeof REMITO_ISSUER;
