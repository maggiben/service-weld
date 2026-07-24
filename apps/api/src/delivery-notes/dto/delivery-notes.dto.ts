import { createZodDto } from "nestjs-zod";
import { z as zod } from "zod";
import {
  CreateDeliveryNoteInput,
  CreateDriverProfileInput,
  CreateRemitoIncidentInput,
  CreateRemitoLineInput,
  CreateVehicleInput,
  DeliveryNoteListQuery,
  DeliveryNoteListResponse,
  DriverListQuery,
  DriverListResponse,
  PaginationQuery,
  RemitoSeries,
  RemitoTransitionInput,
  PrintRemitoPdfQuery,
  UpdateDeliveryNoteInput,
  UpdateRemitoIncidentInput,
  UpdateRemitoLineInput,
  VehicleListQuery,
  VehicleListResponse,
  WarehouseListQuery,
  WarehouseListResponse,
  paginated,
} from "@weld/schemas";

export class CreateDeliveryNoteDto extends createZodDto(
  CreateDeliveryNoteInput,
) {}
export class UpdateDeliveryNoteDto extends createZodDto(
  UpdateDeliveryNoteInput,
) {}
export class RemitoTransitionDto extends createZodDto(RemitoTransitionInput) {}
export class PrintRemitoPdfQueryDto extends createZodDto(PrintRemitoPdfQuery) {}
export class DeliveryNoteListQueryDto extends createZodDto(
  DeliveryNoteListQuery,
) {}
export class DeliveryNoteListResponseDto extends createZodDto(
  DeliveryNoteListResponse,
) {}

export class CreateRemitoLineDto extends createZodDto(CreateRemitoLineInput) {}
export class UpdateRemitoLineDto extends createZodDto(UpdateRemitoLineInput) {}
export class CreateRemitoIncidentDto extends createZodDto(
  CreateRemitoIncidentInput,
) {}
export class UpdateRemitoIncidentDto extends createZodDto(
  UpdateRemitoIncidentInput,
) {}

export class WarehouseListQueryDto extends createZodDto(WarehouseListQuery) {}
export class WarehouseListResponseDto extends createZodDto(
  WarehouseListResponse,
) {}
export class VehicleListQueryDto extends createZodDto(VehicleListQuery) {}
export class VehicleListResponseDto extends createZodDto(VehicleListResponse) {}
export class CreateVehicleDto extends createZodDto(CreateVehicleInput) {}
export class DriverListQueryDto extends createZodDto(DriverListQuery) {}
export class DriverListResponseDto extends createZodDto(DriverListResponse) {}
export class CreateDriverProfileDto extends createZodDto(
  CreateDriverProfileInput,
) {}

const RemitoSeriesListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
});
export class RemitoSeriesListQueryDto extends createZodDto(
  RemitoSeriesListQuery,
) {}
export class RemitoSeriesListResponseDto extends createZodDto(
  paginated(RemitoSeries),
) {}
