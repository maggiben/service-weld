import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthPrincipal } from "../../auth/principal";

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthPrincipal }>();
    return request.user;
  },
);
