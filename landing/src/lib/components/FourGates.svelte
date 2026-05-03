<script lang="ts">
  import { gates } from "$lib/links";
</script>

<section class="landing-section" id="how">
  <div class="section-inner">
    <p class="section-kicker">03 / How it works</p>
    <h2 class="section-title">Four gates before a single memory result.</h2>
    <p class="section-copy section-copy-narrow">
      The gateway is stateless. The policy state lives in ENS, the proof is
      generated in the browser, and mem0 only sees a filtered request.
    </p>

    <div class="pipeline" aria-label="Request pipeline">
      <span>Browser proof</span>
      <span>ENS subname</span>
      <span>ZkmaResolver</span>
      <span>Gateway filter</span>
      <span>mem0 REST</span>
    </div>

    <div class="gate-grid">
      {#each gates as gate, index}
        <article class="gate-card">
          <span class="gate-num">{String(index + 1).padStart(2, "0")}</span>
          <h3>{gate.title}</h3>
          <p>{gate.body}</p>
        </article>
      {/each}
    </div>
  </div>
</section>
