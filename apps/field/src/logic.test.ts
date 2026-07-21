import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";

/** Minimal localStorage for zustand persist in Node. */
function installLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
  });
}

installLocalStorage();

const { useSessionStore } = await import("./store/sessionStore");

describe("field sessionStore", () => {
  beforeEach(() => {
    useSessionStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  });

  it("session lifecycle", () => {
    useSessionStore.getState().setSession("a", "r");
    assert.equal(useSessionStore.getState().isAuthenticated(), true);
    useSessionStore.getState().setUser({
      id: 1,
      username: "driver",
      roles: ["DRIVER"],
      territories: ["Junín"],
      territory_scopes: [{ id: 1, name: "Junín" }],
      capabilities: ["movements:write"],
    });
    assert.equal(
      useSessionStore.getState().hasCapability("movements:write"),
      true,
    );
    assert.equal(
      useSessionStore.getState().hasCapability("admin:write"),
      false,
    );
    useSessionStore.getState().clearSession();
    assert.equal(useSessionStore.getState().accessToken, null);
    assert.equal(useSessionStore.getState().isAuthenticated(), false);
  });
});
