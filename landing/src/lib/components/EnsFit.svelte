<script lang="ts">
  const points = [
    "Subnames are the identity layer for users and org agents.",
    "Text records are the role, namespace, tag, expiry, revocation, and proof state.",
    "IExtendedResolver wildcard support makes those records resolvable through standard ENS tooling.",
    "Anyone with a Sepolia RPC can re-read the records and check the gateway's decision.",
  ];
</script>

<section class="landing-section" id="ens">
  <div class="section-inner ens-grid">
    <div>
      <p class="section-kicker">05 / ENS fit</p>
      <h2 class="section-title">Not ENS-as-login. ENS as policy substrate.</h2>
    </div>
    <div class="ens-point-grid">
      {#each points as point}
        <article class="ens-point">
          <span class="point-mark" aria-hidden="true"></span>
          <p>{point}</p>
        </article>
      {/each}
    </div>
  </div>
</section>
