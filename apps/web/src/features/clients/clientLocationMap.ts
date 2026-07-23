export type ClientLocationParts = {
  addressStreet: string | null | undefined;
  localityName: string | null | undefined;
  province: string | null | undefined;
  countryName?: string;
};

/**
 * Geocode bias for client maps: Argentina, centered on Service Weld
 * operating territories (Junín / Chacabuco, NW Buenos Aires).
 * Span covers the country so Europe / other continents stay out of results.
 */
export const CLIENT_MAP_SEARCH_BIAS = {
  countryCode: "ar",
  near: "Buenos Aires, Argentina",
  /** Midpoint between Junín and Chacabuco. */
  centerLat: -34.62,
  centerLng: -60.71,
  /** Degrees of lat/lng — roughly Argentina, not global. */
  spanLat: 35,
  spanLng: 25,
} as const;

/** True when the client has enough address data to show a map. */
export function hasClientLocation(parts: ClientLocationParts): boolean {
  const street = parts.addressStreet?.trim() ?? "";
  const locality = parts.localityName?.trim() ?? "";
  return street.length > 0 || locality.length > 0;
}

/**
 * Builds a geocodable one-line query for map embeds.
 * Works with street+locality, locality-only, or street-only.
 * Always ends with Argentina so ambiguous names (e.g. Junín) stay local.
 */
export function buildClientLocationQuery(
  parts: ClientLocationParts,
): string | null {
  if (!hasClientLocation(parts)) return null;

  const country = (parts.countryName ?? "Argentina").trim() || "Argentina";
  const street = parts.addressStreet?.trim() || null;
  const locality = parts.localityName?.trim() || null;
  const province = parts.province?.trim() || null;

  const segments = [street, locality, province, country].filter(
    (part): part is string => Boolean(part),
  );
  return segments.join(", ");
}

export function buildMapsEmbedUrl(query: string, locale = "es"): string {
  const bias = CLIENT_MAP_SEARCH_BIAS;
  const params = new URLSearchParams({
    q: query,
    output: "embed",
    hl: locale,
    // Country bias (ccTLD) — prefer Argentine results.
    gl: bias.countryCode,
    // Local search center + span around company territories / Argentina.
    near: bias.near,
    sll: `${bias.centerLat},${bias.centerLng}`,
    sspn: `${bias.spanLat},${bias.spanLng}`,
  });
  return `https://maps.google.com/maps?${params.toString()}`;
}

export function buildDirectionsUrl(query: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: query,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
