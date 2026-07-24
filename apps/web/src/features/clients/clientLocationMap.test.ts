import assert from "node:assert/strict";
import {
  CLIENT_MAP_SEARCH_BIAS,
  buildClientLocationQuery,
  buildDirectionsUrl,
  buildMapsEmbedUrl,
  hasClientLocation,
} from "./clientLocationMap";

describe("hasClientLocation", () => {
  it("is false when both street and locality are empty", () => {
    assert.equal(
      hasClientLocation({ addressStreet: null, localityName: null }),
      false,
    );
    assert.equal(
      hasClientLocation({ addressStreet: "  ", localityName: "" }),
      false,
    );
  });

  it("is true with street or locality alone", () => {
    assert.equal(
      hasClientLocation({
        addressStreet: "San Martín 100",
        localityName: null,
      }),
      true,
    );
    assert.equal(
      hasClientLocation({ addressStreet: null, localityName: "Junín" }),
      true,
    );
  });
});

describe("buildClientLocationQuery", () => {
  it("returns null without location data", () => {
    assert.equal(
      buildClientLocationQuery({ addressStreet: null, localityName: null }),
      null,
    );
  });

  it("builds locality-only query with province and country", () => {
    assert.equal(
      buildClientLocationQuery({
        addressStreet: null,
        localityName: "Junín",
        province: "Buenos Aires",
      }),
      "Junín, Buenos Aires, Argentina",
    );
  });

  it("includes street when present", () => {
    assert.equal(
      buildClientLocationQuery({
        addressStreet: "Belgrano 450",
        localityName: "Chacabuco",
        province: "Buenos Aires",
      }),
      "Belgrano 450, Chacabuco, Buenos Aires, Argentina",
    );
  });

  it("omits missing province", () => {
    assert.equal(
      buildClientLocationQuery({
        addressStreet: null,
        localityName: "Junín",
        province: null,
      }),
      "Junín, Argentina",
    );
  });
});

describe("map URLs", () => {
  it("builds embed and directions URLs biased to Argentina territories", () => {
    const query = "Junín, Buenos Aires, Argentina";
    const embed = buildMapsEmbedUrl(query);
    assert.match(embed, /maps\.google\.com/);
    assert.match(embed, /output=embed/);
    assert.match(embed, /Jun%C3%ADn/);
    assert.match(embed, /gl=ar/);
    assert.match(embed, /near=Buenos\+Aires/);
    assert.match(
      embed,
      new RegExp(
        `sll=${CLIENT_MAP_SEARCH_BIAS.centerLat}%2C${CLIENT_MAP_SEARCH_BIAS.centerLng}`.replace(
          /\./g,
          "\\.",
        ),
      ),
    );
    assert.match(
      embed,
      new RegExp(
        `sspn=${CLIENT_MAP_SEARCH_BIAS.spanLat}%2C${CLIENT_MAP_SEARCH_BIAS.spanLng}`,
      ),
    );
    assert.match(buildDirectionsUrl(query), /maps\/dir/);
  });
});
