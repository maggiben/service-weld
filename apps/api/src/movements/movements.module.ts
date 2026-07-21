import { Module } from "@nestjs/common";
import { BillingModule } from "../billing/billing.module";
import { MovementsController } from "./movements.controller";
import { MovementsRepository } from "./movements.repository";
import { MovementsService } from "./movements.service";

@Module({
  imports: [BillingModule],
  controllers: [MovementsController],
  providers: [MovementsService, MovementsRepository],
  exports: [MovementsService, MovementsRepository],
})
export class MovementsModule {}
