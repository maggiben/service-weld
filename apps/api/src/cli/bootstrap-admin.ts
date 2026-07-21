import "reflect-metadata";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { validateEnv } from "../config/config.schema";
import type { Database } from "../database/schema.types";
import { hashPassword } from "../auth/password";

async function main(): Promise<void> {
  const env = validateEnv(process.env);
  const username = process.env.BOOTSTRAP_ADMIN_USER;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || !password) {
    // eslint-disable-next-line no-console
    console.log(
      "BOOTSTRAP_ADMIN_USER/PASSWORD not set — skipping admin bootstrap.",
    );
    return;
  }

  const db = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: env.DATABASE_URL }),
    }),
  });

  try {
    const existing = await db
      .selectFrom("app_user")
      .select(["id"])
      .where("username", "=", username)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (existing) {
      // eslint-disable-next-line no-console
      console.log(`Bootstrap admin '${username}' already exists — no-op.`);
      return;
    }

    const adminRole = await db
      .selectFrom("role")
      .select(["id"])
      .where("code", "=", "ADMIN")
      .executeTakeFirst();

    if (!adminRole) {
      throw new Error(
        "ADMIN role not found — apply schema.sql seed data first.",
      );
    }

    const passwordHash = await hashPassword(password);
    const user = await db
      .insertInto("app_user")
      .values({
        username,
        password_hash: passwordHash,
        is_active: true,
        mfa_enabled: true,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await db
      .insertInto("user_role")
      .values({ user_id: user.id, role_id: adminRole.id })
      .execute();

    // eslint-disable-next-line no-console
    console.log(`Created bootstrap admin '${username}' (id=${user.id}).`);
  } finally {
    await db.destroy();
  }
}

void main().catch((error: unknown) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
