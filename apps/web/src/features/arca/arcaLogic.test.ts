import assert from "node:assert/strict";
import {
  ARCA_PORTAL_LINKS,
  ARCA_WIZARD_STEPS,
  arcaActionDisabledReason,
  arcaPortalLinksForEnvironment,
  isArcaActionEnabled,
  nextArcaWizardAction,
  shouldConfirmRegenerate,
  statusCheckRows,
} from "./arcaLogic";

describe("arcaLogic", () => {
  it("gates generate keys on CUIT", () => {
    assert.equal(
      isArcaActionEnabled("NOT_STARTED", "generate_keys", {
        hasCompanyCuit: false,
      }),
      false,
    );
    assert.equal(
      isArcaActionEnabled("NOT_STARTED", "generate_keys", {
        hasCompanyCuit: true,
      }),
      true,
    );
  });

  it("requires KEY_READY before download", () => {
    assert.equal(
      isArcaActionEnabled("NOT_STARTED", "download_csr", {
        hasCompanyCuit: true,
      }),
      false,
    );
    assert.equal(
      isArcaActionEnabled("KEY_READY", "download_csr", {
        hasCompanyCuit: true,
      }),
      true,
    );
  });

  it("explains disabled reasons", () => {
    assert.match(
      arcaActionDisabledReason("NOT_STARTED", "upload_certificate", {
        hasCompanyCuit: true,
      }) ?? "",
      /Generate keys/,
    );
  });

  it("flags regenerate confirmation", () => {
    assert.equal(shouldConfirmRegenerate("KEY_READY"), false);
    assert.equal(shouldConfirmRegenerate("VALIDATED"), true);
  });

  it("lists status checks in order", () => {
    const rows = statusCheckRows({
      has_private_key: true,
      has_csr: true,
      has_certificate: false,
      is_validated: false,
    });
    assert.equal(rows.length, 4);
    assert.equal(rows[0]?.key, "has_private_key");
  });

  it("exposes WSASS portal links for homologation", () => {
    const links = arcaPortalLinksForEnvironment("HOMOLOGATION");
    assert.ok(links.some((link) => link.href === ARCA_PORTAL_LINKS.wsassGuide));
    assert.ok(links.some((link) => link.href === ARCA_PORTAL_LINKS.login));
  });

  it("orders wizard steps and suggests the next one", () => {
    assert.equal(ARCA_WIZARD_STEPS.length, 5);
    assert.equal(nextArcaWizardAction("NOT_STARTED"), "generate_keys");
    assert.equal(nextArcaWizardAction("KEY_READY"), "download_csr");
    assert.equal(nextArcaWizardAction("CERT_UPLOADED"), "validate_certificate");
    assert.equal(nextArcaWizardAction("VALIDATED"), "test_connection");
    assert.equal(nextArcaWizardAction("CONNECTED"), null);
  });
});
