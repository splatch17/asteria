<script lang="ts" module>
  export interface InfoRow {
    label: string;
    value: string;
    /** Spoken and shown on hover, e.g. why a distance is approximate. */
    title?: string | undefined;
  }
</script>

<script lang="ts">
  // Info panel shared by the star, Sun/Moon and planet sheets: kept above the time controls by
  // their measured height (`bottom`), so no data row runs under them (#74).
  import type { Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import Designation from "./Designation.svelte";

  let {
    meta,
    name,
    belowHorizon,
    constellation,
    rows,
    bottom,
    onclose,
    children,
  }: {
    meta: Snippet;
    name: string;
    belowHorizon: boolean;
    /** Link to the constellation sheet. */
    constellation?: { name: string; latin: string; onopen: () => void } | undefined;
    rows: InfoRow[];
    /** CSS length from the bottom of the screen. */
    bottom: string;
    onclose: () => void;
    children?: Snippet;
  } = $props();
</script>

<aside class="panel" style:bottom>
  <p class="meta">{@render meta()}</p>
  <p class="name"><Designation text={name} /></p>
  {#if belowHorizon}<p class="meta">{$_("sky.belowHorizon")}</p>{/if}
  {#if constellation}
    <button
      class="con"
      onclick={constellation.onopen}
      aria-label={$_("constellation.open", { values: { name: constellation.name } })}
      >{constellation.name} · <i>{constellation.latin}</i> ›</button
    >
  {/if}
  <dl class="data">
    {#each rows as row, i (i)}
      <dt>{row.label}</dt>
      <dd title={row.title}>
        {row.value}{#if row.title}<span class="sr-only"> ({row.title})</span>{/if}
      </dd>
    {/each}
  </dl>
  {@render children?.()}
  <button class="close" onclick={onclose} aria-label={$_("star.close")} title={$_("star.close")}
    >×</button
  >
</aside>

<style>
  .panel {
    position: fixed;
    z-index: 2;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    max-width: 300px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 85%, transparent);
    backdrop-filter: blur(6px);
    padding: 12px 14px;
  }
  .meta {
    margin: 0;
    padding-right: 32px;
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .name {
    margin: 4px 0 8px;
    padding-right: 32px;
    font-family: var(--ast-font-display);
    font-weight: 700;
    font-size: 30px;
    line-height: 1;
    text-transform: uppercase;
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .con {
    display: block;
    min-height: 32px;
    padding: 0;
    text-align: left;
    margin: -4px 0 4px;
    line-height: 1.4;
  }
  .con i {
    font-family: var(--ast-font-serif);
    font-size: 15px;
    letter-spacing: 0;
    text-transform: none;
  }
  .data {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0 12px;
    margin: 0;
    font: 11px/1.7 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  .data dt {
    text-transform: uppercase;
  }
  .data dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .close {
    position: absolute;
    top: 0;
    right: 0;
    width: 44px;
    height: 44px;
    padding: 0;
    font-size: 16px;
    color: var(--ast-fg);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
