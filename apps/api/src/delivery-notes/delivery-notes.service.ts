import { Injectable } from "@nestjs/common";
import type {
  CreateDeliveryNoteInput,
  DeliveryNote,
  DeliveryNoteDetail,
  DeliveryNoteListQuery,
} from "@weld/schemas";
import { ApiErrors } from "../common/errors/api-error";
import { DeliveryNotesRepository } from "./delivery-notes.repository";

@Injectable()
export class DeliveryNotesService {
  constructor(private readonly repository: DeliveryNotesRepository) {}

  list(query: DeliveryNoteListQuery) {
    return this.repository.list(query);
  }

  async getById(id: number): Promise<DeliveryNoteDetail> {
    const note = await this.repository.getDetail(id);
    if (!note) throw ApiErrors.notFound("Delivery note not found");
    return note;
  }

  create(input: CreateDeliveryNoteInput): Promise<DeliveryNote> {
    return this.repository.create(input);
  }
}
