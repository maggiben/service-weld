/**
 * @weld/schemas — shared Zod schemas.
 * Single source of truth for API request/response validation (nestjs-zod)
 * and frontend form resolvers (react-hook-form). See specs 004 / 006 / 002.
 *
 * Phase 0 ships the cross-cutting primitives and controlled vocabularies.
 * Entity schemas (Client, Cylinder, MovementEvent, …) are added per-endpoint
 * starting in Phase 1.
 */
export * from "./common";
export * from "./enums";
export * from "./cuit";
export * from "./client";
export * from "./cylinder";
export * from "./movement";
export * from "./rental-rate";
export * from "./refill-rate";
export * from "./billing";
export * from "./battery";
export * from "./supplier-loan";
export * from "./transfer";
export * from "./delivery-note";
export * from "./reconciliation";
export * from "./accessory";
export * from "./alert";
export * from "./reports";
export * from "./geo";
export * from "./settings";
export * from "./admin-user";
export * from "./audit-log";
export * from "./migration-data";
