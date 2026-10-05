<script lang="ts">
  // Column of round buttons on the right (#74): each one says what it does by its drawing alone
  // (no text label), with a title and an aria-label.
  import { _ } from "@asteria/ui";
  import Icon from "./Icon.svelte";

  let {
    mode,
    fullscreen,
    locating,
    pointing,
    northDisabled,
    rotation,
    realistic,
    onfullscreen,
    onview,
    onlocate,
    onnorth,
    onpoint,
    onstyle,
    onlibrary,
    libraryOpen = false,
    element = $bindable(),
    height = $bindable(148),
  }: {
    mode: "sky" | "space";
    /** null: fullscreen not available (button hidden). */
    fullscreen: boolean | null;
    locating: "idle" | "busy" | "error";
    /** Sensor pointing is on or starting. */
    pointing: boolean;
    northDisabled: boolean;
    /** Compass needle rotation, degrees. */
    rotation: number;
    realistic: boolean;
    onfullscreen: () => void;
    onview: () => void;
    onlocate: () => void;
    onnorth: () => void;
    onpoint: () => void;
    onstyle: () => void;
    /** Opens the library (#90); receives the button's centre, where its reveal starts. */
    onlibrary?: ((origin: { x: number; y: number }) => void) | undefined;
    libraryOpen?: boolean;
    element?: HTMLElement | undefined;
    height?: number;
  } = $props();

  const ICON = 22;
</script>

<div class="dials" bind:this={element} bind:clientHeight={height}>
  {#if onlibrary}
    <!-- The library (#90): set apart by an orbit turning around it, the way into everything else. -->
    <button
      class="dial library"
      onclick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onlibrary({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
      }}
      aria-haspopup="dialog"
      aria-expanded={libraryOpen}
      aria-label={$_("library.open")}
      title={$_("library.open")}
    >
      <span class="orbit" aria-hidden="true"></span>
      <Icon name="library" size={ICON} />
    </button>
  {/if}
  {#if fullscreen !== null}
    {@const label = fullscreen ? $_("fullscreen.exit") : $_("fullscreen.enter")}
    <button
      class="dial"
      onclick={onfullscreen}
      aria-pressed={fullscreen}
      aria-label={label}
      title={label}
    >
      <Icon name={fullscreen ? "fullscreenExit" : "fullscreen"} size={ICON} />
    </button>
  {/if}
  {#if mode === "sky"}
    <button
      class="dial"
      onclick={onview}
      aria-label={$_("space.toggleToEarth")}
      title={$_("space.toggleToEarth")}
    >
      <Icon name="earth" size={ICON} />
    </button>
  {:else}
    <button
      class="dial"
      onclick={onview}
      aria-label={$_("space.toggleToSky")}
      title={$_("space.toggleToSky")}
    >
      <Icon name="sky" size={ICON} />
    </button>
  {/if}
  <button
    class="dial"
    class:busy={locating === "busy"}
    onclick={onlocate}
    aria-busy={locating === "busy"}
    aria-label={$_("place.locate")}
    title={$_("place.locate")}
  >
    <Icon name="locate" size={ICON} />
  </button>
  {#if mode === "sky"}
    <button
      class="dial compass"
      onclick={onnorth}
      aria-label={$_("compass.north")}
      title={$_("compass.north")}
      disabled={northDisabled}
    >
      <svg viewBox="-20 -20 40 40" aria-hidden="true">
        <circle r="18" class="ring" />
        <g transform={`rotate(${rotation})`}>
          <path d="M0 -15 L4.5 0 L0 3 L-4.5 0 Z" class="north" />
          <path d="M0 15 L4.5 0 L0 -3 L-4.5 0 Z" class="south" />
          <text y="-7.5" text-anchor="middle" class="n">{$_("compass.letter")}</text>
        </g>
      </svg>
    </button>
    <button
      class="dial"
      onclick={onpoint}
      aria-pressed={pointing}
      aria-label={$_("pointing.toggle")}
      title={$_("pointing.toggle")}
    >
      <Icon name="aim" size={ICON} />
    </button>
  {:else}
    <button
      class="dial"
      onclick={onstyle}
      aria-pressed={realistic}
      aria-label={$_("space.realistic")}
      title={$_("space.realistic")}
    >
      <Icon name="realistic" size={ICON} />
    </button>
  {/if}
</div>

<style>
  .dials {
    position: fixed;
    z-index: 2;
    top: max(16px, env(safe-area-inset-top));
    right: max(16px, env(safe-area-inset-right));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dial {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
    background: color-mix(in srgb, var(--ast-bg) 70%, transparent);
    backdrop-filter: blur(4px);
    color: var(--ast-fg);
    cursor: pointer;
  }
  .dial:not(:disabled):hover {
    border-color: color-mix(in srgb, var(--ast-fg) 45%, transparent);
    box-shadow: var(--ast-glow);
  }
  .dial[aria-pressed="true"] {
    background: var(--ast-fg);
    color: var(--ast-bg);
  }
  .dial:disabled {
    opacity: 0.5;
  }
  /* Library dial (#91): a brighter ring, a halo, and a small star orbiting it. It turns twice
     after start-up, then rests: a loop running forever would keep the compositor awake over a
     map that otherwise only draws on demand (battery). */
  .library {
    position: relative;
    border-color: color-mix(in srgb, var(--ast-fg) 55%, transparent);
    box-shadow: var(--ast-glow-soft);
  }
  .library[aria-expanded="true"] {
    background: var(--ast-fg);
    color: var(--ast-bg);
  }
  .orbit {
    position: absolute;
    inset: -5px;
    border-radius: 50%;
    border: 1px dashed color-mix(in srgb, var(--ast-fg) 30%, transparent);
    animation: orbit 9s var(--ast-ease-settle) 1.2s 2;
    pointer-events: none;
  }
  .orbit::after {
    content: "";
    position: absolute;
    top: -2.5px;
    left: 50%;
    width: 4px;
    height: 4px;
    margin-left: -2px;
    background: var(--ast-fg);
    transform: rotate(45deg);
    box-shadow: var(--ast-glow);
  }
  @keyframes orbit {
    to {
      transform: rotate(360deg);
    }
  }
  .busy {
    animation: pulse 1s ease-in-out infinite alternate;
  }
  @keyframes pulse {
    to {
      opacity: 0.4;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .busy,
    .orbit {
      animation: none;
    }
  }
  .compass svg {
    width: 100%;
    height: 100%;
    display: block;
  }
  .ring {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
  }
  .north {
    fill: var(--ast-fg);
  }
  .south {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
  }
  .n {
    font: 700 7px var(--ast-font-mono);
    fill: var(--ast-fg);
  }
</style>
