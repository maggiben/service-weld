import { createZodDto } from "nestjs-zod";
import {
  AlertListQuery,
  AlertListResponse,
  AlertSummary,
  RefreshAlertsResult,
  UpdateAlertContact,
} from "@weld/schemas";

export class AlertListQueryDto extends createZodDto(AlertListQuery) {}
export class AlertListResponseDto extends createZodDto(AlertListResponse) {}
export class RefreshAlertsResultDto extends createZodDto(RefreshAlertsResult) {}
export class AlertSummaryDto extends createZodDto(AlertSummary) {}
export class UpdateAlertContactDto extends createZodDto(UpdateAlertContact) {}
