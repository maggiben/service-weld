import { Injectable, Module, forwardRef } from "@nestjs/common";
import { ArcaModule } from "../arca/arca.module";
import { RatesModule } from "../rates/rates.module";
import { RefillRatesModule } from "../refill-rates/refill-rates.module";
import { SettingsModule } from "../settings/settings.module";
import { BillingController } from "./billing.controller";
import { BillingRepository } from "./billing.repository";
import { BillingService } from "./billing.service";

/** Shared lookup used by Movements void (ALREADY_BILLED). */
@Injectable()
export class BillingLookupService {
  constructor(private readonly repository: BillingRepository) {}

  movementHasLockedCharges(movementId: number): Promise<boolean> {
    return this.repository.movementHasLockedCharges(movementId);
  }

  cylinderSaleHasLockedCharges(cylinderId: number): Promise<boolean> {
    return this.repository.cylinderSaleHasLockedCharges(cylinderId);
  }
}

@Module({
  imports: [
    forwardRef(() => RatesModule),
    forwardRef(() => RefillRatesModule),
    SettingsModule,
    ArcaModule,
  ],
  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingLookupService],
  exports: [BillingLookupService, BillingService],
})
export class BillingModule {}
