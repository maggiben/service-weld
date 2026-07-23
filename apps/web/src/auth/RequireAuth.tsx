"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/api/client";
import { homePathForCapabilities } from "@/auth/homePath";
import { useStoreHydration } from "@/auth/useStoreHydration";
import { useSessionStore } from "@/store/sessionStore";

/** Redirects unauthenticated users to /login, preserving the intended route. */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const hydrated = useStoreHydration();
  const accessToken = useSessionStore((state) => state.accessToken);
  const user = useSessionStore((state) => state.user);
  const setUser = useSessionStore((state) => state.setUser);
  const clearSession = useSessionStore((state) => state.clearSession);
  const isAuthenticated = Boolean(accessToken && user);
  const pendingUser = Boolean(accessToken && !user);
  const pathname = usePathname();
  const router = useRouter();

  // Recover sessions that got tokens without /me (login race / corrupt storage).
  useEffect(() => {
    if (!hydrated || !pendingUser) return;
    let cancelled = false;
    void api
      .me()
      .then((me) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) clearSession();
      });
    return () => {
      cancelled = true;
    };
  }, [hydrated, pendingUser, setUser, clearSession]);

  useEffect(() => {
    if (!hydrated || pendingUser) return;
    if (!isAuthenticated) {
      const from = encodeURIComponent(pathname || "/clients");
      router.replace(`/login?from=${from}`);
    }
  }, [hydrated, pendingUser, isAuthenticated, pathname, router]);

  // Match SSR (empty store) until persist rehydrates — avoids AppShell vs
  // RSC <script> hydration mismatch when a session is already in localStorage.
  if (!hydrated || pendingUser || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}

/** Redirects authenticated users away from public auth pages. */
export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const hydrated = useStoreHydration();
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated());
  const capabilities = useSessionStore((state) => state.user?.capabilities);
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    if (isAuthenticated) {
      router.replace(homePathForCapabilities(capabilities));
    }
  }, [hydrated, isAuthenticated, capabilities, router]);

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
  const user = useSessionStore((state) => state.user);
  const has = useSessionStore((state) => state.hasCapability(capability));
  const router = useRouter();

  useEffect(() => {
    if (!hydrated) return;
    // Wait for user profile — missing capabilities during login must not
    // bounce into /forbidden (and loop with the "back to clients" link).
    if (!user) return;
    if (!has) {
      router.replace("/forbidden");
    }
  }, [hydrated, user, has, router]);

  if (!hydrated || !user || !has) {
    return null;
  }
  return <>{children}</>;
}
