import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { DriverProfile, Vehicle } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  CreateDriverProfileDto,
  CreateVehicleDto,
  DriverListQueryDto,
  DriverListResponseDto,
  RemitoSeriesListQueryDto,
  RemitoSeriesListResponseDto,
  VehicleListQueryDto,
  VehicleListResponseDto,
  WarehouseListQueryDto,
  WarehouseListResponseDto,
} from "./dto/delivery-notes.dto";
import { DeliveryNotesService } from "./delivery-notes.service";

@ApiTags("RemitoFleet")
@ApiBearerAuth()
@Controller()
export class RemitoFleetController {
  constructor(private readonly deliveryNotesService: DeliveryNotesService) {}

  @Get("warehouses")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ type: WarehouseListResponseDto })
  listWarehouses(@Query() query: WarehouseListQueryDto) {
    return this.deliveryNotesService.listWarehouses(query);
  }

  @Get("vehicles")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ type: VehicleListResponseDto })
  listVehicles(@Query() query: VehicleListQueryDto) {
    return this.deliveryNotesService.listVehicles(query);
  }

  @Post("vehicles")
  @RequireCapabilities("delivery_notes:write")
  @ApiCreatedResponse({ description: "Vehicle created" })
  createVehicle(@Body() body: CreateVehicleDto): Promise<Vehicle> {
    return this.deliveryNotesService.createVehicle(body);
  }

  @Get("drivers")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ type: DriverListResponseDto })
  listDrivers(@Query() query: DriverListQueryDto) {
    return this.deliveryNotesService.listDrivers(query);
  }

  @Post("drivers")
  @RequireCapabilities("delivery_notes:write")
  @ApiCreatedResponse({ description: "Driver profile created" })
  createDriver(@Body() body: CreateDriverProfileDto): Promise<DriverProfile> {
    return this.deliveryNotesService.createDriver(body);
  }

  @Get("remito-series")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ type: RemitoSeriesListResponseDto })
  listRemitoSeries(@Query() query: RemitoSeriesListQueryDto) {
    return this.deliveryNotesService.listRemitoSeries(query);
  }
}
