<script lang="ts">
  // « Recentrer » over a game's sky (#183): shown once the player has zoomed, panned or turned
  // the view away from the question's framing; brings it back.
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";

  let { shown, onrecentre }: { shown: boolean; onrecentre: () => void } = $props();
</script>

<button
  class="recentre"
  class:shown
  tabindex={shown ? 0 : -1}
  aria-hidden={!shown}
  aria-label={$_("games.recentreLabel")}
  onclick={onrecentre}
>
  <Icon name="recentre" size={14} />
  <span>{$_("games.recentre")}</span>
</button>

<style>
  .recentre {
    position: absolute;
    right: max(10px, env(safe-area-inset-right));
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 14px 0 12px;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-bg) 82%, transparent);
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    opacity: 0;
    visibility: hidden;
    transition:
      opacity 160ms var(--ast-ease-out),
      visibility 0s 160ms;
  }
  .recentre.shown {
    opacity: 1;
    visibility: visible;
    transition: opacity 160ms var(--ast-ease-out);
  }
  .recentre:hover {
    border-color: var(--ast-fg);
  }
  .recentre:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .recentre,
    .recentre.shown {
      transition: none;
    }
  }
</style>
