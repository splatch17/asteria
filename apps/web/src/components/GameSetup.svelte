<script lang="ts">
  // Settings of a game before playing (#187), a sheet rising over the Apprendre screen from the
  // game's card: the mode (Entraînement, Série, Chrono: three tiles with a small 1-bit picto and
  // the record of each at the player's level) and which part of the sky is asked (« Visibles de
  // chez moi », « Ce soir », « Toutes », with how many items each gives). The choice is
  // remembered per game (GamesScreen). « Pourquoi ? » next to « Visibles de chez moi » appears
  // only when `onexplain` is given: the spot kept for the latitude explorer (#188).
  import { onMount } from "svelte";
  import { _, locale } from "@asteria/ui";
  import type { FigureLevel } from "@asteria/sky-renderer";
  import { TIMED_MS } from "../lib/games/challenge";
  import { GAME_MODES, type GameMode, type ItemKind } from "../lib/games/progress";
  import {
    MIN_SCOPE_ITEMS,
    SKY_SCOPES,
    type GameSettings,
    type SkyScope,
  } from "../lib/games/settings";
  import { HOME_MIN_ALTITUDE } from "../lib/games/visibility";
  import Icon from "./Icon.svelte";
  import Vignette from "./Vignette.svelte";

  let {
    game,
    title,
    items,
    length,
    points = false,
    level,
    settings,
    counts,
    records,
    located,
    placeName,
    latitude,
    onexplain,
    onlocate,
    locating = "idle",
    onplay,
    onclose,
  }: {
    /** The game's id (vignette, element ids). */
    game: string;
    title: string;
    /** What the game asks about: constellations or stars (the counts' unit). */
    items: ItemKind;
    /** Rounds of a training series. */
    length: number;
    /** Scored in points (« Où est-elle ? »). */
    points?: boolean;
    level: FigureLevel;
    settings: GameSettings;
    counts: Record<SkyScope, number>;
    /** Best score of each mode at this level (0: never played). */
    records: Record<GameMode, number>;
    /** The player's own place is known (else the app's default place is used). */
    located: boolean;
    placeName: string;
    latitude: number;
    /** « Pourquoi ? »: opens the latitude explorer (#188), when there is one. */
    onexplain?: (() => void) | undefined;
    /** Asks the phone for the player's place (#198), where the app can (the map's « Ma position »). */
    onlocate?: (() => void) | undefined;
    locating?: "idle" | "busy" | "error";
    onplay: (settings: GameSettings) => void;
    onclose: () => void;
  } = $props();

  // A copy edited here; handed back on « Jouer » (and remembered by the caller).
  // svelte-ignore state_referenced_locally
  let mode = $state<GameMode>(settings.mode);
  // svelte-ignore state_referenced_locally
  let scope = $state<SkyScope>(settings.scope);
  const enabled = (s: SkyScope) => s === "all" || counts[s] >= MIN_SCOPE_ITEMS;
  // A remembered scope that gives too few today (tonight in a short summer night): « Toutes ».
  $effect.pre(() => {
    if (!enabled(scope)) scope = "all";
  });

  const fmt = $derived(new Intl.NumberFormat($locale ?? "fr"));
  const latText = $derived(
    $_("games.lat", {
      values: {
        lat: new Intl.NumberFormat($locale ?? "fr", { maximumFractionDigits: 1 }).format(
          Math.abs(latitude),
        ),
        hemi: $_(latitude >= 0 ? "games.lat.north" : "games.lat.south"),
      },
    }),
  );
  function recordText(m: GameMode): string {
    const best = records[m];
    if (best <= 0) return $_("games.setup.noRecord");
    if (m === "training" && !points)
      return $_("games.setup.recordOf", { values: { score: best, total: length } });
    return $_("games.setup.record", { values: { score: fmt.format(best) } });
  }
  const explain = $derived(
    mode === "timed" && points
      ? $_("games.mode.timed.explainPoints")
      : $_(`games.mode.${mode}.explain`, { values: { count: length } }),
  );

  // The sheet itself takes the focus (no ring on a button the player has not reached yet).
  let sheet: HTMLDivElement;
  onMount(() => sheet.focus());

  /** Arrow keys move within a radio group, as native radios do. */
  function arrows<T>(
    list: readonly T[],
    current: T,
    set: (v: T) => void,
    ok: (v: T) => boolean = () => true,
  ) {
    return (e: KeyboardEvent) => {
      const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
      const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
      if (!forward && !back) return;
      e.preventDefault();
      const step = forward ? 1 : -1;
      let i = list.indexOf(current);
      for (let k = 0; k < list.length; k++) {
        i = (i + step + list.length) % list.length;
        if (ok(list[i]!)) break;
      }
      set(list[i]!);
      const radios = (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[role=radio]");
      radios[i]?.focus();
    };
  }
</script>

<!-- A tap beside the sheet closes it (Escape and × too). -->
<div class="backdrop" aria-hidden="true" onclick={onclose}></div>
<div class="sheet" role="group" aria-labelledby={`setup-${game}`} tabindex="-1" bind:this={sheet}>
  <header class="top">
    <div class="art"><Vignette id={game} /></div>
    <h2 id={`setup-${game}`}>{title}</h2>
    <button
      class="close"
      onclick={onclose}
      aria-label={$_("games.setup.close")}
      title={$_("games.setup.close")}>×</button
    >
  </header>

  <p class="label" id={`setup-${game}-mode`}>{$_("games.setup.mode")}</p>
  <div
    class="modes"
    role="radiogroup"
    aria-labelledby={`setup-${game}-mode`}
    tabindex="-1"
    onkeydown={arrows(GAME_MODES, mode, (m) => (mode = m))}
  >
    {#each GAME_MODES as m (m)}
      <button
        class="mode"
        role="radio"
        aria-checked={mode === m}
        tabindex={mode === m ? 0 : -1}
        onclick={() => (mode = m)}
      >
        <svg class="picto" viewBox="0 0 28 16" aria-hidden="true" shape-rendering="crispEdges">
          {#if m === "training"}
            {#each { length: 10 }, i (i)}
              <rect
                x={0.5 + (i % 5) * 5.5}
                y={i < 5 ? 2.5 : 9}
                width="4"
                height="4"
                class:fill={i < 6}
              />
            {/each}
          {:else if m === "streak"}
            {#each { length: 5 }, i (i)}
              <rect
                x={0.5 + i * 5.5}
                y={12.5 - i * 2.5}
                width="4"
                height={3 + i * 2.5}
                class:fill={i < 4}
              />
            {/each}
          {:else}
            <circle cx="14" cy="8" r="6.5" />
            <path class="fill" d="M14 8 V1.5 A6.5 6.5 0 1 1 7.5 8 Z" />
            <rect class="fill" x="12.5" y="0" width="3" height="1" />
          {/if}
        </svg>
        <span class="m-name">{$_(`games.mode.${m}.label`)}</span>
        <span class="m-detail"
          >{m === "training"
            ? $_("games.mode.training.detail", { values: { count: length } })
            : m === "timed"
              ? $_("games.mode.timed.detail", { values: { s: TIMED_MS / 1000 } })
              : $_("games.mode.streak.detail")}</span
        >
        <span class="m-record">{recordText(m)}</span>
      </button>
    {/each}
  </div>
  <p class="explain">{explain}</p>

  <p class="label" id={`setup-${game}-sky`}>{$_("games.setup.sky")}</p>
  <div
    class="scopes"
    role="radiogroup"
    aria-labelledby={`setup-${game}-sky`}
    tabindex="-1"
    onkeydown={arrows(SKY_SCOPES, scope, (s) => (scope = s), enabled)}
  >
    {#each SKY_SCOPES as s (s)}
      {@const ok = enabled(s)}
      <div class="scope-row" class:off={!ok}>
        <button
          class="scope"
          role="radio"
          aria-checked={scope === s}
          aria-disabled={!ok}
          tabindex={scope === s ? 0 : -1}
          aria-describedby={`setup-${game}-${s}-hint`}
          onclick={() => ok && (scope = s)}
        >
          <span class="dot" aria-hidden="true"></span>
          <span class="s-text">
            <span class="s-name">{$_(`games.scope.${s}.label`)}</span>
            <span class="s-hint" id={`setup-${game}-${s}-hint`}
              >{#if !ok}{$_("games.scope.few")}{:else if s === "home"}{located
                  ? $_("games.scope.home.hint", {
                      values: { place: placeName, lat: latText, alt: HOME_MIN_ALTITUDE },
                    })
                  : $_("games.scope.home.unknown")}{:else if s === "tonight"}{located
                  ? $_("games.scope.tonight.hint")
                  : $_("games.scope.tonight.unknown")}{:else}{$_(`games.scope.all.hint`, {
                  values: { level: $_(`level.${level}`) },
                })}{/if}</span
            >
          </span>
          <span class="count">
            <span class="n">{counts[s]}</span>
            <span class="unit"
              >{$_(`games.scope.unit.${items}`, { values: { count: counts[s] } })}</span
            >
          </span>
        </button>
        {#if s === "home" && onexplain}
          <!-- #188 plugs the latitude explorer in here. -->
          <button class="why" onclick={onexplain}>{$_("games.scope.why")}</button>
        {/if}
      </div>
    {/each}
  </div>
  {#if !located}
    <!-- The player's sky needs their place (#198): ask for it here, not on the map. -->
    <p class="note">{$_(onlocate ? "games.setup.unknownPlace.ask" : "games.setup.unknownPlace")}</p>
    {#if onlocate}
      <button class="locate" onclick={onlocate} disabled={locating === "busy"}>
        <Icon name="locate" size={14} /><span
          >{locating === "busy" ? $_("place.locating") : $_("place.locate")}</span
        >
      </button>
      {#if locating === "error"}<p class="note" role="status">
          {$_("games.setup.locateError")}
        </p>{/if}
    {/if}
  {/if}

  <button class="play" onclick={() => onplay({ mode, scope: enabled(scope) ? scope : "all" })}>
    <Icon name="play" size={12} /><span>{$_("games.play")}</span>
  </button>
</div>

<style>
  .backdrop {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: color-mix(in srgb, var(--ast-bg) 72%, transparent);
    animation: fade 160ms var(--ast-ease-out);
  }
  .sheet {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 2;
    width: 100%;
    max-width: 640px;
    max-height: calc(100% - 24px);
    margin: 0 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 14px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    background: var(--ast-bg);
    border-top: 1px solid var(--ast-fg-muted);
    box-shadow: 0 -24px 48px color-mix(in srgb, var(--ast-bg) 80%, transparent);
    animation: up 240ms var(--ast-ease-out);
    outline: none;
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @keyframes up {
    from {
      transform: translateY(40px);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .backdrop,
    .sheet {
      animation: none;
    }
  }
  button {
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .top {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .art {
    flex: none;
    width: 52px;
    height: 52px;
    box-shadow: inset 0 0 0 1px var(--ast-hairline);
  }
  h2 {
    flex: 1;
    min-width: 0;
    margin: 0;
    font: 700 24px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-wrap: balance;
  }
  .close {
    flex: none;
    align-self: flex-start;
    width: 44px;
    height: 44px;
    margin: -8px -10px 0 0;
    font: 400 24px/1 var(--ast-font-mono);
  }
  .close:focus-visible {
    outline-offset: -6px;
  }
  /* Group titles: spaced capitals ruled to the edge, as on the Apprendre screen. */
  .label {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 8px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .label::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--ast-hairline);
  }
  .modes,
  .scopes {
    outline: none;
  }

  /* Modes: three tiles in one segmented block; the chosen one inverted. */
  .modes {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    border: 1px solid var(--ast-control-border);
  }
  .mode {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    min-width: 0;
    padding: 10px 8px 9px;
    text-align: left;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .mode + .mode {
    border-left: 1px solid var(--ast-hairline);
  }
  .picto {
    width: 28px;
    height: 16px;
    margin-bottom: 3px;
    overflow: visible;
  }
  .picto rect,
  .picto circle {
    fill: none;
    stroke: currentColor;
    stroke-width: 1;
  }
  .picto .fill,
  .picto rect.fill {
    fill: currentColor;
    stroke: none;
  }
  .picto rect.fill {
    stroke: currentColor;
  }
  .m-name {
    font: 700 17px/1 var(--ast-font-display);
    letter-spacing: 0.03em;
  }
  .m-detail {
    min-height: 2.5em;
    font: 400 9px/1.25 var(--ast-font-mono);
    letter-spacing: 0.02em;
    text-transform: none;
    color: var(--ast-fg-muted);
  }
  .m-record {
    font: 500 8px/1.2 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    color: var(--ast-fg-muted);
  }
  .mode[aria-checked="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .mode[aria-checked="true"] .m-detail,
  .mode[aria-checked="true"] .m-record {
    color: color-mix(in srgb, var(--ast-bg) 72%, var(--ast-fg));
  }
  .mode:focus-visible {
    outline-offset: -4px;
  }
  .mode[aria-checked="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  .explain {
    margin: 8px 0 0;
    min-height: 1.45em;
    font: 400 11px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }

  /* Sky: one row per scope, a square that fills when chosen, the count on the right. */
  .scope-row {
    display: flex;
    align-items: stretch;
    border-top: 1px solid var(--ast-hairline);
  }
  .scope-row:last-child {
    border-bottom: 1px solid var(--ast-hairline);
  }
  .scope {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 54px;
    padding: 8px 2px;
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
  }
  .dot {
    flex: none;
    position: relative;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 1px solid var(--ast-fg-muted);
  }
  .scope[aria-checked="true"] .dot {
    border-color: var(--ast-fg);
  }
  .scope[aria-checked="true"] .dot::after {
    content: "";
    position: absolute;
    inset: 2px;
    background: var(--ast-fg);
    animation: fill 140ms var(--ast-ease-out);
  }
  @keyframes fill {
    from {
      transform: scale(0.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .scope[aria-checked="true"] .dot::after {
      animation: none;
    }
    .mode {
      transition: none;
    }
  }
  .s-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .s-name {
    font: 500 14px/1.2 var(--ast-font-mono);
  }
  .s-hint {
    font: 400 10px/1.35 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .count {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    min-width: 44px;
  }
  .n {
    font: 700 24px/1 var(--ast-font-display);
    font-variant-numeric: tabular-nums;
  }
  .unit {
    font: 500 8px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .scope[aria-checked="false"] .n {
    color: var(--ast-fg-muted);
  }
  .off .scope {
    cursor: default;
  }
  .off .s-name,
  .off .n {
    color: var(--ast-fg-muted);
    opacity: 0.6;
  }
  .off .dot {
    border-color: var(--ast-hairline);
  }
  .why {
    flex: none;
    align-self: center;
    min-height: 44px;
    padding: 0 0 0 10px;
    font-size: 9px;
    color: var(--ast-fg-muted);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .locate {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    margin-top: 8px;
    border: 1px solid var(--ast-control-border);
    color: var(--ast-fg);
  }
  .locate:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .note {
    margin: 8px 0 0;
    font: 400 10px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .play {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 52px;
    margin-top: 16px;
    font-size: 12px;
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .play:focus-visible {
    outline-offset: 3px;
  }
</style>
