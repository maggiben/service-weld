import { webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";
import { generateArcaKeyAndCsr } from "./generate-csr";

x509.cryptoProvider.set(webcrypto as never);

describe("generateArcaKeyAndCsr", () => {
  it("returns a PKCS#8 private key and a PKCS#10 CSR", async () => {
    const generated = await generateArcaKeyAndCsr({
      cuit: "20-30405060-7",
      legalName: "Weld SRL",
      alias: "Weld",
    });
    expect(generated.privateKeyPem).toContain("BEGIN PRIVATE KEY");
    expect(generated.csrPem).toContain("BEGIN CERTIFICATE REQUEST");
  });

  it("embeds the CUIT digits in the CSR subject", async () => {
    const generated = await generateArcaKeyAndCsr({
      cuit: "20-30405060-7",
      legalName: "Weld SRL",
      alias: "Weld",
    });
    const csr = new x509.Pkcs10CertificateRequest(generated.csrPem);
    expect(csr.subject).toContain("20304050607");
  });

  it("escapes special characters in alias / legal name without throwing", async () => {
    await expect(
      generateArcaKeyAndCsr({
        cuit: "20-30405060-7",
        legalName: "Acme, Inc. = Special + Co.",
        alias: 'Alias, "Quoted" <Co>',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        privateKeyPem: expect.stringContaining("BEGIN PRIVATE KEY"),
        csrPem: expect.stringContaining("BEGIN CERTIFICATE REQUEST"),
      }),
    );
  });

  it("falls back to a CUIT-based alias / legal name when both are blank", async () => {
    const generated = await generateArcaKeyAndCsr({
      cuit: "20-30405060-7",
      legalName: "   ",
      alias: "   ",
    });
    const csr = new x509.Pkcs10CertificateRequest(generated.csrPem);
    expect(csr.subject).toContain("CUIT 20304050607");
  });
});
