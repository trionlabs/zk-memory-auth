import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  // The contracts-types package ships TS source; transpile it for client bundles.
  transpilePackages: [
    "@zkma/contracts-types",
    "@noir-lang/noir_js",
    "@noir-lang/types",
    "@noir-lang/acvm_js",
    "@noir-lang/noirc_abi",
    "@aztec/bb.js",
    "noir-jwt",
  ],
};

export default nextConfig;
