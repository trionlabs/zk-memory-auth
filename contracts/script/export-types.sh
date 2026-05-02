#!/usr/bin/env bash
# Refreshes @zkca/contracts-types from the latest forge build + deployment artifact.
# Run after `forge build` and after every `forge script Bootstrap.s.sol --broadcast`.
set -euo pipefail

cd "$(dirname "$0")/.."

dst=../packages/contracts-types/src

mkdir -p "$dst/abi" "$dst/deployments"

cp out/ZkcaResolver.sol/ZkcaResolver.json "$dst/abi/ZkcaResolver.json"
echo "→ refreshed $dst/abi/ZkcaResolver.json"

if [[ -f deployments/sepolia.json ]]; then
  cp deployments/sepolia.json "$dst/deployments/sepolia.json"
  echo "→ refreshed $dst/deployments/sepolia.json"
else
  echo "× no deployments/sepolia.json yet — run Bootstrap first" >&2
fi
