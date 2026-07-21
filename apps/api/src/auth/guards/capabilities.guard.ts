import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { CAPABILITIES_KEY } from "../../common/decorators/require-capabilities.decorator";
import { ApiErrors } from "../../common/errors/api-error";
import { hasCapabilities } from "../capabilities";
import type { AuthPrincipal } from "../principal";

@Injectable()
export class CapabilitiesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required =
      this.reflector.getAllAndOverride<string[]>(CAPABILITIES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthPrincipal }>();
    const user = request.user;
    if (!user) {
      throw ApiErrors.unauthenticated();
    }

    if (!hasCapabilities(user.capabilities, required)) {
      throw ApiErrors.forbidden();
    }

    return true;
  }
}
