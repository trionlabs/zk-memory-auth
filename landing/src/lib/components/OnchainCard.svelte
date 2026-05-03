<script lang="ts">
  import { links, requiredPrefix, resolverAddress, textRecords } from "$lib/links";

  const recordPre = textRecords.map((r) => `${r}: <value>`).join("\n");
</script>

<section class="landing-section landing-section-strong" id="onchain">
  <div class="section-inner onchain-grid">
    <div>
      <p class="section-kicker">04 / On-chain substrate</p>
      <h2 class="section-title">ENS is the access control surface.</h2>
      <p class="section-copy">
        No policy database. Every access decision is re-derivable from
        on-chain records with a Sepolia RPC. ZkmaResolver implements
        IExtendedResolver wildcard resolution.
      </p>
      <div class="fact-list">
        <div>
          <span>network</span>
          <strong>Sepolia</strong>
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
      <pre aria-label="ENS text record keys">{recordPre}</pre>
      <p class="security-note">
        v0.1: email is a public circuit input. v0.2 moves it behind a
        Poseidon commitment — only domain membership is revealed.
      </p>
    </div>
  </div>
</section>
