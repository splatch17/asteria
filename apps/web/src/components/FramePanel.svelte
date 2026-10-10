<script lang="ts">
  // Point of view selector of the Earth view (#122, #128): five entries, each with an engraved
  // pictogram and a one-line hint. Opens beside the dials column. « Visiter un astre » (#123)
  // has a sub-list: the Moon and the planets, one tap travels there.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { REFERENCE_FRAMES, type BodyTarget, type ReferenceFrameId } from "@asteria/sky-renderer";

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
  <div role="radiogroup" aria-labelledby="frame-title">
    {#each REFERENCE_FRAMES as entry (entry.id)}
      <button
        class="choice"
        role="radio"
        aria-checked={frame === entry.id}
        disabled={!entry.available}
        onclick={() => onselect(entry.id)}
      >
        <svg class="picto" viewBox="0 0 32 32" aria-hidden="true">
          {#if entry.id === "stars"}
            <!-- The Earth lit from the left, its rotation arrow, the Sun's rays -->
            <circle cx="19" cy="17" r="8" />
            <path class="fill" d="M19 9 A8 8 0 0 0 19 25 Z" />
            <path d="M13 6.5 A8 3 0 1 0 25 6.5" />
            <path d="M25 6.5 l-2.6 -0.6 M25 6.5 l-1.2 2.3" />
            <path class="dash" d="M2 13 H9 M2 17 H9 M2 21 H9" />
          {:else if entry.id === "earth"}
            <!-- Your place on the Earth, the Sun on its daily circle -->
            <ellipse class="dash" cx="16" cy="17" rx="13" ry="7" />
            <circle cx="16" cy="17" r="6" />
            <path d="M16 11 V7.5" />
            <circle class="fill" cx="16" cy="11" r="1.4" />
            <circle cx="28" cy="15" r="2.2" />
          {:else if entry.id === "ecliptic"}
            <!-- The Sun, the orbit, two Earths with the same tilted axis -->
            <ellipse cx="16" cy="17" rx="13" ry="6" />
            <circle class="fill" cx="16" cy="17" r="2.6" />
            <circle cx="3" cy="17" r="2.2" />
            <circle cx="29" cy="17" r="2.2" />
            <path d="M1.4 13 L4.6 21 M27.4 13 L30.6 21" />
          {:else if entry.id === "heliocentric"}
            <!-- The Sun and nested orbits, planets on them -->
            <ellipse cx="16" cy="16" rx="6" ry="3" />
            <ellipse cx="16" cy="16" rx="10" ry="5" />
            <ellipse cx="16" cy="16" rx="14.5" ry="7.5" />
            <circle class="fill" cx="16" cy="16" r="1.8" />
            <circle class="fill" cx="22" cy="16" r="1.1" />
            <circle class="fill" cx="9" cy="19.5" r="1.3" />
            <circle class="fill" cx="27" cy="11" r="1.6" />
          {:else}
            <!-- A ringed planet, the Earth far away -->
            <circle cx="15" cy="17" r="6.5" />
            <ellipse cx="15" cy="17" rx="12" ry="3.2" transform="rotate(-18 15 17)" />
            <circle class="fill" cx="28" cy="5" r="1.3" />
          {/if}
        </svg>
        <span class="text">
          <span class="label">{$_(`frame.${entry.id}`)}</span>
          <span class="hint">{$_(`frame.${entry.id}.hint`)}</span>
        </span>
        {#if entry.available}
          <span class="mark" aria-hidden="true"></span>
        {:else}
          <span class="soon">{$_("frame.soon")}</span>
        {/if}
      </button>
      {#if entry.id === "body" && entry.available}
        <div class="bodies" role="radiogroup" aria-label={$_("frame.body.pick")}>
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
    {/each}
  </div>
</div>

<style>
  .frames {
    position: fixed;
    z-index: 3;
    right: calc(max(16px, env(safe-area-inset-right)) + 56px);
    width: min(300px, calc(100vw - 2 * max(16px, env(safe-area-inset-left)) - 56px));
    box-sizing: border-box;
    padding: 4px 0 6px;
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
  h2 {
    margin: 6px 12px 2px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .choice {
    display: grid;
    grid-template-columns: 30px 1fr auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 4px 12px;
    font: 500 11px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    text-align: left;
    letter-spacing: 0.06em;
    cursor: pointer;
  }
  .choice:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  .choice:disabled {
    cursor: default;
    opacity: 0.5;
  }
  /* Engraved pictogram: ink hairlines, a few filled parts. */
  .picto {
    width: 30px;
    height: 30px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.1;
    stroke-linecap: round;
  }
  .picto .fill {
    fill: currentColor;
    stroke: none;
  }
  .picto .dash {
    stroke-dasharray: 2 2;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .label {
    text-transform: uppercase;
    letter-spacing: var(--ast-tracking-meta);
  }
  .hint {
    font-size: 9px;
    line-height: 1.3;
    letter-spacing: 0.02em;
    opacity: 0.85;
  }
  /* Square instrument mark, filled for the chosen frame */
  .mark {
    width: 10px;
    height: 10px;
    border: 1px solid var(--ast-fg-muted);
    box-sizing: border-box;
  }
  .choice[aria-checked="true"] {
    color: var(--ast-fg);
  }
  .choice[aria-checked="true"] .mark {
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  /* Sub-list of the body-centred frame: a grid of small engraved tabs, 4 per row. */
  .bodies {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 0 12px 6px 40px;
  }
  .body {
    min-height: 36px;
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
    color: var(--ast-bg);
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .soon {
    padding: 2px 4px;
    border: 1px solid var(--ast-hairline);
    font-size: 8px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
</style>
