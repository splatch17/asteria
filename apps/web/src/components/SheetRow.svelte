<script lang="ts">
  // A row of a tab's home in the sheet (menu v2): full width, at least 44 px, a hairline-framed
  // control (outline ≥ 3:1, #198). A label in spaced capitals on the left (« Heure », « Ce soir »),
  // the data, and a chevron when it leads somewhere. `kind`: a plain row, or the search field's
  // look (it opens the search over the sky), or a quiet hint (no action, no outline).
  import type { Snippet } from "svelte";
  import Icon from "./Icon.svelte";
  import type { IconName } from "../lib/icons";

  let {
    label = "",
    icon,
    kind = "row",
    onclick,
    ariaLabel,
    haspopup = false,
    id,
    children,
  }: {
    label?: string;
    icon?: IconName | undefined;
    kind?: "row" | "field" | "hint";
    onclick?: (() => void) | undefined;
    ariaLabel?: string | undefined;
    haspopup?: boolean;
    /** data-row, for tests and captures. */
    id: string;
    children: Snippet;
  } = $props();
</script>

{#if onclick}
  <button
    class={`row ${kind}`}
    data-row={id}
    {onclick}
    aria-label={ariaLabel}
    aria-haspopup={haspopup ? "dialog" : undefined}
  >
    {#if icon}<span class="icon" aria-hidden="true"><Icon name={icon} size={16} /></span>{/if}
    {#if label}<span class="label">{label}</span>{/if}
    <span class="body">{@render children()}</span>
    {#if kind === "row"}<span class="chev" aria-hidden="true">›</span>{/if}
  </button>
{:else}
  <p class={`row ${kind}`} data-row={id}>
    {#if icon}<span class="icon" aria-hidden="true"><Icon name={icon} size={16} /></span>{/if}
    {#if label}<span class="label">{label}</span>{/if}
    <span class="body">{@render children()}</span>
  </p>
{/if}

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    margin: 0;
    padding: 6px 12px;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 400 var(--ast-fs-s)/1.35 var(--ast-font-mono);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms var(--ast-ease-out);
  }
  button.row:active {
    background: color-mix(in srgb, var(--ast-fg) 9%, transparent);
  }
  @media (hover: hover) {
    button.row:hover {
      background: color-mix(in srgb, var(--ast-fg) 6%, transparent);
    }
  }
  .row:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .field {
    color: var(--ast-fg-muted);
    font-size: var(--ast-fs-m);
  }
  .hint {
    border-color: var(--ast-hairline);
    color: var(--ast-fg-muted);
    font-size: var(--ast-fs-s);
    cursor: default;
  }
  .icon {
    flex: none;
    display: grid;
    place-items: center;
  }
  .label {
    flex: none;
    min-width: 52px;
    font: 500 var(--ast-fs-s)/1.2 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .body {
    flex: 1;
    min-width: 0;
  }
  .chev {
    flex: none;
    font: 400 16px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .row {
      transition: none;
    }
  }
</style>
