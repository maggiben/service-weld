"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import ClientDetailPage from "@/views/ClientDetailPage";

export default function ClientDetailRoute() {
  return (
    <RequireCapability capability="clients:read">
      <ClientDetailPage />
    </RequireCapability>
  );
}
