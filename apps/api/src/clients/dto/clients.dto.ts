import { createZodDto } from "nestjs-zod";
import {
  ClientAccountQuery,
  ClientAccountResponse,
  ClientListQuery,
  ClientListResponse,
  CreateClientInput,
} from "@weld/schemas";

export class ClientListQueryDto extends createZodDto(ClientListQuery) {}
export class CreateClientDto extends createZodDto(CreateClientInput) {}
export class ClientListResponseDto extends createZodDto(ClientListResponse) {}
export class ClientAccountQueryDto extends createZodDto(ClientAccountQuery) {}
export class ClientAccountResponseDto extends createZodDto(
  ClientAccountResponse,
) {}
