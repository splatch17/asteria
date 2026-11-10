<script lang="ts">
  // The place picker (review of 2026-11-09, point 5): one field for a city's name or for
  // coordinates typed by hand, and the matches under it, the largest city first (lib/cities,
  // Natural Earth, public domain; the list is fetched when the picker opens). Used by Réglages ›
  // Lieu et temps and by the first-launch welcome. Without the list (offline before it was ever
  // fetched), coordinates still work.
  import { onMount } from "svelte";
  import { _, locale } from "@asteria/ui";
  import {
    countryName,
    loadCityIndex,
    parseCoordinates,
    searchCities,
    type City,
    type CityIndex,
  } from "../lib/cities";
  import { placeParts } from "../lib/format";
  import type { Place } from "../lib/place";

  let {
    onpick,
    autofocus = true,
  }: {
    onpick: (place: Place) => void;
    autofocus?: boolean;
  } = $props();

  let input: HTMLInputElement;
  let query = $state("");
  let index = $state<CityIndex | null>(null);
  let failed = $state(false);

  onMount(() => {
    loadCityIndex().then(
      (i) => (index = i),
      () => (failed = true),
    );
    if (autofocus) input.focus({ preventScroll: true });
  });

  const lang = $derived($locale ?? "fr");
  const typed = $derived(parseCoordinates(query));
  const results = $derived(index && !typed ? searchCities(index, query, 6) : []);

  const coordsText = (latitude: number, longitude: number) => {
    const p = placeParts(latitude, longitude, lang);
    return $_("geo.place", {
      values: { lat: p.lat, ns: $_(`geo.${p.ns}`), lon: p.lon, ew: $_(`geo.${p.ew}`) },
    });
  };
  const whereText = (c: City) =>
    [c.region, countryName(c.country, lang)].filter(Boolean).join(", ");

  function pickCity(c: City) {
    onpick({ name: "city", label: c.name, latitude: c.latitude, longitude: c.longitude });
  }
  function pickCoords() {
    if (typed) onpick({ name: "custom", ...typed });
  }
  /** Enter takes the first proposal. */
  function onsubmit(e: SubmitEvent) {
    e.preventDefault();
    if (typed) pickCoords();
    else if (results[0]) pickCity(results[0]);
  }
</script>

<form class="picker" role="search" {onsubmit}>
  <label class="sr-only" for="city-field">{$_("place.pick.label")}</label>
  <input
    id="city-field"
    bind:this={input}
    bind:value={query}
    type="search"
    inputmode="search"
    enterkeyhint="go"
    autocomplete="off"
    autocapitalize="words"
    spellcheck="false"
    placeholder={$_("place.pick.field")}
    aria-controls="city-results"
  />
  <div id="city-results" class="results" aria-live="polite">
    {#if typed}
      <button type="button" class="result" data-city="coords" onclick={pickCoords}>
        <span class="name">{coordsText(typed.latitude, typed.longitude)}</span>
        <span class="where">{$_("place.pick.coords")}</span>
      </button>
    {:else if !query.trim()}
      <p class="hint">{$_(failed ? "place.pick.error" : "place.pick.hint")}</p>
    {:else if failed}
      <p class="hint">{$_("place.pick.error")}</p>
    {:else if !index}
      <p class="hint">{$_("place.pick.loading")}</p>
    {:else if results.length}
      <ul>
        {#each results as c (`${c.name}|${c.country}|${c.latitude}|${c.longitude}`)}
          <li>
            <button type="button" class="result" data-city={c.name} onclick={() => pickCity(c)}>
              <span class="name">{c.name}</span>
              <span class="where">{whereText(c)}</span>
              <span class="coords">{coordsText(c.latitude, c.longitude)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">{$_("place.pick.none")}</p>
    {/if}
  </div>
</form>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* The em of the container query below follows the text size. */
    container: picker / inline-size;
    font-size: var(--ast-fs-s);
  }
  /* Short of room (narrow screen, large text): the name and the country, without the position. */
  @container picker (max-width: 24em) {
    .coords {
      display: none;
    }
  }
  input {
    width: 100%;
    height: 48px;
    padding: 0 12px;
    border: 1px solid var(--ast-control-border);
    border-radius: var(--ast-radius);
    background: color-mix(in srgb, var(--ast-fg) 5%, transparent);
    color: var(--ast-fg);
    /* 16 px: iOS zooms into a smaller field. */
    font: 400 16px/1 var(--ast-font-mono);
  }
  input::placeholder {
    color: var(--ast-fg-muted);
  }
  input:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  input::-webkit-search-cancel-button {
    display: none;
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
  .result {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 2px 10px;
    width: 100%;
    min-height: 48px;
    padding: 7px 12px;
    border: 0;
    border-radius: var(--ast-radius);
    background: transparent;
    color: var(--ast-fg);
    text-align: left;
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }
  .results > .result {
    border: 1px solid var(--ast-control-border);
  }
  .result:active {
    background: color-mix(in srgb, var(--ast-fg) 12%, transparent);
  }
  .result:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -3px;
  }
  @media (hover: hover) {
    .result:hover {
      background: color-mix(in srgb, var(--ast-fg) 7%, transparent);
    }
  }
  .name {
    grid-column: 1;
    font: 700 17px/1.15 var(--ast-font-display);
    letter-spacing: 0.02em;
  }
  .where {
    grid-column: 1;
    font: 400 var(--ast-fs-s)/1.3 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .coords {
    grid-column: 2;
    grid-row: 1 / span 2;
    align-self: center;
    font: 400 var(--ast-fs-xs)/1 var(--ast-font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ast-fg-muted);
    white-space: nowrap;
  }
  .hint {
    margin: 0 2px;
    font: 400 var(--ast-fs-s)/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
</style>
