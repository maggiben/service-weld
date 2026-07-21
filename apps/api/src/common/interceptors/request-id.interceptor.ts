import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import type { Request } from "express";
import { Observable } from "rxjs";
import { REQUEST_ID_KEY } from "../filters/http-exception.filter";

const REQUEST_ID_HEADER = "x-request-id";

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers[REQUEST_ID_HEADER];
    const requestId =
      typeof header === "string" && header.length > 0 ? header : randomUUID();
    (request as Request & { [REQUEST_ID_KEY]: string })[REQUEST_ID_KEY] =
      requestId;
    return next.handle();
  }
}
