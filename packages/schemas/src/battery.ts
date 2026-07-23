import { z as zod } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { CylinderState, GasCode } from "./enums";
import { Cylinder } from "./cylinder";

export const BatteryMember = zod.object({
  cylinder_id: zod.number().int(),
  serial_number: zod.string().optional(),
  gas_code: GasCode.nullable().optional(),
  state: CylinderState.optional(),
  added_at: zod.string().datetime(),
  removed_at: zod.string().datetime().nullable().optional(),
});
export type BatteryMember = zod.infer<typeof BatteryMember>;

export const Battery = zod.object({
  id: zod.number().int(),
  battery_code: zod.string(),
  owner_party_id: zod.number().int(),
  owner_name: zod.string().optional(),
  gas_code: GasCode.nullable(),
  member_count: zod.number().int().nullable(),
  state: CylinderState,
  version: zod.number().int(),
  created_at: zod.string().datetime(),
  members: zod.array(BatteryMember).optional(),
});
export type Battery = zod.infer<typeof Battery>;

export const CreateBatteryInput = zod.object({
  battery_code: zod.string().min(1),
  owner_party_id: zod.number().int(),
  gas_code: GasCode.nullable().optional(),
  member_cylinder_ids: zod.array(zod.number().int()).min(2),
});
export type CreateBatteryInput = zod.infer<typeof CreateBatteryInput>;

export const AddBatteryMemberInput = zod.object({
  cylinder_id: zod.number().int(),
});
export type AddBatteryMemberInput = zod.infer<typeof AddBatteryMemberInput>;

export const BatteryListQuery = PaginationQuery.extend({
  q: zod.string().optional(),
  sort: zod.enum(["battery_code", "-battery_code"]).default("battery_code"),
  "filter[state]": CylinderState.optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[owner_party_id]": zod.coerce.number().int().optional(),
});
export type BatteryListQuery = zod.infer<typeof BatteryListQuery>;

export const BatteryListResponse = paginated(Battery);
export type BatteryListResponse = zod.infer<typeof BatteryListResponse>;

export const ReplaceCylinderInput = zod.object({
  replacement_cylinder_id: zod.number().int(),
  client_party_id: zod.number().int(),
  occurred_on: IsoDate,
  note: zod.string().nullable().optional(),
});
export type ReplaceCylinderInput = zod.infer<typeof ReplaceCylinderInput>;

export const ReplaceCylinderResponse = zod.object({
  original: Cylinder,
  replacement_movement: zod.object({
    id: zod.number().int(),
    cylinder_id: zod.number().int(),
    holder_party_id: zod.number().int(),
    state: zod.string(),
  }),
});
export type ReplaceCylinderResponse = zod.infer<typeof ReplaceCylinderResponse>;
