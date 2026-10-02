<script lang="ts">
  // Credits and sources (#66): datasets, assets, fonts and libraries shipped in the app, with
  // their licences and required credit lines (packages/content/fr/credits.json), app version.
  import { onMount } from "svelte";
  import { _ } from "@asteria/ui";
  import { CREDIT_SECTIONS, credits } from "@asteria/content/credits";

  let { onclose }: { onclose: () => void } = $props();

  const REPO_URL = "https://github.com/splatch17/asteria";
  const VERSION = import.meta.env.APP_VERSION;
  const COMMIT = import.meta.env.APP_COMMIT;
  const LICENSES_URL = `${import.meta.env.BASE_URL}THIRD-PARTY-LICENSES.txt`;
  const sections = credits("fr");
  const pad = (i: number) => String(i).padStart(2, "0");
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, "");

  let dialog: HTMLElement;
  let closeButton: HTMLButtonElement;

  onMount(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.focus();
    return () => previous?.focus?.();
  });

  /** Escape closes; Tab cycles inside the dialog (it covers the whole screen). */
  function onkeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the sheets below also close on Escape
      onclose();
      return;
    }
    if (e.key !== "Tab") return;
    const focusable = [...dialog.querySelectorAll<HTMLElement>("a[href], button")];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  }
</script>

<div
  class="credits"
  role="dialog"
  aria-modal="true"
  aria-labelledby="credits-title"
  tabindex="-1"
  bind:this={dialog}
  {onkeydown}
>
  <header class="head">
    <div>
      <p class="meta">#00 // {$_("app.name")}</p>
      <h1 id="credits-title">{$_("credits.title")}</h1>
    </div>
    <button class="close" bind:this={closeButton} onclick={onclose} aria-label={$_("credits.close")}
      >×</button
    >
  </header>

  <div class="scroll">
    <p class="intro">{$_("credits.intro")}</p>

    {#each CREDIT_SECTIONS as section, i (section)}
      <section aria-labelledby={`credits-${section}`}>
        <h2 id={`credits-${section}`}>#{pad(i + 1)} // {$_(`credits.section.${section}`)}</h2>
        <ul>
          {#each sections[section] as entry (entry.id)}
            <li class="entry">
              <h3>{entry.name}</h3>
              <p class="role">{entry.role}</p>
              <dl>
                <dt>{$_("credits.author")}</dt>
                <dd>{entry.author}</dd>
                <dt>{$_("credits.license")}</dt>
                <dd>
                  <a href={entry.licenseUrl} target="_blank" rel="noopener noreferrer"
                    >{entry.license}</a
                  >
                </dd>
                <dt>{$_("credits.source")}</dt>
                <dd>
                  <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer"
                    >{host(entry.sourceUrl)}</a
                  >
                </dd>
              </dl>
              <p class="notice">{entry.notice}</p>
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <section aria-labelledby="credits-app">
      <h2 id="credits-app">
        #{pad(CREDIT_SECTIONS.length + 1)} // {$_("credits.section.app")}
      </h2>
      <div class="entry app">
        <h3>{$_("app.name")}</h3>
        <p class="role">{$_("app.tagline")}</p>
        <dl>
          <dt>{$_("credits.versionLabel")}</dt>
          <dd>
            {COMMIT
              ? $_("credits.versionCommit", { values: { version: VERSION, commit: COMMIT } })
              : VERSION}
          </dd>
          <dt>{$_("credits.code")}</dt>
          <dd>{$_("credits.appLicense")}</dd>
        </dl>
        <p class="links">
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">{$_("credits.repo")} ↗</a>
          <a href={LICENSES_URL} target="_blank" rel="noopener noreferrer"
            >{$_("credits.licensesFile")} ↗</a
          >
        </p>
      </div>
    </section>
  </div>
</div>

<style>
  .credits {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    flex-direction: column;
    background: var(--ast-bg);
    color: var(--ast-fg);
    outline: none;
    padding: max(16px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right))
      max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
    box-sizing: border-box;
    animation: fade 160ms var(--ast-ease-out);
  }
  @keyframes fade {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .credits {
      animation: none;
    }
  }
  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--ast-hairline);
  }
  .meta,
  h2,
  dt {
    font: 500 9px/1.4 var(--ast-font-mono);
    letter-spacing: var(--ast-tracking-meta);
    text-transform: uppercase;
    color: var(--ast-fg-muted);
  }
  .meta {
    margin: 0 0 4px;
  }
  h1 {
    margin: 0;
    font: 700 30px/1 var(--ast-font-display);
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
  .close {
    flex: none;
    width: 44px;
    height: 44px;
    margin: -6px -10px 0 0;
    font: 400 24px/1 var(--ast-font-mono);
    color: var(--ast-fg);
    background: transparent;
    border: 0;
    border-radius: var(--ast-radius);
    cursor: pointer;
  }
  .close:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: -6px;
  }
  a:focus-visible {
    outline: 1px solid var(--ast-fg);
    outline-offset: 2px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    width: 100%;
    max-width: 640px;
    margin: 0 auto;
  }
  .intro {
    margin: 14px 0 4px;
    font: 400 12px/1.55 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  section {
    margin-top: 22px;
  }
  h2 {
    margin: 0 0 6px;
    color: var(--ast-fg);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .entry {
    padding: 12px 0;
    border-top: 1px solid var(--ast-hairline);
  }
  h3 {
    margin: 0 0 4px;
    font: 700 12px/1.35 var(--ast-font-mono);
    letter-spacing: 0.04em;
  }
  .role {
    margin: 0 0 8px;
    font: 400 11px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 3px 12px;
    margin: 0;
    font: 400 11px/1.45 var(--ast-font-mono);
  }
  dt {
    line-height: 1.6;
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  a {
    color: var(--ast-fg);
    text-decoration: underline;
    text-decoration-color: var(--ast-hairline);
    text-underline-offset: 3px;
  }
  .notice {
    margin: 8px 0 0;
    font: 400 10px/1.5 var(--ast-font-mono);
    color: var(--ast-fg-muted);
    overflow-wrap: anywhere;
  }
  .links {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 10px 0 0;
    font: 500 11px/1.4 var(--ast-font-mono);
  }
  .links a {
    display: flex;
    align-items: center;
    min-height: 40px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
