import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import type { AuthPrincipal } from "../auth/principal";
import { ClientsService } from "./clients.service";
import {
  ClientAccountQueryDto,
  ClientAccountResponseDto,
  ClientListQueryDto,
  ClientListResponseDto,
  CreateClientDto,
} from "./dto/clients.dto";
import type { Client, ClientAccountResponse } from "@weld/schemas";

@ApiTags("Clients")
@ApiBearerAuth()
@Controller("clients")
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  @RequireCapabilities("clients:read")
  @ApiOkResponse({ type: ClientListResponseDto })
  list(@CurrentUser() user: AuthPrincipal, @Query() query: ClientListQueryDto) {
    return this.clientsService.list(user, query);
  }

  @Post()
  @RequireCapabilities("clients:write")
  @ApiCreatedResponse({ description: "Created client" })
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateClientDto,
    @Req() req: Request,
  ): Promise<Client> {
    void req.headers["idempotency-key"];
    return this.clientsService.create(user, body);
  }

  @Get(":id/account")
  @RequireCapabilities("clients:read")
  @ApiOkResponse({ type: ClientAccountResponseDto })
  getAccount(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Query() query: ClientAccountQueryDto,
  ): Promise<ClientAccountResponse> {
    return this.clientsService.getAccount(user, id, query);
  }

  @Get(":id")
  @RequireCapabilities("clients:read")
  @ApiOkResponse({ description: "Client detail" })
  getById(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
  ): Promise<Client> {
    return this.clientsService.getById(user, id);
  }
}
