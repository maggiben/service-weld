import { Injectable } from "@nestjs/common";
import type {
  AdminUser,
  AdminUserListQuery,
  CreateAdminUserInput,
  UpdateAdminUserInput,
} from "@weld/schemas";
import { AdminUsersRepository } from "./admin-users.repository";

@Injectable()
export class AdminUsersService {
  constructor(private readonly repository: AdminUsersRepository) {}

  list(query: AdminUserListQuery) {
    return this.repository.list(query);
  }

  get(id: number): Promise<AdminUser> {
    return this.repository.getById(id);
  }

  create(input: CreateAdminUserInput): Promise<AdminUser> {
    return this.repository.create(input);
  }

  update(
    id: number,
    input: UpdateAdminUserInput,
    actorUserId: number,
  ): Promise<AdminUser> {
    return this.repository.update(id, input, actorUserId);
  }

  remove(id: number, actorUserId: number): Promise<void> {
    return this.repository.remove(id, actorUserId);
  }
}
