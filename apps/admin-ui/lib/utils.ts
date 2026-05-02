import { keccak256, stringToBytes, encodePacked } from "viem";

export function shortAddr(addr?: string | null): string {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Compute a child namehash given parent + label. */
export function childNode(parentNode: `0x${string}`, label: string): `0x${string}` {
  return keccak256(
    encodePacked(["bytes32", "bytes32"], [parentNode, keccak256(stringToBytes(label))]),
  );
}

/** keccak256 of a label (used to index `users[org][lh]`). */
export function labelHash(label: string): `0x${string}` {
  return keccak256(stringToBytes(label));
}

export function fmtExpiry(secs: bigint | number | undefined | null): string {
  if (!secs) return "—";
  const s = typeof secs === "bigint" ? Number(secs) : secs;
  if (s === 0) return "no expiry";
  const d = new Date(s * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ");
}

