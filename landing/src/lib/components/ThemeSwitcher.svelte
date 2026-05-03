<script lang="ts">
  function toggle() {
    const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.setAttribute("data-mode", next);
    try {
      localStorage.setItem("zkma.theme", JSON.stringify({ theme: next, mode: next }));
    } catch {
      /* ignore */
    }
  }
</script>

<button
  type="button"
  aria-label="Toggle color theme"
  title="Toggle color theme"
  onclick={toggle}
  class="mode-toggle"
>
  <span class="knob">
    <svg class="sun-icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
    <svg class="moon-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  </span>
</button>
