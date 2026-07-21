"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import MovementsPage from "@/views/MovementsPage";

export default function MovementsRoute() {
  return (
    <RequireCapability capability="movements:read">
      <MovementsPage />
    </RequireCapability>
  );
}
