# Implementation Specs

Agent-ready implementation specifications derived from the root analysis docs (`../domain.md`, `../workflows.md`, `../product_requirements_document.md`, `../sdd.md`, `../database.md`, `../schema.sql`, `../openapi_specification.md`, `../frontend_design.md`).

Each spec has the same seven sections: **Purpose · Requirements · Constraints · Acceptance Criteria · Edge Cases · Dependencies · Implementation Notes.**

| #   | Spec                      | Scope                                                                                          |
| --- | ------------------------- | ---------------------------------------------------------------------------------------------- |
| 000 | `000-project-overview.md` | Goals, scope, build order, how to consume these specs                                          |
| 001 | `001-business-rules.md`   | BR-01…BR-20, terminology, enforcement layers                                                   |
| 002 | `002-domain-model.md`     | Entities, aggregates, value objects, enums                                                     |
| 003 | `003-database.md`         | PostgreSQL schema, constraints, triggers, partitioning                                         |
| 004 | `004-api.md`              | REST/JSON contract, validation, pagination, errors                                             |
| 005 | `005-auth.md`             | JWT auth, RBAC, territory scoping, MFA, audit actor                                            |
| 006 | `006-frontend.md`         | Web + offline field app, all screens, nav map                                                  |
| 007 | `007-reporting.md`        | Dashboards, reports, read models, medical statement                                            |
| 008 | `008-inventory.md`        | Cylinder/battery/accessory tracking, custody, transfers                                        |
| 009 | `009-rental-system.md`    | Rental days, rate resolution, billing runs                                                     |
| 010 | `010-testing.md`          | Unit/integration/contract/E2E/offline/migration tests; **≥80% coverage gate**; git hook policy |
| 011 | `011-migrations.md`       | Legacy `.xls` import, normalization, exceptions                                                |
| 012 | `012-deployment.md`       | Topology, jobs, backups, observability, CI/CD, **local hooks**                                 |
| 013 | `013-landing-page.md`     | Public marketing site `@weld/www` (`serviceweld.com`); app on `app.serviceweld.com`            |
| 014 | `014-refill-system.md`    | Su Propiedad refill flow: rates, custody close/swap, gas billing, dashboard                    |

**Recommended build order:** 002 → 003 (+011 scaffolding) → 005 → 004 → 009 + 008 → **014** (refill pricing/billing) → 007 → 006 → 010 (continuous) → 011 (run) → 012. Landing (`013`) can follow once `006` routing/theme/i18n exist.

**Rule of precedence:** if a spec and a root analysis doc disagree, the spec wins — flag the discrepancy.
