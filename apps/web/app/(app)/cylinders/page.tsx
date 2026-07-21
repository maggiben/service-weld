"use client";

import { RequireCapability } from "@/auth/RequireAuth";
import CylindersPage from "@/views/CylindersPage";

export default function CylindersRoute() {
  return (
    <RequireCapability capability="cylinders:read">
      <CylindersPage />
    </RequireCapability>
  );
}
