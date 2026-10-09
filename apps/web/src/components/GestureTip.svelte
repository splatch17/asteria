<script lang="ts">
  // First-time tip of the 3D views' gestures (#107): shown once per view (remembered on the
  // device), hidden after a while, on "Got it", or as soon as the view is touched.
  import { onDestroy } from "svelte";
  import { _ } from "@asteria/ui";
  import { readSetting, writeSetting } from "../lib/storage";

  let {
    view,
    active,
    top,
  }: {
    /** Which view: its own texts and its own "already seen". */
    view: "c3d" | "earth";
    /** The view is shown and usable (not in a transition or a flight). */
    active: boolean;
    /** CSS `top` of the tip. */
    top: string;
  } = $props();

  const HIDE_MS = 12_000;
  const key = $derived(`asteria.tip.gestures.${view}`);
  const touch = matchMedia("(pointer: coarse)").matches;
  // `?tips=1` shows the tips again (captures, tests).
  const forced = new URLSearchParams(location.search).get("tips") === "1";
  let seen = $state(false);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!active || seen || open) return;
    if (!forced && readSetting(key, false, (v): v is boolean => typeof v === "boolean")) {
      seen = true;
      return;
    }
    open = true;
    writeSetting(key, true);
    timer = setTimeout(close, HIDE_MS);
  });

  function close() {
    open = false;
    seen = true;
    clearTimeout(timer);
  }

  // Any gesture on the view counts as "seen it": the tip leaves once the gesture is over.
  $effect(() => {
    if (!open) return;
    const onup = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement) close();
    };
    addEventListener("pointerup", onup);
    return () => removeEventListener("pointerup", onup);
  });

  onDestroy(() => clearTimeout(timer));
</script>

{#if open && active}
  <div class="tip" style:top role="status">
    <p class="title">{$_("gestures.tip.title")}</p>
    <p>{$_(`gestures.tip.${view}.${touch ? "touch" : "mouse"}`)}</p>
    <button onclick={close}>{$_("gestures.tip.dismiss")}</button>
  </div>
{/if}

<style>
  .tip {
    position: fixed;
    z-index: 3;
    left: max(16px, env(safe-area-inset-left));
    right: calc(max(16px, env(safe-area-inset-right)) + 56px);
    max-width: 320px;
    margin: 0 auto;
    padding: 10px 12px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 88%, transparent);
    color: var(--ast-fg);
    font: 11px/1.5 var(--ast-font-mono);
    text-align: center;
  }
  p {
    margin: 0;
  }
  .title {
    margin-bottom: 4px;
    font-size: 10px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  button {
    min-height: 36px;
    margin-top: 8px;
    padding: 0 14px;
    border: 1px solid var(--ast-hairline);
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    font: 500 10px/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--ast-fg);
    outline-offset: 2px;
  }
</style>
