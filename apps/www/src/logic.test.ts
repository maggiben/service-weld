import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDirectionsUrl,
  buildLocalBusinessJsonLd,
  buildMapsEmbedUrl,
  COMPANY,
  formatAddressLines,
  formatAddressOneLine,
} from "./views/landing/company";
import { appLoginUrl, appUrl, siteUrl } from "./site";

describe("landing company helpers", () => {
  it("formats address and map URLs", () => {
    assert.deepEqual(formatAddressLines(), [
      "Acceso Juan XXIII 274",
      "Chacabuco, Buenos Aires",
      "Argentina",
    ]);
    assert.match(formatAddressOneLine(), /Chacabuco/);
    assert.match(buildMapsEmbedUrl(), /maps\.google\.com/);
    assert.match(buildMapsEmbedUrl(), /output=embed/);
    assert.match(buildDirectionsUrl(), /maps\/dir/);
    assert.equal(
      COMPANY.social.instagram,
      "https://www.instagram.com/serviceweld21/",
    );
  });

  it("builds LocalBusiness JSON-LD", () => {
    const ld = buildLocalBusinessJsonLd({
      url: "https://example.com",
      description: "test",
    });
    assert.equal(ld["@type"], "LocalBusiness");
    assert.equal(ld.name, COMPANY.legalName);
    assert.equal(ld.taxID, COMPANY.cuit);
    assert.ok(Array.isArray(ld.sameAs));
  });
});

describe("site URLs", () => {
  it("defaults to local www / web ports", () => {
    assert.match(siteUrl(), /localhost:3003|serviceweld/);
    assert.match(appUrl(), /localhost:3001|serviceweld/);
    assert.match(appLoginUrl(), /\/login$/);
  });
});
