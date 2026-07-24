import { Controller, Get, Param, ParseIntPipe, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  CylinderLifeQueryDto,
  CylinderLifeReportResponseDto,
  DataQualityQueryDto,
  DataQualityReportResponseDto,
  FleetQueryDto,
  FleetReportResponseDto,
  FloatAgingQueryDto,
  FloatAgingReportResponseDto,
  LossReportQueryDto,
  LossReportResponseDto,
  MedicalStatementQueryDto,
  MedicalStatementReportResponseDto,
  RefillReportQueryDto,
  RefillReportResponseDto,
  RentalReportQueryDto,
  RentalReportResponseDto,
  SupplierReturnsQueryDto,
  SupplierReturnsReportResponseDto,
} from "./dto/reports.dto";
import { ReportsService } from "./reports.service";

@ApiTags("Reports")
@ApiBearerAuth()
@Controller("reports")
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("fleet")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: FleetReportResponseDto })
  fleet(@Query() query: FleetQueryDto) {
    return this.reportsService.fleet(query);
  }

  @Get("float-aging")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: FloatAgingReportResponseDto })
  floatAging(@Query() query: FloatAgingQueryDto) {
    return this.reportsService.floatAging(query);
  }

  @Get("rental")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: RentalReportResponseDto })
  rental(@Query() query: RentalReportQueryDto) {
    return this.reportsService.rental(query);
  }

  @Get("refill")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: RefillReportResponseDto })
  refill(@Query() query: RefillReportQueryDto) {
    return this.reportsService.refill(query);
  }

  @Get("loss")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: LossReportResponseDto })
  loss(@Query() query: LossReportQueryDto) {
    return this.reportsService.loss(query);
  }

  @Get("supplier-returns")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: SupplierReturnsReportResponseDto })
  supplierReturns(@Query() query: SupplierReturnsQueryDto) {
    return this.reportsService.supplierReturns(query);
  }

  @Get("cylinder-life/:cylinderId")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: CylinderLifeReportResponseDto })
  cylinderLife(
    @Param("cylinderId", ParseIntPipe) cylinderId: number,
    @Query() query: CylinderLifeQueryDto,
  ) {
    return this.reportsService.cylinderLife(cylinderId, query);
  }

  @Get("medical-statement")
  @RequireCapabilities("medical:read")
  @ApiOkResponse({ type: MedicalStatementReportResponseDto })
  medicalStatement(@Query() query: MedicalStatementQueryDto) {
    return this.reportsService.medicalStatement(query);
  }

  @Get("data-quality")
  @RequireCapabilities("reports:read")
  @ApiOkResponse({ type: DataQualityReportResponseDto })
  dataQuality(@Query() query: DataQualityQueryDto) {
    return this.reportsService.dataQuality(query);
  }
}
