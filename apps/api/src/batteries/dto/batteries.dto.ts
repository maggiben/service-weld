import { createZodDto } from "nestjs-zod";
import {
  AddBatteryMemberInput,
  BatteryListQuery,
  BatteryListResponse,
  CreateBatteryInput,
} from "@weld/schemas";

export class CreateBatteryDto extends createZodDto(CreateBatteryInput) {}
export class AddBatteryMemberDto extends createZodDto(AddBatteryMemberInput) {}
export class BatteryListQueryDto extends createZodDto(BatteryListQuery) {}
export class BatteryListResponseDto extends createZodDto(BatteryListResponse) {}
