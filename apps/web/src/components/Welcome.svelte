<script lang="ts" module>
  import type { Sheet } from "../lib/sheet-rows";

  /** The example star of the level step, its sheet built by lib/sheet-rows at a given level. */
  export interface WelcomeExample {
    name: string;
    /** « HIP 27989 », and the Bayer designation if any. */
    hip: string;
    bayer?: string | undefined;
    constellation: string;
    latin: string;
    sheet: Sheet;
  }
</script>

<script lang="ts">
  // First-launch welcome (#207, mock-up B, variant 2): a low sheet over tonight's sky, in the
  // menu's style, for the place and the level; then three hints on the map, one at a time, each
  // gone once its gesture is made. Shown once (lib/welcome.ts).
  import { onDestroy, tick } from "svelte";
  import { _ } from "@asteria/ui";
  import type { FigureLevel } from "@asteria/sky-renderer";
  import Icon from "./Icon.svelte";
  import Designation from "./Designation.svelte";
  import { LEVELS } from "../lib/level";
  import { level } from "../lib/level-store.svelte";
  import { appStorage } from "../lib/storage";
  import {
    GESTURE_HINTS,
    SHEET_STEPS,
    WELCOME_START,
    endWelcome,
    gestureMade,
    isGestureStep,
    isSheetStep,
    welcomeReduce,
    type GestureHint,
    type ViewSample,
    type WelcomeEvent,
    type WelcomeOutcome,
  } from "../lib/welcome";

  let {
    ready,
    when,
    locating,
    located,
    onlocate,
    example,
    view,
    bottom,
    onend,
  }: {
    /** The sky map is shown and usable (loaded, not in a flight). */
    ready: boolean;
    /** « Voici ton ciel de ce soir / de cette nuit », or just « Voici ton ciel » by day. */
    when: "evening" | "night" | "day";
    locating: "idle" | "busy" | "error";
    /** The place is the player's own position. */
    located: boolean;
    /** The menu's « Utiliser ma position » (Menu › Lieu et temps). */
    onlocate: () => void;
    example: (level: FigureLevel) => WelcomeExample | null;
    /** The map's current view, for the drag and pinch hints. */
    view: () => ViewSample | null;
    /** CSS `bottom` of the hints: above the time line, whatever its layout. */
    bottom: string;
    onend?: (outcome: WelcomeOutcome) => void;
  } = $props();

  let current = $state(WELCOME_START);
  const step = $derived(current.step);
  const coarse = matchMedia("(pointer: coarse)").matches;
  const input = coarse ? "touch" : "mouse";

  function send(e: WelcomeEvent) {
    const was = current.step;
    current = welcomeReduce(current, e);
    if (current.step === was) return;
    if (current.outcome) {
      endWelcome(appStorage(), current.outcome);
      announce(current.outcome === "skipped" ? "" : $_("welcome.done"));
      onend?.(current.outcome);
    }
  }

  // --- Screen reader: a polite live region, always in the page while the welcome runs.
  let announcement = $state("");
  function announce(text: string) {
    announcement = "";
    void tick().then(() => (announcement = text));
  }

  // --- The sheet: modal, focus on the step's title, kept inside, Escape = « Passer ».
  let sheet = $state<HTMLElement>();
  let heading = $state<HTMLElement>();
  $effect(() => {
    if (!ready || !isSheetStep(step)) return;
    void tick().then(() => heading?.focus());
  });

  function onsheetkey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      send({ type: "skip" });
      return;
    }
    if (e.key !== "Tab" || !sheet) return;
    const focusable = [...sheet.querySelectorAll<HTMLElement>("button:not(:disabled)")];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === heading)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // --- Place: the menu's own « Utiliser ma position »; on to the level once it is found.
  let asked = $state(false);
  function locate() {
    asked = true;
    onlocate();
  }
  $effect(() => {
    if (step === "place" && asked && located && locating === "idle") send({ type: "next" });
  });

  // --- Level: the global preference (#201), written at each choice; Betelgeuse at that level.
  let chosen = $state<FigureLevel>(level.value);
  function choose(l: FigureLevel) {
    chosen = l;
    level.set(l);
  }
  const shown = $derived(step === "level" ? example(chosen) : null);
  function seeSky() {
    level.set(chosen); // recorded as chosen, even when it stays the default
    send({ type: "next" });
  }

  // --- Gesture hints: done when the map's view changed enough, once the fingers are up.
  let bubble = $state<HTMLElement>();
  let baseline: ViewSample | null = null;
  let met = false;
  let fingers = 0;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const SETTLE_MS = 350;
  const hintIndex = $derived(isGestureStep(step) ? GESTURE_HINTS.indexOf(step) : -1);

  $effect(() => {
    if (!ready || !isGestureStep(step)) return;
    const hint: GestureHint = step;
    baseline = view();
    met = false;
    clearTimeout(settle);
    settle = undefined;
    if (hint === "drag") void tick().then(() => bubble?.focus());
    else announce(`${hintLabel(hint)}. ${hintTitle(hint)}. ${hintText(hint)}`);
  });

  /** Called by the map on every view change (App.svelte, SkyMap `onViewChange`). */
  export function viewChanged(v: ViewSample) {
    if (!ready || !isGestureStep(step) || step === "tap") return;
    if (!baseline) {
      baseline = { ...v };
      return;
    }
    if (!met && gestureMade(step, baseline, v)) met = true;
    // A wheel turned (no finger down): done shortly after. The sky's glide after a drag does
    // not delay it.
    if (met && fingers === 0) finishSoon();
  }

  /** Called when a star is touched on the map. */
  export function starTapped() {
    if (ready) send({ type: "gesture", gesture: "tap" });
  }

  function finishSoon() {
    if (settle !== undefined) return;
    settle = setTimeout(() => {
      settle = undefined;
      if (fingers > 0) return; // the last finger up finishes it
      if (isGestureStep(step)) send({ type: "gesture", gesture: step });
    }, SETTLE_MS);
  }

  $effect(() => {
    if (!isGestureStep(step)) return;
    const down = () => fingers++;
    const up = () => {
      fingers = Math.max(0, fingers - 1);
      if (fingers === 0 && met) finishSoon();
    };
    addEventListener("pointerdown", down, true);
    addEventListener("pointerup", up, true);
    addEventListener("pointercancel", up, true);
    return () => {
      removeEventListener("pointerdown", down, true);
      removeEventListener("pointerup", up, true);
      removeEventListener("pointercancel", up, true);
      fingers = 0;
    };
  });

  onDestroy(() => clearTimeout(settle));

  const total = GESTURE_HINTS.length;
  const hintLabel = (h: GestureHint) =>
    $_("welcome.gesture.label", { values: { n: GESTURE_HINTS.indexOf(h) + 1, total } });
  const hintTitle = (h: GestureHint) => $_(`welcome.gesture.${h}.title.${input}`);
  const hintText = (h: GestureHint) =>
    h === "tap" ? $_("welcome.gesture.tap.text") : $_(`welcome.gesture.${h}.text.${input}`);

  // Pictograms (mock-up B): a finger is a lightly inked disc, motion an engraved arrow (dotted
  // lines stay for the sky's traces).
  const sparkle = (x: number, y: number, r: number) => {
    const k = r * 0.28;
    return `M${x} ${y - r}L${x + k} ${y - k}L${x + r} ${y}L${x + k} ${y + k}L${x} ${y + r}L${x - k} ${y + k}L${x - r} ${y}L${x - k} ${y - k}Z`;
  };
</script>

<p class="sr-only" aria-live="polite">{announcement}</p>

{#if ready && isSheetStep(step)}
  {@const n = SHEET_STEPS.indexOf(step) + 1}
  <div class="backdrop" aria-hidden="true"></div>
  <div
    class="sheet frame"
    role="dialog"
    aria-modal="true"
    aria-label={$_("welcome.label")}
    tabindex="-1"
    bind:this={sheet}
    onkeydown={onsheetkey}
  >
    <div class="bar">
      <span
        class="dots"
        role="img"
        aria-label={$_("welcome.progress", { values: { n, total: SHEET_STEPS.length } })}
      >
        {#each SHEET_STEPS as s, i (s)}<i class:f={i < n}></i>{/each}
      </span>
      <button
        class="skip"
        onclick={() => send({ type: "skip" })}
        aria-label={$_("welcome.skip.label")}>{$_("welcome.skip")}</button
      >
    </div>

    {#key step}
      <div class="body">
        {#if step === "place"}
          <p class="kicker">{$_("welcome.place.kicker")}</p>
          <h2 tabindex="-1" bind:this={heading}>
            {$_("welcome.place.title", { values: { when } })}
          </h2>
          <p class="lede">{$_("welcome.place.lede")}</p>
          <button class="opt ink" onclick={locate} aria-busy={locating === "busy"}>
            <Icon name="locate" size={18} />
            {locating === "busy" ? $_("place.locating") : $_("place.locate")}
          </button>
          {#if asked && locating === "error"}
            <p class="error" role="alert">{$_("welcome.place.error")}</p>
          {/if}
          <button class="opt text" onclick={() => send({ type: "next" })}>
            <Icon name="now" size={18} />
            {$_("welcome.place.later")}<small>{$_("welcome.place.later.hint")}</small>
          </button>
        {:else}
          <p class="kicker">{$_("welcome.level.kicker")}</p>
          <h2 tabindex="-1" bind:this={heading} id="welcome-level">
            {$_("welcome.level.title")}
          </h2>
          <div class="levels" role="group" aria-labelledby="welcome-level">
            {#each LEVELS as l (l)}
              <button aria-pressed={chosen === l} onclick={() => choose(l)}
                >{$_(`level.${l}`)}</button
              >
            {/each}
          </div>
          {#if shown}
            <section class="panel-block ex" aria-live="polite" aria-atomic="true">
              <p class="panel-title">{$_("welcome.level.example")}</p>
              <p class="meta">
                {shown.hip}{#if shown.bayer}&nbsp;· <Designation text={shown.bayer} />{/if}
              </p>
              <p class="name">{shown.name}</p>
              {#if shown.sheet.sight}<p class="sight">{shown.sheet.sight}</p>{/if}
              {#if shown.sheet.lead.length}<p class="lead">{shown.sheet.lead.join(" ")}</p>{/if}
              <p class="con">
                {shown.constellation}{#if shown.sheet.latin}&nbsp;· <i>{shown.latin}</i>{/if}
              </p>
              {#if shown.sheet.rows.length}
                <dl class="data">
                  {#each shown.sheet.rows as row, i (i)}
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  {/each}
                </dl>
              {/if}
            </section>
          {/if}
          <p class="note">{$_("welcome.level.note")}</p>
          <button class="opt ink go" onclick={seeSky}>{$_("welcome.level.go")}</button>
        {/if}
      </div>
    {/key}
  </div>
{:else if ready && isGestureStep(step)}
  <div
    class="bubble frame"
    style:bottom
    role="group"
    tabindex="-1"
    aria-labelledby="welcome-hint-title"
    aria-describedby="welcome-hint-text"
    bind:this={bubble}
  >
    {#key step}
      <div class="row">
        <svg class="g {step}" viewBox="0 0 56 56" aria-hidden="true">
          {#if step === "drag"}
            <path d="M8 44 C 18 40, 30 26, 44 14" class="thin" />
            <path d="M44 14 l-7 1 M44 14 l-1 7" />
            <circle cx="14" cy="40" r="7" class="finger" />
          {:else if step === "pinch"}
            <path d="M13 43 L6 50 M6 50 h6 M6 50 v-6" />
            <path d="M43 13 L50 6 M50 6 h-6 M50 6 v6" />
            <circle cx="20" cy="36" r="7" class="finger a" />
            <circle cx="36" cy="20" r="7" class="finger b" />
          {:else}
            <path d={sparkle(28, 14, 7)} class="ink" />
            <circle cx="28" cy="34" r="12" class="thin ring" />
            <circle cx="28" cy="34" r="17" class="thin ring far" />
            <circle cx="28" cy="34" r="7" class="finger" />
          {/if}
        </svg>
        <div>
          <p class="sr-only">{hintLabel(step)}</p>
          <p class="title" id="welcome-hint-title">{hintTitle(step)}</p>
          <p class="text" id="welcome-hint-text">{hintText(step)}</p>
        </div>
      </div>
    {/key}
    <div class="foot">
      <span class="dots" aria-hidden="true">
        {#each GESTURE_HINTS as h, i (h)}<i class:f={i <= hintIndex}></i>{/each}
      </span>
      <span class="count" aria-hidden="true"
        >{$_("welcome.gesture.count", { values: { n: hintIndex + 1, total } })}</span
      >
      <button
        class="later"
        onclick={() => send({ type: "later" })}
        aria-label={$_("welcome.gesture.later.label")}>{$_("welcome.gesture.later")}</button
      >
    </div>
  </div>
{/if}

<style>
  /* Like the menu (MenuSheet): a faint veil over the sky that takes the taps, a low sheet. */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 4;
    background: color-mix(in srgb, var(--ast-bg) 35%, transparent);
  }
  .sheet {
    position: fixed;
    z-index: 5;
    left: max(8px, env(safe-area-inset-left));
    right: max(8px, env(safe-area-inset-right));
    bottom: max(8px, env(safe-area-inset-bottom));
    max-width: 420px;
    max-height: calc(100dvh - max(16px, env(safe-area-inset-top)) - 56px);
    margin: 0 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    background: color-mix(in srgb, var(--ast-bg) 94%, transparent);
    outline: none;
    animation: rise 180ms var(--ast-ease-out);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 0 4px 0 14px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  .dots {
    display: inline-flex;
    gap: 5px;
  }
  .dots i {
    width: 6px;
    height: 6px;
    border: 1px solid var(--ast-fg-muted);
    transition: background-color 200ms var(--ast-ease-out);
  }
  .dots i.f {
    background: var(--ast-fg);
    border-color: var(--ast-fg);
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
  }
  .skip,
  .later {
    min-width: 44px;
    min-height: 44px;
    padding: 0 10px;
    color: var(--ast-fg-muted);
  }
  .skip:hover,
  .later:hover {
    color: var(--ast-fg);
  }
  .body {
    padding: 14px 12px 12px;
    animation: appear 160ms var(--ast-ease-out);
  }
  .kicker {
    margin: 0 0 6px;
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  h2 {
    margin: 0 0 6px;
    font: 700 30px/1 var(--ast-font-display);
    text-transform: uppercase;
    outline: none;
  }
  .lede {
    margin: 0 0 14px;
    font: 400 12px/1.55 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  /* Choices: full-width rows, the main one inked (mock-up B). */
  .opt {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 0 16px;
    border: 1px solid var(--ast-control-border);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-align: left;
  }
  .opt + .opt,
  .error + .opt {
    margin-top: 8px;
  }
  .opt.ink {
    background: var(--ast-fg);
    color: var(--ast-bg);
    border-color: var(--ast-fg);
  }
  .opt.ink:focus-visible {
    outline-offset: 3px;
  }
  .opt.text {
    min-height: 48px;
    border-color: transparent;
    color: var(--ast-fg-muted);
  }
  .opt small {
    margin-left: auto;
    font: 400 10px/1 var(--ast-font-mono);
    letter-spacing: 0.08em;
    text-transform: none;
  }
  .opt.go {
    justify-content: center;
  }
  .opt[aria-busy="true"] {
    cursor: progress;
  }
  .error {
    margin: 8px 2px 0;
    font: 400 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg);
  }
  /* Level (#201): the segmented control of Réglages, the choice inverted. */
  .levels {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-top: 12px;
    border: 1px solid var(--ast-control-border);
  }
  .levels button {
    min-height: 44px;
    padding: 0 6px;
    color: var(--ast-fg-muted);
    border-radius: 0;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out);
  }
  .levels button + button {
    border-left: 1px solid var(--ast-control-border);
  }
  .levels button[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .levels button:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -4px;
  }
  .levels button[aria-pressed="true"]:focus-visible {
    outline-color: var(--ast-bg);
  }
  /* The example star: the map's sheet (InfoPanel), its rows from lib/sheet-rows. */
  .ex {
    margin-top: 10px;
    padding: 12px;
  }
  .ex .panel-title {
    margin-bottom: 6px;
  }
  .meta {
    margin: 0;
    font: 400 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .name {
    margin: 2px 0 6px;
    font: 700 26px/1 var(--ast-font-display);
    text-transform: uppercase;
  }
  .sight {
    margin: 0 0 6px;
    font: 500 11px/1.5 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .lead {
    margin: 0 0 6px;
    font: 400 15px/1.35 var(--ast-font-serif);
    font-variant-numeric: lining-nums;
  }
  .con {
    margin: 0 0 4px;
    font: 500 11px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
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
    color: var(--ast-fg);
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 10px 2px 12px;
    font: 400 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }

  /* A hint on the map: a framed bubble above the time line. */
  .bubble {
    position: fixed;
    z-index: 3;
    left: max(16px, env(safe-area-inset-left));
    right: max(16px, env(safe-area-inset-right));
    max-width: 380px;
    margin: 0 auto;
    padding: 12px 14px 4px;
    background: color-mix(in srgb, var(--ast-bg) 88%, transparent);
    outline: none;
    animation: rise 200ms var(--ast-ease-out);
  }
  .bubble:focus-visible {
    outline: 2px solid var(--ast-focus);
    outline-offset: 2px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    animation: appear 200ms var(--ast-ease-out);
  }
  .row p {
    margin: 0;
  }
  .title {
    margin-bottom: 4px !important;
    font: 700 22px/1 var(--ast-font-display);
    text-transform: uppercase;
  }
  .text {
    font: 400 12px/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 8px;
    padding-left: 2px;
    border-top: 1px solid var(--ast-hairline);
  }
  .count {
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: 0.12em;
    color: var(--ast-fg-muted);
  }
  .later {
    margin-left: auto;
    margin-right: -10px;
  }
  svg.g {
    flex: none;
    width: 44px;
    height: 44px;
    fill: none;
    stroke: var(--ast-fg);
    stroke-width: 1.3;
    overflow: visible;
  }
  svg.g .finger {
    fill: color-mix(in srgb, var(--ast-fg) 22%, transparent);
  }
  svg.g .thin {
    stroke-width: 0.8;
    opacity: 0.7;
  }
  svg.g .far {
    opacity: 0.35;
  }
  svg.g .ink {
    fill: var(--ast-fg);
    stroke: none;
  }
  /* The finger shows the gesture, slowly, twice, then rests (nothing with reduced motion). */
  .drag .finger {
    animation: drag 1.6s var(--ast-ease-out) 400ms 2 backwards;
  }
  .pinch .finger.a {
    animation: pinch-a 1.4s var(--ast-ease-out) 400ms 2 both;
  }
  .pinch .finger.b {
    animation: pinch-b 1.4s var(--ast-ease-out) 400ms 2 both;
  }
  .tap .ring {
    animation: ring 1.4s var(--ast-ease-out) 400ms 2 both;
    transform-origin: 28px 34px;
  }
  /* Along the arrow, then fades, and rests back at the start. */
  @keyframes drag {
    0%,
    15% {
      transform: none;
      opacity: 1;
    }
    70% {
      transform: translate(22px, -20px);
      opacity: 1;
    }
    100% {
      transform: translate(22px, -20px);
      opacity: 0;
    }
  }
  @keyframes pinch-a {
    50% {
      transform: translate(-7px, 7px);
    }
  }
  @keyframes pinch-b {
    50% {
      transform: translate(7px, -7px);
    }
  }
  @keyframes ring {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    50% {
      opacity: 0.8;
    }
    100% {
      transform: none;
    }
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .sheet,
    .body,
    .bubble,
    .row,
    .g * {
      animation: none !important;
    }
    .dots i {
      transition: none;
    }
  }
</style>
