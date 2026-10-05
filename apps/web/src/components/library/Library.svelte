<script lang="ts" module>
  import type { Observer } from "@asteria/astro-core";
  import type { CatalogStar } from "@asteria/sky-renderer";
  import type { GameEntry } from "../../games/registry";

  /** What the app hands to the library: data already loaded, and the displayed date and place. */
  export interface LibraryData {
    stars: readonly CatalogStar[];
    lines: Readonly<Record<string, number[][]>>;
    /** Localised constellation names, by IAU abbreviation (88). */
    names: Readonly<Record<string, string>>;
    latin: Readonly<Record<string, string>>;
    date: Date;
    observer: Observer;
    sun: { altitude: number };
    /** Null out of the ephemeris range (±3000 years, #78). */
    moon: { altitude: number } | null;
    planets: readonly { name: string; magnitude: number; altitude: number }[] | null;
  }

  type View =
    | { id: "home" }
    | { id: "catalog" }
    | { id: "stories" }
    | { id: "story"; abbr: string }
    | { id: "games" }
    | { id: "game"; game: GameEntry };
</script>

<script lang="ts">
  // Library (#90): full-screen hub opened from the map — catalogues, stories and anecdotes, games,
  // and the 3D exploration mode. Its pages stack like a book's: the back button (Android, browser)
  // and Escape go back one page, then close. Revealed through an iris that opens from the button
  // that opened it, over a drifting starfield (#91).
  import { onMount } from "svelte";
  import { cubicOut, cubicIn } from "svelte/easing";
  import { _ } from "@asteria/ui";
  import { storyIds } from "@asteria/content";
  import { GAMES } from "../../games/registry";
  import type { LibraryTarget } from "../../lib/library";
  import Icon from "../Icon.svelte";
  import Starfield from "./Starfield.svelte";
  import CatalogView from "./CatalogView.svelte";
  import StoriesView from "./StoriesView.svelte";
  import StoryView from "./StoryView.svelte";
  import GamesView from "./GamesView.svelte";

  let {
    data,
    origin = null,
    onclose,
    onshow,
    onExplore,
  }: {
    data: LibraryData;
    /** Screen point the reveal opens from (the library button's centre). */
    origin?: { x: number; y: number } | null;
    onclose: () => void;
    /** Shows an object on the map (the library is closed first). */
    onshow: (target: LibraryTarget) => void;
    /** Opens the 3D exploration mode; absent: shown as "coming soon". */
    onExplore?: (() => void) | undefined;
  } = $props();

  let stack = $state<View[]>([{ id: "home" }]);
  const view = $derived(stack[stack.length - 1]!);
  let dialog: HTMLElement;
  let scroller = $state<HTMLElement>();
  let scroll = $state(0);
  let focusTarget = $state<HTMLElement>();
  const stories = storyIds("fr");
  const namedStars = $derived(data.stars.filter((s) => s.name).length);
  const pad = (i: number) => String(i).padStart(2, "0");
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const HISTORY_KEY = "asteriaLibrary";

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    // One history entry per page: the phone's back button goes back a page, then closes.
    history.pushState({ [HISTORY_KEY]: 1 }, "");
    addEventListener("popstate", onpop);
    focusTarget?.focus();
    return () => {
      removeEventListener("popstate", onpop);
      previous?.focus?.();
    };
  });

  function onpop(e: PopStateEvent) {
    const depth = Number((e.state as Record<string, unknown> | null)?.[HISTORY_KEY] ?? 0);
    if (depth < 1) {
      removeEventListener("popstate", onpop);
      onclose();
    } else if (depth < stack.length) {
      stack = stack.slice(0, depth);
      afterNavigate();
    }
  }

  function open(next: View) {
    stack = [...stack, next];
    history.pushState({ [HISTORY_KEY]: stack.length }, "");
    afterNavigate();
  }

  const back = () => history.back();

  /** Closes the library, dropping its history entries, then runs `then` (e.g. show on the map). */
  function close(then?: () => void) {
    removeEventListener("popstate", onpop);
    history.go(-stack.length);
    onclose();
    then?.();
  }

  function show(target: LibraryTarget) {
    close(() => onshow(target));
  }

  function afterNavigate() {
    scroll = 0;
    scroller?.scrollTo({ top: 0 });
    // The page title takes the focus, so that a screen reader announces the new page.
    queueMicrotask(() => dialog?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true }));
  }

  /** Escape goes back a page (closes from the first); Tab cycles inside the dialog. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the sheets below also close on Escape
      if (stack.length > 1) back();
      else close();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        "a[href], button:not(:disabled), input, summary, [tabindex='0']",
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }

  /** Iris reveal: a circle opening from the button, like a telescope's aperture (#91). */
  function iris(_node: Element, { closing = false } = {}) {
    const x = origin?.x ?? innerWidth - 40;
    const y = origin?.y ?? 40;
    const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    return {
      duration: reduced ? 0 : closing ? 260 : 460,
      easing: closing ? cubicIn : cubicOut,
      css: (t: number) => `clip-path: circle(${(t * r).toFixed(1)}px at ${x}px ${y}px)`,
    };
  }

  const title = $derived.by(() => {
    switch (view.id) {
      case "home":
        return $_("library.title");
      case "catalog":
        return $_("library.section.catalog");
      case "stories":
        return $_("library.section.stories");
      case "story":
        return data.names[view.abbr] ?? view.abbr;
      case "games":
        return $_("library.section.games");
      case "game":
        return $_(view.game.titleKey);
    }
    return "";
  });
  const sectionNumber = $derived(
    { home: 0, catalog: 1, stories: 2, story: 2, games: 3, game: 3 }[view.id],
  );

  interface Section {
    id: "catalog" | "stories" | "games" | "explore";
    icon: "catalog" | "story" | "games" | "explore";
    count: string;
    soon: boolean;
    go: () => void;
  }
  const sections = $derived<Section[]>([
    {
      id: "catalog",
      icon: "catalog",
      count: $_("library.section.catalog.count", {
        values: { cons: Object.keys(data.names).length, stars: namedStars },
      }),
      soon: false,
      go: () => open({ id: "catalog" }),
    },
    {
      id: "stories",
      icon: "story",
      count: $_("library.section.stories.count", { values: { count: stories.length } }),
      soon: false,
      go: () => open({ id: "stories" }),
    },
    {
      id: "games",
      icon: "games",
      count: $_("library.section.games.count", { values: { count: GAMES.length } }),
      soon: GAMES.length === 0,
      go: () => open({ id: "games" }),
    },
    {
      id: "explore",
      icon: "explore",
      count: "",
      soon: !onExplore,
      go: () => close(onExplore),
    },
  ]);
</script>

<div
  class="library"
  role="dialog"
  aria-modal="true"
  aria-labelledby="library-title"
  tabindex="-1"
  bind:this={dialog}
  {onkeydown}
  in:iris|global
  out:iris|global={{ closing: true }}
>
  <Starfield {scroll} />

  {#if view.id === "game"}
    {@const game = view.game}
    <div class="game">
      {#await game.load()}
        <p class="status" role="status">{$_("games.loading")}</p>
      {:then mod}
        <mod.default onExit={back} />
      {:catch}
        <div class="status" role="alert">
          <p>{$_("games.loadError")}</p>
          <button class="pill" onclick={back}><Icon name="back" />{$_("library.back")}</button>
        </div>
      {/await}
    </div>
  {:else}
    <header class="head">
      {#if stack.length > 1}
        <button
          class="round"
          onclick={back}
          aria-label={$_("library.back")}
          title={$_("library.back")}><Icon name="back" size={20} /></button
        >
      {/if}
      <div class="titles">
        <p class="meta" aria-hidden="true">#{pad(sectionNumber)} // {$_("library.kicker")}</p>
        {#key title}
          <h1 id="library-title" tabindex="-1">{title}</h1>
        {/key}
      </div>
      <button
        class="round close"
        bind:this={focusTarget}
        onclick={() => close()}
        aria-label={$_("library.close")}
        title={$_("library.close")}>×</button
      >
    </header>

    <div class="scroll" bind:this={scroller} onscroll={() => (scroll = scroller?.scrollTop ?? 0)}>
      <div class="page">
        {#if view.id === "home"}
          <!-- An engraved astrolabe ring turning slowly behind the cards. -->
          <svg class="astrolabe" viewBox="-100 -100 200 200" aria-hidden="true">
            <circle r="96" />
            <circle r="80" class="thin" />
            <circle r="52" class="thin dashed" />
            {#each Array.from({ length: 72 }, (_, i) => i) as i (i)}
              <line
                y1={-96}
                y2={i % 6 === 0 ? -86 : -91}
                transform={`rotate(${i * 5})`}
                class:major={i % 6 === 0}
              />
            {/each}
            <path d="M-80 0 H80 M0 -80 V80" class="thin dashed" />
          </svg>
          <ul class="cards">
            {#each sections as s, i (s.id)}
              <li style:--i={i}>
                <button
                  class="card"
                  class:soon={s.soon}
                  disabled={s.soon}
                  onclick={s.go}
                  aria-describedby={`lib-${s.id}-desc`}
                >
                  <span class="seal" aria-hidden="true"><Icon name={s.icon} size={26} /></span>
                  <span class="num" aria-hidden="true">#{pad(i + 1)}</span>
                  <span class="name">{$_(`library.section.${s.id}`)}</span>
                  <span class="desc" id={`lib-${s.id}-desc`}
                    >{$_(`library.section.${s.id}.desc`)}{#if s.soon}<span class="sr-only">
                        — {$_("library.soon")}</span
                      >{/if}</span
                  >
                  {#if s.count && !s.soon}<span class="count">{s.count}</span>{/if}
                  {#if s.soon}<span class="stamp" aria-hidden="true">{$_("library.soon")}</span
                    >{/if}
                </button>
              </li>
            {/each}
          </ul>
        {:else if view.id === "catalog"}
          <CatalogView {data} onshow={show} onstory={(abbr) => open({ id: "story", abbr })} />
        {:else if view.id === "stories"}
          <StoriesView
            names={data.names}
            latin={data.latin}
            onread={(abbr) => open({ id: "story", abbr })}
          />
        {:else if view.id === "story"}
          {#key view.abbr}
            <StoryView
              abbr={view.abbr}
              latin={data.latin[view.abbr] ?? view.abbr}
              onshow={() => show({ kind: "constellation", abbr: view.abbr })}
            />
          {/key}
        {:else if view.id === "games"}
          <GamesView onplay={(game) => open({ id: "game", game })} />
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .library {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background:
      radial-gradient(
        120% 60% at 50% 0%,
        color-mix(in srgb, var(--ast-fg) 7%, transparent),
        transparent 70%
      ),
      var(--ast-night-deep);
    color: var(--ast-fg);
    outline: none;
    overflow: hidden;
  }
  .head {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px
      max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
  }
  .head::after {
    /* Engraved rule: a hairline with a brighter centre, like a printer's ornament. */
    content: "";
    position: absolute;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    bottom: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      var(--ast-hairline) 15%,
      var(--ast-fg) 50%,
      var(--ast-hairline) 85%,
      transparent
    );
  }
  .titles {
    flex: 1;
    min-width: 0;
  }
  .meta {
    margin: 4px 0 4px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  h1 {
    margin: 0;
    font: 700 34px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    outline: none;
    text-shadow: 0 0 18px color-mix(in srgb, var(--ast-fg) 30%, transparent);
    animation: title-in var(--ast-dur-reveal) var(--ast-ease-out);
    overflow-wrap: anywhere;
  }
  @keyframes title-in {
    from {
      opacity: 0;
      letter-spacing: 0.14em;
      filter: blur(2px);
    }
  }
  .round {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
    background: color-mix(in srgb, var(--ast-bg) 60%, transparent);
    color: var(--ast-fg);
    font: 400 22px/1 var(--ast-font-mono);
    cursor: pointer;
  }
  .round:hover {
    box-shadow: var(--ast-glow);
  }
  .scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
  }
  .page {
    position: relative;
    width: 100%;
    max-width: 720px;
    margin: 0 auto;
    padding: 16px max(16px, env(safe-area-inset-right)) max(24px, env(safe-area-inset-bottom))
      max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
  }

  /* --- Home */
  .astrolabe {
    position: absolute;
    top: -40px;
    right: -90px;
    width: 300px;
    height: 300px;
    fill: none;
    stroke: var(--ast-fg);
    stroke-width: 0.6;
    opacity: 0.16;
    pointer-events: none;
    animation: turn 240s linear infinite;
  }
  .astrolabe .thin {
    stroke-width: 0.35;
  }
  .astrolabe .dashed {
    stroke-dasharray: 2 3;
  }
  .astrolabe line {
    stroke-width: 0.4;
  }
  .astrolabe line.major {
    stroke-width: 0.8;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
  .cards {
    position: relative;
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @media (min-width: 640px) {
    .cards {
      grid-template-columns: 1fr 1fr;
    }
  }
  .cards li {
    animation: card-in 420ms var(--ast-ease-settle) both;
    animation-delay: calc(140ms + var(--i) * 70ms);
  }
  @keyframes card-in {
    from {
      opacity: 0;
      transform: translate3d(0, 18px, 0);
    }
  }
  .card {
    position: relative;
    display: grid;
    grid-template-columns: 56px 1fr;
    grid-template-areas:
      "seal num"
      "seal name"
      "seal desc"
      "seal count";
    column-gap: 14px;
    align-items: start;
    width: 100%;
    height: 100%;
    min-height: 132px;
    padding: 16px 16px 16px 14px;
    box-sizing: border-box;
    text-align: left;
    color: var(--ast-fg);
    font: inherit;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    background:
      linear-gradient(160deg, color-mix(in srgb, var(--ast-fg) 8%, transparent), transparent 55%),
      color-mix(in srgb, var(--ast-bg) 72%, transparent);
    cursor: pointer;
    overflow: hidden;
  }
  /* Engraver's hatching, revealed when the card is touched. */
  .card::before {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--ast-hatch);
    opacity: 0;
    transition: opacity var(--ast-dur-fast) var(--ast-ease-out);
    pointer-events: none;
  }
  /* Corner brackets, as on the instrument panels; they reach out on hover. */
  .card::after {
    content: "";
    position: absolute;
    inset: -1px;
    pointer-events: none;
    --c: var(--ast-fg);
    background:
      linear-gradient(var(--c) 0 0) top left / var(--l) 1px,
      linear-gradient(var(--c) 0 0) top left / 1px var(--l),
      linear-gradient(var(--c) 0 0) top right / var(--l) 1px,
      linear-gradient(var(--c) 0 0) top right / 1px var(--l),
      linear-gradient(var(--c) 0 0) bottom left / var(--l) 1px,
      linear-gradient(var(--c) 0 0) bottom left / 1px var(--l),
      linear-gradient(var(--c) 0 0) bottom right / var(--l) 1px,
      linear-gradient(var(--c) 0 0) bottom right / 1px var(--l);
    background-repeat: no-repeat;
    transition: --l var(--ast-dur-fast) var(--ast-ease-out);
  }
  .card:not(:disabled):hover,
  .card:not(:disabled):focus-visible {
    box-shadow: var(--ast-glow-soft);
    border-color: color-mix(in srgb, var(--ast-fg) 40%, transparent);
  }
  .card:not(:disabled):hover::before,
  .card:not(:disabled):active::before {
    opacity: 1;
  }
  .card:not(:disabled):hover::after,
  .card:not(:disabled):focus-visible::after {
    --l: 14px;
  }
  .card:not(:disabled):active {
    transform: scale(0.98);
  }
  .seal {
    grid-area: seal;
    display: grid;
    place-items: center;
    width: 56px;
    height: 56px;
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
    background: radial-gradient(
      circle,
      color-mix(in srgb, var(--ast-fg) 12%, transparent),
      transparent 70%
    );
    box-shadow:
      inset 0 0 0 4px color-mix(in srgb, var(--ast-bg) 50%, transparent),
      inset 0 0 0 5px var(--ast-hairline);
  }
  .num {
    grid-area: num;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    color: var(--ast-fg-muted);
  }
  .name {
    grid-area: name;
    margin-top: 2px;
    font: 700 26px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .desc {
    grid-area: desc;
    margin-top: 6px;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .count {
    grid-area: count;
    margin-top: 10px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .card.soon {
    cursor: default;
    color: var(--ast-fg-muted);
    background: color-mix(in srgb, var(--ast-bg) 60%, transparent);
    border-style: dashed;
  }
  .card.soon .name {
    color: color-mix(in srgb, var(--ast-fg) 55%, transparent);
  }
  /* "Coming soon" as a rubber stamp, slightly askew. */
  .stamp {
    position: absolute;
    right: 12px;
    bottom: 12px;
    padding: 4px 8px;
    border: 1px solid currentColor;
    font: 700 11px/1 var(--ast-font-mono);
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--ast-fg);
    opacity: 0.75;
    transform: rotate(-7deg);
    mask:
      var(--ast-dither) 0 0 / 4px 4px exclude,
      linear-gradient(#000 0 0);
  }

  /* --- Game, full screen */
  .game {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: var(--ast-bg);
  }
  .status {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    height: 100%;
    margin: 0;
    font: 500 11px/1.5 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid var(--ast-hairline);
    background: transparent;
    color: var(--ast-fg);
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .astrolabe,
    .cards li,
    h1 {
      animation: none;
    }
  }
</style>
