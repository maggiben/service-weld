/**
 * Public company facts for the landing page (spec 013).
 *
 * Address sources (2025 municipal / regional press):
 * - https://chacabuco.gob.ar/golia-visito-el-nuevo-local-de-service-weld-srl-en-su-inauguracion/
 * - https://www.diariodemocracia.com/regionales/chacabuco/330545-inauguraron-un-nuevo-local-de-venta-de-gases-indus/
 *
 * Social / contact provided by the business for publication on the marketing site.
 * Business hours: not yet confirmed — omitted from live contact fields.
 */

export const COMPANY = {
  legalName: "Service Weld S.R.L.",
  shortName: "Service Weld",
  /** AFIP CUIT as published on cuitonline.com */
  cuit: "30-71552577-8",
  phone: {
    display: "02352 54-3810",
    tel: "+542352543810",
  },
  email: "mymgases@hotmail.com",
  address: {
    streetAddress: "Acceso Juan XXIII 274",
    addressLocality: "Chacabuco",
    addressRegion: "Buenos Aires",
    addressCountry: "AR",
    countryName: "Argentina",
  },
  social: {
    facebook: "https://www.facebook.com/p/Service-Weld-SRL-100039213056139/",
    instagram: "https://www.instagram.com/p/DbBgx3AucQF/",
  } as const,
  /** Official photos under public/landing/. */
  images: {
    hero: "/landing/taller-workshop.webp",
    about: "/landing/shop-equipment.jpg",
    services: "/landing/welding-action.jpg",
    logoLightBg: "/service-weld-remove-bg-wb.webp",
    logoDarkBg: "/service-weld-remove-bg-bw.webp",
    logoMark: "/service-weld-logo.png",
  },
} as const;

export type CompanyAddress = (typeof COMPANY)["address"];

export const TESTIMONIAL_IDS = [
  "martin",
  "laura",
  "ricardo",
  "valentina",
  "diego",
  "carolina",
] as const;

export type TestimonialId = (typeof TESTIMONIAL_IDS)[number];

/** Temporary stock portraits until real customer photos are available. */
export const TESTIMONIAL_PHOTOS: Record<TestimonialId, string> = {
  martin: "/landing/testimonials/cliente-1.jpg",
  laura: "/landing/testimonials/cliente-2.jpg",
  ricardo: "/landing/testimonials/cliente-3.jpg",
  valentina: "/landing/testimonials/cliente-4.jpg",
  diego: "/landing/testimonials/cliente-5.jpg",
  carolina: "/landing/testimonials/cliente-6.jpg",
};

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
    telephone: COMPANY.phone.tel,
    email: COMPANY.email,
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
