"use client";

import { useEffect, useState } from "react";
import { useSessionStore } from "@/store/sessionStore";

/**
 * True only after zustand `persist` has rehydrated from localStorage.
 * Server + first client paint stay `false` so auth gates don't hydrate-mismatch
 * when a session already exists in storage (persist finishes in a microtask
 * before React hydrates).
 */
export function useStoreHydration(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(useSessionStore.persist.hasHydrated());
    return useSessionStore.persist.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
