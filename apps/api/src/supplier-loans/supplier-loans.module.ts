import { Module } from "@nestjs/common";
import { SettingsModule } from "../settings/settings.module";
import { SupplierLoansController } from "./supplier-loans.controller";
import { SupplierLoansRepository } from "./supplier-loans.repository";
import { SupplierLoansService } from "./supplier-loans.service";

@Module({
  imports: [SettingsModule],
  controllers: [SupplierLoansController],
  providers: [SupplierLoansService, SupplierLoansRepository],
  exports: [SupplierLoansService, SupplierLoansRepository],
})
export class SupplierLoansModule {}
