import {
  hashPassword,
  verifyPassword,
  hashRefreshToken,
  generateRefreshToken,
} from "./password";

describe("password", () => {
  it("hashes and verifies", async () => {
    const stored = await hashPassword("secret-pass");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("secret-pass", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$a$b$c$d$e")).toBe(false);
  });

  it("refresh token helpers", () => {
    const token = generateRefreshToken();
    expect(token.length).toBeGreaterThan(20);
    const left = hashRefreshToken(token);
    const right = hashRefreshToken(token);
    expect(left).toBe(right);
    expect(left).not.toBe(token);
  });
});
