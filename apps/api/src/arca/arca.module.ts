import { Module } from "@nestjs/common";
import { ArcaController } from "./arca.controller";
import { ArcaService } from "./arca.service";
import { ArcaRepository } from "./storage/arca.repository";
import { ArcaConnectionService } from "./wsaa/arca-connection.service";

@Module({
  controllers: [ArcaController],
  providers: [ArcaService, ArcaRepository, ArcaConnectionService],
  exports: [ArcaService],
})
export class ArcaModule {}
