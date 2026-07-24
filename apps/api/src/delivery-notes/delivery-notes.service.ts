import { Injectable } from "@nestjs/common";
import {
  assertRemitoEditable,
  assertRemitoSoftDeletable,
  assertRemitoTransition,
  isCustomerFacingRemitoType,
  isReturnLikeRemitoType,
  movementKindForBasis,
  remitoPostsAccessoryRentalOnClose,
  remitoPostsCylinderCustodyOnClose,
} from "@weld/domain";
import type {
  CreateDeliveryNoteInput,
  CreateDriverProfileInput,
  CreateRemitoIncidentInput,
  CreateRemitoLineInput,
  CreateVehicleInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteListQuery,
  DriverListQuery,
  DriverProfile,
  OwnershipBasis,
  PrintRemitoPdfQuery,
  RemitoIncident,
  RemitoLine,
  RemitoStatus,
  RemitoTransitionInput,
  RemitoType,
  UpdateDeliveryNoteInput,
  UpdateRemitoIncidentInput,
  UpdateRemitoLineInput,
  Vehicle,
  VehicleListQuery,
  WarehouseListQuery,
} from "@weld/schemas";
import { AccessoriesService } from "../accessories/accessories.service";
import type { AuthPrincipal } from "../auth/principal";
import { hasCapabilities } from "../auth/capabilities";
import { ApiErrors } from "../common/errors/api-error";
import { mapDomainError } from "../common/errors/map-domain-error";
import { MovementsService } from "../movements/movements.service";
import { DeliveryNotesRepository } from "./delivery-notes.repository";
import { buildRemitoPdf } from "./remito-pdf";
import { linesForRemitoPdf } from "./remito-pdf-lines";

const ACTION_TO_STATUS = {
  prepare: "PREPARED",
  assign: "ASSIGNED",
  load: "LOADED",
  dispatch: "IN_TRANSIT",
  deliver: "DELIVERED",
  sign: "SIGNED",
  close: "CLOSED",
  invoice: "INVOICED",
  archive: "ARCHIVED",
  cancel: "CANCELLED",
} as const satisfies Record<string, RemitoStatus>;

type RemitoAction = keyof typeof ACTION_TO_STATUS;

@Injectable()
export class DeliveryNotesService {
  constructor(
    private readonly repository: DeliveryNotesRepository,
    private readonly movements: MovementsService,
    private readonly accessories: AccessoriesService,
  ) {}

  list(query: DeliveryNoteListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<DeliveryNoteDetail> {
    const note = await this.repository.getDetail(id);
    if (!note) throw ApiErrors.notFound("Delivery note not found");
    return note;
  }

  async printPdf(
    principal: AuthPrincipal,
    id: number,
    query: PrintRemitoPdfQuery,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const detail = await this.getById(id);
    const copy = query.copy;
    const reason = query.reason?.trim() || null;

    if (copy === "REIMPRESION") {
      if (
        !hasCapabilities(principal.capabilities, ["delivery_notes:pdf:reprint"])
      ) {
        throw ApiErrors.forbidden("Reprint capability required");
      }
      if (!reason) {
        throw ApiErrors.validationFailed("Reprint reason required", [
          { field: "reason", issue: "Required for REIMPRESION" },
        ]);
      }
    } else if (
      !hasCapabilities(principal.capabilities, ["delivery_notes:pdf"])
    ) {
      throw ApiErrors.forbidden("PDF capability required");
    }

    const reprintSeq =
      copy === "REIMPRESION" ? await this.repository.nextReprintSeq(id) : null;

    const client =
      detail.client_party_id != null
        ? await this.repository.getClientFiscal(detail.client_party_id)
        : null;

    const printedAt = new Date();
    const pdf = await buildRemitoPdf({
      remitoNumber: detail.remito_number,
      remitoType: detail.remito_type,
      status: detail.status,
      issuedDate: detail.issued_date,
      scheduledAt: detail.scheduled_delivery_at
        ? detail.scheduled_delivery_at.slice(0, 16).replace("T", " ")
        : null,
      observations: detail.observations ?? null,
      driverName: detail.driver_name ?? null,
      helperName: detail.helper_name ?? null,
      vehiclePlate: detail.vehicle_plate ?? null,
      warehouseName: detail.origin_warehouse_name ?? null,
      client: {
        name: client?.name ?? detail.client_name ?? null,
        cuit: client?.cuit ?? null,
        address: client?.address ?? null,
      },
      lines: linesForRemitoPdf(detail),
      copyKind: copy,
      reprintSeq,
      reprintReason: reason,
      printedAt,
    });

    await this.repository.logPrint({
      remitoId: id,
      copyKind: copy,
      reprintSeq,
      reason,
      printedBy: principal.id,
      contentVersion: detail.version ?? null,
    });

    return { buffer: pdf.buffer, filename: pdf.filename };
  }

  create(
    principal: AuthPrincipal,
    input: CreateDeliveryNoteInput,
  ): Promise<DeliveryNote> {
    return this.repository.create(input, principal.id);
  }

  async update(
    id: number,
    input: UpdateDeliveryNoteInput,
  ): Promise<DeliveryNote> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    try {
      assertRemitoEditable(current.status);
    } catch (error) {
      mapDomainError(error);
    }
    return this.repository.update(id, input);
  }

  async setPickingStatus(
    id: number,
    status: "PREPARING" | "COMPLETE",
    input: RemitoTransitionInput,
  ): Promise<DeliveryNote> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    if (current.status !== "DRAFT" && current.status !== "PREPARED") {
      throw ApiErrors.validationFailed(
        "Picking status can only change while remito is DRAFT or PREPARED",
        [{ field: "status", issue: `Current status is ${current.status}` }],
      );
    }
    return this.repository.setPickingStatus(id, status, input.version);
  }

  async transition(
    principal: AuthPrincipal,
    id: number,
    action: RemitoAction,
    input: RemitoTransitionInput,
  ): Promise<DeliveryNote> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");

    const toStatus: RemitoStatus = ACTION_TO_STATUS[action];
    const scheduled =
      input.scheduled_delivery_at !== undefined
        ? input.scheduled_delivery_at
        : current.scheduled_delivery_at;

    try {
      assertRemitoTransition(current.status, toStatus, {
        remitoType: current.remito_type,
        hasScheduledDeliveryAt: Boolean(scheduled),
        cancelReason: input.cancel_reason,
        elevatedCancel:
          action === "cancel" &&
          (current.status === "DELIVERED" || current.status === "SIGNED"),
      });
    } catch (error) {
      mapDomainError(error);
    }

    if (action === "prepare") {
      const lineCount = await this.repository.countLines(id);
      if (lineCount < 1) {
        throw ApiErrors.validationFailed("At least one line is required", [
          { field: "lines", issue: "Add at least one line before preparing" },
        ]);
      }
      if (
        isCustomerFacingRemitoType(current.remito_type) &&
        current.client_party_id == null
      ) {
        throw ApiErrors.validationFailed("Client required", [
          {
            field: "client_party_id",
            issue: "Required before preparing a customer-facing remito",
          },
        ]);
      }
    }

    if (action === "assign") {
      const driverId =
        input.driver_id !== undefined ? input.driver_id : current.driver_id;
      const vehicleId =
        input.vehicle_id !== undefined ? input.vehicle_id : current.vehicle_id;
      if (driverId == null && vehicleId == null) {
        throw ApiErrors.validationFailed(
          "Driver or vehicle required for assign",
          [
            {
              field: "driver_id",
              issue: "Provide driver_id and/or vehicle_id",
            },
          ],
        );
      }
    }

    if (action === "cancel" && !input.cancel_reason?.trim()) {
      throw ApiErrors.validationFailed("Cancel reason required", [
        { field: "cancel_reason", issue: "Required" },
      ]);
    }

    if (action === "close") {
      await this.applyCloseSideEffects(principal, current);
    }

    return this.repository.transition({
      id,
      toStatus,
      version: input.version,
      actorUserId: principal.id,
      note: input.note,
      scheduledDeliveryAt:
        input.scheduled_delivery_at !== undefined
          ? input.scheduled_delivery_at
          : undefined,
      cancelReason: input.cancel_reason,
      driverId: input.driver_id,
      helperId: input.helper_id,
      vehicleId: input.vehicle_id,
    });
  }

  /**
   * Aggregate close (R-4b / §14): post custody movements and open/close rentals
   * before flipping status to CLOSED. Runs in the same HTTP transaction.
   */
  private async applyCloseSideEffects(
    principal: AuthPrincipal,
    note: DeliveryNote,
  ): Promise<void> {
    const lines = await this.repository.listLines(note.id);
    const businessDate = remitoBusinessDate(note);
    const clientPartyId = note.client_party_id;

    for (const line of lines) {
      if (line.item_kind === "CYLINDER") {
        await this.closeCylinderLine(
          principal,
          note,
          line,
          businessDate,
          clientPartyId,
        );
      } else if (line.item_kind === "ACCESSORY") {
        await this.closeAccessoryLine(
          principal,
          note.remito_type,
          note.id,
          line,
          businessDate,
          clientPartyId,
        );
      }
    }
  }

  private async closeCylinderLine(
    principal: AuthPrincipal,
    note: DeliveryNote,
    line: RemitoLine,
    businessDate: string,
    clientPartyId: number | null,
  ): Promise<void> {
    if (
      !remitoPostsCylinderCustodyOnClose(note.remito_type) ||
      line.cylinder_id == null ||
      line.movement_event_id != null
    ) {
      return;
    }

    if (clientPartyId == null) {
      throw ApiErrors.validationFailed("Client required to close remito", [
        {
          field: "client_party_id",
          issue: "Required to post cylinder movements",
        },
      ]);
    }

    if (isReturnLikeRemitoType(note.remito_type)) {
      const openId = await this.movements.findOpenIdByCylinder(
        line.cylinder_id,
      );
      if (openId == null) {
        throw ApiErrors.validationFailed(
          "No open movement for returned cylinder",
          [
            {
              field: `lines[${line.line_no}].cylinder_id`,
              issue: `Cylinder ${line.cylinder_id} has no OPEN movement`,
            },
          ],
        );
      }
      const closed = await this.movements.returnMovement(principal, openId, {
        return_date: businessDate,
      });
      await this.repository.linkLineMovement(note.id, line.id, closed.id);
      return;
    }

    const basis = (line.ownership_basis ?? "OURS") as OwnershipBasis;
    const movement = await this.movements.create(principal, {
      cylinder_id: line.cylinder_id,
      holder_party_id: clientPartyId,
      movement_kind: movementKindForBasis(basis),
      gas_code: line.gas_code ?? undefined,
      delivery_date: businessDate,
      remito_id: note.id,
      note: line.notes ?? undefined,
    });
    await this.repository.linkLineMovement(note.id, line.id, movement.id);
  }

  private async closeAccessoryLine(
    principal: AuthPrincipal,
    remitoType: RemitoType,
    remitoId: number,
    line: RemitoLine,
    businessDate: string,
    clientPartyId: number | null,
  ): Promise<void> {
    if (
      !remitoPostsAccessoryRentalOnClose(remitoType) ||
      line.accessory_id == null ||
      line.accessory_rental_id != null ||
      !line.is_rental
    ) {
      return;
    }

    if (clientPartyId == null) {
      throw ApiErrors.validationFailed("Client required to close remito", [
        {
          field: "client_party_id",
          issue: "Required to open/close accessory rentals",
        },
      ]);
    }

    if (isReturnLikeRemitoType(remitoType)) {
      const openId = await this.accessories.findOpenRentalIdByAccessory(
        line.accessory_id,
      );
      if (openId == null) {
        throw ApiErrors.validationFailed(
          "No open accessory rental for returned item",
          [
            {
              field: `lines[${line.line_no}].accessory_id`,
              issue: `Accessory ${line.accessory_id} has no ON_LOAN rental`,
            },
          ],
        );
      }
      const closed = await this.accessories.returnRental(principal, openId, {
        end_date: businessDate,
      });
      await this.repository.linkLineAccessoryRental(
        remitoId,
        line.id,
        closed.id,
      );
      return;
    }

    const rental = await this.accessories.createRental(principal, {
      accessory_id: line.accessory_id,
      client_party_id: clientPartyId,
      quantity: Math.max(1, Math.trunc(line.qty)),
      start_date: businessDate,
      charge_basis: "RENTAL",
      remito_id: remitoId,
      note: line.notes ?? undefined,
    });
    await this.repository.linkLineAccessoryRental(remitoId, line.id, rental.id);
  }

  async addLine(id: number, input: CreateRemitoLineInput): Promise<RemitoLine> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    try {
      assertRemitoEditable(current.status);
    } catch (error) {
      mapDomainError(error);
    }
    return this.repository.addLine(id, input);
  }

  async updateLine(
    id: number,
    lineId: number,
    input: UpdateRemitoLineInput,
  ): Promise<RemitoLine> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    try {
      assertRemitoEditable(current.status);
    } catch (error) {
      mapDomainError(error);
    }
    return this.repository.updateLine(id, lineId, input);
  }

  async deleteLine(id: number, lineId: number): Promise<void> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    try {
      assertRemitoEditable(current.status);
    } catch (error) {
      mapDomainError(error);
    }
    await this.repository.softDeleteLine(id, lineId);
  }

  async remove(id: number): Promise<void> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    try {
      assertRemitoSoftDeletable(current.status);
    } catch (error) {
      mapDomainError(error);
    }

    await this.repository.softDelete(id);
  }

  async addIncident(
    principal: AuthPrincipal,
    id: number,
    input: CreateRemitoIncidentInput,
  ): Promise<RemitoIncident> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    return this.repository.addIncident(id, input, principal.id);
  }

  async updateIncident(
    principal: AuthPrincipal,
    id: number,
    incidentId: number,
    input: UpdateRemitoIncidentInput,
  ): Promise<RemitoIncident> {
    const current = await this.repository.getById(id);
    if (!current) throw ApiErrors.notFound("Delivery note not found");
    return this.repository.updateIncident(id, incidentId, input, principal.id);
  }

  listWarehouses(query: WarehouseListQuery) {
    return this.repository.listWarehouses(query);
  }

  listVehicles(query: VehicleListQuery) {
    return this.repository.listVehicles(query);
  }

  createVehicle(input: CreateVehicleInput): Promise<Vehicle> {
    return this.repository.createVehicle(input);
  }

  listDrivers(query: DriverListQuery) {
    return this.repository.listDrivers(query);
  }

  createDriver(input: CreateDriverProfileInput): Promise<DriverProfile> {
    return this.repository.createDriver(input);
  }

  listRemitoSeries(query: { limit: number; cursor?: string; q?: string }) {
    return this.repository.listRemitoSeries(query);
  }
}

/** Business date for custody / rental cycles: arrival day → issued → today. */
function remitoBusinessDate(note: DeliveryNote): string {
  if (note.arrival_at) return note.arrival_at.slice(0, 10);
  if (note.issued_date) return note.issued_date;
  return new Date().toISOString().slice(0, 10);
}
