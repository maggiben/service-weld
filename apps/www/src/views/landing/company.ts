/**
 * Verified public company facts for the landing page (spec 013).
 *
 * Address sources (2025 municipal / regional press):
 * - https://chacabuco.gob.ar/golia-visito-el-nuevo-local-de-service-weld-srl-en-su-inauguracion/
 * - https://www.diariodemocracia.com/regionales/chacabuco/330545-inauguraron-un-nuevo-local-de-venta-de-gases-indus/
 *
 * Instagram verified by live profile title "SERVICE WELD SRL (@serviceweld21)".
 * Phone, email, hours, Facebook, WhatsApp, LinkedIn, Google Business profile URL:
 * not independently verified — omitted from the live page (placeholders in UI only).
 */

export const COMPANY = {
  legalName: "Service Weld S.R.L.",
  shortName: "Service Weld",
  /** AFIP CUIT as published on cuitonline.com */
  cuit: "30-71552577-8",
  address: {
    streetAddress: "Acceso Juan XXIII 274",
    addressLocality: "Chacabuco",
    addressRegion: "Buenos Aires",
    addressCountry: "AR",
    countryName: "Argentina",
  },
  /** Only include profiles we could verify. */
  social: {
    instagram: "https://www.instagram.com/serviceweld21/",
  } as const,
  /** Official photos (optimized WebP derivatives). */
  images: {
    hero: "/landing/taller-workshop.webp",
    about: "/landing/facility-storefront.webp",
    services: "/landing/facility-interior.webp",
    logoLightBg: "/service-weld-remove-bg-wb.webp",
    logoDarkBg: "/service-weld-remove-bg-bw.webp",
    logoMark: "/service-weld-logo.png",
  },
} as const;

export type CompanyAddress = (typeof COMPANY)["address"];

export function formatAddressLines(
  address: CompanyAddress = COMPANY.address,
): string[] {
  return [
    address.streetAddress,
    `${address.addressLocality}, ${address.addressRegion}`,
    address.countryName,
  ];
}

export function formatAddressOneLine(
  address: CompanyAddress = COMPANY.address,
): string {
  return `${address.streetAddress}, ${address.addressLocality}, ${address.addressRegion}, ${address.countryName}`;
}

export function buildMapsEmbedUrl(
  query: string = formatAddressOneLine(),
): string {
  const params = new URLSearchParams({
    q: query,
    output: "embed",
    hl: "es",
  });
  return `https://maps.google.com/maps?${params.toString()}`;
}

export function buildDirectionsUrl(
  query: string = formatAddressOneLine(),
): string {
  const params = new URLSearchParams({
    api: "1",
    destination: query,
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function buildLocalBusinessJsonLd(opts: {
  url: string;
  description: string;
}): Record<string, unknown> {
  const { address } = COMPANY;
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: COMPANY.legalName,
    legalName: COMPANY.legalName,
    taxID: COMPANY.cuit,
    description: opts.description,
    url: opts.url,
    image: [
      `${opts.url.replace(/\/$/, "")}${COMPANY.images.logoMark}`,
      `${opts.url.replace(/\/$/, "")}${COMPANY.images.hero}`,
    ],
    address: {
      "@type": "PostalAddress",
      streetAddress: address.streetAddress,
      addressLocality: address.addressLocality,
      addressRegion: address.addressRegion,
      addressCountry: address.addressCountry,
    },
    sameAs: Object.values(COMPANY.social),
    areaServed: [
      { "@type": "City", name: "Chacabuco" },
      { "@type": "City", name: "Junín" },
    ],
  };
}
