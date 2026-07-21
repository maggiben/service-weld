import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApiErrors } from "../../common/errors/api-error";
import {
  hasGlobalTerritoryAccess,
  isTerritoryScoped,
  type AuthPrincipal,
} from "../principal";

export const TERRITORY_SCOPE_KEY = "territoryScope";

@Injectable()
export class TerritoryScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthPrincipal;
      [TERRITORY_SCOPE_KEY]?: number[] | null;
    }>();
    const user = request.user;
    if (!user) {
      return true;
    }

    if (hasGlobalTerritoryAccess(user.roles)) {
      request[TERRITORY_SCOPE_KEY] = null;
      return true;
    }

    if (!isTerritoryScoped(user.roles)) {
      request[TERRITORY_SCOPE_KEY] = null;
      return true;
    }

    const territoryIds = user.territories.map((territory) => territory.id);
    if (territoryIds.length === 0) {
      throw ApiErrors.forbidden("No territory scope assigned");
    }

    request[TERRITORY_SCOPE_KEY] = territoryIds;
    return true;
  }
}

export function readTerritoryScope(request: {
  [TERRITORY_SCOPE_KEY]?: number[] | null;
}): number[] | null {
  return request[TERRITORY_SCOPE_KEY] ?? null;
}
