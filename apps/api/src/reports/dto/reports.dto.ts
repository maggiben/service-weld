import { createZodDto } from "nestjs-zod";
import {
  CylinderLifeQuery,
  CylinderLifeReportResponse,
  DataQualityQuery,
  DataQualityReportResponse,
  FleetQuery,
  FleetReportResponse,
  FloatAgingQuery,
  FloatAgingReportResponse,
  LossReportQuery,
  LossReportResponse,
  MedicalStatementQuery,
  MedicalStatementReportResponse,
  RentalReportQuery,
  RentalReportResponse,
  SupplierReturnsQuery,
  SupplierReturnsReportResponse,
} from "@weld/schemas";

export class FleetQueryDto extends createZodDto(FleetQuery) {}
export class FleetReportResponseDto extends createZodDto(FleetReportResponse) {}

export class FloatAgingQueryDto extends createZodDto(FloatAgingQuery) {}
export class FloatAgingReportResponseDto extends createZodDto(
  FloatAgingReportResponse,
) {}

export class RentalReportQueryDto extends createZodDto(RentalReportQuery) {}
export class RentalReportResponseDto extends createZodDto(
  RentalReportResponse,
) {}

export class LossReportQueryDto extends createZodDto(LossReportQuery) {}
export class LossReportResponseDto extends createZodDto(LossReportResponse) {}

export class SupplierReturnsQueryDto extends createZodDto(
  SupplierReturnsQuery,
) {}
export class SupplierReturnsReportResponseDto extends createZodDto(
  SupplierReturnsReportResponse,
) {}

export class CylinderLifeQueryDto extends createZodDto(CylinderLifeQuery) {}
export class CylinderLifeReportResponseDto extends createZodDto(
  CylinderLifeReportResponse,
) {}

export class DataQualityQueryDto extends createZodDto(DataQualityQuery) {}
export class DataQualityReportResponseDto extends createZodDto(
  DataQualityReportResponse,
) {}

export class MedicalStatementQueryDto extends createZodDto(
  MedicalStatementQuery,
) {}
export class MedicalStatementReportResponseDto extends createZodDto(
  MedicalStatementReportResponse,
) {}
