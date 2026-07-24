"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import DashboardPage from "@/views/DashboardPage";

export default function DashboardRoute() {
  return (
    <RequireCapability capability="billing:read">
      <DashboardPage />
    </RequireCapability>
  );
}
