import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
} from "node:crypto";
import { webcrypto } from "node:crypto";
import * as x509 from "@peculiar/x509";
import { cuitDigits } from "@weld/domain";

x509.cryptoProvider.set(webcrypto as never);

export interface GeneratedArcaKeyPair {
  privateKeyPem: string;
  csrPem: string;
}

/**
 * RSA-2048 + PKCS#10 CSR with ARCA DN (serialNumber=CUIT …) — R-18 / R-19.
 */
export async function generateArcaKeyAndCsr(input: {
  cuit: string;
  legalName: string;
  alias: string;
}): Promise<GeneratedArcaKeyPair> {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const digits = cuitDigits(input.cuit);
  const alias = input.alias.trim() || `CUIT ${digits}`;
  const organization = input.legalName.trim() || alias;

  const cryptoKey = await webcrypto.subtle.importKey(
    "pkcs8",
    createPrivateKey(privateKey).export({ type: "pkcs8", format: "der" }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const publicCryptoKey = await webcrypto.subtle.importKey(
    "spki",
    createPublicKey(publicKey).export({ type: "spki", format: "der" }),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    true,
    ["verify"],
  );

  const csr = await x509.Pkcs10CertificateRequestGenerator.create({
    // OID 2.5.4.5 = serialNumber (ARCA requires serialNumber=CUIT <digits>).
    name: `CN=${escapeDn(alias)}, O=${escapeDn(organization)}, 2.5.4.5=CUIT ${digits}`,
    keys: { privateKey: cryptoKey, publicKey: publicCryptoKey },
    signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  });

  return {
    privateKeyPem: privateKey,
    csrPem: csr.toString("pem"),
  };
}

function escapeDn(value: string): string {
  return value.replaceAll(/([,\\=+<>#;"])/g, "\\$1");
}
