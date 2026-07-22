import type { Metadata } from "next";
import LandingPage from "@/views/landing/LandingPage";
import { buildLocalBusinessJsonLd, COMPANY } from "@/views/landing/company";
import { siteUrl } from "@/site";

const SITE_URL = siteUrl();

const TITLE = "Service Weld S.R.L. | Gases industriales y cilindros";
const DESCRIPTION =
  "Service Weld S.R.L. — proveedor de gases industriales, alquiler, recarga y canje de cilindros, e insumos de soldadura en Chacabuco y la región.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  applicationName: COMPANY.legalName,
  keywords: [
    "Service Weld",
    "gases industriales",
    "cilindros",
    "oxígeno",
    "argón",
    "CO2",
    "nitrógeno",
    "acetileno",
    "soldadura",
    "Chacabuco",
    "alquiler de cilindros",
  ],
  openGraph: {
    type: "website",
    locale: "es_AR",
    url: SITE_URL,
    siteName: COMPANY.legalName,
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: `${SITE_URL}${COMPANY.images.hero}`,
        width: 1600,
        height: 1067,
        alt: COMPANY.legalName,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}${COMPANY.images.hero}`],
  },
  robots: { index: true, follow: true },
  alternates: { canonical: SITE_URL },
};

export default function HomePage() {
  const jsonLd = buildLocalBusinessJsonLd({
    url: SITE_URL,
    description: DESCRIPTION,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LandingPage />
    </>
  );
}
