import { Injectable, Module, forwardRef } from "@nestjs/common";
import { RatesModule } from "../rates/rates.module";
import { RefillRatesModule } from "../refill-rates/refill-rates.module";
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
}

@Module({
  imports: [forwardRef(() => RatesModule), forwardRef(() => RefillRatesModule)],

  controllers: [BillingController],
  providers: [BillingService, BillingRepository, BillingLookupService],
  exports: [BillingLookupService, BillingService],
})
export class BillingModule {}
