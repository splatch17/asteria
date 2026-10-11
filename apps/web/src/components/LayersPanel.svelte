<script lang="ts">
  // Layers of the current view (#54), integrated in the menu's « Calques » section (#130): the
  // switches, grouped by theme. The menu owns the dialog, focus and closing.
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import { sectionsFor, type LayerKey, type LayerView } from "../lib/layers";
  import MenuSwitch from "./MenuSwitch.svelte";

  let {
    view,
    layers,
    onchange,
    unavailable = [],
  }: {
    /** Current view: only the layers it renders are offered. */
    view: LayerView;
    layers: Readonly<SkyLayers>;
    onchange: (key: LayerKey, value: boolean) => void;
    /** Layers whose data could not be loaded (#101): shown off and disabled, with a notice. */
    unavailable?: readonly LayerKey[];
  } = $props();

  const sections = $derived(sectionsFor(view));
</script>

<div class="layers" id="layers-panel">
  {#each sections as section (section.id)}
    <div role="group" aria-labelledby={`layers-${section.id}`}>
      <h3 id={`layers-${section.id}`}>{$_(`layers.section.${section.id}`)}</h3>
      {#each section.entries as entry (entry.key)}
        {@const off = unavailable.includes(entry.key)}
        <MenuSwitch
          icon={entry.icon}
          label={$_(`layers.${entry.key}`)}
          hint={off
            ? $_("layers.unavailable")
            : entry.hint
              ? $_(`layers.${entry.key}.hint`)
              : undefined}
          checked={layers[entry.key] && !off}
          disabled={off}
          onclick={() => onchange(entry.key, !layers[entry.key])}
        />
      {/each}
    </div>
  {/each}
</div>

<style>
  h3 {
    margin: 8px 12px 0 40px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    opacity: 0.8;
  }
</style>
