import { Module, forwardRef } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { RatesController } from "./rates.controller";
import { RatesRepository } from "./rates.repository";
import { RatesService } from "./rates.service";

@Module({
  imports: [forwardRef(() => BillingModule)],
  controllers: [RatesController],
  providers: [RatesService, RatesRepository],
  exports: [RatesService, RatesRepository],
})
export class RatesModule {}
