<script lang="ts" module>
  /** One point of a pass, as the panel shows it. */
  export interface IssPassPoint {
    date: Date;
    azimuth: number;
    altitude: number;
  }
  export interface IssPassView {
    rise: number;
    set: number;
    visible: { start: IssPassPoint; max: IssPassPoint; end: IssPassPoint };
  }
  export interface IssNow {
    altitude: number;
    azimuth: number;
    rangeKm: number;
    heightKm: number;
    sunlit: boolean;
  }
  export interface IssOrbit {
    epoch: Date;
    /** Days from the epoch to the displayed date (signed). */
    ageDays: number;
    freshness: "fresh" | "aging" | "stale";
    fetchedAt: Date;
    noradId: number;
    inclination: number;
    periodMin: number;
    perigeeKm: number;
    apogeeKm: number;
  }
</script>

<script lang="ts">
  // Sheet of the ISS (#12): where it is now, its next visible passes, its orbit. Three levels:
  // Découverte = one sentence (when, where to look) and two facts; Amateur = the passes, start,
  // highest point and end with directions; Expert = the same plus the orbit and its age.
  import { _, locale } from "@asteria/ui";
  import type { FigureLevel } from "@asteria/sky-renderer";
  import InfoPanel, { type InfoRow } from "./InfoPanel.svelte";
  import { PASS_DAYS, compassPoint, passWhen } from "../lib/iss";

  let {
    level,
    now,
    state: status,
    orbit,
    look,
    passes,
    shownPass,
    bottom,
    onpass,
    onclose,
  }: {
    level: FigureLevel;
    /** Displayed date. */
    now: Date;
    state: "loading" | "failed" | "ready";
    orbit: IssOrbit | null;
    look: IssNow | null;
    /** Visible passes from now on (at most a few). */
    passes: IssPassView[];
    /** `rise` of the pass whose track is drawn. */
    shownPass: number | null;
    bottom: string;
    onpass: (rise: number) => void;
    onclose: () => void;
  } = $props();

  const lang = $derived($locale ?? "fr");
  const time = (d: Date) =>
    $_("iss.time", {
      values: { h: d.getHours(), m: String(d.getMinutes()).padStart(2, "0") },
    });
  const dayFormat = $derived(
    new Intl.DateTimeFormat(lang, { weekday: "short", day: "numeric", month: "short" }),
  );
  const weekday = $derived(new Intl.DateTimeFormat(lang, { weekday: "long" }));
  const dateTime = $derived(
    new Intl.DateTimeFormat(lang, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
  );
  const cardinals = $derived($_("map.cardinals").split(","));
  const short = (az: number) => cardinals[compassPoint(az)] ?? "";
  const fixed = (x: number, digits: number) =>
    new Intl.NumberFormat(lang, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(x);

  const usable = $derived(status === "ready" && orbit !== null && orbit.freshness !== "stale");

  /** The Découverte sentence: now, or the next visible pass. */
  const sentence = $derived.by(() => {
    if (!usable) return "";
    if (look && look.altitude > 0) {
      if (!look.sunlit) return $_("iss.discovery.nowShadow");
      const height = look.altitude < 20 ? "low" : look.altitude < 60 ? "mid" : ("high" as const);
      return $_("iss.discovery.now", {
        values: {
          dir: $_(`compass.dir.${compassPoint(look.azimuth)}`),
          height: $_(`iss.height.${height}`),
        },
      });
    }
    const next = passes.find((p) => p.visible.start.date.getTime() >= now.getTime());
    if (!next) return $_("iss.discovery.none", { values: { days: PASS_DAYS } });
    const start = next.visible.start.date;
    const w = passWhen(start.getTime(), now.getTime());
    const eve = new Date(start.getTime() - 86_400_000);
    return $_("iss.discovery.next", {
      values: {
        when: $_(`iss.when.${w.day}.${w.part}`, {
          values: { day: weekday.format(start), eve: weekday.format(eve) },
        }),
        time: time(start),
        // Where it appears; the highest point when it appears already high (out of the shadow).
        dir: $_(`compass.dir.${compassPoint(next.visible.start.azimuth)}`),
      },
    });
  });

  const nowRows = $derived.by((): InfoRow[] => {
    if (!usable || !look || level === "discovery") return [];
    const rows: InfoRow[] = [
      { label: $_("body.altitude"), value: `${fixed(look.altitude, 1)}°` },
      { label: $_("body.azimuth"), value: `${fixed(look.azimuth, 1)}° · ${short(look.azimuth)}` },
      {
        label: $_("data.dist"),
        value: $_("body.distance", { values: { km: Math.round(look.rangeKm) } }),
      },
    ];
    if (level === "expert")
      rows.push({
        label: $_("iss.now.height"),
        value: $_("iss.now.altitudeKm", { values: { km: Math.round(look.heightKm) } }),
      });
    return rows;
  });

  const orbitRows = $derived.by((): InfoRow[] => {
    if (!orbit || level !== "expert") return [];
    return [
      { label: $_("iss.orbit.epoch"), value: dateTime.format(orbit.epoch) },
      {
        label: $_("iss.orbit.age"),
        value: $_("iss.orbit.ageValue", { values: { days: fixed(orbit.ageDays, 1) } }),
      },
      { label: $_("iss.orbit.inclination"), value: `${fixed(orbit.inclination, 2)}°` },
      {
        label: $_("iss.orbit.period"),
        value: $_("iss.orbit.periodValue", { values: { min: fixed(orbit.periodMin, 1) } }),
      },
      {
        label: $_("iss.orbit.perigee"),
        value: $_("iss.now.altitudeKm", { values: { km: Math.round(orbit.perigeeKm) } }),
      },
      {
        label: $_("iss.orbit.apogee"),
        value: $_("iss.now.altitudeKm", { values: { km: Math.round(orbit.apogeeKm) } }),
      },
    ];
  });

  const shownPasses = $derived(passes.slice(0, level === "discovery" ? 0 : 5));
  const point = (p: IssPassPoint) =>
    $_("iss.pass.point", {
      values: { time: time(p.date), dir: short(p.azimuth), alt: Math.round(p.altitude) },
    });
</script>

<InfoPanel
  name={$_("iss.name")}
  belowHorizon={usable && level !== "discovery" && look !== null && look.altitude < 0}
  rows={nowRows}
  {bottom}
  {onclose}
>
  {#snippet meta()}
    {level === "expert" && orbit
      ? $_("iss.kindExpert", { values: { id: orbit.noradId } })
      : $_("iss.fullName")}
  {/snippet}
  {#if status === "loading"}
    <p class="text">{$_("iss.loading")}</p>
  {:else if status === "failed" || !orbit}
    <p class="text">{$_("iss.unavailable")}</p>
  {:else if orbit.freshness === "stale"}
    <p class="text">{$_("iss.stale", { values: { date: dateTime.format(orbit.epoch) } })}</p>
  {:else}
    {#if sentence}<p class="lead">{sentence}</p>{/if}
    {#if look && look.altitude > 0 && level !== "discovery"}
      <p class="state">{look.sunlit ? $_("iss.now.lit") : $_("iss.now.shadow")}</p>
    {/if}
    {#if level === "discovery"}
      <p class="text">{$_("iss.discovery.look")}</p>
      <p class="text">
        {$_("iss.discovery.fact", {
          values: { min: Math.round(orbit.periodMin), km: Math.round(orbit.perigeeKm / 10) * 10 },
        })}
      </p>
    {:else}
      <section class="passes" aria-labelledby="iss-passes">
        <h3 id="iss-passes" class="panel-title">{$_("iss.passes.title")}</h3>
        {#if shownPasses.length === 0}
          <p class="text">{$_("iss.passes.empty", { values: { days: PASS_DAYS } })}</p>
        {:else}
          <ul>
            {#each shownPasses as p (p.rise)}
              <li>
                <button
                  class="pass"
                  class:shown={p.rise === shownPass}
                  aria-pressed={p.rise === shownPass}
                  aria-label={$_("iss.pass.show", {
                    values: { date: dayFormat.format(p.visible.start.date) },
                  })}
                  onclick={() => onpass(p.rise)}
                >
                  <span class="day">{dayFormat.format(p.visible.start.date)}</span>
                  <span class="cells">
                    <span><i>{$_("iss.pass.start")}</i>{point(p.visible.start)}</span>
                    <span><i>{$_("iss.pass.max")}</i>{point(p.visible.max)}</span>
                    <span><i>{$_("iss.pass.end")}</i>{point(p.visible.end)}</span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
        <p class="note">{$_("iss.passes.hint")}</p>
      </section>
    {/if}
    {#if orbitRows.length}
      <section class="orbit" aria-labelledby="iss-orbit">
        <h3 id="iss-orbit" class="panel-title">{$_("iss.orbit.title")}</h3>
        <dl>
          {#each orbitRows as row (row.label)}
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          {/each}
        </dl>
      </section>
    {/if}
    {#if orbit.freshness === "aging"}
      <p class="warn">
        {$_("iss.aging", { values: { days: Math.round(Math.abs(orbit.ageDays)) } })}
      </p>
    {/if}
  {/if}
  {#if orbit && status === "ready"}
    <!-- Credit to the source of the elements, at every level (docs/DATA_SOURCES.md). -->
    <p class="note">
      {level === "discovery"
        ? $_("iss.credit")
        : $_("iss.orbit.source", { values: { date: dateTime.format(orbit.fetchedAt) } })}
    </p>
  {/if}
</InfoPanel>

<style>
  p {
    margin: 0;
  }
  .lead {
    margin: 0 0 8px;
    font: 400 15px/1.35 var(--ast-font-serif);
    color: var(--ast-fg);
  }
  .text,
  .state {
    margin: 0 0 6px;
    font: 400 12px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .state {
    font-size: 11px;
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
  }
  .passes,
  .orbit {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--ast-hairline);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-top: 1px solid color-mix(in srgb, var(--ast-hairline) 60%, transparent);
  }
  .pass {
    display: grid;
    grid-template-columns: 1fr;
    gap: 2px;
    width: 100%;
    min-height: 44px;
    padding: 6px 0;
    text-align: left;
    font: 400 11px/1.5 var(--ast-font-mono);
    letter-spacing: 0.04em;
    color: var(--ast-fg-muted);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
    font-variant-numeric: tabular-nums;
  }
  .pass.shown {
    color: var(--ast-fg);
  }
  .pass.shown .day::before {
    content: "▸ ";
  }
  .pass:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .day {
    text-transform: uppercase;
    letter-spacing: var(--ast-tracking-meta);
    color: var(--ast-fg);
  }
  .cells {
    display: grid;
    gap: 0;
  }
  .cells > span {
    display: grid;
    grid-template-columns: 11.5ch 1fr;
  }
  .cells i {
    font-style: normal;
    text-transform: uppercase;
    font-size: 10px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 0 12px;
    margin: 0;
    font: 11px/1.7 var(--ast-font-mono);
    letter-spacing: 0.06em;
    color: var(--ast-fg-muted);
  }
  dt {
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin-top: 8px;
    font: 400 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  .warn {
    margin-top: 8px;
    font: 500 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg);
  }
</style>
