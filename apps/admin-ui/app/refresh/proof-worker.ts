/**
 * Web worker that runs the heavy proof generation off the UI thread.
 * Receives a message with the JWT + RSA pubkey + admin-set email + onboarded
 * subname, returns the proof, public inputs, and the keccak commitment ready
 * to be written to the user's `zkma:proof-commitment` ENS record.
 *
 * Without this worker the main thread freezes for 10-30 seconds during prove.
 */

import { Noir } from "@noir-lang/noir_js";
import { UltraHonkBackend } from "@aztec/bb.js";
import { generateInputs } from "noir-jwt";
import { keccak256 } from "viem";

const MAX_PARTIAL_DATA_LENGTH = 1024;
const MAX_EMAIL_LENGTH = 100;
const MAX_AUD_LENGTH = 128;
const MAX_ISS_LENGTH = 64;

export type WorkerInput = {
  jwt: string;
  /** JsonWebKey of the Google RSA pubkey that signed the JWT (n + e). */
  pubkeyJwk: JsonWebKey;
  /** The email Google verified for this user (must match the JWT's claim). */
  email: string;
  /** OAuth audience the JWT was issued for. */
  aud: string;
  /** JWT issuer; for Google id-tokens this is "https://accounts.google.com". */
  iss: string;
  /** iat freshness window. */
  iatLower: number;
  iatUpper: number;
};

export type WorkerProgress =
  | { kind: "progress"; step: string }
  | {
      kind: "done";
      proofHex: `0x${string}`;
      publicInputsHex: `0x${string}`;
      commitment: `0x${string}`;
    }
  | { kind: "error"; message: string };

function pad(arr: Uint8Array, capacity: number): { storage: number[]; len: number } {
  const storage = new Array<number>(capacity).fill(0);
  for (let i = 0; i < arr.length; i++) storage[i] = arr[i]!;
  return { storage, len: arr.length };
}

self.onmessage = async (ev: MessageEvent<WorkerInput>) => {
  const post = (msg: WorkerProgress) => self.postMessage(msg);

  try {
    const input = ev.data;
    post({ kind: "progress", step: "fetching circuit artifact" });
    const artifactRes = await fetch("/circuit/zkma_auth.json");
    if (!artifactRes.ok) throw new Error(`circuit artifact fetch failed: ${artifactRes.status}`);
    const circuit = await artifactRes.json();

    post({ kind: "progress", step: "deriving JWT inputs" });
    const jwtInputs = await generateInputs({
      jwt: input.jwt,
      pubkey: input.pubkeyJwk,
      maxSignedDataLength: MAX_PARTIAL_DATA_LENGTH,
    });

    const enc = new TextEncoder();
    const expected_email = pad(enc.encode(input.email), MAX_EMAIL_LENGTH);
    const expected_aud = pad(enc.encode(input.aud), MAX_AUD_LENGTH);
    const expected_iss = pad(enc.encode(input.iss), MAX_ISS_LENGTH);

    post({ kind: "progress", step: "executing circuit (witness)" });
    const noir = new Noir(circuit);
    const { witness } = await noir.execute({
      data: jwtInputs.data!,
      base64_decode_offset: jwtInputs.base64_decode_offset,
      signature_limbs: jwtInputs.signature_limbs!,
      pubkey_modulus_limbs: jwtInputs.pubkey_modulus_limbs!,
      redc_params_limbs: jwtInputs.redc_params_limbs!,
      expected_email,
      expected_aud,
      expected_iss,
      iat_lower: input.iatLower.toString(),
      iat_upper: input.iatUpper.toString(),
    } as never);

    post({ kind: "progress", step: "generating UltraHonk proof (~10-30s)" });
    const backend = new UltraHonkBackend(circuit.bytecode);
    const proofData = await backend.generateProof(witness);

    const proofHex = ("0x" +
      Array.from(proofData.proof)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;
    const publicInputsHex = ("0x" +
      proofData.publicInputs
        .map((s: string) => s.replace(/^0x/, "").padStart(64, "0"))
        .join("")) as `0x${string}`;

    // Build the commitment exactly the way the gateway computes it.
    const proofBytes = new Uint8Array(
      proofHex
        .slice(2)
        .match(/../g)!
        .map((h) => parseInt(h, 16)),
    );
    const piBytes = new Uint8Array(
      publicInputsHex
        .slice(2)
        .match(/../g)!
        .map((h) => parseInt(h, 16)),
    );
    const both = new Uint8Array(proofBytes.length + piBytes.length);
    both.set(proofBytes);
    both.set(piBytes, proofBytes.length);
    const commitment = keccak256(both);

    post({ kind: "done", proofHex, publicInputsHex, commitment });
  } catch (e) {
    post({ kind: "error", message: (e as Error).message });
  }
};
