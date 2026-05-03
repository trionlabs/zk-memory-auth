<script lang="ts">
  import { memoryQuestions, personas } from "$lib/links";
</script>

<section class="landing-section landing-section-strong" id="demo">
  <div class="section-inner">
    <div class="section-heading-row">
      <div>
        <p class="section-kicker">02 / Demo narrative</p>
        <h2 class="section-title">Same hospital memory. Different answers.</h2>
      </div>
      <p class="section-note">
        Every row is an ENS subname. Every decision is derived from text
        records and the proof attached to the request.
      </p>
    </div>

    <div class="matrix-wrap" role="region" aria-label="Hospital access matrix">
      <table class="access-matrix">
        <thead>
          <tr>
            <th scope="col">Principal</th>
            {#each memoryQuestions as question}
              <th scope="col">{question}</th>
            {/each}
          </tr>
        </thead>
        <tbody>
          {#each personas as persona}
            <tr>
              <th scope="row">
                <span class="persona-role">{persona.role}</span>
                <span class="persona-ens">{persona.ens}</span>
                <span class="persona-policy">
                  {persona.namespaces} / max {persona.maxTag}
                </span>
              </th>
              {#each persona.results as result}
                <td>
                  <span class="status-cell status-{result}">
                    {result === "allow" ? "allowed" : "denied"}
                  </span>
                </td>
              {/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="partner-band">
      <div>
        <span class="mini-label">cross-org case</span>
        <strong>claims-bot.zkmemory-acmeinsurance.eth</strong>
      </div>
      <p>
        Billing codes shared with the insurer pass. Mental health history and
        hospital strategy fail because namespace, tag level, and partner
        records do not match.
      </p>
    </div>
  </div>
</section>
