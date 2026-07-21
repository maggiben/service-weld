import { Module } from "@nestjs/common";
import { AccessoriesController } from "./accessories.controller";
import { AccessoriesRepository } from "./accessories.repository";
import { AccessoriesService } from "./accessories.service";

@Module({
  controllers: [AccessoriesController],
  providers: [AccessoriesService, AccessoriesRepository],
  exports: [AccessoriesService],
})
export class AccessoriesModule {}
