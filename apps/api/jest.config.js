/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  // Unit coverage focuses on pure modules exercised by *.spec.ts.
  // Controllers/repositories/services with DB I/O are covered by e2e / invariants.
  collectCoverageFrom: [
    "auth/password.ts",
    "auth/capabilities.ts",
    "auth/principal.ts",
    "common/pagination/**/*.ts",
    "common/errors/**/*.ts",
    "config/config.schema.ts",
    "health/health.controller.ts",
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
