import type { Metadata, Viewport } from "next";
import { EmotionCacheProvider } from "@/emotion-cache";
import { AppProviders } from "@/providers";

export const metadata: Metadata = {
  title: "Cilindros — Reparto",
  description: "Captura de campo — custodia y circulación",
  applicationName: "Reparto",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Reparto",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1976d2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>
        <EmotionCacheProvider>
          <AppProviders>{children}</AppProviders>
        </EmotionCacheProvider>
      </body>
    </html>
  );
}
