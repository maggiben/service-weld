import { Module } from "@nestjs/common";
import { DeliveryNotesController } from "./delivery-notes.controller";
import { DeliveryNotesRepository } from "./delivery-notes.repository";
import { DeliveryNotesService } from "./delivery-notes.service";

@Module({
  controllers: [DeliveryNotesController],
  providers: [DeliveryNotesService, DeliveryNotesRepository],
  exports: [DeliveryNotesService, DeliveryNotesRepository],
})
export class DeliveryNotesModule {}
