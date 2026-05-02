"use client";

import { useEffect, useState } from "react";
import { TxButton } from "./tx-button";

type Props = {
  orgNode: `0x${string}`;
  current: string;
  canEdit: boolean;
  onConfirmed: () => void;
};

export function PartnersEditor({ orgNode, current, canEdit, onConfirmed }: Props) {
  const [val, setVal] = useState(current ?? "");
  useEffect(() => setVal(current ?? ""), [current]);

  if (!canEdit) {
    return (
      <div className="text-xs font-mono text-zinc-400">
        partners: <span className="text-zinc-200">{current || "—"}</span>
      </div>
    );
  }

  const dirty = val !== (current ?? "");

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-zinc-500 font-mono w-20">partners</span>
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="comma,separated,ens.eth,names"
        className="flex-1 bg-zinc-950 border border-zinc-700 rounded px-2 py-1 font-mono text-[11px]"
      />
      <TxButton
        functionName="setPartners"
        args={[orgNode, val]}
        label="Save"
        className="bg-emerald-500 text-zinc-950 hover:bg-emerald-400 px-3 py-1 text-xs"
        disabledReason={dirty ? null : "no change"}
        onConfirmed={onConfirmed}
      />
    </div>
  );
}
