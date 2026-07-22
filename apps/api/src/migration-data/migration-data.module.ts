import { Module } from "@nestjs/common";
import { MigrationDataController } from "./migration-data.controller";
import { MigrationDataService } from "./migration-data.service";

@Module({
  controllers: [MigrationDataController],
  providers: [MigrationDataService],
})
export class MigrationDataModule {}
