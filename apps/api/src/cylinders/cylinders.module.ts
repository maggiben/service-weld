import { Module } from "@nestjs/common";
import { MovementsModule } from "../movements/movements.module";
import { CylindersController } from "./cylinders.controller";
import { CylindersRepository } from "./cylinders.repository";
import { CylindersService } from "./cylinders.service";

@Module({
  imports: [MovementsModule],
  controllers: [CylindersController],
  providers: [CylindersService, CylindersRepository],
  exports: [CylindersService, CylindersRepository],
})
export class CylindersModule {}
