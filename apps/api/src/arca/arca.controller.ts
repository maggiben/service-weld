import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import type {
  ArcaCompanyProfile,
  ArcaDashboard,
  ArcaEnvironment,
  ArcaSimulationMode,
  ArcaTestingMode,
  ConnectionTestResult,
  UploadCertificateResult,
  ValidateCertificateResult,
} from "@weld/schemas";
import { ArcaEnvironment as ArcaEnvironmentSchema } from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { ApiErrors } from "../common/errors/api-error";
import { ArcaService } from "./arca.service";
import {
  DeleteArcaCertificateDto,
  GenerateArcaKeysDto,
  UpdateArcaCompanyProfileDto,
  UpdateArcaSimulationModeDto,
  UpdateArcaTestingModeDto,
} from "./dto/arca.dto";

function parseEnvironment(raw: string | undefined): ArcaEnvironment {
  const parsed = ArcaEnvironmentSchema.safeParse(raw ?? "HOMOLOGATION");
  if (!parsed.success) {
    throw ApiErrors.validationFailed("Invalid environment.", [
      { field: "environment", issue: "enum" },
    ]);
  }
  return parsed.data;
}

@ApiTags("ARCA")
@ApiBearerAuth()
@Controller("arca")
export class ArcaController {
  constructor(private readonly arcaService: ArcaService) {}

  @Get()
  @RequireCapabilities("arca:read")
  @ApiOkResponse({ description: "ARCA dashboard for environment" })
  getDashboard(
    @Query("environment") environment?: string,
  ): Promise<ArcaDashboard> {
    return this.arcaService.getDashboard(parseEnvironment(environment));
  }

  @Get("company")
  @RequireCapabilities("arca:read")
  getCompany(): Promise<ArcaCompanyProfile> {
    return this.arcaService.getCompanyProfile();
  }

  @Patch("company")
  @RequireCapabilities("arca:manage")
  updateCompany(
    @Body() body: UpdateArcaCompanyProfileDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ArcaCompanyProfile> {
    return this.arcaService.updateCompanyProfile(body, user.id);
  }

  @Get("testing-mode")
  @RequireCapabilities("arca:read")
  getTestingMode(): Promise<ArcaTestingMode> {
    return this.arcaService.getTestingMode();
  }

  @Patch("testing-mode")
  @RequireCapabilities("arca:manage")
  updateTestingMode(
    @Body() body: UpdateArcaTestingModeDto,
  ): Promise<ArcaTestingMode> {
    return this.arcaService.updateTestingMode(body);
  }

  @Get("simulation-mode")
  @RequireCapabilities("arca:read")
  getSimulationMode(): Promise<ArcaSimulationMode> {
    return this.arcaService.getSimulationMode();
  }

  @Patch("simulation-mode")
  @RequireCapabilities("arca:manage")
  updateSimulationMode(
    @Body() body: UpdateArcaSimulationModeDto,
  ): Promise<ArcaSimulationMode> {
    return this.arcaService.updateSimulationMode(body);
  }

  @Post("keys")
  @RequireCapabilities("arca:manage")
  generateKeys(
    @Body() body: GenerateArcaKeysDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ArcaDashboard> {
    return this.arcaService.generateKeys(body, user.id);
  }

  @Get("csr")
  @RequireCapabilities("arca:read")
  async downloadCsr(
    @Query("environment") environment: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const env = parseEnvironment(environment);
    const csr = await this.arcaService.getCsrPem(env);
    response.setHeader("Content-Type", "application/pkcs10");
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="company.csr"',
    );
    response.send(csr);
  }

  @Post("certificate")
  @RequireCapabilities("arca:manage")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        environment: { type: "string", enum: ["HOMOLOGATION", "PRODUCTION"] },
        file: { type: "string", format: "binary" },
      },
      required: ["environment", "file"],
    },
  })
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 },
    }),
  )
  uploadCertificate(
    @Body("environment") environmentRaw: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<UploadCertificateResult> {
    return this.arcaService.uploadCertificate(
      parseEnvironment(environmentRaw),
      file,
      user.id,
    );
  }

  @Post("certificate/validate")
  @RequireCapabilities("arca:manage")
  validateCertificate(
    @Body() body: { environment: string },
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ValidateCertificateResult> {
    return this.arcaService.validateCertificate(
      parseEnvironment(body.environment),
      user.id,
    );
  }

  @Delete("certificate")
  @RequireCapabilities("arca:manage")
  deleteCertificate(
    @Body() body: DeleteArcaCertificateDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ArcaDashboard> {
    return this.arcaService.deleteCertificate(body, user.id);
  }

  @Post("connection-test")
  @RequireCapabilities("arca:manage")
  testConnection(
    @Body() body: { environment: string },
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ConnectionTestResult> {
    return this.arcaService.testConnection(
      parseEnvironment(body.environment),
      user.id,
    );
  }

  @Post("connection-test/:environment")
  @RequireCapabilities("arca:manage")
  testConnectionParam(
    @Param("environment") environment: string,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<ConnectionTestResult> {
    return this.arcaService.testConnection(
      parseEnvironment(environment),
      user.id,
    );
  }
}
