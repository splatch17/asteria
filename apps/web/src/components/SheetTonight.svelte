<script lang="ts">
  // The « Ce soir » page of the Ciel tab (#11): what the coming night offers, in short rows
  // grouped by kind — the Moon, the planets one can see with the naked eye, the Space Station's
  // pass, and the well-known figures standing highest (lib/tonight-list). A tap on a row goes
  // to the map at the moment the object shows best and selects it. Opened from the « Ce soir »
  // row of the tab's home; ‹ in the sheet's header comes back (MenuSheet). The texts are
  // composed by App.svelte.
  export interface TonightRow {
    id: string;
    name: string;
    /** When and where, in a sentence fragment. */
    text: string;
    /** Short data on the right (« ↑ 41° »). */
    aside?: string | undefined;
    onselect?: (() => void) | undefined;
  }
  export interface TonightSection {
    id: string;
    title: string;
    rows: TonightRow[];
    /** Said when there are no rows. */
    empty?: string | undefined;
  }

  let {
    night,
    sections,
    note,
  }: {
    /** « Nuit de 17 h 53 à 7 h 20 », or why there is none. */
    night: string;
    sections: TonightSection[];
    note: string;
  } = $props();
</script>

<div class="tonight">
  <p class="night"><span class="dot" aria-hidden="true"></span>{night}</p>
  {#each sections as section (section.id)}
    <section aria-labelledby={`tonight-${section.id}`} data-section={section.id}>
      <h3 id={`tonight-${section.id}`}>{section.title}</h3>
      {#if section.rows.length}
        <ul>
          {#each section.rows as row (row.id)}
            <li>
              {#if row.onselect}
                <button class="row" data-tonight={row.id} onclick={row.onselect}>
                  <span class="text"
                    ><span class="name">{row.name}</span><span class="when">{row.text}</span></span
                  >
                  {#if row.aside}<span class="aside">{row.aside}</span>{/if}
                  <span class="chev" aria-hidden="true">›</span>
                </button>
              {:else}
                <p class="row" data-tonight={row.id}>
                  <span class="text"
                    ><span class="name">{row.name}</span><span class="when">{row.text}</span></span
                  >
                  {#if row.aside}<span class="aside">{row.aside}</span>{/if}
                </p>
              {/if}
            </li>
          {/each}
        </ul>
      {:else if section.empty}
        <p class="empty">{section.empty}</p>
      {/if}
    </section>
  {/each}
  <p class="note">{note}</p>
</div>

<style>
  .tonight {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .night {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font: 500 var(--ast-fs-m)/1.4 var(--ast-font-mono);
    color: var(--ast-fg);
  }
  .dot {
    flex: none;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    margin: 0;
    font: 500 var(--ast-fs-xs)/1 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
    border: 1px solid var(--ast-control-border);
  }
  li + li {
    border-top: 1px solid var(--ast-hairline);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    margin: 0;
    padding: 7px 10px 7px 12px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    text-align: left;
  }
  button.row {
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    transition: background-color 120ms var(--ast-ease-out);
  }
  button.row:active {
    background: color-mix(in srgb, var(--ast-fg) 12%, transparent);
  }
  button.row:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  @media (hover: hover) {
    button.row:hover {
      background: color-mix(in srgb, var(--ast-fg) 7%, transparent);
    }
  }
  .text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .name {
    font: 700 17px/1.1 var(--ast-font-display);
    letter-spacing: 0.02em;
  }
  .when {
    font: 400 var(--ast-fs-s)/1.4 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .aside {
    flex: none;
    font: 500 var(--ast-fs-s)/1 var(--ast-font-mono);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .chev {
    flex: none;
    font: 400 16px/1 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .empty,
  .note {
    margin: 0;
    font: 400 var(--ast-fs-s)/1.45 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  @media (prefers-reduced-motion: reduce) {
    button.row {
      transition: none;
    }
  }
</style>
