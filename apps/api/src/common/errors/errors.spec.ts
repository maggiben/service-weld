import { DomainError, DomainErrors } from "@weld/domain";
import { ApiError, ApiErrors } from "./api-error";
import { assertOrApi, mapDomainError } from "./map-domain-error";

describe("ApiErrors", () => {
  it("builds typed errors", () => {
    expect(ApiErrors.unauthenticated().httpStatus).toBe(401);
    expect(ApiErrors.invalidCredentials().code).toBe("INVALID_CREDENTIALS");
    expect(ApiErrors.invalidRefresh().httpStatus).toBe(401);
    expect(ApiErrors.forbidden().httpStatus).toBe(403);
    expect(ApiErrors.mfaRequired().code).toBe("MFA_REQUIRED");
    expect(ApiErrors.notFound().httpStatus).toBe(404);
    expect(
      ApiErrors.validationFailed("x", [{ field: "a", issue: "b" }]).details,
    ).toHaveLength(1);
    expect(ApiErrors.duplicateCuit().httpStatus).toBe(409);
    expect(ApiErrors.duplicateSerial().code).toBe("DUPLICATE_SERIAL_FOR_OWNER");
    expect(ApiErrors.cylinderAlreadyOut().code).toBe("CYLINDER_ALREADY_OUT");
    expect(ApiErrors.cylinderTerminal().code).toBe("CYLINDER_TERMINAL");
    expect(ApiErrors.notOpen().code).toBe("NOT_OPEN");
    expect(ApiErrors.alreadyTerminal().code).toBe("ALREADY_TERMINAL");
    expect(ApiErrors.returnedCylinderBusy().code).toBe(
      "RETURNED_CYLINDER_BUSY",
    );
    expect(ApiErrors.conflict("X", "y").code).toBe("X");
    expect(ApiErrors.tooFewMembers().httpStatus).toBe(422);
    expect(ApiErrors.memberAlreadyPacked().httpStatus).toBe(409);
    expect(ApiErrors.replacementNotAvailable().httpStatus).toBe(409);
  });
});

describe("mapDomainError", () => {
  it("maps validation-like codes to 422", () => {
    try {
      mapDomainError(DomainErrors.sameParty());
      fail("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).httpStatus).toBe(422);
      expect((err as ApiError).code).toBe("SAME_PARTY");
    }
  });

  it("maps conflict-like codes to 409", () => {
    try {
      mapDomainError(DomainErrors.notOpen());
      fail("expected throw");
    } catch (err) {
      expect((err as ApiError).httpStatus).toBe(409);
    }
  });

  it("rethrows non-domain", () => {
    expect(() => mapDomainError(new Error("boom"))).toThrow("boom");
  });

  it("assertOrApi wraps domain throws", () => {
    expect(() =>
      assertOrApi(() => {
        throw DomainErrors.tooFewMembers();
      }),
    ).toThrow(ApiError);
    expect(() => assertOrApi(() => undefined)).not.toThrow();
  });

  it("DomainError instanceof check", () => {
    const err = new DomainError("X", "y");
    expect(err).toBeInstanceOf(DomainError);
  });
});
