import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import { memoryStorage } from "multer";
import type { Response } from "express";
import {
  MigrationExportDataset,
  MigrationWorkbookSlot,
  type MigrationDataStatus,
  type MigrationJobAccepted,
  type MigrationSnapshot,
  type MigrationUploadedFile,
} from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  MigrationMarkGoodRequestDto,
  MigrationPurgeBusinessRequestDto,
  MigrationRollbackRequestDto,
  MigrationRunRequestDto,
} from "./dto/migration-data.dto";
import { MigrationDataService } from "./migration-data.service";
import type { MigrationPurgeBusinessResult } from "@weld/schemas";

function parseSlot(raw: string): MigrationWorkbookSlot {
  const parsed = MigrationWorkbookSlot.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(
      `Unknown workbook slot "${raw}". Use: junin | chacabuco | propios`,
    );
  }
  return parsed.data;
}

function parseDataset(raw: string): MigrationExportDataset {
  const parsed = MigrationExportDataset.safeParse(raw);
  if (!parsed.success) {
    throw new BadRequestException(
      `Unknown export dataset "${raw}". Use: clients | cylinders | movements | exceptions | all`,
    );
  }
  return parsed.data;
}

@ApiTags("Migration data")
@ApiBearerAuth()
@Controller("admin/migration-data")
export class MigrationDataController {
  constructor(private readonly migrationData: MigrationDataService) {}

  @Get("status")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "Upload slots, snapshots, last report" })
  status(): MigrationDataStatus {
    return this.migrationData.getStatus();
  }

  @Post("uploads/:slot")
  @RequireCapabilities("admin:write")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: { file: { type: "string", format: "binary" } },
      required: ["file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 120 * 1024 * 1024 },
    }),
  )
  upload(
    @Param("slot") slotRaw: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<MigrationUploadedFile> {
    return this.migrationData.saveUpload(parseSlot(slotRaw), file);
  }

  @Post("dry-run")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({
    description:
      "Start parse + reconcile without writes (poll status.live_job for logs)",
  })
  dryRun(@Body() body: MigrationRunRequestDto): MigrationJobAccepted {
    return this.migrationData.startImport({ ...body, dry_run: true });
  }

  @Post("sync")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({
    description:
      "Start snapshot + load (poll status.live_job for progress/terminal)",
  })
  sync(@Body() body: MigrationRunRequestDto): MigrationJobAccepted {
    return this.migrationData.startImport({ ...body, dry_run: false });
  }

  @Post("rollback")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "Restore DB from a prior snapshot" })
  rollback(
    @Body() body: MigrationRollbackRequestDto,
  ): Promise<Record<string, unknown>> {
    return this.migrationData.rollback(body.snapshot_id);
  }

  @Post("snapshots/mark-good")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "Mark snapshot as known-good version" })
  markGood(@Body() body: MigrationMarkGoodRequestDto): MigrationSnapshot {
    return this.migrationData.markGood(body.snapshot_id, body.good);
  }

  @Post("purge-business")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({
    description:
      "Danger zone: wipe clients/cylinders/movements/billing/etc. Keeps users + settings",
  })
  purgeBusiness(
    @Body() _body: MigrationPurgeBusinessRequestDto,
  ): Promise<MigrationPurgeBusinessResult> {
    // Zod already enforced confirmation === "VACIAR DATOS"
    return this.migrationData.purgeBusinessData();
  }

  @Get("export/:dataset")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "Download Excel export for double-check" })
  async export(
    @Param("dataset") datasetRaw: string,
    @Res() res: Response,
  ): Promise<void> {
    const { filePath, downloadName } = await this.migrationData.exportDataset(
      parseDataset(datasetRaw),
    );
    res.download(filePath, downloadName);
  }
}
