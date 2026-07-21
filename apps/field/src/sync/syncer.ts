import { ApiClientError } from "@weld/api-client";
import { api } from "@/api/client";
import { useOutboxStore, type OutboxItem } from "@/store/outboxStore";

let draining = false;

async function syncOne(item: OutboxItem): Promise<void> {
  const store = useOutboxStore.getState();
  store.markSyncing(item.id);

  try {
    const payload = item.payload;
    if (payload.kind === "DELIVER") {
      await api.createMovement(payload.body, { idempotencyKey: item.id });
    } else if (payload.kind === "RETURN") {
      await api.returnMovement(payload.movementId, payload.body);
    } else {
      await api.swapMovement(payload.movementId, payload.body);
    }
    store.markSynced(item.id);
  } catch (error) {
    if (error instanceof ApiClientError) {
      if (error.httpStatus === 409) {
        store.markConflict(item.id, error.code, error.message);
        return;
      }
      store.markError(item.id, error.code, error.message);
      return;
    }
    store.markError(
      item.id,
      "SYNC_FAILED",
      error instanceof Error ? error.message : "Unknown sync error",
    );
  }
}

/** Drain queued outbox items while online (006 §2.8). */
export async function drainOutbox(): Promise<void> {
  if (draining) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  draining = true;
  try {
    const queued = useOutboxStore
      .getState()
      .items.filter((i) => i.status === "queued")
      .slice()
      .reverse(); // oldest first (enqueue prepends)

    for (const item of queued) {
      if (typeof navigator !== "undefined" && !navigator.onLine) break;
      await syncOne(item);
    }
  } finally {
    draining = false;
  }
}

export function startOutboxSyncer(): () => void {
  const onOnline = () => {
    void drainOutbox();
  };
  window.addEventListener("online", onOnline);
  // Initial drain if already online.
  void drainOutbox();
  return () => window.removeEventListener("online", onOnline);
}
