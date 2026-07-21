import "reflect-metadata";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { ZodValidationPipe, patchNestJsSwagger } from "nestjs-zod";
import { AppModule } from "./app.module";
import type { Env } from "./config/config.schema";
import { HttpExceptionFilter } from "./common/filters/http-exception.filter";
import { RequestIdInterceptor } from "./common/interceptors/request-id.interceptor";
import { TransactionInterceptor } from "./common/interceptors/transaction.interceptor";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService) as ConfigService<Env, true>;

  const prefix = config.get("API_GLOBAL_PREFIX", { infer: true });
  app.setGlobalPrefix(prefix);

  app.enableCors({
    origin: [
      "http://localhost:3001",
      "http://127.0.0.1:3001",
      "http://localhost:3002",
      "http://127.0.0.1:3002",
    ],
    credentials: true,
  });

  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(
    new RequestIdInterceptor(),
    app.get(TransactionInterceptor),
  );

  // Zod is the single validation mechanism (004 R8 / C6).
  app.useGlobalPipes(new ZodValidationPipe());

  // Emit OpenAPI from the Zod DTOs; the emitted JSON is the runtime contract
  // (D-10). Design doc openapi_specification.md is the parity checklist.
  patchNestJsSwagger();
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Cylinder Custody, Circulation & Rental Management API")
    .setDescription("REST API — see specs/004 and openapi_specification.md")
    .setVersion("1.0.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, document, {
    jsonDocumentUrl: "api/docs-json",
  });

  const port = config.get("API_PORT", { infer: true });
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on :${port}${prefix} — docs at /api/docs`);
}

void bootstrap();
