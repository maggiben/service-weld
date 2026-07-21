import { z } from "zod";
import { IsoDate, paginated, PaginationQuery } from "./common";
import { CylinderState, GasCode } from "./enums";
import { Cylinder } from "./cylinder";

export const BatteryMember = z.object({
  cylinder_id: z.number().int(),
  serial_number: z.string().optional(),
  gas_code: GasCode.nullable().optional(),
  state: CylinderState.optional(),
  added_at: z.string().datetime(),
  removed_at: z.string().datetime().nullable().optional(),
});
export type BatteryMember = z.infer<typeof BatteryMember>;

export const Battery = z.object({
  id: z.number().int(),
  battery_code: z.string(),
  owner_party_id: z.number().int(),
  owner_name: z.string().optional(),
  gas_code: GasCode.nullable(),
  member_count: z.number().int().nullable(),
  state: CylinderState,
  version: z.number().int(),
  created_at: z.string().datetime(),
  members: z.array(BatteryMember).optional(),
});
export type Battery = z.infer<typeof Battery>;

export const CreateBatteryInput = z.object({
  battery_code: z.string().min(1),
  owner_party_id: z.number().int(),
  gas_code: GasCode.nullable().optional(),
  member_cylinder_ids: z.array(z.number().int()).min(2),
});
export type CreateBatteryInput = z.infer<typeof CreateBatteryInput>;

export const AddBatteryMemberInput = z.object({
  cylinder_id: z.number().int(),
});
export type AddBatteryMemberInput = z.infer<typeof AddBatteryMemberInput>;

export const BatteryListQuery = PaginationQuery.extend({
  q: z.string().optional(),
  sort: z.enum(["battery_code", "-battery_code"]).default("battery_code"),
  "filter[state]": CylinderState.optional(),
  "filter[gas_code]": GasCode.optional(),
  "filter[owner_party_id]": z.coerce.number().int().optional(),
});
export type BatteryListQuery = z.infer<typeof BatteryListQuery>;

export const BatteryListResponse = paginated(Battery);
export type BatteryListResponse = z.infer<typeof BatteryListResponse>;

export const ReplaceCylinderInput = z.object({
  replacement_cylinder_id: z.number().int(),
  client_party_id: z.number().int(),
  occurred_on: IsoDate,
  note: z.string().nullable().optional(),
});
export type ReplaceCylinderInput = z.infer<typeof ReplaceCylinderInput>;

export const ReplaceCylinderResponse = z.object({
  original: Cylinder,
  replacement_movement: z.object({
    id: z.number().int(),
    cylinder_id: z.number().int(),
    holder_party_id: z.number().int(),
    state: z.string(),
  }),
});
export type ReplaceCylinderResponse = z.infer<typeof ReplaceCylinderResponse>;
