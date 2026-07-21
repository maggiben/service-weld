/** Small pure formatters used across the back-office UI. */

export function dashIfEmpty(value: string | null | undefined): string {
  if (value == null || value.trim() === "") return "—";
  return value;
}

export function formatPartyLabel(id: number, name: string): string {
  return `#${id} ${name}`;
}

export function clampPercent(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

export function pluralize(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

export function boolLabel(value: boolean, yes = "sí", no = "no"): string {
  return value ? yes : no;
}
