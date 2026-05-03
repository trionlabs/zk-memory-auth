"use client";

import { useState } from "react";
import { keccak256, toBytes } from "viem";
import { TxButton } from "./tx-button";

type Props = {
  orgNode: `0x${string}`;
  onConfirmed: () => void;
};

export function RegisterUserForm({ orgNode, onConfirmed }: Props) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [userAddr, setUserAddr] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("nurse");
  const [namespaces, setNamespaces] = useState("clinical,operational");
  const [maxTag, setMaxTag] = useState("confidential");
  const [expiryDays, setExpiryDays] = useState("7");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-zinc-700 bg-zinc-950/50 px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200 transition font-mono"
      >
        + register new user
      </button>
    );
  }

  const expirySecs =
    Math.floor(Date.now() / 1000) + Math.max(0, Number(expiryDays || "0")) * 86400;

  const labelOk = /^[a-z0-9-]{1,32}$/.test(label);
  const addrOk = /^0x[0-9a-fA-F]{40}$/.test(userAddr);
  // Loose RFC-822-ish; the gateway is the authoritative validator (it
  // compares hashes, not strings). We just want to catch obvious typos here.
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const disableReason = !labelOk
    ? "label must be lowercase a-z, 0-9, hyphen"
    : !addrOk
      ? "userAddr must be a 0x-prefixed 20-byte address"
      : !emailOk
        ? "email must look like name@domain.tld"
        : null;
  // keccak256 over the lowercased email - matches what the gateway does on the
  // proof's expected_email public input. Lowercasing is a deliberate choice:
  // RFC 5321 makes local-parts case-sensitive but Google's IDP normalizes them,
  // and we want the admin's typed email to match the JWT's email claim.
  const emailHash = emailOk
    ? (keccak256(toBytes(email.trim().toLowerCase())) as `0x${string}`)
    : ("0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`);

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wider text-zinc-400">register new user</h4>
        <button onClick={() => setOpen(false)} className="text-xs text-zinc-500 hover:text-zinc-300">cancel</button>
      </div>
      <div className="grid grid-cols-[7rem_1fr] gap-y-2 text-xs items-center">
        <label className="text-zinc-500 font-mono">label</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. newnurse" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono" />

        <label className="text-zinc-500 font-mono">userAddr</label>
        <input value={userAddr} onChange={(e) => setUserAddr(e.target.value)} placeholder="0x…" className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono" />

        <label className="text-zinc-500 font-mono">email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="aysel@hospital.org"
          className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono"
        />

        <label className="text-zinc-500 font-mono">role</label>
        <input value={role} onChange={(e) => setRole(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono" />

        <label className="text-zinc-500 font-mono">namespaces</label>
        <input value={namespaces} onChange={(e) => setNamespaces(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono" />

        <label className="text-zinc-500 font-mono">max-tag</label>
        <select value={maxTag} onChange={(e) => setMaxTag(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono">
          <option value="public">public</option>
          <option value="internal">internal</option>
          <option value="confidential">confidential</option>
          <option value="restricted">restricted</option>
        </select>

        <label className="text-zinc-500 font-mono">expiry (days)</label>
        <input value={expiryDays} onChange={(e) => setExpiryDays(e.target.value)} className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1 font-mono w-24" />
      </div>
      <div className="pt-2">
        <TxButton
          functionName="registerUser"
          args={[
            orgNode,
            label,
            userAddr as `0x${string}`,
            emailHash,
            role,
            namespaces,
            maxTag,
            BigInt(expirySecs),
          ]}
          label="Register"
          className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 px-4 py-1.5"
          disabledReason={disableReason}
          onConfirmed={() => {
            onConfirmed();
            setOpen(false);
            setLabel("");
            setUserAddr("");
            setEmail("");
          }}
        />
      </div>
    </div>
  );
}
