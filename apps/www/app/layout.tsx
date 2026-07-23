import type { Metadata } from "next";
import { EmotionCacheProvider } from "@/emotion-cache";
import { AppProviders } from "@/providers";

export const metadata: Metadata = {
  title: {
    default: "Service Weld S.R.L.",
    template: "%s · Service Weld",
  },
  description:
    "Service Weld S.R.L. — gases industriales, cilindros e insumos de soldadura",
  icons: {
    icon: "/service-weld-remove-bg-bw.webp",
  },
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
