import { Module } from "@nestjs/common";
import { BatteriesController } from "./batteries.controller";
import { BatteriesRepository } from "./batteries.repository";
import { BatteriesService } from "./batteries.service";

@Module({
  controllers: [BatteriesController],
  providers: [BatteriesService, BatteriesRepository],
  exports: [BatteriesService, BatteriesRepository],
})
export class BatteriesModule {}
