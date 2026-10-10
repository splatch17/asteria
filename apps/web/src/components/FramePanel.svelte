<script lang="ts">
  // Reference frame selector of the Earth view (#122): five entries, the frames of later
  // sub-tickets shown disabled ("bientôt"). Opens beside the dials column. The body-centred
  // frame (#123) has a sub-list: the Moon and the planets, one tap travels there.
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
  const pad = (i: number) => String(i + 1).padStart(2, "0");

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
    {#each REFERENCE_FRAMES as entry, i (entry.id)}
      <button
        class="choice"
        role="radio"
        aria-checked={frame === entry.id}
        disabled={!entry.available}
        onclick={() => onselect(entry.id)}
      >
        <span class="num" aria-hidden="true">{pad(i)}</span>
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
    grid-template-columns: 18px 1fr auto;
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
  .num {
    font-size: 9px;
    letter-spacing: var(--ast-tracking-meta);
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
