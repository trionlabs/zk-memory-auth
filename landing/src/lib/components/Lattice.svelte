<script lang="ts">
  import { onMount } from "svelte";

  type Domain = "med" | "ins" | "hr" | "fam" | "sales";
  type Verdict = "ALLOWED" | "DENIED";
  type IconName =
    | "pulse" | "doc" | "list" | "image" | "shield"
    | "card" | "user" | "calendar" | "chart" | "ticket";

  type Cell = { id: string; label: string; icon: IconName; domain: Domain };
  type Agent = { id: string; handle: string; domain: Domain };
  type Beam = { cellId: string; agentId: string; verdict: Verdict; key: number };

  const cells: readonly Cell[] = [
    { id: "vital",     label: "vital signs",      icon: "pulse",   domain: "med" },
    { id: "psych",     label: "psych notes",      icon: "doc",     domain: "med" },
    { id: "icd",       label: "icd codes",        icon: "list",    domain: "med" },
    { id: "allergy",   label: "allergy list",     icon: "pulse",   domain: "med" },

    { id: "damage",    label: "damage photos",    icon: "image",   domain: "ins" },
    { id: "fraud",     label: "fraud flags",      icon: "shield",  domain: "ins" },
    { id: "med-hist",  label: "med history",      icon: "doc",     domain: "ins" },
    { id: "payout",    label: "payout auth",      icon: "card",    domain: "ins" },

    { id: "resume",    label: "resume",           icon: "user",    domain: "hr" },
    { id: "interview", label: "interview notes",  icon: "doc",     domain: "hr" },
    { id: "salary",    label: "salary band",      icon: "card",    domain: "hr" },
    { id: "refs",      label: "references",       icon: "user",    domain: "hr" },

    { id: "bank",      label: "bank statements",  icon: "card",    domain: "fam" },
    { id: "report",    label: "report card",      icon: "doc",     domain: "fam" },
    { id: "family",    label: "family calendar",  icon: "calendar",domain: "fam" },
    { id: "photos",    label: "personal photos",  icon: "image",   domain: "fam" },

    { id: "company",   label: "company data",     icon: "chart",   domain: "sales" },
    { id: "deal",      label: "deal pricing",     icon: "card",    domain: "sales" },
    { id: "support",   label: "support tickets",  icon: "ticket",  domain: "sales" },
    { id: "comp",      label: "competitor intel", icon: "shield",  domain: "sales" },
  ];

  const agents: readonly Agent[] = [
    { id: "alice",  handle: "alice@hosp",   domain: "med" },
    { id: "jane",   handle: "jane@ins",     domain: "ins" },
    { id: "sara",   handle: "sara@hire",    domain: "hr" },
    { id: "parent", handle: "parent@home",  domain: "fam" },
    { id: "sam",    handle: "sam@crm",      domain: "sales" },
  ];

  function pickBeams(counter: number): Beam[] {
    const usedCells = new Set<string>();
    const next: Beam[] = [];
    for (const agent of agents) {
      const matching = cells.filter((c) => c.domain === agent.domain && !usedCells.has(c.id));
      const others   = cells.filter((c) => c.domain !== agent.domain && !usedCells.has(c.id));
      const allow = Math.random() < 0.62 && matching.length > 0;
      const pool = allow ? matching : others.length > 0 ? others : matching;
      if (pool.length === 0) continue;
      const cell = pool[Math.floor(Math.random() * pool.length)];
      usedCells.add(cell.id);
      next.push({
        cellId: cell.id,
        agentId: agent.id,
        verdict: allow ? "ALLOWED" : "DENIED",
        key: counter * 10 + next.length,
      });
    }
    return next.slice(0, 4);
  }

  // Empty on prerender so the static HTML matches first hydration —
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
    <div class={beam ? "lattice-cell lattice-cell-active" : "lattice-cell"}>
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
        {:else if cell.icon === "list"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7h14M5 12h14M5 17h14" />
            <circle cx="3" cy="7" r="0.6" fill="currentColor" />
            <circle cx="3" cy="12" r="0.6" fill="currentColor" />
            <circle cx="3" cy="17" r="0.6" fill="currentColor" />
          </svg>
        {:else if cell.icon === "image"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="5" width="18" height="14" rx="1.5" />
            <path d="M3 16l5-5 4 4 3-3 6 6" />
            <circle cx="9" cy="10" r="1.4" />
          </svg>
        {:else if cell.icon === "shield"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 3l8 3v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" />
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
        {:else if cell.icon === "calendar"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <rect x="4" y="6" width="16" height="14" rx="1.5" />
            <path d="M4 10h16M9 4v4M15 4v4" />
          </svg>
        {:else if cell.icon === "chart"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 19V9M11 19V5M17 19v-7" />
            <path d="M3 19h18" />
          </svg>
        {:else if cell.icon === "ticket"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 8a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2a2 2 0 100-4z" />
            <path d="M14 6v12" stroke-dasharray="2 2" />
          </svg>
        {/if}
      </span>
      <span class="lattice-label">{cell.label}</span>

      {#if beam && agent}
        {#key beam.key}
          <div class="lattice-beam beam-{agent.id} beam-{beam.verdict.toLowerCase()}">
            <span class="lattice-beam-status">{beam.verdict}</span>
            <span class="lattice-beam-handle">{agent.handle}</span>
          </div>
        {/key}
      {/if}
    </div>
  {/each}
</div>
