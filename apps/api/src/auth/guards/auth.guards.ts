import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { IS_PUBLIC_KEY } from "../../common/decorators/public.decorator";
import { ApiErrors } from "../../common/errors/api-error";
import { AuthService } from "../auth.service";
import type { AuthPrincipal } from "../principal";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }

  override handleRequest<TUser>(err: Error | null, user: TUser | false): TUser {
    if (err || !user) {
      throw err ?? new UnauthorizedException("Missing or invalid token");
    }
    return user;
  }
}

@Injectable()
export class LocalAuthGuard extends AuthGuard("local") {}

/**
 * Validates opaque refresh tokens from the request body (D-8).
 * Named jwt-refresh for parity with the auth spec; tokens are not JWTs.
 */
@Injectable()
export class JwtRefreshAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      body?: { refresh_token?: string };
      user?: AuthPrincipal;
    }>();
    const token = request.body?.refresh_token;
    if (!token) {
      throw ApiErrors.invalidRefresh();
    }

    const principal = await this.authService.validateRefreshToken(token);
    if (!principal) {
      throw ApiErrors.invalidRefresh();
    }

    request.user = principal;
    return true;
  }
}
