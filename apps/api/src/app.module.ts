import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/config.schema";
import { AuthModule } from "./auth/auth.module";
import { BatteriesModule } from "./batteries/batteries.module";
import { BillingModule } from "./billing/billing.module";
import { ClientsModule } from "./clients/clients.module";
import { CylindersModule } from "./cylinders/cylinders.module";
import { MovementsModule } from "./movements/movements.module";
import { RatesModule } from "./rates/rates.module";
import { RefillRatesModule } from "./refill-rates/refill-rates.module";
import { SupplierLoansModule } from "./supplier-loans/supplier-loans.module";
import { TransfersModule } from "./transfers/transfers.module";
import { DeliveryNotesModule } from "./delivery-notes/delivery-notes.module";
import { ReconciliationModule } from "./reconciliation/reconciliation.module";
import { AccessoriesModule } from "./accessories/accessories.module";
import { AlertsModule } from "./alerts/alerts.module";
import { ReportsModule } from "./reports/reports.module";
import { MastersModule } from "./masters/masters.module";
import { SettingsModule } from "./settings/settings.module";
import { AdminUsersModule } from "./admin-users/admin-users.module";
import { AuditLogsModule } from "./audit-logs/audit-logs.module";
import { MigrationDataModule } from "./migration-data/migration-data.module";
import { TransactionInterceptor } from "./common/interceptors/transaction.interceptor";
import { DatabaseModule } from "./database/database.module";
import { HealthModule } from "./health/health.module";

/** Monorepo root `.env` when cwd is `apps/api` (pnpm --filter). */
const envFiles = [
  join(process.cwd(), ".env"),
  join(process.cwd(), "../../.env"),
];

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFiles,
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    AuthModule,
    ClientsModule,
    CylindersModule,
    BatteriesModule,
    MovementsModule,
    RatesModule,
    RefillRatesModule,
    BillingModule,
    SupplierLoansModule,
    TransfersModule,
    DeliveryNotesModule,
    ReconciliationModule,
    AccessoriesModule,
    AlertsModule,
    ReportsModule,
    MastersModule,
    SettingsModule,
    AdminUsersModule,
    AuditLogsModule,
    MigrationDataModule,
  ],
  providers: [TransactionInterceptor],
})
export class AppModule {}
