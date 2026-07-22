import type { Metadata } from "next";
import { EmotionCacheProvider } from "@/emotion-cache";
import { AppProviders } from "@/providers";

export const metadata: Metadata = {
  title: {
    default: "Gestión de Cilindros",
    template: "%s · Service Weld",
  },
  description: "Custodia, circulación y alquiler — Service Weld S.R.L.",
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
