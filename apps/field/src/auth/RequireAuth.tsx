"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionStore } from "@/store/sessionStore";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated());
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      const from = encodeURIComponent(pathname || "/");
      router.replace(`/login?from=${from}`);
    }
  }, [isAuthenticated, pathname, router]);

  if (!isAuthenticated) return null;
  return <>{children}</>;
}

export function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useSessionStore((state) => state.isAuthenticated());
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  if (isAuthenticated) return null;
  return <>{children}</>;
}
