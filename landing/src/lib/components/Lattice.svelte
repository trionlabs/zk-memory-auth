<script lang="ts">
  import { onMount } from "svelte";

  type Domain = "med" | "ins" | "hr";
  type Verdict = "ALLOWED" | "DENIED";
  type IconName = "pulse" | "doc" | "shield" | "image" | "card" | "user";

  type Cell = { id: string; icon: IconName; domain: Domain };
  type Agent = { id: string; handle: string; domain: Domain };
  type Beam = { cellId: string; agentId: string; verdict: Verdict; key: number };

  // 3×3 grid: one row per domain (med / ins / hr).
  const cells: readonly Cell[] = [
    { id: "vital",   icon: "pulse",  domain: "med" },
    { id: "psych",   icon: "doc",    domain: "med" },
    { id: "allergy", icon: "pulse",  domain: "med" },

    { id: "damage", icon: "image",  domain: "ins" },
    { id: "fraud",  icon: "shield", domain: "ins" },
    { id: "payout", icon: "card",   domain: "ins" },

    { id: "resume", icon: "user",   domain: "hr" },
    { id: "salary", icon: "card",   domain: "hr" },
    { id: "refs",   icon: "user",   domain: "hr" },
  ];

  const agents: readonly Agent[] = [
    { id: "alice", handle: "alice@hosp", domain: "med" },
    { id: "jane",  handle: "jane@ins",   domain: "ins" },
    { id: "sara",  handle: "sara@hire",  domain: "hr" },
  ];

  function pickBeams(counter: number): Beam[] {
    // Show 2 agents per cycle: one allowed (matching its domain), one denied
    // (probing off-domain). Simpler than the previous "every agent" rotation.
    const usedCells = new Set<string>();
    const next: Beam[] = [];

    const allowedAgent = agents[Math.floor(Math.random() * agents.length)];
    const allowPool = cells.filter((c) => c.domain === allowedAgent.domain);
    const allowCell = allowPool[Math.floor(Math.random() * allowPool.length)];
    if (allowCell) {
      usedCells.add(allowCell.id);
      next.push({
        cellId: allowCell.id,
        agentId: allowedAgent.id,
        verdict: "ALLOWED",
        key: counter * 10,
      });
    }

    const otherAgents = agents.filter((a) => a.id !== allowedAgent.id);
    const deniedAgent = otherAgents[Math.floor(Math.random() * otherAgents.length)];
    const denyPool = cells.filter(
      (c) => c.domain !== deniedAgent.domain && !usedCells.has(c.id),
    );
    const denyCell = denyPool[Math.floor(Math.random() * denyPool.length)];
    if (denyCell) {
      next.push({
        cellId: denyCell.id,
        agentId: deniedAgent.id,
        verdict: "DENIED",
        key: counter * 10 + 1,
      });
    }

    return next;
  }

  // Empty on prerender so static HTML matches first hydration —
  // pickBeams uses Math.random(), so populating synchronously would diverge.
  let beams = $state<Beam[]>([]);

  onMount(() => {
    let counter = 0;
    const kick = window.setTimeout(() => {
      beams = pickBeams(counter++);
    }, 60);
    const t = window.setInterval(() => {
      beams = pickBeams(counter++);
    }, 2400);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  });

  const beamByCell = $derived(new Map(beams.map((b) => [b.cellId, b])));
</script>

<div class="lattice" aria-hidden="true">
  {#each cells as cell (cell.id)}
    {@const beam = beamByCell.get(cell.id)}
    {@const agent = beam ? agents.find((a) => a.id === beam.agentId) : undefined}
    <div
      class={beam ? "lattice-cell lattice-cell-active" : "lattice-cell"}
      data-domain={cell.domain}
    >
      <span class="lattice-icon" aria-hidden="true">
        {#if cell.icon === "pulse"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12h4l2-6 4 12 2-6h6" />
          </svg>
        {:else if cell.icon === "doc"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 3h7l5 5v13H7z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h7M9 17h5" />
          </svg>
        {:else if cell.icon === "shield"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" />
          </svg>
        {:else if cell.icon === "image"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="1.5" />
            <path d="M3 16l5-5 4 4 3-3 6 6" />
            <circle cx="9" cy="10" r="1.4" />
          </svg>
        {:else if cell.icon === "card"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="1.5" />
            <path d="M3 10h18" />
            <path d="M7 15h4" />
          </svg>
        {:else if cell.icon === "user"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="9" r="3.4" />
            <path d="M5 20c1.4-3.5 4-5 7-5s5.6 1.5 7 5" />
          </svg>
        {/if}
      </span>

      {#if beam && agent}
        {#key beam.key}
          <div class="lattice-beam beam-{beam.verdict.toLowerCase()}">
            <span class="lattice-beam-handle">{agent.handle}</span>
          </div>
        {/key}
      {/if}
    </div>
  {/each}
</div>
