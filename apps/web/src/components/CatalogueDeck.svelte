<script lang="ts" module>
  import type { DeckSky } from "../lib/deck-sky";

  /** What the deck hands each card it renders. */
  export interface DeckCardProps {
    /** The deck's shared sky (lib/deck-sky). */
    sky: DeckSky;
    /** The card the deck rests on: its title names the dialog. */
    current: boolean;
    /** Illustrated figures shown, the same on every card. */
    figures: boolean;
    onfigures: () => void;
    /** HIP of the star to show at once (the card the deck opened on). */
    star: number | null;
  }
</script>

<script lang="ts">
  // The catalogue as a deck of cards (#196, after #186). Each constellation of the list is a card;
  // the cards sit side by side in a horizontal scroller with CSS scroll-snap, the neighbours
  // peeking at the sides: the browser's own scrolling follows the finger, keeps its momentum and
  // snaps, so a flick goes to the next card and a fling goes through several. Each card scrolls
  // vertically inside its frame; a tap on its sky picks a star. Only the cards around the centred
  // one are in the page (DECK_RADIUS); one sky map draws them all (lib/deck-sky): live on the card
  // the deck rests on, still pictures on the others, prepared when idle. Once the deck rests on a
  // new card, it is marked consulted (onturn) and announced. ← and →, the neighbours' names below
  // and the edges of the screen (left to Android's back gesture) go one card at a time.
  import { onDestroy, onMount, tick, untrack, type Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import type { CatalogStar, FigureLevel, SkyTheme } from "@asteria/sky-renderer";
  import type { CatalogueEntry } from "../lib/catalogue";
  import {
    arrowDirection,
    cardAt,
    deckWindow,
    stillOrder,
    type Direction,
  } from "../lib/catalogue-nav";
  import { DeckSky as Sky } from "../lib/deck-sky";

  let {
    sequence,
    abbr,
    initialStar = null,
    onturn,
    onback,
    onclose,
    stars,
    lines,
    names,
    theme,
    figureSet,
    level,
    date,
    card,
  }: {
    /** The cards in order (lib/catalogue-nav pageSequence), fixed while the deck is open. */
    sequence: readonly CatalogueEntry[];
    /** The card the deck opens on. */
    abbr: string;
    initialStar?: number | null;
    /** The deck rests on another card (marked consulted by the host). */
    onturn: (abbr: string) => void;
    onback: () => void;
    onclose: () => void;
    stars: CatalogStar[];
    lines: Record<string, number[][]>;
    names: Readonly<Record<string, string>>;
    theme: SkyTheme;
    figureSet: string;
    level: FigureLevel;
    date: Date;
    /** A card: the host's constellation page. */
    card: Snippet<[CatalogueEntry, DeckCardProps]>;
  } = $props();

  const count = $derived(sequence.length);
  const start = untrack(() =>
    Math.max(
      0,
      sequence.findIndex((e) => e.abbr === abbr),
    ),
  );
  const startAbbr = untrack(() => abbr);
  /** The card nearest the middle, followed while the cards move. */
  let centre = $state(start);
  /** The card the deck rests on: live sky, consulted, announced. */
  let settled = $state(start);
  const shown = $derived(deckWindow(centre, count));
  const previous = $derived(sequence[centre - 1] ?? null);
  const next = $derived(sequence[centre + 1] ?? null);
  let figures = $state(untrack(() => level === "discovery"));
  /** Said by screen readers once the deck rests on a new card. */
  let arrived = $state("");

  const sky = untrack(() => new Sky({ stars, lines, names, theme, figureSet, level, date }));
  onDestroy(() => sky.dispose());

  let track: HTMLDivElement;
  /** Distance between two cards (CSS px): a card's width and the gap. */
  let pitch = 1;
  /** The card a key or a button is taking the deck to. */
  let target: number | null = null;
  /** The cards are moving: the still pictures wait. */
  let moving = false;
  let frame = 0;
  let fallback: ReturnType<typeof setTimeout> | undefined;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  function measure() {
    const [a, b] = track.children as unknown as HTMLElement[];
    if (!a) return;
    // Fractional (a card may be 330.5 px wide): rounded offsets would drift over 88 cards.
    const first = a.getBoundingClientRect();
    pitch = b ? b.getBoundingClientRect().left - first.left : first.width;
  }

  function onscroll() {
    moving = true;
    cancelStills();
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        centre = cardAt(track.scrollLeft, pitch, count);
      });
    // Without scrollend (older Safari): the deck rests once the scroll events stop.
    if (!("onscrollend" in window)) {
      clearTimeout(fallback);
      fallback = setTimeout(settle, 160);
    }
  }

  /** The cards stopped: the one in the middle becomes the deck's card. */
  function settle() {
    const i = cardAt(track.scrollLeft, pitch, count);
    centre = i;
    // Between two cards: a finger resting on the screen, the deck has not settled.
    if (Math.abs(track.scrollLeft - i * pitch) > 2) return;
    moving = false;
    target = null;
    if (i !== settled) {
      settled = i;
      const e = sequence[i]!;
      onturn(e.abbr);
      // Said once the card is in place: a live region filled as it appears is not always read.
      setTimeout(() => {
        arrived = $_("catalogue.turn.arrived", {
          values: { name: e.name, index: i + 1, count },
        });
      }, 150);
    }
    void tick().then(() => {
      // Focus left on a card now out of the middle (inert): the new card takes it.
      const focus = document.activeElement;
      if (!focus || focus === document.body || focus.closest("[inert]"))
        track.querySelector<HTMLElement>(".slot.current .sheet")?.focus({ preventScroll: true });
      const e = sequence[settled];
      if (e) sky.setLive(e.abbr);
      scheduleStills();
    });
  }

  // --- Still pictures of the neighbours, one per idle moment, nearest first.
  let job: { cancel: () => void } | null = null;
  const fontsReady: Promise<unknown> =
    typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();

  function idle(fn: () => void, delay = 0): { cancel: () => void } {
    if (!delay && typeof requestIdleCallback === "function") {
      const id = requestIdleCallback(fn, { timeout: 250 });
      return { cancel: () => cancelIdleCallback(id) };
    }
    const id = setTimeout(fn, delay || 40);
    return { cancel: () => clearTimeout(id) };
  }

  function cancelStills() {
    job?.cancel();
    job = null;
  }

  function scheduleStills() {
    cancelStills();
    const queue = stillOrder(settled, count).map((i) => sequence[i]!.abbr);
    let retries = 0;
    const step = () => {
      job = null;
      if (moving) return;
      const abbr = queue.shift();
      if (!abbr) return;
      const done = sky.prepare(abbr);
      if (done === "later" && retries++ < 20) {
        queue.unshift(abbr);
        job = idle(step, 300); // the figures are loading: their picture waits
      } else job = idle(step);
    };
    void fontsReady.then(() => {
      if (!moving && !job) job = idle(step);
    });
  }

  /** One card to the side (keys, the names below, the edges). */
  function go(dir: Direction) {
    const from = target ?? centre;
    const to = Math.min(count - 1, Math.max(0, from + (dir === "next" ? 1 : -1)));
    if (to === from) return;
    target = to;
    track.scrollTo({ left: to * pitch, behavior: reducedMotion() ? "instant" : "smooth" });
  }

  /** A click on a card at the side (inert: the click reaches the deck) brings it to the middle. */
  function onclick(e: MouseEvent) {
    const card = track.querySelector(".slot.current")?.getBoundingClientRect();
    if (!card || (e.clientX >= card.left && e.clientX <= card.right)) return;
    go(e.clientX < card.left ? "previous" : "next");
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const dir = arrowDirection(e);
    if (!dir) return;
    e.preventDefault(); // the focused card would scroll sideways by itself
    go(dir);
  }

  function toggleFigures() {
    figures = !figures;
    void tick().then(scheduleStills);
  }

  $effect(() => {
    sky.setTheme(theme);
    untrack(() => scheduleStills());
  });

  onMount(() => {
    // Focus in the card (Escape and Tab stay in the dialog), with no ring on a button.
    track.querySelector<HTMLElement>(".slot.current .sheet")?.focus({ preventScroll: true });
    measure();
    track.scrollLeft = start * pitch;
    track.addEventListener("scrollend", settle);
    const resize = new ResizeObserver(() => {
      measure();
      track.scrollLeft = settled * pitch;
      scheduleStills();
    });
    resize.observe(track);
    void tick().then(() => {
      const e = sequence[settled];
      if (e) sky.setLive(e.abbr);
      scheduleStills();
    });
    return () => {
      resize.disconnect();
      track.removeEventListener("scrollend", settle);
      cancelAnimationFrame(frame);
      clearTimeout(fallback);
      cancelStills();
    };
  });
</script>

<svelte:window {onkeydown} />

<div class="deck">
  <header class="bar">
    <button
      class="icon"
      onclick={onback}
      aria-label={$_("catalogue.back")}
      title={$_("catalogue.back")}>←</button
    >
    <p class="bar-title">{$_("catalogue.title")}</p>
    <button
      class="icon"
      onclick={onclose}
      aria-label={$_("catalogue.close")}
      title={$_("catalogue.close")}>×</button
    >
  </header>

  <div class="table">
    <!-- A click on a neighbour is a shortcut; ← → and the names below do it from the keyboard. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
    <div
      class="track"
      class:single={count < 2}
      bind:this={track}
      {onscroll}
      {onclick}
      role="group"
      aria-roledescription={$_("catalogue.deck.role")}
      aria-label={$_("catalogue.deck.label")}
    >
      {#each sequence as entry, i (entry.abbr)}
        <div
          class="slot"
          class:current={i === centre}
          inert={i !== centre}
          role="group"
          aria-roledescription={$_("catalogue.deck.card")}
          aria-label={$_("catalogue.turn.arrived", {
            values: { name: entry.name, index: i + 1, count },
          })}
        >
          <div class="sheet" tabindex="-1">
            {#if i >= shown.from && i <= shown.to}
              {@render card(entry, {
                sky,
                current: i === settled,
                figures,
                onfigures: toggleFigures,
                star: entry.abbr === startAbbr ? initialStar : null,
              })}
            {/if}
          </div>
        </div>
      {/each}
    </div>
    {#if count > 1}
      <!-- The sides of the screen: Android's back gesture starts there, so the cards do not
         move from them; a tap goes to the card peeking there. -->
      <button class="edge previous" tabindex="-1" aria-hidden="true" onclick={() => go("previous")}
      ></button>
      <button class="edge next" tabindex="-1" aria-hidden="true" onclick={() => go("next")}
      ></button>
    {/if}
  </div>

  {#if count > 1}
    <nav class="turn" aria-label={$_("catalogue.turn.label")}>
      {#if previous}
        {@const n = previous}
        <button
          class="to previous"
          onclick={() => go("previous")}
          aria-label={$_("catalogue.turn.previous", { values: { name: n.name } })}
          title={$_("catalogue.turn.previous.hint", { values: { name: n.name } })}
          ><span class="chev" aria-hidden="true">‹</span><span class="t-name">{n.name}</span
          ></button
        >
      {:else}
        <span class="to"></span>
      {/if}
      <span
        class="pos"
        aria-label={$_("catalogue.turn.position.label", {
          values: { index: centre + 1, count },
        })}
        >{$_("catalogue.turn.position", {
          values: { index: centre + 1, count },
        })}</span
      >
      {#if next}
        {@const n = next}
        <button
          class="to next"
          onclick={() => go("next")}
          aria-label={$_("catalogue.turn.next", { values: { name: n.name } })}
          title={$_("catalogue.turn.next.hint", { values: { name: n.name } })}
          ><span class="t-name">{n.name}</span><span class="chev" aria-hidden="true">›</span
          ></button
        >
      {:else}
        <span class="to"></span>
      {/if}
    </nav>
  {/if}
  <p class="sr-only" role="status">{arrived}</p>
</div>

<style>
  .deck {
    /* Room on each side of a card: the gap and the neighbour peeking (CSS px). */
    --gap: 10px;
    --peek: 12px;
    --side: max(calc(var(--gap) + var(--peek)), calc((100% - 560px) / 2));
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    /* The table the cards lie on: a shade deeper than a card. */
    background: var(--ast-night-deep);
  }
  .bar {
    flex: none;
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    align-items: center;
    padding: max(6px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) 0
      max(10px, env(safe-area-inset-left));
  }
  .bar-title {
    margin: 0;
    text-align: center;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
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
  .icon {
    width: 44px;
    height: 44px;
    font: 400 22px/1 var(--ast-font-mono);
  }
  .icon:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -6px;
  }

  .table {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
  }
  /* The cards side by side; the browser scrolls, keeps the momentum and snaps. */
  .track {
    position: relative;
    isolation: isolate; /* the cards' thickness is drawn over the table, under the cards */
    flex: 1;
    min-width: 0;
    display: flex;
    gap: var(--gap);
    padding: 8px var(--side) 18px;
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x mandatory;
    /* A sideways overscroll is not the browser's « back ». */
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    outline: none;
  }
  .track::-webkit-scrollbar {
    display: none;
  }
  .track.single {
    overflow-x: hidden;
  }
  /* A card: a sheet of night with an inked edge, its thickness a 1-bit stipple below and right. */
  .slot {
    position: relative;
    flex: 0 0 100%;
    min-width: 0;
    display: flex;
    scroll-snap-align: center;
    background: var(--ast-bg);
    border: 1px solid color-mix(in srgb, var(--ast-fg) 55%, transparent);
  }
  .slot::after {
    content: "";
    position: absolute;
    top: 5px;
    left: 5px;
    right: -6px;
    bottom: -6px;
    z-index: -1;
    background: conic-gradient(
        var(--ast-fg) 0 25%,
        transparent 0 50%,
        var(--ast-fg) 0 75%,
        transparent 0
      )
      0 0 / 2px 2px;
    opacity: 0.4;
    pointer-events: none;
  }
  .sheet {
    flex: 1;
    min-width: 0;
    overflow-x: hidden;
    overflow-y: auto;
    /* The card's own scroll does not spill onto the screen; sideways goes to the deck. */
    overscroll-behavior-y: contain;
    outline: none;
  }

  .edge {
    position: absolute;
    z-index: 1;
    top: 0;
    bottom: 0;
    width: var(--side);
    max-width: 28px;
    padding: 0;
    /* No sideways scroll from here: the system's back gesture keeps the edge. */
    touch-action: pan-y;
  }
  .edge.previous {
    left: 0;
  }
  .edge.next {
    right: 0;
  }

  /* Below the deck: the neighbours, discreet, one tap away. */
  .turn {
    flex: none;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    box-sizing: border-box;
    padding: 0 max(4px, env(safe-area-inset-right)) env(safe-area-inset-bottom)
      max(4px, env(safe-area-inset-left));
  }
  .to {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 44px;
    padding: 0 12px;
    /* Room above the capitals: É and È are not cut by the ellipsis' clipping. */
    font: 500 10px/1.5 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .to.next {
    justify-content: flex-end;
  }
  .to:active,
  .to:hover {
    color: var(--ast-fg);
  }
  .to:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .t-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .to .chev {
    flex: none;
    font: 400 16px/1 var(--ast-font-mono);
  }
  .pos {
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    color: var(--ast-fg-muted);
  }
</style>
