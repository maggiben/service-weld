/** Float aging buckets (007 R3 / BR-20). */
export type AgingBucket = "≤30" | ">30" | ">90" | ">180" | ">365";

export function agingBucket(daysOut: number): AgingBucket {
  if (daysOut > 365) return ">365";
  if (daysOut > 180) return ">180";
  if (daysOut > 90) return ">90";
  if (daysOut > 30) return ">30";
  return "≤30";
}

export function matchesAgingFilter(
  daysOut: number,
  filter: ">30" | ">90" | ">180" | ">365" | undefined,
): boolean {
  if (!filter) return true;
  const threshold = Number(filter.slice(1));
  return daysOut > threshold;
}
