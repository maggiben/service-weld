import { z as zod } from "zod";

/**
 * Environment validation (fail-fast at boot). Mirrors .env.example.
 * Consumed by @nestjs/config `validate`.
 */
export const EnvSchema = zod.object({
  NODE_ENV: zod
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: zod.coerce.number().int().default(3000),
  API_GLOBAL_PREFIX: zod.string().default("/api/v1"),
  /** Comma-separated extra CORS origins (production web/field URLs). */
  CORS_ORIGINS: zod.string().optional(),

  DATABASE_URL: zod.string().url(),
  DB_POOL_MAX: zod.coerce.number().int().default(10),

  // Auth (005 / D-8) — required outside tests.
  JWT_ACCESS_SECRET: zod.string().min(1),
  JWT_ACCESS_TTL: zod.coerce.number().int().default(900),
  JWT_REFRESH_SECRET: zod.string().min(1),
  JWT_REFRESH_TTL: zod.coerce.number().int().default(2_592_000),

  // Bootstrap admin (D-11) — optional; CLI no-ops when unset.
  BOOTSTRAP_ADMIN_USER: zod.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: zod.string().optional(),

  // Business config (009 / 012).
  BUSINESS_TIMEZONE: zod.string().default("America/Argentina/Buenos_Aires"),
  RENTAL_MIN_DAYS: zod.coerce.number().int().min(0).default(0),
});

export type Env = zod.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.toString()}`,
    );
  }
  return parsed.data;
}
