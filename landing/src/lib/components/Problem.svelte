<section class="landing-section" id="problem">
  <div class="section-inner problem-grid">
    <div>
      <p class="section-kicker">01 / Problem</p>
      <h2 class="section-title">Memory access is still a database filter.</h2>
      <p class="section-copy">
        If two agents query the same memory store today, they usually get
        whatever the operator&apos;s application code returns. That works for
        toy assistants. It fails in hospitals, finance desks, law firms, and
        any team where role, namespace, expiry, and revocation need to be
        independently verifiable.
      </p>
    </div>

    <div class="problem-visual" aria-label="Untrusted memory operator diagram">
      <div class="agent-column">
        <span class="agent-token">nurse agent</span>
        <span class="agent-token">admin agent</span>
      </div>
      <div class="memory-blob">
        <span class="blob-title">shared mem0 store</span>
        <span>clinical</span>
        <span>billing</span>
        <span>restricted</span>
      </div>
      <div class="operator-box">
        <span>operator code decides</span>
        <strong>trust required</strong>
      </div>
    </div>
  </div>
</section>
