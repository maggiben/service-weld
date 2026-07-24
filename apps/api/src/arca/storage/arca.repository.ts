import { Inject, Injectable } from "@nestjs/common";
import type { ArcaConnectionStatus, ArcaEnvironment } from "@weld/schemas";
import { KYSELY, type DB } from "../../database/database.module";
import { resolveDb } from "../../database/transaction.context";

/** Single-company default until a company table exists (Q-4). */
export const DEFAULT_ARCA_COMPANY_ID = 1;

export const SETTING_ARCA_TESTING_MODE = "arca_testing_mode";
export const SETTING_ARCA_SIMULATION_MODE = "arca_simulation_mode";
export const SETTING_ARCA_COMPANY_CUIT = "arca_company_cuit";
export const SETTING_ARCA_COMPANY_LEGAL_NAME = "arca_company_legal_name";
export const SETTING_ARCA_COMPANY_ALIAS = "arca_company_alias";
export const SETTING_ARCA_POINT_OF_SALE = "arca_point_of_sale";

export interface ArcaCredentialRow {
  id: number;
  company_id: number;
  environment: ArcaEnvironment;
  cuit: string;
  certificate_encrypted: string | null;
  private_key_encrypted: string | null;
  csr_pem: string | null;
  certificate_fingerprint: string | null;
  valid_until: Date | null;
  last_validation: Date | null;
  last_authentication: Date | null;
  last_connection_status: ArcaConnectionStatus | null;
  last_connection_error: string | null;
  version: number;
}

@Injectable()
export class ArcaRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async findCredential(
    environment: ArcaEnvironment,
    companyId = DEFAULT_ARCA_COMPANY_ID,
  ): Promise<ArcaCredentialRow | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("arca_credentials")
      .selectAll()
      .where("company_id", "=", companyId)
      .where("environment", "=", environment)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async upsertKeys(input: {
    environment: ArcaEnvironment;
    cuitDigits: string;
    privateKeyEncrypted: string;
    csrPem: string;
    actorUserId: number | null;
    companyId?: number;
  }): Promise<ArcaCredentialRow> {
    const db = resolveDb(this.db);
    const companyId = input.companyId ?? DEFAULT_ARCA_COMPANY_ID;
    const existing = await this.findCredential(input.environment, companyId);

    if (existing) {
      await db
        .updateTable("arca_credentials")
        .set({
          cuit: input.cuitDigits,
          private_key_encrypted: input.privateKeyEncrypted,
          csr_pem: input.csrPem,
          certificate_encrypted: null,
          certificate_fingerprint: null,
          valid_until: null,
          last_validation: null,
          last_authentication: null,
          last_connection_status: "NOT_CONFIGURED",
          last_connection_error: null,
          updated_by: input.actorUserId,
          updated_at: new Date(),
        })
        .where("id", "=", existing.id)
        .execute();
      return (await this.findCredential(input.environment, companyId))!;
    }

    await db
      .insertInto("arca_credentials")
      .values({
        company_id: companyId,
        environment: input.environment,
        cuit: input.cuitDigits,
        private_key_encrypted: input.privateKeyEncrypted,
        csr_pem: input.csrPem,
        last_connection_status: "NOT_CONFIGURED",
        created_by: input.actorUserId,
        updated_by: input.actorUserId,
      })
      .execute();
    return (await this.findCredential(input.environment, companyId))!;
  }

  async storeCertificate(input: {
    environment: ArcaEnvironment;
    certificateEncrypted: string;
    actorUserId: number | null;
    companyId?: number;
  }): Promise<ArcaCredentialRow> {
    const db = resolveDb(this.db);
    const companyId = input.companyId ?? DEFAULT_ARCA_COMPANY_ID;
    const existing = await this.findCredential(input.environment, companyId);
    if (!existing) {
      throw new Error("Missing credentials row");
    }
    await db
      .updateTable("arca_credentials")
      .set({
        certificate_encrypted: input.certificateEncrypted,
        certificate_fingerprint: null,
        valid_until: null,
        last_validation: null,
        last_authentication: null,
        last_connection_status: "NOT_CONFIGURED",
        last_connection_error: null,
        updated_by: input.actorUserId,
        updated_at: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();
    return (await this.findCredential(input.environment, companyId))!;
  }

  async markValidated(input: {
    environment: ArcaEnvironment;
    fingerprint: string;
    validUntil: Date;
    actorUserId: number | null;
    companyId?: number;
  }): Promise<ArcaCredentialRow> {
    const db = resolveDb(this.db);
    const companyId = input.companyId ?? DEFAULT_ARCA_COMPANY_ID;
    const existing = await this.findCredential(input.environment, companyId);
    if (!existing) throw new Error("Missing credentials row");
    await db
      .updateTable("arca_credentials")
      .set({
        certificate_fingerprint: input.fingerprint,
        valid_until: input.validUntil,
        last_validation: new Date(),
        updated_by: input.actorUserId,
        updated_at: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();
    return (await this.findCredential(input.environment, companyId))!;
  }

  async markConnectionResult(input: {
    environment: ArcaEnvironment;
    status: ArcaConnectionStatus;
    error: string | null;
    authenticated: boolean;
    actorUserId: number | null;
    companyId?: number;
  }): Promise<void> {
    const db = resolveDb(this.db);
    const companyId = input.companyId ?? DEFAULT_ARCA_COMPANY_ID;
    const existing = await this.findCredential(input.environment, companyId);
    if (!existing) return;
    await db
      .updateTable("arca_credentials")
      .set({
        last_connection_status: input.status,
        last_connection_error: input.error,
        last_authentication: input.authenticated
          ? new Date()
          : existing.last_authentication,
        updated_by: input.actorUserId,
        updated_at: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();
  }

  async softDelete(input: {
    environment: ArcaEnvironment;
    actorUserId: number | null;
    companyId?: number;
  }): Promise<void> {
    const db = resolveDb(this.db);
    const companyId = input.companyId ?? DEFAULT_ARCA_COMPANY_ID;
    const existing = await this.findCredential(input.environment, companyId);
    if (!existing) return;
    await db
      .updateTable("arca_credentials")
      .set({
        deleted_at: new Date(),
        private_key_encrypted: null,
        certificate_encrypted: null,
        csr_pem: null,
        certificate_fingerprint: null,
        valid_until: null,
        last_validation: null,
        last_authentication: null,
        last_connection_status: "NOT_CONFIGURED",
        last_connection_error: null,
        updated_by: input.actorUserId,
        updated_at: new Date(),
      })
      .where("id", "=", existing.id)
      .execute();
  }

  /** Wipe Homologation + Production credential rows for a company. */
  async softDeleteAllEnvironments(input: {
    actorUserId: number | null;
    companyId?: number;
  }): Promise<void> {
    await this.softDelete({
      environment: "HOMOLOGATION",
      actorUserId: input.actorUserId,
      companyId: input.companyId,
    });
    await this.softDelete({
      environment: "PRODUCTION",
      actorUserId: input.actorUserId,
      companyId: input.companyId,
    });
  }

  async getSetting(key: string): Promise<string | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("system_setting")
      .select(["value"])
      .where("key", "=", key)
      .executeTakeFirst();
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = resolveDb(this.db);
    const existing = await db
      .selectFrom("system_setting")
      .select(["key", "version"])
      .where("key", "=", key)
      .executeTakeFirst();
    if (!existing) {
      await db
        .insertInto("system_setting")
        .values({ key, value, version: 1 })
        .execute();
      return;
    }
    await db
      .updateTable("system_setting")
      .set({
        value,
        updated_at: new Date(),
        version: Number(existing.version) + 1,
      })
      .where("key", "=", key)
      .execute();
  }

  private mapRow(row: {
    id: number | string | bigint;
    company_id: number | string | bigint;
    environment: ArcaEnvironment;
    cuit: string;
    certificate_encrypted: string | null;
    private_key_encrypted: string | null;
    csr_pem: string | null;
    certificate_fingerprint: string | null;
    valid_until: Date | null;
    last_validation: Date | null;
    last_authentication: Date | null;
    last_connection_status: string | null;
    last_connection_error: string | null;
    version: number | string;
  }): ArcaCredentialRow {
    const status = row.last_connection_status;
    const connectionStatus: ArcaConnectionStatus | null =
      status === "NOT_CONFIGURED" ||
      status === "CONNECTED" ||
      status === "FAILED"
        ? status
        : null;
    return {
      id: Number(row.id),
      company_id: Number(row.company_id),
      environment: row.environment,
      cuit: row.cuit,
      certificate_encrypted: row.certificate_encrypted,
      private_key_encrypted: row.private_key_encrypted,
      csr_pem: row.csr_pem,
      certificate_fingerprint: row.certificate_fingerprint,
      valid_until: row.valid_until,
      last_validation: row.last_validation,
      last_authentication: row.last_authentication,
      last_connection_status: connectionStatus,
      last_connection_error: row.last_connection_error,
      version: Number(row.version),
    };
  }
}
