<script lang="ts">
  const points = [
    "Revocation is a single text record write. No session invalidation, no token rotation.",
  ];
</script>

<section class="landing-section" id="ens">
  <div class="section-inner ens-grid">
    <div>
      <p class="section-kicker">05 / ENS fit</p>
      <h2 class="section-title">Not ENS-as-login. ENS as policy substrate.</h2>
      <p class="section-copy">
        The subname is the identity. The text records are the policy. Both
        are public, both are revocable, both work with standard ENS
        tooling.
      </p>
    </div>
    <div class="ens-point-grid ens-point-grid-single">
      {#each points as point}
        <article class="ens-point">
          <span class="point-mark" aria-hidden="true"></span>
          <p>{point}</p>
        </article>
      {/each}
    </div>
  </div>
</section>
