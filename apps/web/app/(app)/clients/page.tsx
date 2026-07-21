"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import ClientsPage from "@/views/ClientsPage";

export default function ClientsRoute() {
  return (
    <RequireCapability capability="clients:read">
      <ClientsPage />
    </RequireCapability>
  );
}
