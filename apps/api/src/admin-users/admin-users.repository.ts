import { Inject, Injectable } from "@nestjs/common";
import type {
  AdminUser,
  AdminUserListQuery,
  CreateAdminUserInput,
  RoleCode,
  UpdateAdminUserInput,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import {
  buildPageMeta,
  decodeCursor,
  encodeCursor,
  parseSort,
} from "../common/pagination/cursor";
import { KYSELY, type DB } from "../database/database.module";
import { resolveDb } from "../database/transaction.context";
import { hashPassword } from "../auth/password";

interface UserRow {
  id: number | string | bigint;
  username: string;
  email: string | null;
  is_active: boolean;
  mfa_enabled: boolean;
  last_login_at: Date | null;
  created_at: Date;
  version: number | string;
}

function mapUser(
  row: UserRow,
  roles: RoleCode[],
  territories: Array<{ id: number; name: string }>,
): AdminUser {
  return {
    id: Number(row.id),
    username: row.username,
    email: row.email,
    roles,
    territories: territories.map((territory) => territory.name),
    territory_ids: territories.map((territory) => territory.id),
    is_active: row.is_active,
    mfa_enabled: row.mfa_enabled,
    last_login_at: row.last_login_at ? row.last_login_at.toISOString() : null,
    created_at: row.created_at.toISOString(),
    version: Number(row.version),
  };
}

@Injectable()
export class AdminUsersRepository {
  constructor(@Inject(KYSELY) private readonly db: DB) {}

  async list(query: AdminUserListQuery): Promise<{
    data: AdminUser[];
    page: ReturnType<typeof buildPageMeta>;
  }> {
    const db = resolveDb(this.db);
    const limit = query.limit;
    const sort = parseSort(query.sort, ["username"]);

    let qb = db
      .selectFrom("app_user")
      .select([
        "app_user.id",
        "app_user.username",
        "app_user.email",
        "app_user.is_active",
        "app_user.mfa_enabled",
        "app_user.last_login_at",
        "app_user.created_at",
        "app_user.version",
      ])
      .where("app_user.deleted_at", "is", null);

    if (query["filter[is_active]"] != null) {
      qb = qb.where(
        "app_user.is_active",
        "=",
        query["filter[is_active]"] === "true",
      );
    }
    if (query.q) {
      const term = `%${query.q.trim()}%`;
      qb = qb.where((eb) =>
        eb.or([
          eb("app_user.username", "ilike", term),
          eb("app_user.email", "ilike", term),
        ]),
      );
    }
    if (query["filter[role]"]) {
      qb = qb.where(({ exists, selectFrom }) =>
        exists(
          selectFrom("user_role")
            .innerJoin("role", "role.id", "user_role.role_id")
            .select("user_role.user_id")
            .whereRef("user_role.user_id", "=", "app_user.id")
            .where("role.code", "=", query["filter[role]"]!),
        ),
      );
    }

    if (query.cursor) {
      const cursor = decodeCursor(query.cursor);
      const cursorUsername = String(cursor.username ?? "");
      const cursorId = Number(cursor.id ?? 0);
      qb =
        sort.direction === "asc"
          ? qb.where((eb) =>
              eb.or([
                eb("app_user.username", ">", cursorUsername),
                eb.and([
                  eb("app_user.username", "=", cursorUsername),
                  eb("app_user.id", ">", cursorId),
                ]),
              ]),
            )
          : qb.where((eb) =>
              eb.or([
                eb("app_user.username", "<", cursorUsername),
                eb.and([
                  eb("app_user.username", "=", cursorUsername),
                  eb("app_user.id", "<", cursorId),
                ]),
              ]),
            );
    }

    const rows = (await qb
      .orderBy("app_user.username", sort.direction)
      .orderBy("app_user.id", sort.direction)
      .limit(limit + 1)
      .execute()) as UserRow[];

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const data = await Promise.all(
      pageRows.map(async (row) => {
        const extras = await this.loadRolesAndTerritories(Number(row.id));
        return mapUser(row, extras.roles, extras.territories);
      }),
    );
    const last = pageRows[pageRows.length - 1];

    return {
      data,
      page: buildPageMeta({
        limit,
        hasMore,
        nextCursor:
          hasMore && last
            ? encodeCursor({
                username: last.username,
                id: Number(last.id),
              })
            : null,
      }),
    };
  }

  async getById(id: number): Promise<AdminUser> {
    const row = await this.fetchRow(id);
    if (!row) throw ApiErrors.notFound("User not found");
    const extras = await this.loadRolesAndTerritories(id);
    return mapUser(row, extras.roles, extras.territories);
  }

  async create(input: CreateAdminUserInput): Promise<AdminUser> {
    const db = resolveDb(this.db);
    const existing = await db
      .selectFrom("app_user")
      .select(["id"])
      .where("username", "=", input.username)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    if (existing) {
      throw ApiErrors.duplicateUsername();
    }

    const roleIds = await this.resolveRoleIds(input.roles);
    await this.assertTerritoryIds(input.territory_ids);
    const passwordHash = await hashPassword(input.password);

    const user = await db
      .insertInto("app_user")
      .values({
        username: input.username,
        email: input.email ?? null,
        password_hash: passwordHash,
        is_active: true,
        mfa_enabled: input.mfa_enabled,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    const userId = Number(user.id);
    if (roleIds.length > 0) {
      await db
        .insertInto("user_role")
        .values(roleIds.map((role_id) => ({ user_id: userId, role_id })))
        .execute();
    }
    if (input.territory_ids.length > 0) {
      await db
        .insertInto("user_territory_scope")
        .values(
          input.territory_ids.map((territory_id) => ({
            user_id: userId,
            territory_id,
          })),
        )
        .execute();
    }

    return this.getById(userId);
  }

  async update(
    id: number,
    input: UpdateAdminUserInput,
    actorUserId: number,
  ): Promise<AdminUser> {
    const db = resolveDb(this.db);
    const existing = await this.fetchRow(id);
    if (!existing) throw ApiErrors.notFound("User not found");

    if (input.is_active === false && id === actorUserId) {
      throw ApiErrors.forbidden("You cannot deactivate your own account");
    }

    const patch: {
      email?: string | null;
      password_hash?: string;
      is_active?: boolean;
      mfa_enabled?: boolean;
      updated_at: Date;
      version: number;
    } = {
      updated_at: new Date(),
      version: Number(existing.version) + 1,
    };

    if (input.email !== undefined) patch.email = input.email;
    if (input.is_active !== undefined) patch.is_active = input.is_active;
    if (input.mfa_enabled !== undefined) patch.mfa_enabled = input.mfa_enabled;
    if (input.password) {
      patch.password_hash = await hashPassword(input.password);
    }

    await db
      .updateTable("app_user")
      .set(patch)
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .execute();

    if (input.roles) {
      const roleIds = await this.resolveRoleIds(input.roles);
      await db.deleteFrom("user_role").where("user_id", "=", id).execute();
      if (roleIds.length > 0) {
        await db
          .insertInto("user_role")
          .values(roleIds.map((role_id) => ({ user_id: id, role_id })))
          .execute();
      }
    }

    if (input.territory_ids) {
      await this.assertTerritoryIds(input.territory_ids);
      await db
        .deleteFrom("user_territory_scope")
        .where("user_id", "=", id)
        .execute();
      if (input.territory_ids.length > 0) {
        await db
          .insertInto("user_territory_scope")
          .values(
            input.territory_ids.map((territory_id) => ({
              user_id: id,
              territory_id,
            })),
          )
          .execute();
      }
    }

    if (input.is_active === false) {
      await db
        .updateTable("refresh_token")
        .set({ revoked_at: new Date() })
        .where("user_id", "=", id)
        .where("revoked_at", "is", null)
        .execute();
    }

    return this.getById(id);
  }

  async remove(id: number, actorUserId: number): Promise<void> {
    if (id === actorUserId) {
      throw ApiErrors.forbidden("You cannot remove your own account");
    }
    const db = resolveDb(this.db);
    const existing = await this.fetchRow(id);
    if (!existing) throw ApiErrors.notFound("User not found");

    await db
      .updateTable("app_user")
      .set({
        is_active: false,
        deleted_at: new Date(),
        updated_at: new Date(),
        version: Number(existing.version) + 1,
      })
      .where("id", "=", id)
      .execute();

    await db
      .updateTable("refresh_token")
      .set({ revoked_at: new Date() })
      .where("user_id", "=", id)
      .where("revoked_at", "is", null)
      .execute();
  }

  private async fetchRow(id: number): Promise<UserRow | null> {
    const db = resolveDb(this.db);
    const row = await db
      .selectFrom("app_user")
      .select([
        "id",
        "username",
        "email",
        "is_active",
        "mfa_enabled",
        "last_login_at",
        "created_at",
        "version",
      ])
      .where("id", "=", id)
      .where("deleted_at", "is", null)
      .executeTakeFirst();
    return (row as UserRow | undefined) ?? null;
  }

  private async loadRolesAndTerritories(userId: number): Promise<{
    roles: RoleCode[];
    territories: Array<{ id: number; name: string }>;
  }> {
    const db = resolveDb(this.db);
    const roleRows = await db
      .selectFrom("user_role")
      .innerJoin("role", "role.id", "user_role.role_id")
      .select(["role.code"])
      .where("user_role.user_id", "=", userId)
      .execute();

    const territoryRows = await db
      .selectFrom("user_territory_scope")
      .innerJoin(
        "dispatch_territory",
        "dispatch_territory.id",
        "user_territory_scope.territory_id",
      )
      .select(["dispatch_territory.id", "dispatch_territory.name"])
      .where("user_territory_scope.user_id", "=", userId)
      .execute();

    return {
      roles: roleRows.map((row) => row.code as RoleCode),
      territories: territoryRows.map((row) => ({
        id: Number(row.id),
        name: row.name,
      })),
    };
  }

  private async resolveRoleIds(roles: RoleCode[]): Promise<number[]> {
    const db = resolveDb(this.db);
    const rows = await db
      .selectFrom("role")
      .select(["id", "code"])
      .where("code", "in", roles)
      .execute();
    if (rows.length !== roles.length) {
      throw ApiErrors.validationFailed("One or more roles are invalid");
    }
    return rows.map((row) => Number(row.id));
  }

  private async assertTerritoryIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const db = resolveDb(this.db);
    const rows = await db
      .selectFrom("dispatch_territory")
      .select(["id"])
      .where("id", "in", ids)
      .execute();
    if (rows.length !== ids.length) {
      throw ApiErrors.validationFailed("One or more territories are invalid");
    }
  }
}
