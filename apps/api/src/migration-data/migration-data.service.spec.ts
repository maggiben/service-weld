import { extractLastJson } from "./migration-data.service";

describe("extractLastJson", () => {
  it("returns the last JSON object from mixed stdout", () => {
    const stdout = `Extracting…
  clients=10
{"dry_run":true,"imported_clean":5}
`;
    expect(extractLastJson(stdout)).toBe('{"dry_run":true,"imported_clean":5}');
  });

  it("returns null when empty", () => {
    expect(extractLastJson("")).toBeNull();
  });
});
