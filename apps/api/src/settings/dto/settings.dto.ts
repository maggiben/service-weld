import { createZodDto } from "nestjs-zod";
import { SystemSettings, UpdateSystemSettingsInput } from "@weld/schemas";

export class SystemSettingsDto extends createZodDto(SystemSettings) {}
export class UpdateSystemSettingsDto extends createZodDto(
  UpdateSystemSettingsInput,
) {}
