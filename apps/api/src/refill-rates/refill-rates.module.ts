import { Module, forwardRef } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { RefillRatesController } from "./refill-rates.controller";
import { RefillRatesRepository } from "./refill-rates.repository";
import { RefillRatesService } from "./refill-rates.service";

@Module({
  imports: [forwardRef(() => BillingModule)],
  controllers: [RefillRatesController],
  providers: [RefillRatesService, RefillRatesRepository],
  exports: [RefillRatesService, RefillRatesRepository],
})
export class RefillRatesModule {}
