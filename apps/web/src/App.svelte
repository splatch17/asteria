<script lang="ts">
  import { _ } from "@asteria/ui";

  let night = $state(false);

  $effect(() => {
    document.documentElement.dataset.night = night ? "red" : "";
  });
</script>

<main>
  <p class="meta">#00 // {$_("nav.map")}</p>
  <h1>{$_("app.name")}</h1>
  <p class="tagline">{$_("app.tagline")}</p>
  <button onclick={() => (night = !night)} aria-pressed={night}>{$_("night.toggle")}</button>
</main>

<style>
  main {
    min-height: 100dvh;
    display: grid;
    place-content: center;
    gap: 1rem;
    padding: 1rem;
    text-align: center;
  }
  .meta {
    margin: 0;
    color: var(--ast-fg-muted);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    font-size: 0.75rem;
  }
  h1 {
    margin: 0;
    font-family: var(--ast-font-display);
    font-size: clamp(3rem, 14vw, 9rem);
    text-transform: uppercase;
    line-height: 0.9;
  }
  .tagline {
    margin: 0;
    max-width: 36ch;
    color: var(--ast-fg-muted);
  }
  button {
    justify-self: center;
    padding: 0.6rem 1rem;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: inherit;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
  }
</style>
