import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DomainError,
  DomainErrors,
  Capacity,
  Money,
  RentalPeriod,
  parseIsoDate,
  calendarDaysBetween,
  assertPlausibleBusinessDate,
  businessTodayIso,
  assertBatteryMemberCount,
  assertPackableAsBatteryMember,
  assertNotPackedMember,
  assertReplaceable,
  assertDistinctTransferParties,
  assertTransferReturnOrder,
  classifyTransferCustodyStatus,
  assertAccessoryRentable,
  assertAccessoryOnLoan,
  agingBucket,
  matchesAgingFilter,
  assertOwnerBasisConsistency,
  assertKindBasisConsistency,
  assertCylinderTransition,
  assertDeliverable,
  assertCanReportLoss,
  stateAfterReturn,
  stateAfterDelivery,
  stateAfterLoss,
  isTerminalCylinderState,
} from "./index";
import { movementKindForBasis } from "./ownership";

describe("DomainErrors factories", () => {
  it("constructs every known code", () => {
    const samples = [
      DomainErrors.illegalStateTransition("A", "B"),
      DomainErrors.cylinderTerminal("LOST"),
      DomainErrors.cylinderAlreadyOut(),
      DomainErrors.kindBasisMismatch("RENTAL", "CUSTOMER"),
      DomainErrors.ownerBasisMismatch("SELF", "CUSTOMER"),
      DomainErrors.returnBeforeDelivery(),
      DomainErrors.dateOutOfRange("x"),
      DomainErrors.notOpen(),
      DomainErrors.alreadyTerminal("SOLD"),
      DomainErrors.returnedCylinderBusy(),
      DomainErrors.tooFewMembers(),
      DomainErrors.memberAlreadyPacked(),
      DomainErrors.memberOwnerMismatch(),
      DomainErrors.memberNotInStock(),
      DomainErrors.replacementNotAvailable(),
      DomainErrors.stageOutOfOrder("RECEIVED", "RETURNED_TO_SUPPLIER"),
      DomainErrors.dateOrder(),
      DomainErrors.sameParty(),
      DomainErrors.accessoryAlreadyOnLoan(),
      DomainErrors.notOnLoan(),
      DomainErrors.accessoryOnLoanBlocksClose(),
      DomainErrors.invalidCapacity(),
      DomainErrors.invalidMoney(),
    ];
    for (const err of samples) {
      assert.ok(err instanceof DomainError);
      assert.ok(err.code.length > 0);
      assert.ok(err.message.length > 0);
      assert.equal(err.name, "DomainError");
    }
  });
});

describe("value objects", () => {
  it("Capacity rejects non-positive", () => {
    assert.throws(() => Capacity.of(0));
    assert.throws(() => Capacity.of(-1));
    assert.throws(() => Capacity.of(Number.NaN));
    assert.equal(Capacity.of(10).m3, 10);
  });

  it("Money enforces ARS cents", () => {
    assert.equal(Money.of(10.5).amount, 10.5);
    assert.throws(() => Money.of(-1));
    assert.throws(() => Money.of(1.001));
  });

  it("RentalPeriod and dates", () => {
    assert.equal(RentalPeriod.between("2024-01-01", "2024-01-11").days, 10);
    assert.equal(RentalPeriod.accrued("2024-01-01", "2024-01-01").days, 0);
    assert.throws(() => RentalPeriod.between("2024-01-10", "2024-01-01"));
    assert.equal(calendarDaysBetween("2024-01-01", "2024-01-02"), 1);
    assert.throws(() => parseIsoDate("not-a-date"));
    assert.throws(() => parseIsoDate("2024-13-40"));
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(businessTodayIso()));
    assertPlausibleBusinessDate("2024-06-15", "2024-06-15");
    assert.throws(() =>
      assertPlausibleBusinessDate("1999-01-01", "2024-01-01"),
    );
  });
});

describe("battery / accessory / transfer", () => {
  it("battery rules", () => {
    assert.throws(() => assertBatteryMemberCount(1));
    assertBatteryMemberCount(2);
    assertPackableAsBatteryMember({
      packaging: "SINGLE",
      batteryId: null,
      state: "IN_STOCK_FULL",
      ownerPartyId: 1,
      batteryOwnerPartyId: 1,
    });
    assert.throws(() =>
      assertPackableAsBatteryMember({
        packaging: "SINGLE",
        batteryId: null,
        state: "IN_STOCK_FULL",
        ownerPartyId: 1,
        batteryOwnerPartyId: 2,
      }),
    );
    assert.throws(() =>
      assertPackableAsBatteryMember({
        packaging: "BATTERY_MEMBER",
        batteryId: null,
        state: "IN_STOCK_FULL",
        ownerPartyId: 1,
        batteryOwnerPartyId: 1,
      }),
    );
    assert.throws(() =>
      assertPackableAsBatteryMember({
        packaging: "SINGLE",
        batteryId: 9,
        state: "IN_STOCK_FULL",
        ownerPartyId: 1,
        batteryOwnerPartyId: 1,
      }),
    );
    assert.throws(() =>
      assertPackableAsBatteryMember({
        packaging: "SINGLE",
        batteryId: null,
        state: "LOST",
        ownerPartyId: 1,
        batteryOwnerPartyId: 1,
      }),
    );
    assert.throws(() =>
      assertPackableAsBatteryMember({
        packaging: "SINGLE",
        batteryId: null,
        state: "AT_CLIENT",
        ownerPartyId: 1,
        batteryOwnerPartyId: 1,
      }),
    );
    assert.throws(() => assertNotPackedMember("BATTERY_MEMBER"));
    assertNotPackedMember("SINGLE");
    assertReplaceable({
      originalState: "AT_CLIENT",
      replacementState: "IN_STOCK_FULL",
    });
    assertReplaceable({
      originalState: "LOST",
      replacementState: "IN_STOCK_EMPTY",
    });
    assert.throws(() =>
      assertReplaceable({
        originalState: "AT_CLIENT",
        replacementState: "AT_CLIENT",
      }),
    );
    assert.throws(() =>
      assertReplaceable({
        originalState: "IN_STOCK_FULL",
        replacementState: "IN_STOCK_FULL",
      }),
    );
  });

  it("accessory + transfer", () => {
    assertAccessoryRentable("IN_STOCK");
    assert.throws(() => assertAccessoryRentable("ON_LOAN"));
    assertAccessoryOnLoan("ON_LOAN");
    assert.throws(() => assertAccessoryOnLoan("IN_STOCK"));
    assertDistinctTransferParties(1, 2);
    assert.throws(() => assertDistinctTransferParties(1, 1));
    assertTransferReturnOrder("2024-01-01", null);
    assertTransferReturnOrder("2024-01-01", "2024-01-01");
    assertTransferReturnOrder("2024-01-01", "2024-01-10");
    assert.throws(() => assertTransferReturnOrder("2024-01-10", "2024-01-01"));
    assert.equal(classifyTransferCustodyStatus("CUSTOMER", null), "LOANED");
    assert.equal(classifyTransferCustodyStatus("SUPPLIER", null), "REFILL");
    assert.equal(classifyTransferCustodyStatus("SELF", null), "CUSTODY");
    assert.equal(
      classifyTransferCustodyStatus("SUBDISTRIBUTOR", null),
      "CUSTODY",
    );
    assert.equal(
      classifyTransferCustodyStatus("CUSTOMER", "2024-01-15"),
      "CUSTODY",
    );
    assert.equal(
      classifyTransferCustodyStatus("SUPPLIER", "2024-01-15"),
      "CUSTODY",
    );
  });
});

describe("ownership + reports + cylinder transitions", () => {
  it("ownership helpers", () => {
    assertOwnerBasisConsistency("SELF", "OURS");
    assertOwnerBasisConsistency("SUPPLIER", "SUPPLIER");
    assertOwnerBasisConsistency("CUSTOMER", "CUSTOMER");
    assertOwnerBasisConsistency("SUBDISTRIBUTOR", "OURS");
    assert.throws(() => assertOwnerBasisConsistency("SELF", "CUSTOMER"));
    assertKindBasisConsistency("REFILL", "CUSTOMER");
    assertKindBasisConsistency("RENTAL", "OURS");
    assertKindBasisConsistency("RENTAL", "SUPPLIER");
    assert.throws(() => assertKindBasisConsistency("RENTAL", "CUSTOMER"));
    assert.equal(movementKindForBasis("CUSTOMER"), "REFILL");
    assert.equal(movementKindForBasis("OURS"), "RENTAL");
  });

  it("aging buckets", () => {
    assert.equal(agingBucket(10), "≤30");
    assert.equal(agingBucket(31), ">30");
    assert.equal(agingBucket(91), ">90");
    assert.equal(agingBucket(181), ">180");
    assert.equal(agingBucket(366), ">365");
    assert.equal(matchesAgingFilter(40, undefined), true);
    assert.equal(matchesAgingFilter(40, ">30"), true);
    assert.equal(matchesAgingFilter(20, ">30"), false);
  });

  it("extra cylinder transitions", () => {
    assert.equal(isTerminalCylinderState("SOLD"), true);
    assertCylinderTransition("IN_STOCK_EMPTY", "IN_STOCK_EMPTY");
    assertCylinderTransition("IN_STOCK_FULL", "AT_SUPPLIER");
    assertCylinderTransition("AT_SUPPLIER", "IN_STOCK_EMPTY");
    assert.throws(() => assertCylinderTransition("LOST", "AT_CLIENT"));
    assert.throws(() =>
      assertCylinderTransition("IN_STOCK_EMPTY", "AT_SUPPLIER"),
    );
    assertDeliverable("IN_STOCK_FULL");
    assertDeliverable("AT_CLIENT", { forRefill: true });
    assert.throws(() => assertDeliverable("AT_CLIENT"));
    assert.throws(() => assertDeliverable("SOLD"));
    assert.equal(stateAfterReturn(), "IN_STOCK_EMPTY");
    assert.equal(stateAfterDelivery(), "AT_CLIENT");
    assert.equal(stateAfterLoss("BROKEN"), "BROKEN");
    assertCanReportLoss("IN_STOCK_FULL", "LOST");
    assert.throws(() => assertCanReportLoss("RETIRED", "LOST"));
  });
});
