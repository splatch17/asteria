<script lang="ts">
  // Games of the library (#90): the entries of games/registry.ts, or a "coming soon" page while
  // there is none. The chosen game is mounted full screen by Library.svelte.
  import { _ } from "@asteria/ui";
  import { GAMES, type GameEntry } from "../../games/registry";
  import { isIconName } from "../../lib/icons";
  import Icon from "../Icon.svelte";

  let { onplay }: { onplay: (game: GameEntry) => void } = $props();

  const LEVEL_KEY: Record<GameEntry["level"], string> = {
    decouverte: "level.discovery",
    amateur: "level.amateur",
    expert: "level.expert",
  };
  const pad = (i: number) => String(i).padStart(2, "0");
</script>

{#if GAMES.length === 0}
  <div class="empty">
    <!-- An unfinished constellation: dotted lines between stars still waiting to be joined. -->
    <svg viewBox="0 0 200 120" aria-hidden="true">
      <path d="M20 90 L62 40 L104 70 L146 24 L182 60" class="dotted" />
      {#each [[20, 90], [62, 40], [104, 70], [146, 24], [182, 60]] as [x, y], i (i)}
        <circle cx={x} cy={y} r={i === 2 ? 4 : 3} style:animation-delay={`${i * 0.6}s`} />
      {/each}
    </svg>
    <p class="stamp" aria-hidden="true">{$_("library.soon")}</p>
    <p class="text">{$_("games.empty")}</p>
  </div>
{:else}
  <ul class="list">
    {#each GAMES as game, i (game.id)}
      <li>
        <button class="game" onclick={() => onplay(game)}>
          <span class="seal" aria-hidden="true"
            ><Icon name={isIconName(game.icon) ? game.icon : "games"} size={24} /></span
          >
          <span class="num" aria-hidden="true">#{pad(i + 1)}</span>
          <span class="name">{$_(game.titleKey)}</span>
          <span class="desc">{$_(game.descriptionKey)}</span>
          <span class="level">{$_(LEVEL_KEY[game.level])}</span>
          <span class="play" aria-hidden="true">{$_("games.play")} →</span>
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    display: grid;
    justify-items: center;
    gap: 14px;
    margin: 24px auto;
    max-width: 360px;
    text-align: center;
  }
  svg {
    width: 220px;
    height: 132px;
    overflow: visible;
  }
  .dotted {
    fill: none;
    stroke: var(--ast-fg-muted);
    stroke-width: 1;
    stroke-dasharray: 2 5;
  }
  circle {
    fill: var(--ast-fg);
    animation: wait 2.4s ease-in-out infinite;
  }
  @keyframes wait {
    50% {
      opacity: 0.35;
    }
  }
  .stamp {
    margin: 0;
    padding: 6px 12px;
    border: 1px solid var(--ast-fg);
    font: 700 13px/1 var(--ast-font-mono);
    letter-spacing: 0.22em;
    text-transform: uppercase;
    transform: rotate(-5deg);
  }
  .text {
    margin: 0;
    font: 400 12px/1.6 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .list {
    display: grid;
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .game {
    display: grid;
    grid-template-columns: 52px 1fr auto;
    grid-template-areas:
      "seal num level"
      "seal name name"
      "seal desc desc"
      "seal play play";
    gap: 4px 12px;
    width: 100%;
    padding: 14px;
    border: 1px solid var(--ast-hairline);
    background: color-mix(in srgb, var(--ast-bg) 72%, transparent);
    color: var(--ast-fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .game:hover,
  .game:focus-visible {
    box-shadow: var(--ast-glow-soft);
    background: var(--ast-hatch), color-mix(in srgb, var(--ast-bg) 72%, transparent);
  }
  .seal {
    grid-area: seal;
    display: grid;
    place-items: center;
    width: 52px;
    height: 52px;
    border: 1px solid var(--ast-hairline);
    border-radius: 50%;
  }
  .num,
  .level,
  .play {
    font: 500 10px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .num {
    grid-area: num;
  }
  .level {
    grid-area: level;
    padding: 2px 6px;
    border: 1px solid var(--ast-hairline);
  }
  .name {
    grid-area: name;
    font: 700 22px/1 var(--ast-font-display);
    text-transform: uppercase;
  }
  .desc {
    grid-area: desc;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .play {
    grid-area: play;
    margin-top: 6px;
    color: var(--ast-fg);
  }
  @media (prefers-reduced-motion: reduce) {
    circle {
      animation: none;
    }
  }
</style>
