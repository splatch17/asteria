<script lang="ts">
  // Home of the Catalogue tab (menu v2, sketch A + B panel 3): pictures, not a list. « Tes
  // dernières cartes », the last three constellations looked at in the deck (lib/recent-cards),
  // as small cards drawn from their sky (CardThumb): a tap opens the deck on that card. Then
  // « Ouvrir les 88 cartes », the deck laid on the constellation standing highest in the sky now
  // (lib/sky-tonight figureToSee: among the well-known ones of the Découverte list when one is at
  // least 20° high, as « Ce soir » of the Ciel tab, else the highest of all). Then two tiles: « Visibles ce soir » (their count; the catalogue's list on
  // its « Ce soir » filter, #170) and « Selon la latitude » (#188). Before any card was looked at,
  // the highest constellation is offered as the first card to open.
  // Computed once per opening: the date and the place do not change under the sheet.
  import { untrack } from "svelte";
  import { _ } from "@asteria/ui";
  import type { Observer } from "@asteria/astro-core";
  import type { CatalogStar, SkyTheme } from "@asteria/sky-renderer";
  import { constellationShapes } from "../lib/games/geometry";
  import { loadProgress } from "../lib/games/progress";
  import { visibleTonight } from "../lib/games/visibility";
  import { RECENT_KEY, isRecentList, recentCards } from "../lib/recent-cards";
  import { figureToSee, highestFigure } from "../lib/sky-tonight";
  import { DISCOVERY_CONSTELLATIONS } from "../lib/games/pool";
  import { readSetting } from "../lib/storage";
  import CardThumb from "./CardThumb.svelte";
  import Vignette from "./Vignette.svelte";

  let {
    stars,
    lines,
    names,
    date,
    observer,
    theme,
    onopen,
    onvisible,
    onlatitude,
    onmeta,
  }: {
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    /** Constellation names (French), by IAU abbreviation. */
    names: Readonly<Record<string, string>>;
    date: Date;
    observer: Observer;
    theme: Pick<SkyTheme, "sky" | "ink">;
    /** Opens the deck of the 88 on a constellation. */
    onopen: (abbr: string) => void;
    /** Opens the catalogue's list on « Ce soir ». */
    onvisible: () => void;
    onlatitude: () => void;
    /** The header's short meta: cards looked at, of the 88. */
    onmeta?: (meta: string) => void;
  } = $props();

  const shapes = untrack(() => constellationShapes(stars, lines));
  const all = Object.keys(shapes);
  const progress = loadProgress();
  const seen = all.filter((a) => progress.seen[`con:${a}`] !== undefined).length;
  const recent = recentCards(readSetting(RECENT_KEY, [], isRecentList), progress.seen, (a) =>
    Boolean(shapes[a]),
  );
  const centres = Object.fromEntries(all.map((a) => [a, shapes[a]!.centre]));
  const highest = untrack(
    () =>
      figureToSee(centres, DISCOVERY_CONSTELLATIONS, date, observer)?.abbr ?? recent[0] ?? "Ori",
  );
  const visible = untrack(() => visibleTonight(shapes, date, observer));
  /** The tile's picture: one of those up tonight, the well-known first, not the card above. */
  const visibleArt = untrack(() => {
    const up = [...visible].filter((a) => a !== highest);
    const known = up.filter((a) => DISCOVERY_CONSTELLATIONS.includes(a));
    return highestFigure(centres, known.length ? known : up, date, observer)?.abbr ?? up[0] ?? null;
  });
  const name = (abbr: string) => names[abbr] ?? abbr;
  $effect(() => {
    onmeta?.($_("catalogue.meta", { values: { seen, total: all.length } }));
  });
</script>

<div class="home">
  <section aria-labelledby="cat-recent">
    <h3 id="cat-recent">{$_(recent.length ? "catalogue.recent" : "catalogue.start")}</h3>
    {#if recent.length}
      <ul class="recent">
        {#each recent as abbr (abbr)}
          <li>
            <button class="card" data-recent={abbr} onclick={() => onopen(abbr)}>
              <span class="art"
                ><CardThumb {abbr} {stars} {lines} shape={shapes[abbr]!} {date} {theme} /></span
              >
              <span class="index" aria-hidden="true">{abbr}</span>
              <span class="name">{name(abbr)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <!-- Nothing looked at yet: the constellation highest in the sky, as the first card. -->
      <button class="card first" data-recent={highest} onclick={() => onopen(highest)}>
        <span class="art"
          ><CardThumb
            abbr={highest}
            {stars}
            {lines}
            shape={shapes[highest]!}
            {date}
            {theme}
          /></span
        >
        <span class="index" aria-hidden="true">{highest}</span>
        <span class="first-text">
          <span class="name">{name(highest)}</span>
          <span class="pitch">{$_("catalogue.start.hint")}</span>
        </span>
      </button>
    {/if}
  </section>

  <button class="primary" data-action="deck" onclick={() => onopen(highest)}>
    {$_("catalogue.openAll", { values: { total: all.length } })}
  </button>

  <div class="tiles">
    <button class="tile" data-action="latitude" onclick={onlatitude}>
      <span class="tile-art vignette"><Vignette id="latitude" /></span>
      <span class="tile-name">{$_("learn.latitude.title")}</span>
    </button>
    <button
      class="tile"
      data-action="visible"
      onclick={onvisible}
      aria-label={$_("catalogue.visible.label", { values: { n: visible.size } })}
    >
      {#if visibleArt && shapes[visibleArt]}
        <span class="tile-art"
          ><CardThumb
            abbr={visibleArt}
            {stars}
            {lines}
            shape={shapes[visibleArt]!}
            {date}
            {theme}
            fill={0.9}
          /></span
        >
      {/if}
      <span class="count" aria-hidden="true">{visible.size}</span>
      <span class="tile-name" aria-hidden="true">{$_("catalogue.visible")}</span>
    </button>
  </div>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sheet-gap);
  }
  h3 {
    margin: 0 2px 6px;
    font: 500 var(--ast-fs-s)/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .recent {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
  }
  /* A card in small, as in the deck (#196): a night sheet, an ink rule at 55 %, sharp corners,
     the UAI index on an ink plate in the corner, the sky edge to edge, the name at the bottom. */
  .card {
    position: relative;
    display: block;
    width: 100%;
    aspect-ratio: 3 / 4;
    padding: 0;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--ast-fg) 55%, transparent);
    border-radius: var(--ast-radius);
    background: var(--ast-bg);
    color: var(--ast-fg);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .card.first {
    display: flex;
    align-items: stretch;
    aspect-ratio: auto;
    height: 112px;
  }
  .card.first .art {
    position: relative;
    flex: none;
    width: 112px;
    inset: auto;
    border-right: 1px solid var(--ast-hairline);
  }
  .first-text {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 6px;
    padding: 12px;
  }
  .card.first .name {
    position: static;
    font-size: 24px;
  }
  .pitch {
    font: 400 var(--ast-fs-s)/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .art {
    position: absolute;
    inset: 0;
  }
  .index {
    position: absolute;
    top: 0;
    left: 0;
    padding: 3px 5px 2px;
    background: var(--ast-fg);
    color: var(--ast-bg);
    font: 600 var(--ast-fs-xs)/1 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .name {
    position: absolute;
    left: 8px;
    right: 6px;
    bottom: 6px;
    font: 700 17px/1 var(--ast-font-display);
    letter-spacing: 0.01em;
    text-shadow:
      0 0 4px var(--ast-bg),
      0 0 2px var(--ast-bg);
    overflow-wrap: anywhere;
  }
  .card:focus-visible,
  .tile:focus-visible,
  .primary:focus-visible {
    outline: 2px solid var(--ast-focus);
    outline-offset: 2px;
  }
  @media (hover: hover) {
    .card:hover,
    .tile:hover {
      border-color: var(--ast-fg);
    }
  }
  .card:active,
  .tile:active {
    transform: translateY(1px);
  }
  /* The one main action: a plate of ink across the width. */
  .primary {
    min-height: 48px;
    border: 0;
    border-radius: var(--ast-radius);
    background: var(--ast-fg);
    color: var(--ast-bg);
    font: 600 var(--ast-fs-s)/1 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .tile {
    position: relative;
    display: block;
    height: 96px;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: var(--ast-bg);
    color: var(--ast-fg);
    text-align: left;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .tile-art {
    position: absolute;
    inset: 0;
  }
  .tile-art.vignette {
    inset: 4px 6px auto auto;
    width: 64px;
    height: 64px;
  }
  /* The name on its own band under the drawing, never over its lines. */
  .tile-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: 6px 10px 7px;
    border-top: 1px solid var(--ast-hairline);
    background: var(--ast-bg);
    font: 700 17px/1 var(--ast-font-display);
  }
  .count {
    position: absolute;
    top: 6px;
    right: 6px;
    min-width: 14px;
    padding: 3px 4px 2px;
    border: 1px solid var(--ast-fg);
    background: var(--ast-bg);
    font: 600 var(--ast-fs-xs)/1 var(--ast-font-mono);
    text-align: center;
  }
  @media (prefers-reduced-motion: reduce) {
    .card:active,
    .tile:active {
      transform: none;
    }
  }
</style>
