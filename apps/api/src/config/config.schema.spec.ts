import { validateEnv, EnvSchema } from "./config.schema";

describe("EnvSchema", () => {
  const base = {
    DATABASE_URL: "postgres://postgres:test@localhost:5432/weld",
    JWT_ACCESS_SECRET: "access",
    JWT_REFRESH_SECRET: "refresh",
  };

  it("applies defaults", () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3000);
    expect(env.BUSINESS_TIMEZONE).toBe("America/Argentina/Buenos_Aires");
    expect(EnvSchema.parse(base).NODE_ENV).toBe("development");
  });

  it("fails fast on missing secrets", () => {
    expect(() => validateEnv({ DATABASE_URL: "postgres://x" })).toThrow(
      /Invalid environment/,
    );
  });
});
