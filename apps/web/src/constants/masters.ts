/**
 * Seed owner parties from schema.sql INSERT order (identity starts at 1).
 * Replaced by GET /parties once that master-data endpoint lands.
 */
export const SEED_OWNERS = [
  { id: 1, name: "Nuestra Empresa", party_type: "SELF", basis: "OURS" },
  { id: 2, name: "Linde", party_type: "SUPPLIER", basis: "SUPPLIER" },
  { id: 3, name: "Intergas", party_type: "SUPPLIER", basis: "SUPPLIER" },
  { id: 4, name: "Nordelta", party_type: "SUPPLIER", basis: "SUPPLIER" },
  { id: 5, name: "DSJ", party_type: "SUPPLIER", basis: "SUPPLIER" },
] as const;

/** Structured nodes / hub / suppliers for stock transfers (schema.sql seed order). */
export const SEED_TRANSFER_PARTIES = [
  { id: 1, name: "Nuestra Empresa", party_type: "SELF" },
  { id: 2, name: "Linde", party_type: "SUPPLIER" },
  { id: 3, name: "Intergas", party_type: "SUPPLIER" },
  { id: 4, name: "Nordelta", party_type: "SUPPLIER" },
  { id: 5, name: "DSJ", party_type: "SUPPLIER" },
  { id: 6, name: "Ceres", party_type: "SUBDISTRIBUTOR" },
  { id: 7, name: "Pantiga", party_type: "SUBDISTRIBUTOR" },
  { id: 8, name: "Ezequiel", party_type: "SUBDISTRIBUTOR" },
  { id: 9, name: "Tito", party_type: "SUBDISTRIBUTOR" },
  { id: 10, name: "Buroni", party_type: "SUBDISTRIBUTOR" },
] as const;

export const GAS_CODES = [
  "O2",
  "O2_MED",
  "O2_LASER",
  "CO2",
  "N2",
  "AR",
  "AR_50",
  "ATAL",
  "MIX20",
  "MIX22",
  "MAPAX30",
  "ACET",
  "HELIUM",
  "THERMOLENE",
] as const;
