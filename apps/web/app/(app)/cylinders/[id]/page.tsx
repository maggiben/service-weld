"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import CylinderDetailPage from "@/views/CylinderDetailPage";

export default function CylinderDetailRoute() {
  return (
    <RequireCapability capability="cylinders:read">
      <CylinderDetailPage />
    </RequireCapability>
  );
}
