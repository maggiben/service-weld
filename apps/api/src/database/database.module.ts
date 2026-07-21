import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Env } from "../config/config.schema";
import type { Database } from "./schema.types";

/** DI token for the Kysely instance. */
export const KYSELY = Symbol("KYSELY");
export type DB = Kysely<Database>;

/**
 * Provides a single connection pool + Kysely instance.
 * Transactions (with `SET LOCAL` audit GUCs, D-9/005) are added as a
 * TransactionInterceptor in Phase 1 — Phase 0 only needs connectivity.
 */
@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): DB => {
        const pool = new Pool({
          connectionString: config.get("DATABASE_URL", { infer: true }),
          max: config.get("DB_POOL_MAX", { infer: true }),
        });
        return new Kysely<Database>({
          dialect: new PostgresDialect({ pool }),
        });
      },
    },
  ],
  exports: [KYSELY],
})
export class DatabaseModule {}
