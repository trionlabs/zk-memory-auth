/**
 * HTTP-level integration test for the zkma gateway.
 *
 * Boots buildServer() with FAKE resolvePrincipal + FAKE searchAndFilter so
 * the test can run hermetically with no Sepolia / no mem0. Real proof,
 * real wallet sig, real keccak. Hits the routes through fastify.inject
 * (no port, no network) and asserts each gate fires correctly.
 *
 * Run: cd apps/gateway && pnpm test:http
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import crypto from "node:crypto";
import jsonwebtoken from "jsonwebtoken";
import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { buildServer } from "../src/server.js";
import type { ResolvedPrincipal } from "../src/ens.js";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const CIRCUIT_PATH = resolve(HERE, "../../../circuits/zkma-auth/target/zkma_auth.json");

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

const MAX_PARTIAL_DATA_LENGTH = 1024;
const MAX_EMAIL_LENGTH = 100;
const MAX_AUD_LENGTH = 128;
const MAX_ISS_LENGTH = 64;
const EMAIL = "alice@test.com";
const AUD = "zkma-test-client.apps.googleusercontent.com";
const ISS = "https://accounts.google.com";
const IAT = Math.floor(Date.now() / 1000) - 60;
const GATEWAY_DOMAIN = "zkma:gateway:dev"; // matches default ZKMA_GATEWAY_DOMAIN

// A throwaway hardhat-style key. Public Sepolia/etc safe - never used elsewhere.
const TEST_WALLET_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ok    ${label}${detail ? ` - ${detail}` : ""}`);
    pass++;
  } else {
    console.error(`  FAIL  ${label}${detail ? ` - ${detail}` : ""}`);
    fail++;
  }
}

function base64UrlToHex(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return Buffer.from(b64 + "=".repeat(pad), "base64").toString("hex");
}

async function main(): Promise<void> {
  console.log("[setup] generate one real proof shared across cases");
  const privateKey = crypto.createPrivateKey({ key: PRIVATE_KEY_PEM, type: "pkcs8", format: "pem" });
  const publicKey = crypto.createPublicKey({ key: PUBLIC_KEY_PEM, type: "spki", format: "pem" });

  // Allow the test pubkey through the gateway's JWKS pin and pin every
  // user-supplied public input to the test values.
  const testJwk = publicKey.export({ format: "jwk" }) as JsonWebKey;
  process.env.ZKMA_SKIP_JWKS = "1";
  process.env.ZKMA_EXTRA_MODULI = base64UrlToHex(testJwk.n!);
  process.env.ZKMA_EXPECTED_AUD = AUD;
  process.env.ZKMA_EXPECTED_ISS = ISS;
  process.env.ZKMA_GATEWAY_DOMAIN = GATEWAY_DOMAIN;
  const jwt = jsonwebtoken.sign(
    {
      iss: ISS,
      sub: "test",
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
  const jwtInputs = await generateInputs({ jwt, pubkey: pubkeyJwk, maxSignedDataLength: MAX_PARTIAL_DATA_LENGTH });

  const emailBytes = new TextEncoder().encode(EMAIL);
  const emailStorage = new Array<number>(MAX_EMAIL_LENGTH).fill(0);
  for (let i = 0; i < emailBytes.length; i++) emailStorage[i] = emailBytes[i]!;
  const audBytes = new TextEncoder().encode(AUD);
  const audStorage = new Array<number>(MAX_AUD_LENGTH).fill(0);
  for (let i = 0; i < audBytes.length; i++) audStorage[i] = audBytes[i]!;
  const issBytes = new TextEncoder().encode(ISS);
  const issStorage = new Array<number>(MAX_ISS_LENGTH).fill(0);
  for (let i = 0; i < issBytes.length; i++) issStorage[i] = issBytes[i]!;

  const circuit = JSON.parse(readFileSync(CIRCUIT_PATH, "utf8"));
  const noir = new Noir(circuit);
  const { witness } = await noir.execute({
    data: jwtInputs.data!,
    base64_decode_offset: jwtInputs.base64_decode_offset,
    signature_limbs: jwtInputs.signature_limbs,
    pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs,
    redc_params_limbs: jwtInputs.redc_params_limbs,
    expected_email: { storage: emailStorage, len: emailBytes.length },
    expected_aud: { storage: audStorage, len: audBytes.length },
    expected_iss: { storage: issStorage, len: issBytes.length },
    iat_lower: IAT.toString(),
    iat_upper: (IAT + 60).toString(),
  } as never);

  const backend = new UltraHonkBackend(circuit.bytecode);
  const proofData = await backend.generateProof(witness);
  const proofHex = ("0x" + Buffer.from(proofData.proof).toString("hex")) as `0x${string}`;
  const publicInputsHex = ("0x" + proofData.publicInputs
    .map((s) => s.replace(/^0x/, "").padStart(64, "0"))
    .join("")) as `0x${string}`;
  const commitment = keccak256(
    new Uint8Array([
      ...Buffer.from(proofHex.slice(2), "hex"),
      ...Buffer.from(publicInputsHex.slice(2), "hex"),
    ]),
  );

  const wallet = privateKeyToAccount(TEST_WALLET_PK);
  console.log(`[setup] proof generated; test wallet ${wallet.address}`);

  // Helper: build a server with a configurable fake resolver.
  type FakeOpts = {
    revoked?: boolean;
    expiry?: number;
    walletAddress?: `0x${string}`;
    proofCommitment?: `0x${string}` | null;
    emailHash?: `0x${string}` | null;
    namespaces?: readonly string[];
  };
  function makeServer(opts: FakeOpts = {}) {
    const seenSearches: { query: string; orgLabel: string }[] = [];
    const fastify = buildServer({
      logger: false,
      resolvePrincipal: async (subname): Promise<ResolvedPrincipal | null> => {
        const orgLabel = subname.slice(subname.indexOf(".") + 1).replace(/\.eth$/, "");
        return {
          principal: {
            orgLabel,
            role: "nurse",
            namespaces: opts.namespaces ?? ["clinical", "operational"],
            maxTag: "confidential",
          },
          walletAddress: opts.walletAddress ?? wallet.address,
          proofCommitment: opts.proofCommitment === undefined ? commitment : opts.proofCommitment,
          emailHash:
            opts.emailHash === undefined
              ? (keccak256(toBytes(EMAIL.toLowerCase())) as `0x${string}`)
              : opts.emailHash,
          expiry: opts.expiry ?? 1799999999,
          revoked: opts.revoked ?? false,
        };
      },
      searchAndFilter: async (principal, query) => {
        seenSearches.push({ query, orgLabel: principal.orgLabel });
        return [{ id: "m1", memory: "patient 304 amox 500mg", metadata: { tag: "confidential" } }];
      },
    });
    return { fastify, seenSearches };
  }

  // Build a single signed search request once - cases reuse the body where applicable.
  async function signedSearchRequest(server: ReturnType<typeof makeServer>) {
    const subname = "aysel.zkmemory-istanbulhospital.eth";
    const challengeRes = await server.fastify.inject({
      method: "GET",
      url: `/challenge?subname=${encodeURIComponent(subname)}`,
    });
    const { nonce } = challengeRes.json() as { nonce: string };

    const body = { query: "patient 304 meds", subname, proof: proofHex, publicInputs: publicInputsHex };
    const requestHash = keccak256(new TextEncoder().encode(JSON.stringify(body)));
    const domainHash = keccak256(new TextEncoder().encode(GATEWAY_DOMAIN));
    const challenge = keccak256(
      new Uint8Array([
        ...Buffer.from(domainHash.replace(/^0x/, ""), "hex"),
        ...Buffer.from(nonce.replace(/^0x/, ""), "hex"),
        ...Buffer.from(requestHash.replace(/^0x/, ""), "hex"),
      ]),
    );
    const sig = await wallet.signMessage({ message: { raw: challenge } });
    return { body, nonce, sig, subname };
  }

  console.log("\n[case] healthz");
  {
    const s = makeServer();
    const r = await s.fastify.inject({ method: "GET", url: "/healthz" });
    check("healthz returns ok:true", r.statusCode === 200 && r.json().ok === true);
    await s.fastify.close();
  }

  console.log("\n[case] happy path: real proof + real sig + valid principal");
  {
    const s = makeServer();
    const { body, nonce, sig } = await signedSearchRequest(s);
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("status 200", r.statusCode === 200, `got ${r.statusCode}: ${r.body}`);
    const json = r.json() as { results: unknown[] };
    check("results returned", Array.isArray(json.results) && json.results.length === 1);
    check("search saw correct org", s.seenSearches[0]?.orgLabel === "zkmemory-istanbulhospital");
    await s.fastify.close();
  }

  console.log("\n[case] revoked principal -> 403");
  {
    const s = makeServer({ revoked: true });
    const { body, nonce, sig } = await signedSearchRequest(s);
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("status 403", r.statusCode === 403);
    check("error reason 'revoked'", (r.json() as { error: string }).error === "revoked");
    await s.fastify.close();
  }

  console.log("\n[case] no proof commitment on ENS -> 403");
  {
    const s = makeServer({ proofCommitment: null });
    const { body, nonce, sig } = await signedSearchRequest(s);
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("status 403", r.statusCode === 403);
    check(
      "error mentions commitment",
      (r.json() as { error: string }).error.includes("commitment"),
    );
    await s.fastify.close();
  }

  console.log("\n[case] expired principal -> 403");
  {
    const s = makeServer({ expiry: 1 });
    const { body, nonce, sig } = await signedSearchRequest(s);
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("status 403", r.statusCode === 403);
    check("error reason 'expired'", (r.json() as { error: string }).error === "expired");
    await s.fastify.close();
  }

  console.log("\n[case] wallet sig from wrong key -> 401");
  {
    const otherWallet = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as `0x${string}`,
    );
    const s = makeServer({ walletAddress: otherWallet.address }); // resolver claims a DIFFERENT address
    const { body, nonce, sig } = await signedSearchRequest(s); // sig is from the original wallet
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("status 401", r.statusCode === 401);
    check(
      "error mentions wallet sig",
      (r.json() as { error: string }).error.includes("wallet"),
    );
    await s.fastify.close();
  }

  console.log("\n[case] nonce replay -> 401 on second use");
  {
    const s = makeServer();
    const { body, nonce, sig } = await signedSearchRequest(s);
    const first = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("first call ok", first.statusCode === 200);
    const second = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "x-zkma-nonce": nonce, "x-zkma-sig": sig, "content-type": "application/json" },
      payload: body,
    });
    check("second call 401", second.statusCode === 401);
    check(
      "error mentions nonce",
      (second.json() as { error: string }).error.includes("nonce"),
    );
    await s.fastify.close();
  }

  console.log("\n[case] missing x-zkma-nonce -> 401");
  {
    const s = makeServer();
    const r = await s.fastify.inject({
      method: "POST",
      url: "/v1/memories/search",
      headers: { "content-type": "application/json" },
      payload: { query: "x", subname: "a.b.eth", proof: "0x00", publicInputs: "0x00" },
    });
    check("status 401", r.statusCode === 401);
    await s.fastify.close();
  }

  console.log(`\n${pass}/${pass + fail} checks passed.`);
  process.exit(fail === 0 ? 0 : 1);
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
