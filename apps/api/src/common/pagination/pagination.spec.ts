import { encodeCursor, decodeCursor, buildPageMeta, parseSort } from "./cursor";
import { parseFilters, readFilterValue } from "./filter";

describe("cursor", () => {
  it("round-trips payload", () => {
    const encoded = encodeCursor({ id: 10, name: "x" });
    expect(decodeCursor(encoded)).toEqual({ id: 10, name: "x" });
    expect(() => decodeCursor("%%%")).toThrow(/Invalid cursor/);
    expect(() => decodeCursor(Buffer.from("[]").toString("base64url"))).toThrow(
      /Invalid cursor/,
    );
  });

  it("buildPageMeta + parseSort", () => {
    expect(
      buildPageMeta({
        limit: 20,
        hasMore: true,
        nextCursor: "abc",
        totalEstimate: 100,
      }),
    ).toEqual({
      limit: 20,
      has_more: true,
      next_cursor: "abc",
      total_estimate: 100,
    });
    expect(parseSort("-name", ["name", "id"])).toEqual({
      field: "name",
      direction: "desc",
    });
    expect(parseSort("id", ["name", "id"], "name")).toEqual({
      field: "id",
      direction: "asc",
    });
    expect(() => parseSort("nope", ["name"])).toThrow(/Unknown sort field/);
  });
});

describe("filters", () => {
  it("parses eq/in and ignores unknown", () => {
    const filters = parseFilters(
      {
        "filter[state]": "OPEN",
        "filter[gas_code][in]": "O2,N2",
        "filter[days][gte]": "30",
        "filter[secret]": "x",
        "filter[state][bogus]": "y",
        other: 1,
      },
      ["state", "gas_code", "days"],
    );
    expect(filters).toEqual(
      expect.arrayContaining([
        { field: "state", operator: "eq", value: "OPEN" },
        { field: "gas_code", operator: "in", value: ["O2", "N2"] },
        { field: "days", operator: "gte", value: "30" },
      ]),
    );
    expect(readFilterValue(filters, "state")).toBe("OPEN");
    expect(readFilterValue(filters, "missing")).toBeUndefined();
  });
});
