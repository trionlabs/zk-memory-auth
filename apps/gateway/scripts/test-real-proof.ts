/**
 * End-to-end real-proof test for the zkma gateway.
 *
 * 1. Sign a JWT with a known RSA key (the noir-jwt test fixture key).
 * 2. Use noir-jwt's input generator to build the limb-encoded inputs.
 * 3. Use @noir-lang/noir_js to execute the circuit and produce a witness.
 * 4. Use @aztec/bb.js UltraHonkBackend to generate a real Noir proof.
 * 5. Compute the keccak commitment and call the gateway's verifyProof.
 *
 * Pass = the gateway's bb.js wiring is correct end-to-end.
 *
 * Run with:
 *   cd apps/gateway && pnpm tsx scripts/test-real-proof.ts
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import jsonwebtoken from "jsonwebtoken";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { keccak256 } from "viem";
import { verifyProof } from "../src/proof.js";
import { __zkmaTestResetJwksCache as resetJwksCache } from "../src/jwks.js";

// noir-jwt's published ESM dist omits .js extensions on internal imports, so
// strict ESM resolution fails. Load via CJS where Node's resolver still does
// extension search.
const require_ = createRequire(import.meta.url);
const { generateInputs } = require_("noir-jwt") as {
  generateInputs: (args: {
    jwt: string;
    pubkey: JsonWebKey;
    maxSignedDataLength: number;
  }) => Promise<{
    data?: { storage: number[]; len: number };
    base64_decode_offset: number;
    pubkey_modulus_limbs: string[];
    redc_params_limbs: string[];
    signature_limbs: string[];
  }>;
};

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CIRCUIT_PATH = resolve(HERE, "../../../circuits/zkma-auth/target/zkma_auth.json");

// PKCS#8 RSA-2048 key from noir-jwt's own test fixtures (public/private pair).
// Using a known test key keeps this script deterministic and offline.
const PRIVATE_KEY_PEM = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCjm55on1OLp1Ur
4B/N4+OKz6YL22jpjUmJzC81ghS4YQg8pb+DjUR734F6LGXLHqBuLvP5cjq5zRv3
uLWfrhj/FGDKdkk5QGRcHbF6bbwlFnfv4BpojF5Dg7SiPBa+12pva3gB99nvoT/r
q1nTGGP57DaAO7EtiFIOl+hGzPK3B3byk1xek8m4BQ9mEC/ZDrCHlDyn9wcWEsNu
vV8qlFeLbKmcWSDScKJHEFeYlyWAZGxr56hvEgA9hqomJ61VDHzqBG7kI4PYolzO
vORKnhsYTFminBnndABfnifxSFVCg+FFhLioBaAyZ452hIRX7ASQXV4L9w7ayZpI
4uNJ508fAgMBAAECggEAEc842S6uy371mIcXLzRlapDcBGJn8zR8EtH1OZ/lXYTC
fseUJ1/TWqCj2YbHteqpkBTwXfD/T4ZySu8CZlVvRyUSvDdQFTlbM2PQFAGp/2eI
usXsWgEdqb/Gg/qCh1evsF1EfQJb6Ofmq2LFrmLzTxtVe3QD/27db9U9ZaedrCqp
S6Ar7abI3Zo3bc+N6PKJEnN9Du+kj9nofi2dVjrlr/RFE+zx+7yq0aO+IpmRIP34
WOvRzTGOWtvBYAWmy4F8E4RsDJuV/coQJZ67udu9uhbzedIlZpnpjEdGdLSFwiO0
LPKr3BW/iNmE4kBfnWPO2XeKrz+tld7a4Q2hrvEDEQKBgQDNp3wJB+KrEb5G3io5
mpZfLBaf1R4NE9c2QfstdiBJ3DdqjhBgpSaAQ5mKcspnqy0G1chk8UYaP++nIrZT
8+6iPDHBd8vBwW4xjsWsQ+mjJ0oxPqTLjw7YRf3vPpHK99IzROG/t7/Yb99SMnNt
9oabx1UYsUqJo/9I72H2DsRQLQKBgQDLqQ5MdIWuUTEAFD4/bi4uAvq5OpmxwWiJ
zHDTVZD6tPN4CIq1rJWdKHoJ/tcDpOBdX22cBJoI/70vOyuh0xNkFKZpWWislRWr
Xm+ZUt74fFwHNJywkfqAp/xrFKSCcfiTfxAtBAXraFo9taHHTKz0VImFfMBMdgDD
dzKZq9xf+wKBgQC/1aSZE/b3loSEvMZsl2v/eTPdgkIW9tQA88lmndL+suIqjjxu
un9QlD5MbEmsLHvC7XaR2pKG9+8IXBPx+hA226maC7JQmau9pK11xJ/TJlpJ12KH
03mIermmCxqaV1OHqZBfcvsM3UZW+WK9R4JHG8igUPjzrbv7f/lEOoAbPQKBgDw3
GtwuI4xbwyIj2hfFCvBdvyXfFqxA5BjCEqXZickmkUnvNJvskDvsSNEFwSr5p8DT
w0O69JQukRAS7Z6mGvifRmiln9ZPKh4GCPcLUpOjqU4UFzP5pVg+0toSO2W6LuXl
TrIQm3Nz4iKWvmN/3y9Kg3KtZOn2hdlFN/fJoZnbAoGBAJaTIliqJIvO5+L3auyZ
abJ8id/nLZxAYpdCvzj1OaBHHjdrnwICTes8QNvcgcNIKdOkNjPVoGjTKXTdyBZJ
g220hxOl6PTarDEwxCAxkWEZkN/mGITN4SkLyAQe5CMKGQWczx9rsnhlcj37YLJX
KkhEi0T+msAtTMLLYFeKaEGD
-----END PRIVATE KEY-----`;

const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAo5ueaJ9Ti6dVK+AfzePj
is+mC9to6Y1JicwvNYIUuGEIPKW/g41Ee9+Beixlyx6gbi7z+XI6uc0b97i1n64Y
/xRgynZJOUBkXB2xem28JRZ37+AaaIxeQ4O0ojwWvtdqb2t4AffZ76E/66tZ0xhj
+ew2gDuxLYhSDpfoRszytwd28pNcXpPJuAUPZhAv2Q6wh5Q8p/cHFhLDbr1fKpRX
i2ypnFkg0nCiRxBXmJclgGRsa+eobxIAPYaqJietVQx86gRu5COD2KJczrzkSp4b
GExZopwZ53QAX54n8UhVQoPhRYS4qAWgMmeOdoSEV+wEkF1eC/cO2smaSOLjSedP
HwIDAQAB
-----END PUBLIC KEY-----`;

// Constants must match circuits/zkma-auth/src/main.nr.
const MAX_PARTIAL_DATA_LENGTH = 1024;
const MAX_EMAIL_LENGTH = 100;
const MAX_AUD_LENGTH = 128;
const MAX_ISS_LENGTH = 64;
const EMAIL = "alice@test.com";
const AUD = "zkma-test-client.apps.googleusercontent.com";
const ISS = "https://accounts.google.com";
// Use the current time so iat passes the gateway's freshness window.
const IAT = Math.floor(Date.now() / 1000) - 60;

function base64UrlToHex(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return Buffer.from(b64 + "=".repeat(pad), "base64").toString("hex");
}

async function main(): Promise<void> {
  console.log("[1/5] sign JWT with the noir-jwt test fixture key");
  const privateKey = crypto.createPrivateKey({
    key: PRIVATE_KEY_PEM, type: "pkcs8", format: "pem",
  });
  const publicKey = crypto.createPublicKey({
    key: PUBLIC_KEY_PEM, type: "spki", format: "pem",
  });

  // Pin the gateway's JWKS allowlist to the test pubkey only. The default
  // (real Google JWKS) would correctly reject our test-signed proof - we
  // exercise that case at the bottom.
  const testJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  process.env.ZKMA_SKIP_JWKS = "1";
  process.env.ZKMA_EXTRA_MODULI = base64UrlToHex(testJwk.n!);
  process.env.ZKMA_EXPECTED_AUD = AUD;
  process.env.ZKMA_EXPECTED_ISS = ISS;
  resetJwksCache();

  const jwt = jsonwebtoken.sign(
    {
      iss: ISS,
      sub: "test-subject",
      email_verified: true,
      email: EMAIL,
      iat: IAT,
      aud: AUD,
      exp: IAT + 7 * 24 * 3600,
    },
    privateKey,
    { algorithm: "RS256" },
  );
  const pubkeyJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;

  console.log("[2/5] generate noir-jwt limb-encoded inputs");
  const jwtInputs = await generateInputs({
    jwt,
    pubkey: pubkeyJwk,
    maxSignedDataLength: MAX_PARTIAL_DATA_LENGTH,
  });

  // Pad expected_email, expected_aud, expected_iss to their MAX lengths.
  const emailBytes = new TextEncoder().encode(EMAIL);
  const emailStorage = new Array<number>(MAX_EMAIL_LENGTH).fill(0);
  for (let i = 0; i < emailBytes.length; i++) emailStorage[i] = emailBytes[i]!;
  const audBytes = new TextEncoder().encode(AUD);
  const audStorage = new Array<number>(MAX_AUD_LENGTH).fill(0);
  for (let i = 0; i < audBytes.length; i++) audStorage[i] = audBytes[i]!;
  const issBytes = new TextEncoder().encode(ISS);
  const issStorage = new Array<number>(MAX_ISS_LENGTH).fill(0);
  for (let i = 0; i < issBytes.length; i++) issStorage[i] = issBytes[i]!;

  const inputs = {
    data: jwtInputs.data!,
    base64_decode_offset: jwtInputs.base64_decode_offset,
    signature_limbs: jwtInputs.signature_limbs!,
    pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs!,
    redc_params_limbs: jwtInputs.redc_params_limbs!,
    expected_email: { storage: emailStorage, len: emailBytes.length },
    expected_aud: { storage: audStorage, len: audBytes.length },
    expected_iss: { storage: issStorage, len: issBytes.length },
    iat_lower: IAT.toString(),
    iat_upper: (IAT + 60).toString(),
  };

  console.log("[3/5] load circuit + execute witness");
  const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, "utf8"));
  const noir = new Noir(circuit);
  const t0 = Date.now();
  const { witness } = await noir.execute(inputs as unknown as Record<string, unknown> as never);
  console.log(`      witness generated in ${Date.now() - t0} ms`);

  console.log("[4/5] generate UltraHonk proof (this can take a while)");
  const backend = new UltraHonkBackend(circuit.bytecode);
  const t1 = Date.now();
  const proofData = await backend.generateProof(witness);
  console.log(`      proof generated in ${Date.now() - t1} ms`);
  console.log(`      proof bytes: ${proofData.proof.length}, public inputs: ${proofData.publicInputs.length}`);

  console.log("[5/5] verify through gateway verifyProof");
  // Wire format: publicInputs as a single concatenated 32-byte hex blob.
  const publicInputsHex = ("0x" +
    proofData.publicInputs
      .map((s) => s.replace(/^0x/, "").padStart(64, "0"))
      .join("")) as `0x${string}`;
  const proofHex = ("0x" + Buffer.from(proofData.proof).toString("hex")) as `0x${string}`;

  // Self-verify first (raw bb.js path) to confirm the proof itself is valid.
  const selfValid = await backend.verifyProof(proofData);
  console.log(`      self-verify: ${selfValid}`);
  if (!selfValid) {
    console.error("FAIL: bb.js could not verify its own proof");
    process.exit(1);
  }

  // Now go through the gateway's verifyProof - this is what we are testing.
  const expectedCommitment = keccak256(
    new Uint8Array([
      ...Buffer.from(proofHex.slice(2), "hex"),
      ...Buffer.from(publicInputsHex.slice(2), "hex"),
    ]),
  );
  const result = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment,
  });

  if (!result.ok) {
    console.error(`FAIL: gateway verifyProof rejected: ${result.reason}`);
    process.exit(1);
  }
  console.log("      gateway verifyProof: ok");

  // Negative case 1: a tampered proof (flip one byte) should fail bb.js verify.
  const tamperedBytes = new Uint8Array(proofData.proof);
  tamperedBytes[100] = tamperedBytes[100]! ^ 0xff;
  const tamperedHex = ("0x" + Buffer.from(tamperedBytes).toString("hex")) as `0x${string}`;
  const tamperedCommitment = keccak256(
    new Uint8Array([
      ...tamperedBytes,
      ...Buffer.from(publicInputsHex.slice(2), "hex"),
    ]),
  );
  const tamperedResult = await verifyProof({
    proof: tamperedHex,
    publicInputs: publicInputsHex,
    expectedCommitment: tamperedCommitment, // commitment matches the tampered proof, so layer 1 passes
  });
  if (tamperedResult.ok) {
    console.error("FAIL: gateway accepted a tampered proof");
    process.exit(1);
  }
  console.log(`      tampered-proof rejection: ${tamperedResult.reason}`);

  // Negative case 2: wrong commitment (layer 1) should reject before bb.js.
  const wrongCommitment = ("0x" + "deadbeef".repeat(8)) as `0x${string}`;
  const wrongResult = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment: wrongCommitment,
  });
  if (wrongResult.ok) {
    console.error("FAIL: gateway accepted a proof with wrong commitment");
    process.exit(1);
  }
  console.log(`      wrong-commitment rejection: ${wrongResult.reason}`);

  // Negative case 3: JWKS pin rejects a proof whose modulus is not allowlisted.
  process.env.ZKMA_SKIP_JWKS = "1";
  process.env.ZKMA_EXTRA_MODULI = "";
  resetJwksCache();
  const noJwksResult = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment,
  });
  if (noJwksResult.ok) {
    console.error("FAIL: gateway accepted a proof not in the JWKS allowlist");
    process.exit(1);
  }
  console.log(`      jwks-pin rejection:  ${noJwksResult.reason}`);

  // Restore the test pubkey allowlist so the next negative cases isolate one
  // gate at a time.
  process.env.ZKMA_EXTRA_MODULI = base64UrlToHex(testJwk.n!);
  resetJwksCache();

  // Negative case 4: aud mismatch - gateway expects a different OAuth client.
  process.env.ZKMA_EXPECTED_AUD = "totally-different-app.apps.googleusercontent.com";
  const audMismatch = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment,
  });
  if (audMismatch.ok) {
    console.error("FAIL: gateway accepted a proof with mismatched aud");
    process.exit(1);
  }
  console.log(`      aud-mismatch rejection: ${audMismatch.reason}`);
  process.env.ZKMA_EXPECTED_AUD = AUD;

  // Negative case 5: iss mismatch - JWT was issued by some other IDP.
  process.env.ZKMA_EXPECTED_ISS = "https://login.microsoftonline.com";
  const issMismatch = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment,
  });
  if (issMismatch.ok) {
    console.error("FAIL: gateway accepted a proof with mismatched iss");
    process.exit(1);
  }
  console.log(`      iss-mismatch rejection: ${issMismatch.reason}`);
  process.env.ZKMA_EXPECTED_ISS = ISS;

  // Negative case 6: iat outside the gateway's freshness window.
  process.env.ZKMA_IAT_MAX_AGE_SECS = "1"; // anything older than 1s is stale
  const iatStale = await verifyProof({
    proof: proofHex,
    publicInputs: publicInputsHex,
    expectedCommitment,
  });
  if (iatStale.ok) {
    console.error("FAIL: gateway accepted a stale-iat proof");
    process.exit(1);
  }
  console.log(`      iat-stale rejection:    ${iatStale.reason}`);

  console.log("\nPASS - gateway verifies real proofs and rejects every replay vector.");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
