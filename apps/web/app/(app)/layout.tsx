"use client";

import type { PropsWithChildren } from "react";
import { RequireAuth } from "@/auth/RequireAuth";
import AppShell from "@/layout/AppShell";

export default function AuthenticatedLayout({ children }: PropsWithChildren) {
  return (
    <RequireAuth>
      <AppShell>{children}</AppShell>
    </RequireAuth>
  );
}
