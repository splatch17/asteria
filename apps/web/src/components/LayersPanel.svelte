<script lang="ts">
  // Layers of one section (#54: Ciel, Système solaire, Repères) as menu tiles (#135), in the
  // menu's « Affichage » panel (#138). No wrapper: the tiles join the caller's grid. The menu owns
  // the dialog, focus, closing and the detail readout.
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import type { LayerEntry, LayerKey } from "../lib/layers";
  import MenuTile from "./MenuTile.svelte";

  let {
    entries,
    layers,
    onchange,
    unavailable = [],
    oninfo,
  }: {
    /** The section's layers honoured by the current view (`sectionsFor`). */
    entries: readonly LayerEntry[];
    layers: Readonly<SkyLayers>;
    onchange: (key: LayerKey, value: boolean) => void;
    /** Layers whose data could not be loaded (#101): shown off and disabled, with a notice. */
    unavailable?: readonly LayerKey[];
    oninfo?: (
      tile: { label: string; detail: string; hint?: string | undefined },
      on: boolean,
    ) => void;
  } = $props();
</script>

{#each entries as entry (entry.key)}
  {@const off = unavailable.includes(entry.key)}
  <MenuTile
    id={entry.key}
    icon={entry.icon}
    label={$_(`layers.${entry.key}.short`)}
    detail={$_(`layers.${entry.key}`)}
    hint={off ? $_("layers.unavailable") : entry.hint ? $_(`layers.${entry.key}.hint`) : undefined}
    pressed={layers[entry.key] && !off}
    disabled={off}
    onclick={() => onchange(entry.key, !layers[entry.key])}
    {oninfo}
  />
{/each}
