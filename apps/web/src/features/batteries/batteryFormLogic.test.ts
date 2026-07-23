import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Battery, Cylinder } from "@weld/schemas";
import { ApiClientError } from "@weld/api-client";
import {
  batteryFormErrorMessage,
  buildOwnerOptions,
  canMarkBatteryEmpty,
  canMarkBatteryFull,
  canSaveBatteryForm,
  chipLabel,
  fromBatteryMembers,
  fromCylinder,
  isPackableCandidate,
  memberIdDiff,
  memberLabel,
  mergeMemberOptions,
  parseIdTokens,
  resolveMemberTokens,
  type MemberOption,
} from "./batteryFormLogic";

function cylinder(over: Partial<Cylinder> = {}): Cylinder {
  return {
    id: 1,
    owner_party_id: 10,
    owner_name: "Acme",
    serial_number: "S-1",
    gas_code: "O2",
    capacity_m3: 10,
    capacity_unit: "M3",
    ownership_basis: "OWNED",
    packaging: "SINGLE",
    battery_id: null,
    home_territory_id: null,
    state: "IN_STOCK_FULL",
    condition: "FULL",
    acquisition_date: null,
    version: 1,
    created_at: "2024-01-01T00:00:00.000Z",
    ...over,
  };
}

function battery(over: Partial<Battery> = {}): Battery {
  return {
    id: 5,
    battery_code: "BAT-1",
    owner_party_id: 10,
    owner_name: "Acme",
    gas_code: "O2",
    state: "IN_STOCK_FULL",
    member_count: 2,
    members: [
      { cylinder_id: 1, serial_number: "S-1", gas_code: "O2" },
      { cylinder_id: 2, serial_number: null, gas_code: "O2" },
    ],
    ...over,
  };
}

describe("parseIdTokens", () => {
  it("splits, trims, dedupes, and drops invalid tokens", () => {
    assert.deepEqual(parseIdTokens("1, 2  2\t3"), [1, 2, 3]);
    assert.deepEqual(parseIdTokens("0, -1, foo, 4.5, 7"), [4.5, 7]);
    assert.deepEqual(parseIdTokens("  ,  "), []);
    assert.deepEqual(parseIdTokens(""), []);
  });
});

describe("member labels", () => {
  it("formats full and chip labels", () => {
    const full: MemberOption = {
      id: 9,
      serial_number: "ABC",
      owner_name: "Acme",
      gas_code: "CO2",
    };
    assert.equal(memberLabel(full), "ABC (#9) · Acme · CO2");
    assert.equal(chipLabel(full), "ABC (#9)");
    assert.equal(memberLabel({ id: 1, serial_number: "X" }), "X (#1)");
  });
});

describe("fromCylinder / fromBatteryMembers", () => {
  it("maps cylinder and battery members", () => {
    const item = cylinder({ id: 3, serial_number: "Z", owner_name: "Own" });
    assert.deepEqual(fromCylinder(item), {
      id: 3,
      serial_number: "Z",
      gas_code: "O2",
      owner_name: "Own",
      owner_party_id: 10,
    });

    const mapped = fromBatteryMembers(battery());
    assert.equal(mapped.length, 2);
    assert.equal(mapped[0]?.serial_number, "S-1");
    assert.equal(mapped[1]?.serial_number, "2"); // null serial → id string
    assert.equal(mapped[0]?.owner_party_id, 10);

    assert.deepEqual(fromBatteryMembers(battery({ members: undefined })), []);
  });
});

describe("isPackableCandidate", () => {
  it("rejects battery husks and foreign packed members", () => {
    assert.equal(
      isPackableCandidate(cylinder({ packaging: "BATTERY" }), 10, null),
      false,
    );
    assert.equal(
      isPackableCandidate(
        cylinder({ packaging: "BATTERY_MEMBER", battery_id: 99 }),
        10,
        null,
      ),
      false,
    );
    assert.equal(
      isPackableCandidate(
        cylinder({ packaging: "BATTERY_MEMBER", battery_id: 5 }),
        10,
        7,
      ),
      false,
    );
  });

  it("allows current battery members while editing", () => {
    assert.equal(
      isPackableCandidate(
        cylinder({
          packaging: "BATTERY_MEMBER",
          battery_id: 5,
          state: "AT_CLIENT",
        }),
        10,
        5,
      ),
      true,
    );
  });

  it("requires stock for singles and matches owner when set", () => {
    assert.equal(
      isPackableCandidate(cylinder({ state: "AT_CLIENT" }), 10, null),
      false,
    );
    assert.equal(
      isPackableCandidate(cylinder({ state: "IN_STOCK_EMPTY" }), 10, null),
      true,
    );
    assert.equal(
      isPackableCandidate(cylinder({ owner_party_id: 99 }), 10, null),
      false,
    );
    assert.equal(
      isPackableCandidate(cylinder({ owner_party_id: 99 }), "", null),
      true,
    );
    assert.equal(
      isPackableCandidate(cylinder({ owner_party_id: 99 }), undefined, null),
      true,
    );
  });
});

describe("memberIdDiff", () => {
  it("computes add/remove sets for edit sync", () => {
    assert.deepEqual(memberIdDiff([1, 2, 3], [2, 3, 4]), {
      toAdd: [4],
      toRemove: [1],
    });
    assert.deepEqual(memberIdDiff([1, 2], [1, 2]), {
      toAdd: [],
      toRemove: [],
    });
  });
});

describe("canSaveBatteryForm", () => {
  it("enforces BR-13 min members and required fields", () => {
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "BAT",
        ownerId: 1,
        memberCount: 2,
      }),
      true,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: true,
        loadingBattery: false,
        code: "BAT",
        ownerId: 1,
        memberCount: 2,
      }),
      false,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: true,
        code: "BAT",
        ownerId: 1,
        memberCount: 2,
      }),
      false,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "  ",
        ownerId: 1,
        memberCount: 2,
      }),
      false,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "BAT",
        ownerId: "",
        memberCount: 2,
      }),
      false,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "BAT",
        ownerId: 1,
        memberCount: 1,
      }),
      false,
    );
  });

  it("requires changes in edit mode", () => {
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "BAT",
        ownerId: 1,
        memberCount: 2,
        isEdit: true,
        hasChanges: false,
      }),
      false,
    );
    assert.equal(
      canSaveBatteryForm({
        saving: false,
        loadingBattery: false,
        code: "BAT",
        ownerId: 1,
        memberCount: 2,
        isEdit: true,
        hasChanges: true,
      }),
      true,
    );
  });
});

describe("canMarkBatteryFull / canMarkBatteryEmpty", () => {
  it("only allows plant stock transitions", () => {
    assert.equal(canMarkBatteryFull("IN_STOCK_EMPTY"), true);
    assert.equal(canMarkBatteryFull("IN_STOCK_FULL"), false);
    assert.equal(canMarkBatteryFull("AT_CLIENT"), false);
    assert.equal(canMarkBatteryFull(undefined), false);

    assert.equal(canMarkBatteryEmpty("IN_STOCK_FULL"), true);
    assert.equal(canMarkBatteryEmpty("IN_STOCK_EMPTY"), false);
    assert.equal(canMarkBatteryEmpty("AT_CLIENT"), false);
    assert.equal(canMarkBatteryEmpty(undefined), false);
  });
});

describe("buildOwnerOptions / mergeMemberOptions", () => {
  it("builds owner map and merges picker options", () => {
    const owners = buildOwnerOptions(
      [
        cylinder({ owner_party_id: 1, owner_name: "A" }),
        cylinder({ owner_party_id: 1, owner_name: "A" }),
        cylinder({ owner_party_id: 2, owner_name: undefined }),
      ],
      { owner_party_id: 3, owner_name: "Edit" },
    );
    assert.deepEqual(owners, [
      [1, "A"],
      [3, "Edit"],
    ]);
    assert.deepEqual(buildOwnerOptions([], null), []);
    assert.deepEqual(
      buildOwnerOptions([], { owner_party_id: 9, owner_name: null }),
      [],
    );

    const members: MemberOption[] = [
      { id: 1, serial_number: "kept", owner_party_id: 10 },
    ];
    const merged = mergeMemberOptions(members, [
      cylinder({ id: 1, serial_number: "ignored" }),
      cylinder({ id: 2, serial_number: "new" }),
    ]);
    assert.equal(
      merged.find((member) => member.id === 1)?.serial_number,
      "kept",
    );
    assert.equal(
      merged.find((member) => member.id === 2)?.serial_number,
      "new",
    );
  });
});

describe("batteryFormErrorMessage", () => {
  const translate = (key: string) => `t:${key}`;

  it("maps known codes and falls back", () => {
    assert.equal(
      batteryFormErrorMessage(
        new ApiClientError("TOO_FEW_MEMBERS", "x", 400),
        translate,
      ),
      "t:errors.too_few_members",
    );
    assert.equal(
      batteryFormErrorMessage(
        new ApiClientError("MEMBER_ALREADY_PACKED", "x", 400),
        translate,
      ),
      "t:errors.member_already_packed",
    );
    assert.equal(
      batteryFormErrorMessage(
        new ApiClientError("OTHER", "raw message", 500),
        translate,
      ),
      "raw message",
    );
    assert.equal(
      batteryFormErrorMessage(
        Object.assign(new Error("too few"), { code: "TOO_FEW_MEMBERS" }),
        translate,
      ),
      "t:errors.too_few_members",
    );
    assert.equal(
      batteryFormErrorMessage(new Error("boom"), translate),
      "t:errors.generic",
    );
    assert.equal(
      batteryFormErrorMessage("string", translate),
      "t:errors.generic",
    );
  });
});

describe("resolveMemberTokens", () => {
  it("keeps options, resolves IDs, and reports packability/not-found", async () => {
    const existing: MemberOption[] = [
      { id: 1, serial_number: "S-1", owner_party_id: 10 },
    ];
    const notPackable: number[] = [];
    const notFound: number[] = [];
    const byId: Record<number, Cylinder> = {
      2: cylinder({ id: 2, serial_number: "S-2" }),
      3: cylinder({ id: 3, state: "AT_CLIENT" }),
    };

    const resolved = await resolveMemberTokens(
      [
        existing[0]!,
        existing[0]!, // duplicate option ignored
        "1,2,3,4,bogus",
        "   ",
      ],
      existing,
      10,
      null,
      {
        fetchCylinder: async (id) => {
          const item = byId[id];
          if (!item) throw new Error("missing");
          return item;
        },
        onNotPackable: (id) => notPackable.push(id),
        onNotFound: (id) => notFound.push(id),
      },
    );

    assert.deepEqual(
      resolved.map((member) => member.id),
      [1, 2],
    );
    assert.deepEqual(notPackable, [3]);
    assert.deepEqual(notFound, [4]);
  });

  it("resolves pasted IDs from existing members without refetch", async () => {
    const existing: MemberOption[] = [
      { id: 8, serial_number: "S-8", owner_party_id: 10 },
    ];
    let fetches = 0;
    const resolved = await resolveMemberTokens(
      ["8", "nope"],
      existing,
      10,
      null,
      {
        fetchCylinder: async () => {
          fetches += 1;
          throw new Error("should not fetch");
        },
        onNotPackable: () => assert.fail("not packable"),
        onNotFound: () => assert.fail("not found"),
      },
    );
    assert.deepEqual(
      resolved.map((member) => member.id),
      [8],
    );
    assert.equal(fetches, 0);
  });
});
