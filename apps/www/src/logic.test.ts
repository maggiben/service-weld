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
      COMPANY.social.facebook,
      "https://www.facebook.com/p/Service-Weld-SRL-100039213056139/",
    );
    assert.equal(
      COMPANY.social.instagram,
      "https://www.instagram.com/p/DbBgx3AucQF/",
    );
    assert.equal(COMPANY.phone.display, "02352 54-3810");
    assert.equal(COMPANY.email, "mymgases@hotmail.com");
    assert.equal(COMPANY.hours.display, "8:00 a 18:00 hs");
  });

  it("builds LocalBusiness JSON-LD", () => {
    const ld = buildLocalBusinessJsonLd({
      url: "https://example.com",
      description: "test",
    });
    assert.equal(ld["@type"], "LocalBusiness");
    assert.equal(ld.name, COMPANY.legalName);
    assert.equal(ld.taxID, COMPANY.cuit);
    assert.equal(ld.telephone, COMPANY.phone.tel);
    assert.equal(ld.email, COMPANY.email);
    assert.ok(Array.isArray(ld.sameAs));
    assert.equal((ld.sameAs as string[]).length, 2);
  });
});

describe("site URLs", () => {
  it("defaults to local www / web ports", () => {
    assert.match(siteUrl(), /localhost:3003|serviceweld/);
    assert.match(appUrl(), /localhost:3001|serviceweld/);
    assert.match(appLoginUrl(), /\/login$/);
  });
});
