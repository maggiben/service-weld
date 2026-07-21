"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";
import { useStoreHydration } from "@/auth/useStoreHydration";

/** Redirects unauthenticated users to /login, preserving the intended route. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const hydrated = useStoreHydration();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!isAuthenticated) {
      const from = encodeURIComponent(pathname || "/clients");
      router.replace(`/login?from=${from}`);
    }
  }, [hydrated, isAuthenticated, pathname, router]);

  // Match SSR (empty store) until persist rehydrates — avoids AppShell vs
  // RSC <script> hydration mismatch when a session is already in localStorage.
  if (!hydrated || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/** Redirects authenticated users away from public auth pages. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const hydrated = useStoreHydration();
  const isAuthenticated = useSessionStore((s) => s.isAuthenticated());
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated) {
      router.replace("/clients");
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated || isAuthenticated) {
    return null;
  }
  return <>{children}</>;
}

export function RequireCapability({
  capability,
  children,
}: {
  capability: string;
  children: React.ReactNode;
}) {
  const hydrated = useStoreHydration();
  const has = useSessionStore((s) => s.hasCapability(capability));
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (!has) {
      router.replace("/forbidden");
    }
  }, [hydrated, has, router]);

  if (!hydrated || !has) {
    return null;
  }
  return <>{children}</>;
}
