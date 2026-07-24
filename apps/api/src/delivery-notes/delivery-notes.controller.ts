import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
} from "@nestjs/swagger";
import type { Response } from "express";
import type {
  DeliveryNote,
  DeliveryNoteDetail,
  RemitoIncident,
  RemitoLine,
} from "@weld/schemas";
import type { AuthPrincipal } from "../auth/principal";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequireCapabilities } from "../common/decorators/require-capabilities.decorator";
import {
  CreateDeliveryNoteDto,
  CreateRemitoIncidentDto,
  CreateRemitoLineDto,
  DeliveryNoteListQueryDto,
  DeliveryNoteListResponseDto,
  PrintRemitoPdfQueryDto,
  RemitoTransitionDto,
  UpdateDeliveryNoteDto,
  UpdateRemitoIncidentDto,
  UpdateRemitoLineDto,
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
  create(
    @CurrentUser() user: AuthPrincipal,
    @Body() body: CreateDeliveryNoteDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.create(user, body);
  }

  @Get(":id/pdf")
  @RequireCapabilities("delivery_notes:pdf")
  @ApiProduces("application/pdf")
  @ApiOkResponse({ description: "Remito PDF (logs print copy)" })
  @Header("Content-Type", "application/pdf")
  async printPdf(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Query() query: PrintRemitoPdfQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.deliveryNotesService.printPdf(
      user,
      id,
      query,
    );
    res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Get(":id")
  @RequireCapabilities("delivery_notes:read")
  @ApiOkResponse({ description: "Delivery note detail with linked items" })
  getById(@Param("id", ParseIntPipe) id: number): Promise<DeliveryNoteDetail> {
    return this.deliveryNotesService.getById(id);
  }

  @Patch(":id")
  @RequireCapabilities("delivery_notes:write")
  @ApiOkResponse({ description: "Draft remito updated" })
  update(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateDeliveryNoteDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.update(id, body);
  }

  @Post(":id/lines")
  @RequireCapabilities("delivery_notes:write")
  @ApiCreatedResponse({ description: "Remito line added" })
  addLine(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CreateRemitoLineDto,
  ): Promise<RemitoLine> {
    return this.deliveryNotesService.addLine(id, body);
  }

  @Patch(":id/lines/:lineId")
  @RequireCapabilities("delivery_notes:write")
  @ApiOkResponse({ description: "Remito line updated" })
  updateLine(
    @Param("id", ParseIntPipe) id: number,
    @Param("lineId", ParseIntPipe) lineId: number,
    @Body() body: UpdateRemitoLineDto,
  ): Promise<RemitoLine> {
    return this.deliveryNotesService.updateLine(id, lineId, body);
  }

  @Delete(":id/lines/:lineId")
  @RequireCapabilities("delivery_notes:write")
  @HttpCode(204)
  @ApiNoContentResponse({ description: "Remito line soft-deleted" })
  async deleteLine(
    @Param("id", ParseIntPipe) id: number,
    @Param("lineId", ParseIntPipe) lineId: number,
  ): Promise<void> {
    await this.deliveryNotesService.deleteLine(id, lineId);
  }

  @Post(":id/incidents")
  @RequireCapabilities("delivery_notes:incident")
  @ApiCreatedResponse({ description: "Remito incident recorded" })
  addIncident(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: CreateRemitoIncidentDto,
  ): Promise<RemitoIncident> {
    return this.deliveryNotesService.addIncident(user, id, body);
  }

  @Patch(":id/incidents/:incidentId")
  @RequireCapabilities("delivery_notes:incident")
  @ApiOkResponse({ description: "Remito incident updated" })
  updateIncident(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Param("incidentId", ParseIntPipe) incidentId: number,
    @Body() body: UpdateRemitoIncidentDto,
  ): Promise<RemitoIncident> {
    return this.deliveryNotesService.updateIncident(user, id, incidentId, body);
  }

  @Post(":id/picking/start")
  @RequireCapabilities("delivery_notes:pick")
  @ApiOkResponse({ description: "Picking marked PREPARING" })
  pickingStart(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.setPickingStatus(id, "PREPARING", body);
  }

  @Post(":id/picking/complete")
  @RequireCapabilities("delivery_notes:pick")
  @ApiOkResponse({ description: "Picking marked COMPLETE" })
  pickingComplete(
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.setPickingStatus(id, "COMPLETE", body);
  }

  @Post(":id/prepare")
  @RequireCapabilities("delivery_notes:prepare")
  transitionPrepare(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "prepare", body);
  }

  @Post(":id/assign")
  @RequireCapabilities("delivery_notes:assign")
  transitionAssign(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "assign", body);
  }

  @Post(":id/load")
  @RequireCapabilities("delivery_notes:load")
  transitionLoad(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "load", body);
  }

  @Post(":id/dispatch")
  @RequireCapabilities("delivery_notes:dispatch")
  transitionDispatch(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "dispatch", body);
  }

  @Post(":id/deliver")
  @RequireCapabilities("delivery_notes:deliver")
  transitionDeliver(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "deliver", body);
  }

  @Post(":id/sign")
  @RequireCapabilities("delivery_notes:sign")
  transitionSign(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "sign", body);
  }

  @Post(":id/close")
  @RequireCapabilities("delivery_notes:close")
  transitionClose(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "close", body);
  }

  @Post(":id/cancel")
  @RequireCapabilities("delivery_notes:cancel")
  transitionCancel(
    @CurrentUser() user: AuthPrincipal,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: RemitoTransitionDto,
  ): Promise<DeliveryNote> {
    return this.deliveryNotesService.transition(user, id, "cancel", body);
  }
}
