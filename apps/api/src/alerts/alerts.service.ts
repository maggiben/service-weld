import { Injectable } from "@nestjs/common";
import type {
  Alert,
  AlertListQuery,
  AlertSummary,
  AlertSummaryQuery,
  RefreshAlertsResult,
  UpdateAlertContact,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { AlertsRepository } from "./alerts.repository";

@Injectable()
export class AlertsService {
  constructor(private readonly repository: AlertsRepository) {}

  list(query: AlertListQuery) {
    return this.repository.list(query);
  }

  async summary(query: AlertSummaryQuery = {}): Promise<AlertSummary> {
    return {
      open_count: await this.repository.openCount({
        period_start: query.period_start,
        period_end: query.period_end,
      }),
    };
  }

  async resolve(id: number): Promise<Alert> {
    try {
      return await this.repository.resolve(id);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw ApiErrors.notFound("Alert not found");
      }
      throw error;
    }
  }

  async updateContact(id: number, body: UpdateAlertContact): Promise<Alert> {
    try {
      return await this.repository.updateContact(id, body);
    } catch (error) {
      if (error instanceof Error && error.message === "NOT_FOUND") {
        throw ApiErrors.notFound("Alert not found");
      }
      throw error;
    }
  }

  refresh(): Promise<RefreshAlertsResult> {
    return this.repository.refresh();
  }
}
