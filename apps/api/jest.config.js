/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  // Services + auth/common pure logic. Repositories/controllers stay on e2e;
  // migration-data is CLI orchestration (covered by dedicated extract helper tests).
  collectCoverageFrom: [
    "**/*.service.ts",
    "!migration-data/**",
    "auth/password.ts",
    "auth/capabilities.ts",
    "auth/principal.ts",
    "auth/guards/capabilities.guard.ts",
    "auth/guards/territory-scope.guard.ts",
    "common/pagination/**/*.ts",
    "common/errors/**/*.ts",
    "config/config.schema.ts",
    "health/health.controller.ts",
    "database/transaction.context.ts",
  ],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@weld/domain$": "<rootDir>/../../../packages/domain/src/index.ts",
    "^@weld/schemas$": "<rootDir>/../../../packages/schemas/src/index.ts",
  },
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
