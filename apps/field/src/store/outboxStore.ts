import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { get, set, del } from "idb-keyval";
import type {
  CreateMovementInput,
  ReturnMovementInput,
  SwapMovementInput,
} from "@weld/schemas";

export type OutboxStatus =
  "queued" | "syncing" | "synced" | "conflict" | "error";

export type OutboxKind = "DELIVER" | "RETURN" | "SWAP";

export type OutboxPayload =
  | { kind: "DELIVER"; body: CreateMovementInput }
  | { kind: "RETURN"; movementId: number; body: ReturnMovementInput }
  | { kind: "SWAP"; movementId: number; body: SwapMovementInput };

export interface OutboxItem {
  id: string;
  kind: OutboxKind;
  payload: OutboxPayload;
  status: OutboxStatus;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  /** Human label for the sync list (serial / client). */
  label: string;
}

interface OutboxState {
  items: OutboxItem[];
  enqueue: (
    item: Omit<
      OutboxItem,
      "status" | "errorCode" | "errorMessage" | "updatedAt"
    >,
  ) => void;
  markSyncing: (id: string) => void;
  markSynced: (id: string) => void;
  markConflict: (id: string, code: string, message: string) => void;
  markError: (id: string, code: string, message: string) => void;
  discard: (id: string) => void;
  requeue: (id: string) => void;
  pendingCount: () => number;
  conflictCount: () => number;
}

const idbStorage = createJSONStorage(() => ({
  getItem: async (name: string) => {
    const value = await get<string>(name);
    return value ?? null;
  },
  setItem: async (name: string, value: string) => {
    await set(name, value);
  },
  removeItem: async (name: string) => {
    await del(name);
  },
}));

/** Offline write queue (006 R3 / §2.8) — persisted to IndexedDB. */
export const useOutboxStore = create<OutboxState>()(
  persist(
    (set, get) => ({
      items: [],
      enqueue: (item) =>
        set((state) => ({
          items: [
            {
              ...item,
              status: "queued",
              errorCode: null,
              errorMessage: null,
              updatedAt: item.createdAt,
            },
            ...state.items,
          ],
        })),
      markSyncing: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "syncing",
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      markSynced: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "synced",
                  errorCode: null,
                  errorMessage: null,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      markConflict: (id, code, message) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "conflict",
                  errorCode: code,
                  errorMessage: message,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      markError: (id, code, message) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "error",
                  errorCode: code,
                  errorMessage: message,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      discard: (id) =>
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        })),
      requeue: (id) =>
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? {
                  ...item,
                  status: "queued",
                  errorCode: null,
                  errorMessage: null,
                  updatedAt: new Date().toISOString(),
                }
              : item,
          ),
        })),
      pendingCount: () =>
        get().items.filter(
          (item) => item.status === "queued" || item.status === "syncing",
        ).length,
      conflictCount: () =>
        get().items.filter((item) => item.status === "conflict").length,
    }),
    {
      name: "weld.field.outbox",
      storage: idbStorage,
      partialize: (state) => ({ items: state.items }),
    },
  ),
);
