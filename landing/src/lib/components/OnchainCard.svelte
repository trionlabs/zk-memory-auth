<script lang="ts">
  import { chainId, links, requiredPrefix, resolverAddress, textRecords } from "$lib/links";

  const recordPre = textRecords.map((r) => `${r}: <value>`).join("\n");
</script>

<section class="landing-section landing-section-strong" id="onchain">
  <div class="section-inner onchain-grid">
    <div>
      <p class="section-kicker">04 / On-chain substrate</p>
      <h2 class="section-title">ENS is the access control surface.</h2>
      <p class="section-copy">
        ZkmaResolver implements wildcard resolution for the project names.
        User subnames carry the role and namespace policy that the gateway has
        to enforce. No project database is needed to re-derive a decision.
      </p>
      <div class="fact-list">
        <div>
          <span>network</span>
          <strong>Sepolia / {chainId}</strong>
        </div>
        <div>
          <span>required prefix</span>
          <strong>{requiredPrefix}</strong>
        </div>
        <div>
          <span>resolver</span>
          <a href={links.resolver} target="_blank" rel="noreferrer">
            {resolverAddress}
          </a>
        </div>
      </div>
    </div>

    <div class="record-panel">
      <span class="mini-label">served by ZkmaResolver</span>
      <pre aria-label="ENS text record keys">{recordPre}</pre>
      <p class="security-note">
        Current v0.1 note: the email is still a public circuit input. Moving
        it behind a Poseidon commitment is explicitly a v0.2 goal.
      </p>
    </div>
  </div>
</section>
