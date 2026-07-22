import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";
import { ZodValidationException } from "nestjs-zod";
import { ZodError } from "zod";
import { ApiError, type ApiErrorDetail } from "../errors/api-error";

export const REQUEST_ID_KEY = "requestId";

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details: ApiErrorDetail[];
    request_id: string;
  };
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ [REQUEST_ID_KEY]?: string }>();
    const requestId = request[REQUEST_ID_KEY] ?? "unknown";

    if (exception instanceof ApiError) {
      response
        .status(exception.httpStatus)
        .json(this.body(exception, requestId));
      return;
    }

    if (exception instanceof ZodValidationException) {
      const zodError = exception.getZodError();
      const details: ApiErrorDetail[] =
        zodError instanceof ZodError
          ? zodError.issues.map((issue) => ({
              field: issue.path.join(".") || "body",
              issue: issue.message,
            }))
          : [];
      response
        .status(HttpStatus.UNPROCESSABLE_ENTITY)
        .json(
          this.body(
            new ApiError(
              "VALIDATION_FAILED",
              "Validation failed",
              HttpStatus.UNPROCESSABLE_ENTITY,
              details,
            ),
            requestId,
          ),
        );
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : typeof payload === "object" &&
              payload !== null &&
              "message" in payload
            ? String(
                Array.isArray((payload as { message: unknown }).message)
                  ? ((payload as { message: string[] }).message[0] ?? "Error")
                  : (payload as { message: string }).message,
              )
            : "Error";

      const code =
        status === HttpStatus.UNAUTHORIZED
          ? "UNAUTHENTICATED"
          : status === HttpStatus.FORBIDDEN
            ? "FORBIDDEN"
            : status === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : status === HttpStatus.CONFLICT
                ? "CONFLICT"
                : status === HttpStatus.UNPROCESSABLE_ENTITY
                  ? "VALIDATION_FAILED"
                  : "INTERNAL_ERROR";

      response
        .status(status)
        .json(this.body(new ApiError(code, message, status), requestId));
      return;
    }

    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.body(
          new ApiError(
            "INTERNAL_ERROR",
            "An unexpected error occurred",
            HttpStatus.INTERNAL_SERVER_ERROR,
          ),
          requestId,
        ),
      );
  }

  private body(error: ApiError, requestId: string): ErrorBody {
    return {
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        request_id: requestId,
      },
    };
  }
}
