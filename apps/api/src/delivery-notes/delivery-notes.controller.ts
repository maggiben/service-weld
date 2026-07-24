import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
} from "@nestjs/swagger";
import type { DeliveryNote, DeliveryNoteDetail } from "@weld/schemas";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  CreateDeliveryNoteDto,
  DeliveryNoteListQueryDto,
  DeliveryNoteListResponseDto,
} from "./dto/delivery-notes.dto";
import { DeliveryNotesService } from "./delivery-notes.service";

@ApiTags("DeliveryNotes")
@ApiBearerAuth()
@Controller("delivery-notes")
export class DeliveryNotesController {
  constructor(private readonly deliveryNotesService: DeliveryNotesService) {}

  @Get()
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ type: DeliveryNoteListResponseDto })
  list(@Query() query: DeliveryNoteListQueryDto) {
    return this.deliveryNotesService.list(query);
  }

  @Post()
  @RequireCapabilities("delivery_notes:write")
  @ApiCreatedResponse({ description: "Delivery note registered" })
  create(@Body() body: CreateDeliveryNoteDto): Promise<DeliveryNote> {
    return this.deliveryNotesService.create(body);
  }

  @Get(":id")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ description: "Delivery note detail with linked items" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<DeliveryNoteDetail> {
    return this.deliveryNotesService.getById(id);
  }
}
