<script lang="ts">
  // Point of view selector of the Earth view (#122, #128, #131, #139): three cards, each with an engraved
  // pictogram (#135: cards rather than a list; the one-line hint is read out under them). Opens
  // under the header. « Visiter un astre » (#123) has a sub-grid: the Moon and the planets, one tap
  // travels there.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { REFERENCE_FRAMES, type BodyTarget, type ReferenceFrameId } from "@asteria/sky-renderer";
  import FramePicto from "./FramePicto.svelte";

  let {
    frame,
    body,
    bodies,
    onbody,
    top,
    onselect,
    onclose,
    toggle,
  }: {
    frame: ReferenceFrameId;
    /** Body of the body-centred frame, and the bodies offered, with their localised names. */
    body: BodyTarget;
    bodies: { id: BodyTarget; name: string }[];
    /** A body is chosen in the sub-list (switches to the body-centred frame). */
    onbody: (body: BodyTarget) => void;
    /** CSS `top` of the panel. */
    top: string;
    onselect: (id: ReferenceFrameId) => void;
    onclose: () => void;
    /** The button that opens the panel (a tap on it is not an "outside" tap). */
    toggle?: HTMLElement | undefined;
  } = $props();

  let panel: HTMLElement;
  /** Card whose hint is read out: focused or hovered (else the current point of view). */
  let shown = $state<ReferenceFrameId | null>(null);

  onMount(() => {
    panel.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const outside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !panel.contains(target) && !toggle?.contains(target)) onclose();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        toggle?.focus();
        onclose();
      }
    };
    addEventListener("pointerdown", outside, true);
    addEventListener("keydown", escape);
    return () => {
      removeEventListener("pointerdown", outside, true);
      removeEventListener("keydown", escape);
    };
  });
</script>

<div
  class="frames frame"
  style:top
  role="dialog"
  aria-label={$_("frame.title")}
  tabindex="-1"
  bind:this={panel}
  id="frame-panel"
>
  <h2 id="frame-title">{$_("frame.title")}</h2>
  <!-- Visual cards (#135): pictogram and name; the hint is the card's description, and is read
       out under the cards for the focused or hovered card, else the current one. -->
  <div class="cards" role="radiogroup" aria-labelledby="frame-title">
    {#each REFERENCE_FRAMES as entry (entry.id)}
      <button
        class="choice"
        role="radio"
        aria-checked={frame === entry.id}
        aria-describedby={`frame-hint-${entry.id}`}
        disabled={!entry.available}
        onclick={() => onselect(entry.id)}
        onfocus={() => (shown = entry.id)}
        onpointerenter={(e) => e.pointerType === "mouse" && (shown = entry.id)}
        onpointerleave={() => (shown = null)}
        onblur={() => (shown = null)}
      >
        <FramePicto frame={entry.id} size={34} />
        <span class="label">{$_(`frame.${entry.id}`)}</span>
        {#if !entry.available}<span class="soon">{$_("frame.soon")}</span>{/if}
        <span class="sr" id={`frame-hint-${entry.id}`}>{$_(`frame.${entry.id}.hint`)}</span>
      </button>
    {/each}
  </div>
  <p class="readout" aria-hidden="true">{$_(`frame.${shown ?? frame}.hint`)}</p>
  {#if REFERENCE_FRAMES.some((f) => f.id === "body" && f.available)}
    <h3 id="frame-bodies">{$_("frame.body.pick")}</h3>
    <div class="bodies" role="radiogroup" aria-labelledby="frame-bodies">
      {#each bodies as b (b.id)}
        <button
          class="body"
          role="radio"
          aria-checked={frame === "body" && body === b.id}
          onclick={() => onbody(b.id)}>{b.name}</button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .frames {
    position: fixed;
    z-index: 3;
    right: max(16px, env(safe-area-inset-right));
    width: min(340px, calc(100vw - 2 * max(16px, env(safe-area-inset-left))));
    box-sizing: border-box;
    padding: 4px 10px 10px;
    outline: none;
    animation: rise 160ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .frames {
      animation: none;
    }
  }
  h2,
  h3 {
    margin: 6px 2px 6px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  h3 {
    margin-top: 10px;
  }
  /* Three cards in a row (#139): an engraved pictogram over the name. */
  .cards {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
  }
  .choice {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 76px;
    padding: 10px 4px 8px;
    font: 500 9px/1.2 var(--ast-font-mono);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-align: center;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
    transition:
      color 120ms var(--ast-ease-out),
      background-color 120ms var(--ast-ease-out),
      border-color 120ms var(--ast-ease-out);
  }
  .choice:hover:not(:disabled) {
    color: var(--ast-fg);
    border-color: var(--ast-fg-muted);
  }
  .choice:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .choice:disabled {
    cursor: default;
    opacity: 0.5;
  }
  /* Square instrument mark, filled for the chosen point of view */
  .choice::after {
    content: "";
    position: absolute;
    top: 5px;
    right: 5px;
    width: 6px;
    height: 6px;
    border: 1px solid var(--ast-hairline);
    box-sizing: border-box;
  }
  .choice[aria-checked="true"] {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 18%, transparent);
    border-color: var(--ast-fg);
  }
  .choice[aria-checked="true"]::after {
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  @media (prefers-reduced-motion: reduce) {
    .choice {
      transition: none;
    }
  }
  .readout {
    min-height: 2.8em;
    margin: 8px 2px 0;
    font: 400 10px/1.4 var(--ast-font-mono);
    letter-spacing: 0.02em;
    color: var(--ast-fg-muted);
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  /* The bodies: a grid of small engraved tabs, 4 per row. */
  .bodies {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .body {
    min-height: 44px;
    padding: 0 2px;
    font: 500 9px/1 var(--ast-font-mono);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .body:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 1px;
  }
  .body[aria-checked="true"] {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 18%, transparent);
    border-color: var(--ast-fg);
  }
  .soon {
    padding: 2px 4px;
    border: 1px solid var(--ast-hairline);
    font-size: 8px;
    letter-spacing: var(--ast-tracking-meta);
  }
</style>
