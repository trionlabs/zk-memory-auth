import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  turbopack: {
    root: repoRoot,
  },
  // The contracts-types package ships TS source; transpile it for client bundles.
  transpilePackages: ["@zkca/contracts-types"],
};

export default nextConfig;
