/** First back-office route the user can open, given their capabilities. */
const HOME_CANDIDATES: ReadonlyArray<{ path: string; capability: string }> = [
  { path: "/clients", capability: "clients:read" },
  { path: "/cylinders", capability: "cylinders:read" },
  { path: "/movements", capability: "movements:read" },
  { path: "/reports", capability: "reports:read" },
  { path: "/billing", capability: "billing:read" },
  { path: "/settings", capability: "admin:write" },
];

export function homePathForCapabilities(
  capabilities: readonly string[] | undefined | null,
): string {
  if (!capabilities?.length) return "/settings";
  const granted = new Set(capabilities);
  for (const candidate of HOME_CANDIDATES) {
    if (granted.has(candidate.capability)) return candidate.path;
  }
  return "/settings";
}
