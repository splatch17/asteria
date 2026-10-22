<script module lang="ts">
  import type { Direction as TurnDirection } from "../lib/catalogue-nav";
  /** The turn a page arrives from: set by the page leaving, played by the one mounting. */
  let entering: { dir: TurnDirection; name: string; index: number; count: number } | null = null;
</script>

<script lang="ts">
  // Turning the pages of the catalogue (#186): around a constellation's page, a horizontal swipe
  // goes to the previous or next constellation of the list (lib/catalogue-nav). The page follows
  // the finger, the neighbour's name shows in the gap it leaves, and on release the page turns or
  // springs back. A swipe is told from a scroll and a tap by its initial direction and length;
  // one starting on a side of the screen is left to the system's back gesture. With reduced
  // motion, the page stays still and turns at once. Below the page, the neighbours' names (small
  // chevrons) do the same in one tap, as ← and → on a keyboard.
  import { onMount, tick, type Snippet } from "svelte";
  import { _ } from "@asteria/ui";
  import type { CatalogueEntry } from "../lib/catalogue";
  import {
    DISTANCE,
    classifyGesture,
    arrowDirection,
    directionOf,
    dragOffset,
    inEdgeZone,
    neighbours,
    releaseVelocity,
    swipeOutcome,
    type Direction,
    type GestureKind,
    type Sample,
  } from "../lib/catalogue-nav";

  let {
    sequence,
    abbr,
    onturn,
    children,
  }: {
    /** The pages in order (pageSequence). */
    sequence: readonly CatalogueEntry[];
    /** The page shown. */
    abbr: string;
    /** Shows another page (and marks it consulted). */
    onturn: (abbr: string) => void;
    /** The page, keyed by constellation. */
    children: Snippet;
  } = $props();

  const around = $derived(neighbours(sequence, abbr));
  const has = $derived({ previous: around.previous !== null, next: around.next !== null });

  let sheet: HTMLDivElement;
  const peeks: Partial<Record<Direction, HTMLDivElement>> = {};
  /** Said by screen readers after a turn. */
  let arrived = $state("");
  /** A turn is under way: further swipes and keys wait for it. */
  let busy = false;

  const SIDES = ["previous", "next"] as const;
  const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- The swipe
  let gesture: {
    id: number;
    x0: number;
    y0: number;
    kind: GestureKind;
    samples: Sample[];
    offset: number;
  } | null = null;
  /** A click right after a swipe is the end of the swipe, not a tap on a star or a button. */
  let swallowUntil = 0;

  function onpointerdown(e: PointerEvent) {
    // A second finger (a pinch) ends the swipe.
    if (gesture && !e.isPrimary) return cancel();
    // The mouse selects text: on a desktop, the chevrons and the arrow keys turn the pages.
    if (busy || e.pointerType === "mouse" || !e.isPrimary || around.count < 2) return;
    if (inEdgeZone(e.clientX, window.innerWidth)) return;
    gesture = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      kind: "pending",
      samples: [{ x: e.clientX, t: e.timeStamp }],
      offset: 0,
    };
  }

  function onpointermove(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const dx = e.clientX - gesture.x0;
    if (gesture.kind === "pending") {
      gesture.kind = classifyGesture(dx, e.clientY - gesture.y0);
      if (gesture.kind === "vertical") return void (gesture = null); // the page scrolls
      if (gesture.kind === "pending") return;
      try {
        sheet.setPointerCapture(e.pointerId);
      } catch {
        // the pointer is already gone: its pointerup or pointercancel follows
      }
      sheet.classList.add("dragging");
    }
    gesture.samples.push({ x: e.clientX, t: e.timeStamp });
    if (gesture.samples.length > 12) gesture.samples.shift();
    gesture.offset = dragOffset(dx, has);
    paint(gesture.offset);
  }

  function onpointerup(e: PointerEvent) {
    if (!gesture || e.pointerId !== gesture.id) return;
    const g = gesture;
    gesture = null;
    if (g.kind !== "horizontal") return; // a tap: the click goes on
    swallowUntil = performance.now() + 400;
    const dx = e.clientX - g.x0;
    const dir = swipeOutcome(dx, releaseVelocity(g.samples), sheet.clientWidth, has);
    if (dir) void turn(dir, g.offset);
    else springBack(g.offset);
  }

  /** The browser took the gesture (a scroll, the system's back) or a second finger came. */
  function cancel() {
    const g = gesture;
    gesture = null;
    if (g?.kind === "horizontal") springBack(g.offset);
  }

  function onclickcapture(e: MouseEvent) {
    if (performance.now() < swallowUntil) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  /** The page at `offset` px, the neighbour's name showing as it nears the turning point. */
  function paint(offset: number) {
    const width = Math.max(1, sheet.clientWidth);
    const progress = Math.min(1, Math.abs(offset) / (DISTANCE * width));
    const dir = directionOf(offset);
    for (const d of SIDES) {
      const peek = peeks[d];
      if (!peek) continue;
      peek.style.opacity = d === dir && offset !== 0 ? String(progress) : "0";
      peek.classList.toggle("ready", d === dir && progress >= 1);
    }
    if (!reducedMotion()) sheet.style.transform = offset ? `translateX(${offset}px)` : "";
  }

  function clear() {
    sheet.classList.remove("dragging");
    sheet.style.transform = "";
    for (const p of Object.values(peeks)) {
      p.style.opacity = "0";
      p.classList.remove("ready");
    }
  }

  /** Too short: the page returns, with a small overshoot. */
  function springBack(offset: number) {
    clear();
    if (offset === 0 || reducedMotion()) return;
    sheet.animate([{ transform: `translateX(${offset}px)` }, { transform: "translateX(0)" }], {
      duration: 320,
      easing: "cubic-bezier(0.3, 1.35, 0.5, 1)",
    });
  }

  /** Goes to the page before or after: this page slides out, the new one slides in. */
  async function turn(dir: Direction, from = 0) {
    const target = around[dir];
    if (!target || busy) return;
    busy = true;
    const sign = dir === "next" ? -1 : 1;
    try {
      if (!reducedMotion()) {
        const width = sheet.clientWidth;
        // From a swipe, the page leaves the screen; from a key or a tap, a short slide and a fade.
        const to = from ? sign * width : sign * width * 0.25;
        const duration = from
          ? Math.min(220, Math.max(120, (Math.abs(to - from) / width) * 260))
          : 130;
        sheet.style.transform = `translateX(${to}px)`;
        await sheet
          .animate(
            [
              { transform: `translateX(${from}px)`, opacity: 1 },
              { transform: `translateX(${to}px)`, opacity: from ? 1 : 0 },
            ],
            { duration, easing: "cubic-bezier(0.4, 0, 1, 1)" },
          )
          .finished.catch(() => {});
        sheet.style.opacity = "0";
      }
      const there = neighbours(sequence, target.abbr);
      entering = { dir, name: target.name, index: there.index, count: there.count };
      onturn(target.abbr);
      await tick();
      // The host keyed its page by constellation: the new page took the entrance on mounting.
      // Otherwise this page shows the new constellation and plays it.
      if (alive && entering) {
        clear();
        sheet.style.opacity = "";
        await enter();
      }
    } finally {
      if (alive) {
        clear();
        sheet.style.opacity = "";
        busy = false;
      }
    }
  }

  /** A page arriving from a turn: it slides in from the side the finger went to. */
  async function enter() {
    const e = entering;
    entering = null;
    if (!e) return;
    // Said once the page is in place: a live region filled as it appears is not always read.
    setTimeout(() => {
      arrived = $_("catalogue.turn.arrived", {
        values: { name: e.name, index: e.index, count: e.count },
      });
    }, 150);
    if (reducedMotion()) return;
    const sign = e.dir === "next" ? -1 : 1;
    const width = sheet.clientWidth;
    busy = true;
    await sheet
      .animate(
        [
          { transform: `translateX(${-sign * width * 0.25}px)`, opacity: 0 },
          { transform: "translateX(0)", opacity: 1 },
        ],
        { duration: 240, easing: "cubic-bezier(0, 0, 0.2, 1)" },
      )
      .finished.catch(() => {});
    busy = false;
  }

  let alive = true;
  onMount(() => {
    if (entering) void enter();
    return () => (alive = false);
  });

  function onkeydown(e: KeyboardEvent) {
    if (e.defaultPrevented) return;
    const dir = arrowDirection(e);
    if (!dir || !around[dir]) return;
    e.preventDefault();
    void turn(dir);
  }
</script>

<svelte:window {onkeydown} />

<div class="pager">
  {#each SIDES as d (d)}
    {@const n = around[d]}
    {#if n}
      <div class={`peek ${d}`} bind:this={peeks[d]} aria-hidden="true">
        {#if d === "previous"}<span class="chev">‹</span>{/if}
        <span class="p-name">{n.name}</span>
        {#if d === "next"}<span class="chev">›</span>{/if}
      </div>
    {/if}
  {/each}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sheet"
    bind:this={sheet}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={cancel}
    {onclickcapture}
  >
    {@render children()}

    {#if around.count > 1}
      <nav class="turn" aria-label={$_("catalogue.turn.label")}>
        {#if around.previous}
          {@const n = around.previous}
          <button
            class="to previous"
            onclick={() => turn("previous")}
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
            values: { index: around.index, count: around.count },
          })}
          >{$_("catalogue.turn.position", {
            values: { index: around.index, count: around.count },
          })}</span
        >
        {#if around.next}
          {@const n = around.next}
          <button
            class="to next"
            onclick={() => turn("next")}
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
  </div>
  <p class="sr-only" role="status">{arrived}</p>
</div>

<style>
  .pager {
    position: relative;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    /* Desktop touchpads: a sideways overscroll is not the browser's « back ». */
    overscroll-behavior-x: contain;
  }
  .sheet {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--ast-bg);
    /* Vertical scrolling and zooming stay the browser's; sideways moves come to the swipe. */
    touch-action: pan-y pinch-zoom;
  }
  .sheet:global(.dragging) {
    user-select: none;
    -webkit-user-select: none;
    will-change: transform;
    box-shadow:
      1px 0 0 var(--ast-hairline),
      -1px 0 0 var(--ast-hairline);
  }
  /* In the gap the page leaves: the neighbour's name, inked once a release would turn. */
  .peek {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 max(16px, env(safe-area-inset-right)) 0 max(16px, env(safe-area-inset-left));
    opacity: 0;
    pointer-events: none;
    color: var(--ast-fg-muted);
  }
  .peek.next {
    justify-content: flex-end;
  }
  .p-name {
    max-width: 40vw;
    font: 700 22px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: inherit;
    overflow-wrap: anywhere;
  }
  .peek.next .p-name {
    text-align: right;
  }
  .peek .chev {
    font: 400 26px/1 var(--ast-font-mono);
    transition: transform 140ms var(--ast-ease-out);
  }
  .peek:global(.ready) {
    color: var(--ast-fg);
  }
  .peek.next:global(.ready) .chev {
    transform: translateX(4px);
  }
  .peek.previous:global(.ready) .chev {
    transform: translateX(-4px);
  }
  @media (prefers-reduced-motion: reduce) {
    /* The page stays still: the name shows over its side, as a fade only. */
    .peek {
      z-index: 2;
      width: 50%;
      background: linear-gradient(
        to right,
        color-mix(in srgb, var(--ast-bg) 94%, transparent),
        transparent
      );
    }
    .peek.next {
      left: auto;
      background: linear-gradient(
        to left,
        color-mix(in srgb, var(--ast-bg) 94%, transparent),
        transparent
      );
    }
    .peek .chev {
      transition: none;
    }
    .peek:global(.ready) .chev {
      transform: none;
    }
  }

  /* Below the page: the neighbours, discreet, one tap away. */
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
    border-top: 1px solid var(--ast-hairline);
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
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
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
    opacity: 0.75;
  }
</style>
