<script lang="ts">
  import { gates } from "$lib/links";
</script>

<section class="landing-section" id="how">
  <div class="section-inner">
    <p class="section-kicker">03 / How it works</p>
    <h2 class="section-title">Four gates before a single memory result.</h2>
    <p class="section-copy section-copy-narrow">
      The gateway is stateless. The policy lives in ENS, the proof is
      generated in the browser, mem0 only sees a filtered request.
    </p>

    <div class="gate-grid">
      {#each gates as gate, index}
        <article class="gate-card">
          <span class="gate-step" aria-hidden="true">
            {String(index + 1).padStart(2, "0")}
          </span>
          <span class="gate-step-label">step {index + 1} of 4</span>
          <h3>{gate.title}</h3>
          <p>
            {#each gate.body as seg}
              {#if typeof seg === "string"}{seg}{:else}<span class="kw kw-{seg.tone}">{seg.kw}</span>{/if}
            {/each}
          </p>
        </article>
      {/each}
    </div>

    <p class="section-pullquote section-pullquote-after">
      The proof binds the identity. The wallet binds the request. You need
      both, every call.
    </p>
  </div>
</section>
