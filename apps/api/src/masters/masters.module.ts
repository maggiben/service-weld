import { Module } from "@nestjs/common";
import { MastersController } from "./masters.controller";
import { MastersRepository } from "./masters.repository";
import { MastersService } from "./masters.service";

@Module({
  controllers: [MastersController],
  providers: [MastersService, MastersRepository],
  exports: [MastersService, MastersRepository],
})
export class MastersModule {}
