import { z } from "zod";

/**
 * Environment validation (fail-fast at boot). Mirrors .env.example.
 * Consumed by @nestjs/config `validate`.
 */
export const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().default(3000),
  API_GLOBAL_PREFIX: z.string().default("/api/v1"),
  /** Comma-separated extra CORS origins (production web/field URLs). */
  CORS_ORIGINS: z.string().optional(),

  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().int().default(10),

  // Auth (005 / D-8) — required outside tests.
  JWT_ACCESS_SECRET: z.string().min(1),
  JWT_ACCESS_TTL: z.coerce.number().int().default(900),
  JWT_REFRESH_SECRET: z.string().min(1),
  JWT_REFRESH_TTL: z.coerce.number().int().default(2_592_000),

  // Bootstrap admin (D-11) — optional; CLI no-ops when unset.
  BOOTSTRAP_ADMIN_USER: z.string().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),

  // Business config (009 / 012).
  BUSINESS_TIMEZONE: z.string().default("America/Argentina/Buenos_Aires"),
  RENTAL_MIN_DAYS: z.coerce.number().int().default(1),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.toString()}`,
    );
  }
  return parsed.data;
}
