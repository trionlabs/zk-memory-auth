<script lang="ts">
  import Lattice from "./Lattice.svelte";
  import ThemeSwitcher from "./ThemeSwitcher.svelte";
  import { links } from "$lib/links";
</script>

<header class="site-hero" id="top">
  <nav class="topbar" aria-label="Primary">
    <a href="#top" class="brand-lockup" aria-label="zk memory auth home">
      <span class="brand-mark" aria-hidden="true">Z</span>
      <span>
        <span class="brand-name">zk memory auth</span>
      </span>
    </a>
    <div class="topbar-actions">
      <a href="#how" class="nav-link">How it works</a>
      <a href="#onchain" class="nav-link">On-chain</a>
      <ThemeSwitcher />
    </div>
  </nav>

  <div class="hero-grid">
    <div class="hero-copy">
      <a
        href="https://ethglobal.com/events/openagents"
        target="_blank"
        rel="noreferrer"
        class="hack-badge"
        aria-label="Built for ETHGlobal Open Agents"
      >
        <span class="hack-badge-mark">
          <img src="/openagents-badge.png" alt="" width="28" height="28" />
        </span>
        <span class="hack-badge-text">
          <span class="hack-badge-kicker">Built for</span>
          <span class="hack-badge-title">ETHGlobal · Open Agents</span>
        </span>
      </a>

      <h1>zk memory auth</h1>
      <p class="hero-statement">
        Two agents should not see the same memory just because they share the
        same store.
      </p>
      <p class="hero-body">
        A drop-in gateway in front of mem0 that checks a Google-derived Noir
        proof, resolves the user&apos;s ENS subname, reads role policy from
        ZkmaResolver, and filters memory before retrieval.
      </p>
      <div class="hero-actions" aria-label="Project links">
        <a
          href={links.github}
          target="_blank"
          rel="noreferrer"
          class="btn btn-primary"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
            <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.4-3.9-1.4-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.1.1 1.7 1.2 1.7 1.2 1 1.8 2.7 1.3 3.4 1 .1-.7.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.7 0-1.3.4-2.4 1.2-3.2-.1-.3-.5-1.5.1-3 0 0 1-.3 3.3 1.2.9-.3 2-.4 3-.4s2 .1 3 .4c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.7.1 3 .8.8 1.2 1.9 1.2 3.2 0 4.5-2.7 5.4-5.3 5.7.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
          </svg>
          View on GitHub
        </a>
      </div>
    </div>

    <div class="hero-visual" aria-hidden="true">
      <Lattice />
    </div>
  </div>
</header>
