import { Injectable } from "@nestjs/common";
import type { SystemSettings, UpdateSystemSettingsInput } from "@weld/schemas";
import { SettingsRepository } from "./settings.repository";

@Injectable()
export class SettingsService {
  constructor(private readonly repository: SettingsRepository) {}

  getSettings(): Promise<SystemSettings> {
    return this.repository.getSettings();
  }

  updateSettings(
    input: UpdateSystemSettingsInput,
    expectedVersion?: number,
  ): Promise<SystemSettings> {
    return this.repository.updateSettings(input, expectedVersion);
  }
}
