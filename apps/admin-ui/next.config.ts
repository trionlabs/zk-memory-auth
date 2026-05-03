import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // wagmi's connectors barrel pulls in walletconnect/metamask SDK whose optional
  // peers (`pino-pretty`, `@react-native-async-storage/async-storage`) aren't
  // installed. Turbopack tree-shakes them; webpack doesn't, so alias to false.
  webpack: (config) => {
    config.resolve.fallback = {
      ...(config.resolve.fallback ?? {}),
      "pino-pretty": false,
      "@react-native-async-storage/async-storage": false,
    };
    return config;
  },
};

export default nextConfig;
