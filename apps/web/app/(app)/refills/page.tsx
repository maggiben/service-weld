"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import RefillsPage from "@/views/RefillsPage";

export default function RefillsRoute() {
  return (
    <RequireCapability capability="movements:read">
      <RefillsPage />
    </RequireCapability>
  );
}
