import type { AccessoryState } from "@weld/schemas";
import { DomainErrors } from "./errors";

export function assertAccessoryRentable(state: AccessoryState): void {
  if (state !== "IN_STOCK") {
    throw DomainErrors.accessoryAlreadyOnLoan();
  }
}

export function assertAccessoryOnLoan(state: AccessoryState): void {
  if (state !== "ON_LOAN") {
    throw DomainErrors.notOnLoan();
  }
}
