/**
 * Constellation stories (#10, #61): one Markdown file per constellation in `<lang>/constellations/`
 * (format in fr/constellations/README.md). Files are bundled as separate chunks and loaded on
 * demand: only the opened constellation's story is fetched.
 */
import type { ContentLocale } from "./index";

export interface StorySource {
  title: string;
  url: string;
  license: string;
}

export interface ConstellationStory {
  /** IAU abbreviation, e.g. "Ori". */
  id: string;
  sources: StorySource[];
  /** "## Histoire": paragraphs (Découverte level). */
  story: string[];
  /** "## Anecdotes": the bullets, without their dash. */
  anecdotes: string[];
}

/** A run of inline text; `italic` comes from Markdown `*…*` (foreign words, titles). */
export interface InlineSegment {
  text: string;
  italic: boolean;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, "$1");

/**
 * Parses a story file. Only the subset used by the content files is understood: a frontmatter with
 * `id` and a list of flat `{ title, url, license }` sources, then `##` sections of paragraphs or
 * `- ` bullets. Throws on a missing frontmatter or id.
 */
export function parseConstellationStory(markdown: string): ConstellationStory {
  const text = markdown.replace(/\r\n/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error("missing frontmatter");
  let id = "";
  const sources: Partial<StorySource>[] = [];
  let current: Partial<StorySource> | undefined;
  for (const line of fm[1]!.split("\n")) {
    const idMatch = /^id:\s*(.+)$/.exec(line);
    if (idMatch) id = unquote(idMatch[1]!);
    const field = /^\s{2}(?:- )?\s*(title|url|license):\s*(.+)$/.exec(line);
    if (!field) continue;
    if (/^\s{2}- /.test(line)) sources.push((current = {}));
    if (current) current[field[1] as keyof StorySource] = unquote(field[2]!);
  }
  if (!id) throw new Error("missing id");

  const sections = new Map<string, string>();
  for (const part of text.slice(fm[0].length).split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  const paragraphs = (s = "") =>
    s
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
      .filter(Boolean);
  const bullets = (s = "") =>
    s
      .split(/\n(?=- )/)
      .map((b) =>
        b
          .replace(/^- /, "")
          .replace(/\s*\n\s*/g, " ")
          .trim(),
      )
      .filter(Boolean);

  return {
    id,
    sources: sources.filter((s): s is StorySource => !!(s.title && s.url && s.license)),
    story: paragraphs(sections.get("Histoire")),
    anecdotes: bullets(sections.get("Anecdotes")),
  };
}

/**
 * Splits text on Markdown emphasis `*…*`. A lone asterisk (as in "Sagittarius A*") stays literal:
 * emphasis must open before a non-space and close after one, on the same line.
 */
export function inlineSegments(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const re = /\*(\S(?:[^*\n]*\S)?)\*/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), italic: false });
    out.push({ text: m[1]!, italic: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), italic: false });
  return out;
}

// One lazy chunk per file. Keys look like "../fr/constellations/Ori.md". The README exclusion is
// relative to this file: "!**/README.md" is matched against root-relative paths, and from
// apps/web the files sit under "../../packages/…", which "**" does not cross, so the README was
// bundled and listed as a story (#67).
const FILES: Record<ContentLocale, Record<string, () => Promise<string>>> = {
  fr: import.meta.glob<string>(["../fr/constellations/*.md", "!../fr/constellations/README.md"], {
    query: "?raw",
    import: "default",
  }),
};

const abbrOf = (path: string) => /([^/]+)\.md$/.exec(path)![1]!;

/** Abbreviations of the constellations that have a story in this locale (no loading involved). */
export function storyIds(locale: ContentLocale): string[] {
  return Object.keys(FILES[locale]).map(abbrOf).sort();
}

export function hasConstellationStory(locale: ContentLocale, abbr: string): boolean {
  return storyIds(locale).includes(abbr);
}

const cache = new Map<string, Promise<ConstellationStory | null>>();

/** Loads and parses a story; null when the constellation has none. Results are cached. */
export function loadConstellationStory(
  locale: ContentLocale,
  abbr: string,
): Promise<ConstellationStory | null> {
  const key = `${locale}/${abbr}`;
  let story = cache.get(key);
  if (!story) {
    const entry = Object.entries(FILES[locale]).find(([path]) => abbrOf(path) === abbr);
    story = entry ? entry[1]().then(parseConstellationStory) : Promise.resolve(null);
    // A failed load (offline chunk) can be retried later.
    story.catch(() => cache.delete(key));
    cache.set(key, story);
  }
  return story;
}
