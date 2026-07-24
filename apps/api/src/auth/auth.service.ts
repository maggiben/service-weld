import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { RoleCode } from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import type { Env } from "../config/config.schema";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import { capabilitiesForRoles } from "./capabilities";
import {
  generateRefreshToken,
  hashRefreshToken,
  verifyPassword,
} from "./password";
import type { AuthPrincipal, TerritoryRef } from "./principal";

interface LoadedUser {
  id: number;
  username: string;
  password_hash: string;
  is_active: boolean;
  mfa_enabled: boolean;
  roles: RoleCode[];
  territories: TerritoryRef[];
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(KYSELY) private readonly db: DB,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async validateUser(
    username: string,
    password: string,
  ): Promise<AuthPrincipal | null> {
    const user = await this.loadUserByUsername(username);
    if (!user || !user.is_active) {
      return null;
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      return null;
    }

    return this.toPrincipal(user);
  }

  async validateRefreshToken(token: string): Promise<AuthPrincipal | null> {
    const db = resolveDb(this.db);
    const tokenHash = hashRefreshToken(token);
    const row = await db
      .selectFrom("refresh_token")
      .select(["user_id", "expires_at", "revoked_at"])
      .where("token_hash", "=", tokenHash)
      .executeTakeFirst();

    if (!row || row.revoked_at || row.expires_at <= new Date()) {
      return null;
    }

    const user = await this.loadUserById(row.user_id);
    if (!user || !user.is_active) {
      return null;
    }

    return this.toPrincipal(user);
  }

  async login(
    principal: AuthPrincipal,
    meta?: { userAgent?: string; ip?: string },
  ) {
    const accessTtl = this.config.get("JWT_ACCESS_TTL", { infer: true });
    const refreshTtl = this.config.get("JWT_REFRESH_TTL", { infer: true });
    const refreshToken = generateRefreshToken();
    const refreshHash = hashRefreshToken(refreshToken);
    const expiresAt = new Date(Date.now() + refreshTtl * 1000);

    const db = resolveDb(this.db);
    await db
      .insertInto("refresh_token")
      .values({
        user_id: principal.id,
        token_hash: refreshHash,
        expires_at: expiresAt,
        user_agent: meta?.userAgent ?? null,
        ip: meta?.ip ?? null,
      })
      .execute();

    await db
      .updateTable("app_user")
      .set({ last_login_at: new Date() })
      .where("id", "=", principal.id)
      .execute();

    const accessToken = await this.signAccessToken(principal, accessTtl);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: accessTtl,
      roles: principal.roles,
      territories: principal.territories.map((territory) => territory.name),
    };
  }

  async refresh(
    principal: AuthPrincipal,
    presentedRefreshToken: string,
    meta?: { userAgent?: string; ip?: string },
  ) {
    const db = resolveDb(this.db);
    const oldHash = hashRefreshToken(presentedRefreshToken);

    await db
      .updateTable("refresh_token")
      .set({ revoked_at: new Date() })
      .where("token_hash", "=", oldHash)
      .where("revoked_at", "is", null)
      .execute();

    return this.login(principal, meta);
  }

  async logout(refreshToken: string): Promise<void> {
    const db = resolveDb(this.db);
    await db
      .updateTable("refresh_token")
      .set({ revoked_at: new Date() })
      .where("token_hash", "=", hashRefreshToken(refreshToken))
      .where("revoked_at", "is", null)
      .execute();
  }

  async me(principal: AuthPrincipal) {
    const fresh = await this.loadUserById(principal.id);
    if (!fresh || !fresh.is_active) {
      throw ApiErrors.unauthenticated();
    }
    const current = this.toPrincipal(fresh);
    return {
      id: current.id,
      username: current.username,
      roles: current.roles,
      territories: current.territories.map((territory) => territory.name),
      territory_scopes: current.territories,
      capabilities: current.capabilities,
    };
  }

  private async signAccessToken(
    principal: AuthPrincipal,
    expiresInSeconds: number,
  ): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: principal.id,
        username: principal.username,
        roles: principal.roles,
        capabilities: principal.capabilities,
        territories: principal.territories,
        mfa: principal.mfa,
      },
      {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
        expiresIn: expiresInSeconds,
      },
    );
  }

  private toPrincipal(user: LoadedUser): AuthPrincipal {
    return {
      id: user.id,
      username: user.username,
      roles: user.roles,
      capabilities: capabilitiesForRoles(user.roles),
      territories: user.territories,
      mfa: user.mfa_enabled,
    };
  }

  private async loadUserByUsername(
    username: string,
  ): Promise<LoadedUser | null> {
    const row = await this.db
      .selectFrom("app_user")
      .select(["id", "username", "password_hash", "is_active", "mfa_enabled"])
      .where("username", "=", username)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!row) return null;
    return this.loadRolesAndTerritories(row);
  }

  private async loadUserById(id: number): Promise<LoadedUser | null> {
    const row = await this.db
      .selectFrom("app_user")
      .select(["id", "username", "password_hash", "is_active", "mfa_enabled"])
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();

    if (!row) return null;
    return this.loadRolesAndTerritories(row);
  }

  private async loadRolesAndTerritories(row: {
    id: number;
    username: string;
    password_hash: string;
    is_active: boolean;
    mfa_enabled: boolean;
  }): Promise<LoadedUser> {
    const roleRows = await this.db
      .selectFrom("user_role")
      .innerJoin("role", "role.id", "user_role.role_id")
      .select(["role.code"])
      .where("user_role.user_id", "=", row.id)
      .execute();

    const territoryRows = await this.db
      .selectFrom("user_territory_scope")
      .innerJoin(
        "dispatch_territory",
        "dispatch_territory.id",
        "user_territory_scope.territory_id",
      )
      .select(["dispatch_territory.id", "dispatch_territory.name"])
      .where("user_territory_scope.user_id", "=", row.id)
      .execute();

    return {
      ...row,
      roles: roleRows.map((roleRow) => roleRow.code as RoleCode),
      territories: territoryRows.map((territory) => ({
        id: Number(territory.id),
        name: territory.name,
      })),
    };
  }
}
