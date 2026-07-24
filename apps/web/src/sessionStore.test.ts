import assert from "node:assert/strict";
/** Minimal localStorage for zustand persist in Node. */
function installLocalStorage() {
  const map = new Map<string, string>();
  const storage = {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => [...map.keys()][index] ?? null,
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
(globalThis as unknown as { window: typeof globalThis }).window = globalThis;

describe("web sessionStore", async () => {
  const { useSessionStore, partializeSession } =
    await import("./store/sessionStore");

  beforeEach(() => {
    useSessionStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
    });
  });

  it("requires user profile before considering the session authenticated", () => {
    useSessionStore.getState().setSession("a", "r");
    assert.equal(useSessionStore.getState().isAuthenticated(), false);

    useSessionStore.getState().setUser({
      id: 1,
      username: "admin",
      roles: ["ADMIN"],
      territories: [],
      territory_scopes: [],
      capabilities: ["clients:read", "admin:write"],
    });
    assert.equal(useSessionStore.getState().isAuthenticated(), true);
    assert.equal(useSessionStore.getState().hasCapability("admin:write"), true);
    assert.equal(
      useSessionStore.getState().hasCapability("does-not-exist"),
      false,
    );
    assert.deepEqual(partializeSession(useSessionStore.getState()), {
      accessToken: "a",
      refreshToken: "r",
      user: useSessionStore.getState().user,
    });

    useSessionStore.getState().clearSession();
    assert.equal(useSessionStore.getState().isAuthenticated(), false);
  });
});
