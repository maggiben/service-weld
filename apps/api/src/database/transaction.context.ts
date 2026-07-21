import { AsyncLocalStorage } from "async_hooks";
import type { Kysely, Transaction } from "kysely";
import type { Database } from "./schema.types";

const transactionStorage = new AsyncLocalStorage<Transaction<Database>>();

export function runInTransaction<T>(
  tx: Transaction<Database>,
  fn: () => Promise<T>,
): Promise<T> {
  return transactionStorage.run(tx, fn);
}

export function getTransaction(): Transaction<Database> | undefined {
  return transactionStorage.getStore();
}

/** Prefer the active transaction when one is pinned to the request. */
export function resolveDb(db: Kysely<Database>): Kysely<Database> {
  return getTransaction() ?? db;
}
