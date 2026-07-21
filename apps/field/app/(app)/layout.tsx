"use client";

import type { PropsWithChildren } from "react";
import { RequireAuth } from "@/auth/RequireAuth";
import FieldShell from "@/layout/FieldShell";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <RequireAuth>
      <FieldShell>{children}</FieldShell>
    </RequireAuth>
  );
}
