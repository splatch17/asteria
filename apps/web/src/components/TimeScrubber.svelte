<script module lang="ts">
  /**
   * Height (CSS px) the offset bubble rises above the scrubber's top edge, plus a 4 px margin:
   * 9 px gap + 41 px bubble (6 + 6 padding, 13 px value, 2 px gap, 12 px date, 2 px borders).
   * What sits right above the scrubber while the bubble shows (the playback hint, #80) is pushed
   * up by this much minus the column gap. Keep in sync with `.bubble` below.
   */
  export const BUBBLE_RISE = 54;
</script>

<script lang="ts">
  import { _ } from "@asteria/ui";
  import { RANGES, type TimeRange } from "../lib/timeline";
  import Icon from "./Icon.svelte";

  let {
    range,
    offset,
    playing,
    relative,
    target,
    speedKey,
    onscrub,
    ontoggle,
    onspeed,
  }: {
    range: TimeRange;
    offset: number;
    playing: boolean;
    /** Signed offset, e.g. "+3 h 20 min". */
    relative: string;
    /** Displayed instant, e.g. "jeu. 1 oct., 23:40". */
    target: string;
    speedKey: string;
    onscrub: (value: number) => void;
    ontoggle: () => void;
    onspeed: () => void;
  } = $props();

  let dragging = $state(false);
  const spec = $derived(RANGES[range]);
  /** Thumb position in [0, 1]. */
  const position = $derived((offset + spec.half) / (2 * spec.half));
  const ticks = $derived(
    [-1, -0.5, 0, 0.5, 1].map((f) => {
      const v = f * spec.half;
      const sign = v < 0 ? "−" : "+";
      const n = Math.abs(v);
      let label: string;
      if (f === 0) label = "0";
      else if (range === "48h") label = $_("time.tick.h", { values: { sign, n: n / 3_600_000 } });
      else if (range === "1y")
        label = $_("time.tick.months", {
          values: { sign, n: Math.round(n / (30.4375 * 86_400_000)) },
        });
      else label = $_("time.tick.years", { values: { sign, n } });
      // Only the ends and the centre are labelled: intermediate ticks would collide on phones.
      return { f, label: Math.abs(f) === 0.5 ? "" : label };
    }),
  );
</script>

<div class="scrubber frame">
  <button
    class="play"
    onclick={ontoggle}
    aria-label={playing ? $_("time.pause") : $_("time.play")}
    aria-pressed={playing}
  >
    <Icon name={playing ? "pause" : "play"} />
  </button>

  <div class="track">
    {#if dragging || playing}
      <!-- 8px = half thumb: keeps the bubble centred on the thumb at both ends -->
      <output class="bubble" style:left={`calc(${position * 100}% + ${8 - position * 16}px)`}>
        <strong>{relative || "0"}</strong>
        <span>{target}</span>
      </output>
    {/if}
    <input
      type="range"
      aria-label={$_("time.scrub")}
      aria-valuetext={`${relative || "0"} · ${target}`}
      min={-spec.half}
      max={spec.half}
      step={spec.step}
      value={offset}
      oninput={(e) => onscrub(Number(e.currentTarget.value))}
      onpointerdown={() => (dragging = true)}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      onblur={() => (dragging = false)}
    />
    <div class="ticks" aria-hidden="true">
      {#each ticks as t (t.f)}
        <span
          class:zero={t.f === 0}
          style:left={`calc(${((t.f + 1) / 2) * 100}% + ${8 - ((t.f + 1) / 2) * 16}px)`}
          >{t.label}</span
        >
      {/each}
    </div>
  </div>

  <button class="speed" onclick={onspeed}>{$_(speedKey)}</button>
</div>

<style>
  .scrubber {
    display: flex;
    align-items: stretch;
    width: 100%;
    max-width: 420px;
    height: 56px;
  }
  button {
    display: grid;
    place-items: center;
    border: 0;
    background: transparent;
    color: var(--ast-fg);
    cursor: pointer;
    font: 500 11px/1 var(--ast-font-mono);
    letter-spacing: 0.04em;
  }
  .play {
    width: 48px;
    border-right: 1px solid var(--ast-hairline);
  }
  .play[aria-pressed="true"] {
    color: var(--ast-bg);
    background: var(--ast-fg);
  }
  .speed {
    width: 104px;
    padding: 0 6px;
    white-space: nowrap;
    border-left: 1px solid var(--ast-hairline);
    color: var(--ast-fg-muted);
  }
  .track {
    position: relative;
    flex: 1;
    min-width: 0;
    margin: 0 14px;
  }
  input {
    appearance: none;
    position: absolute;
    left: 0;
    right: 0;
    top: 10px;
    width: 100%;
    height: 24px;
    margin: 0;
    background: transparent;
  }
  input::-webkit-slider-runnable-track {
    height: 1px;
    background: var(--ast-fg-muted);
  }
  input::-moz-range-track {
    height: 1px;
    background: var(--ast-fg-muted);
  }
  /* Diamond thumb, like a chart marker */
  input::-webkit-slider-thumb {
    appearance: none;
    width: 12px;
    height: 12px;
    margin-top: -6px;
    border: 1px solid var(--ast-bg);
    background: var(--ast-fg);
    transform: rotate(45deg);
  }
  input::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border: 1px solid var(--ast-bg);
    border-radius: 0;
    background: var(--ast-fg);
    transform: rotate(45deg);
  }
  .ticks {
    /* Decorative: must never intercept the finger dragging the thumb. */
    pointer-events: none;
    user-select: none;
  }
  .ticks span {
    position: absolute;
    top: 34px;
    transform: translateX(-50%);
    font: 9px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    white-space: nowrap;
  }
  .ticks span::before {
    content: "";
    position: absolute;
    left: 50%;
    top: -12px;
    height: 5px;
    border-left: 1px solid var(--ast-fg-muted);
  }
  .ticks span.zero {
    color: var(--ast-fg);
  }
  .ticks span:first-child {
    transform: none;
  }
  .ticks span:last-child {
    transform: translateX(-100%);
  }
  .ticks span:first-child::before {
    left: 0;
  }
  .ticks span:last-child::before {
    left: auto;
    right: 0;
  }
  .bubble {
    position: absolute;
    bottom: calc(100% + 10px);
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 10px;
    border: 1px solid var(--ast-fg);
    background: var(--ast-bg);
    font: 10px/1.2 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    white-space: nowrap;
    pointer-events: none;
  }
  .bubble strong {
    font: 700 13px/1 var(--ast-font-mono);
    color: var(--ast-fg);
  }
  /* small pointer under the bubble */
  .bubble::after {
    content: "";
    position: absolute;
    top: 100%;
    left: 50%;
    width: 8px;
    height: 8px;
    border-right: 1px solid var(--ast-fg);
    border-bottom: 1px solid var(--ast-fg);
    background: var(--ast-bg);
    transform: translate(-50%, -4px) rotate(45deg);
  }
</style>
