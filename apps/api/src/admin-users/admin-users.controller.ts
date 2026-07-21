import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { AdminUser } from "@weld/schemas";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import {
  AdminUserListQueryDto,
  AdminUserListResponseDto,
  CreateAdminUserDto,
  UpdateAdminUserDto,
} from "./dto/admin-users.dto";
import { AdminUsersService } from "./admin-users.service";

@ApiTags("Admin")
@ApiBearerAuth()
@Controller("admin/users")
export class AdminUsersController {
  constructor(private readonly adminUsersService: AdminUsersService) {}

  @Get()
  @RequireCapabilities("admin:read")
  @ApiOkResponse({ type: AdminUserListResponseDto })
  list(@Query() query: AdminUserListQueryDto) {
    return this.adminUsersService.list(query);
  }

  @Get(":id")
  @RequireCapabilities("admin:read")
  @ApiOkResponse({ description: "User detail" })
  get(@Param("id", ParseIntPipe) id: number): Promise<AdminUser> {
    return this.adminUsersService.get(id);
  }

  @Post()
  @RequireCapabilities("admin:write")
  @ApiCreatedResponse({ description: "Created user" })
  create(@Body() body: CreateAdminUserDto): Promise<AdminUser> {
    return this.adminUsersService.create(body);
  }

  @Patch(":id")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "Updated user" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateAdminUserDto,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<AdminUser> {
    return this.adminUsersService.update(id, body, user.id);
  }

  @Delete(":id")
  @RequireCapabilities("admin:write")
  @ApiOkResponse({ description: "User removed" })
  async remove(
    @Param("id", ParseIntPipe) id: number,
    @CurrentUser() user: AuthPrincipal,
  ): Promise<{ ok: true }> {
    await this.adminUsersService.remove(id, user.id);
    return { ok: true };
  }
}
