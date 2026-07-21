import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiTags } from "@nestjs/swagger";
import { sql } from "kysely";
import { Public } from "../common/decorators/public.decorator";
import { KYSELY, type DB } from "../database/database.module";

@ApiTags("Health")
@Controller("health")
export class HealthController {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  /** Liveness + DB readiness. Public (no auth). */
  @Public()
  @Get()
  @ApiOkResponse({ description: "Service and database are reachable." })
  async check(): Promise<{ status: string; db: string; time: string }> {
    let dbStatus = "down";
    try {
      await sql`select 1`.execute(this.db);
      dbStatus = "up";
    } catch {
      dbStatus = "down";
    }
    return {
      status: "ok",
      db: dbStatus,
      time: new Date().toISOString(),
    };
  }
}
