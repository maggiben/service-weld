import { createZodDto } from "nestjs-zod";
import {
  AdminUserListQuery,
  AdminUserListResponse,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from "@weld/schemas";

export class AdminUserListQueryDto extends createZodDto(AdminUserListQuery) {}
export class AdminUserListResponseDto extends createZodDto(
  AdminUserListResponse,
) {}
export class CreateAdminUserDto extends createZodDto(CreateAdminUserInput) {}
export class UpdateAdminUserDto extends createZodDto(UpdateAdminUserInput) {}
