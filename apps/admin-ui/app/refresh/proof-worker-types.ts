/**
 * Shared types between proof-worker.ts and page.tsx.
 * Extracted to a standalone file so page.tsx can import them without
 * pulling in @aztec/bb.js, @noir-lang/noir_js, etc. during SSR.
 */

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
