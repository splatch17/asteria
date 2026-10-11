<script lang="ts">
  // What stays still in the Earth view (#139): a compact chip « Fixe : Étoiles ▾ » in the view,
  // over the caption, opening a small popover of engraved choices (the stars, the Sun, the Earth,
  // the body looked at). One radio group; a choice not possible now stays listed, disabled, with
  // what to do to get it.
  import { tick } from "svelte";
  import { _ } from "@asteria/ui";
  import type { RestFrameId } from "@asteria/sky-renderer";
  import RestPicto from "./RestPicto.svelte";

  let {
    rest,
    options,
    bottom,
    onselect,
  }: {
    rest: RestFrameId;
    /** The rest frames in order, localised; `disabled`: not possible now (`hint` says why). */
    options: { id: RestFrameId; name: string; hint: string; disabled: boolean }[];
    /** CSS `bottom` of the chip. */
    bottom: string;
    onselect: (id: RestFrameId) => void;
  } = $props();

  let open = $state(false);
  let chip: HTMLButtonElement;
  let popover = $state<HTMLElement>();
  const current = $derived(options.find((o) => o.id === rest) ?? options[0]!);

  async function toggle() {
    open = !open;
    if (!open) return;
    await tick();
    popover?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
  }

  function close(refocus = true) {
    open = false;
    if (refocus) chip?.focus({ preventScroll: true });
  }

  function choose(id: RestFrameId) {
    close();
    if (id !== rest) onselect(id);
  }

  /** Arrow keys move between the enabled choices (radio group), Escape closes. */
  function keydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
      return;
    }
    const step =
      e.key === "ArrowDown" || e.key === "ArrowRight"
        ? 1
        : e.key === "ArrowUp" || e.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step || !popover) return;
    e.preventDefault();
    const radios = [
      ...popover.querySelectorAll<HTMLButtonElement>('[role="radio"]:not(:disabled)'),
    ];
    const i = radios.indexOf(document.activeElement as HTMLButtonElement);
    radios[(i + step + radios.length) % radios.length]?.focus();
  }

  $effect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (target && !popover?.contains(target) && !chip.contains(target)) close(false);
    };
    addEventListener("pointerdown", outside, true);
    return () => removeEventListener("pointerdown", outside, true);
  });
</script>

<div class="rest" style:bottom>
  {#if open}
    <div
      class="popover"
      id="rest-popover"
      role="dialog"
      aria-labelledby="rest-title"
      tabindex="-1"
      bind:this={popover}
      onkeydown={keydown}
    >
      <h2 id="rest-title">{$_("rest.title")}</h2>
      <div class="choices" role="radiogroup" aria-labelledby="rest-title">
        {#each options as o (o.id)}
          <button
            class="choice"
            role="radio"
            aria-checked={o.id === rest}
            aria-describedby={`rest-hint-${o.id}`}
            disabled={o.disabled}
            tabindex={o.id === rest ? 0 : -1}
            onclick={() => choose(o.id)}
          >
            <RestPicto rest={o.id} size={26} />
            <span class="text">
              <span class="name">{o.name}</span>
              <span class="hint" id={`rest-hint-${o.id}`}>{o.hint}</span>
            </span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
  <button
    class="chip"
    bind:this={chip}
    aria-haspopup="dialog"
    aria-expanded={open}
    aria-controls={open ? "rest-popover" : undefined}
    aria-label={$_("rest.open", { values: { name: current.name } })}
    onclick={toggle}
  >
    <RestPicto {rest} size={16} />
    <span>{$_("rest.chip", { values: { name: current.name } })}</span>
    <span class="caret" aria-hidden="true">▾</span>
  </button>
</div>

<style>
  .rest {
    position: fixed;
    z-index: 2;
    left: max(16px, env(safe-area-inset-left));
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    max-width: min(340px, calc(100vw - 2 * max(16px, env(safe-area-inset-left))));
  }
  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 10px 0 8px;
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-bg) 80%, transparent);
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  /* 44 px touch target round the 30 px chip */
  .chip::before {
    content: "";
    position: absolute;
    inset: -7px -4px;
  }
  .chip:hover,
  .chip[aria-expanded="true"] {
    border-color: var(--ast-fg-muted);
  }
  .chip:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .caret {
    font-size: 9px;
    color: var(--ast-fg-muted);
  }
  .popover {
    order: -1;
    width: min(300px, calc(100vw - 2 * max(16px, env(safe-area-inset-left))));
    box-sizing: border-box;
    padding: 4px 6px 6px;
    background: color-mix(in srgb, var(--ast-bg) 92%, transparent);
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    outline: none;
    animation: rise 140ms var(--ast-ease-out);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
  }
  h2 {
    margin: 6px 4px 4px;
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .choices {
    display: flex;
    flex-direction: column;
  }
  .choice {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 6px 22px 6px 6px;
    text-align: left;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .choice + .choice {
    border-top-color: var(--ast-hairline);
  }
  .choice:hover:not(:disabled) {
    color: var(--ast-fg);
  }
  .choice:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -1px;
  }
  .choice:disabled {
    cursor: default;
    opacity: 0.5;
  }
  /* Square instrument mark, filled for the chosen frame */
  .choice::after {
    content: "";
    position: absolute;
    top: 50%;
    right: 8px;
    width: 6px;
    height: 6px;
    margin-top: -3px;
    border: 1px solid var(--ast-hairline);
    box-sizing: border-box;
  }
  .choice[aria-checked="true"] {
    color: var(--ast-fg);
    background: color-mix(in srgb, var(--ast-fg) 14%, transparent);
  }
  .choice[aria-checked="true"]::after {
    background: var(--ast-fg);
    border-color: var(--ast-fg);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    font: 500 10px/1.2 var(--ast-font-mono);
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .hint {
    font: 400 10px/1.35 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .popover {
      animation: none;
    }
  }
</style>
