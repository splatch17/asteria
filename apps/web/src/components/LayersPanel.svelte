<script lang="ts">
  // Layers of the current view (#54) as menu tiles (#135): the everyday ones (`tier="main"`) or
  // the rarer ones of « Plus de réglages ». No wrapper: the tiles join the caller's grid, next to
  // its own tiles. The menu owns the dialog, focus, closing and the detail readout.
  import { _ } from "@asteria/ui";
  import type { SkyLayers } from "@asteria/sky-renderer";
  import { layersFor, type LayerKey, type LayerView } from "../lib/layers";
  import MenuTile from "./MenuTile.svelte";

  let {
    view,
    tier,
    layers,
    onchange,
    unavailable = [],
    oninfo,
  }: {
    /** Current view: only the layers it renders are offered. */
    view: LayerView;
    tier: "main" | "more";
    layers: Readonly<SkyLayers>;
    onchange: (key: LayerKey, value: boolean) => void;
    /** Layers whose data could not be loaded (#101): shown off and disabled, with a notice. */
    unavailable?: readonly LayerKey[];
    oninfo?: (
      tile: { label: string; detail: string; hint?: string | undefined },
      on: boolean,
    ) => void;
  } = $props();

  const entries = $derived(layersFor(view, tier));
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
