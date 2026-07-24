import { Module } from "@nestjs/common";
import { AccessoriesModule } from "../accessories/accessories.module";
import { MovementsModule } from "../movements/movements.module";
import { DeliveryNotesController } from "./delivery-notes.controller";
import { DeliveryNotesRepository } from "./delivery-notes.repository";
import { DeliveryNotesService } from "./delivery-notes.service";
import { RemitoFleetController } from "./remito-fleet.controller";

@Module({
  imports: [MovementsModule, AccessoriesModule],
  controllers: [DeliveryNotesController, RemitoFleetController],
  providers: [DeliveryNotesService, DeliveryNotesRepository],
  exports: [DeliveryNotesService, DeliveryNotesRepository],
})
export class DeliveryNotesModule {}
