import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hasConstellationStory,
  inlineSegments,
  loadConstellationStory,
  parseConstellationStory,
  storyIds,
} from "./stories";
import { CONSTELLATION_LATIN } from "./index";

// Issue #10: zodiac constellations + Orion, Ursa Major, Cassiopeia.
const IDS = [
  "Ari",
  "Tau",
  "Gem",
  "Cnc",
  "Leo",
  "Vir",
  "Lib",
  "Sco",
  "Sgr",
  "Cap",
  "Aqr",
  "Psc",
  "Ori",
  "UMa",
  "Cas",
] as const;

const DIR = new URL("../fr/constellations/", import.meta.url);
const read = (id: string) => readFileSync(fileURLToPath(new URL(`${id}.md`, DIR)), "utf8");

describe.each(IDS)("constellation story %s", (id) => {
  const story = parseConstellationStory(read(id));

  it("has a frontmatter with the matching id", () => {
    expect(story.id).toBe(id);
  });

  it("lists at least one source with url and license", () => {
    expect(story.sources.length).toBeGreaterThan(0);
    for (const source of story.sources) {
      expect(source.title).toBeTruthy();
      expect(source.url).toMatch(/^https?:\/\//);
      expect(source.license).toBeTruthy();
    }
    expect(story.sources.some((s) => s.url.startsWith("https://fr.wikipedia.org/"))).toBe(true);
  });

  it("has a non-empty story, in paragraphs without line breaks", () => {
    expect(story.story.length).toBeGreaterThan(0);
    for (const p of story.story) expect(p).not.toMatch(/\n|^- /);
  });

  it("has exactly 3 anecdotes", () => {
    expect(story.anecdotes).toHaveLength(3);
    for (const a of story.anecdotes) expect(a).not.toMatch(/^- |\n/);
  });
});

describe("parseConstellationStory", () => {
  const md = [
    "---",
    "id: Xyz",
    "sources:",
    '  - title: "A — Wikipédia"',
    '    url: "https://fr.wikipedia.org/wiki/A"',
    '    license: "CC BY-SA 4.0"',
    "  - title: Incomplete",
    "---",
    "",
    "## Histoire",
    "",
    "First line",
    "continued.",
    "",
    "Second paragraph.",
    "",
    "## Anecdotes",
    "",
    "- One,",
    "  wrapped.",
    "- Two.",
    "",
  ].join("\r\n");

  it("joins wrapped lines, splits paragraphs and bullets, drops incomplete sources", () => {
    expect(parseConstellationStory(md)).toEqual({
      id: "Xyz",
      sources: [
        { title: "A — Wikipédia", url: "https://fr.wikipedia.org/wiki/A", license: "CC BY-SA 4.0" },
      ],
      story: ["First line continued.", "Second paragraph."],
      anecdotes: ["One, wrapped.", "Two."],
    });
  });

  it("rejects a file without frontmatter or id", () => {
    expect(() => parseConstellationStory("## Histoire\n\nx")).toThrow();
    expect(() => parseConstellationStory("---\nsources:\n---\n")).toThrow();
  });
});

describe("inlineSegments", () => {
  it("turns *…* into italic runs", () => {
    expect(inlineSegments("nom *al-ḥamal*, « l'agneau »")).toEqual([
      { text: "nom ", italic: false },
      { text: "al-ḥamal", italic: true },
      { text: ", « l'agneau »", italic: false },
    ]);
  });

  it("keeps a lone asterisk literal (Sagittarius A*)", () => {
    const text = "Là se cache Sagittarius A*, un trou noir.";
    expect(inlineSegments(text)).toEqual([{ text, italic: false }]);
  });
});

describe("story loading", () => {
  it("knows the 15 stories without loading them, all valid IAU abbreviations", () => {
    expect(storyIds("fr")).toEqual([...IDS].sort());
    for (const id of storyIds("fr")) expect(CONSTELLATION_LATIN[id]).toBeTruthy();
    expect(hasConstellationStory("fr", "Ori")).toBe(true);
    expect(hasConstellationStory("fr", "And")).toBe(false);
  });

  it('excludes the README with a pattern relative to stories.ts (not "**/", see #67)', () => {
    expect(storyIds("fr")).not.toContain("README");
    const source = readFileSync(fileURLToPath(new URL("./stories.ts", import.meta.url)), "utf8");
    const globs = [...source.matchAll(/import\.meta\.glob<string>\(\[([^\]]*)\]/g)];
    expect(globs.length).toBeGreaterThan(0);
    for (const [, patterns] of globs) {
      expect(patterns).toContain('"!../fr/constellations/README.md"');
      expect(patterns).not.toMatch(/"!\*\*/);
    }
  });

  it("loads and parses a story on demand, null when there is none", async () => {
    const ori = await loadConstellationStory("fr", "Ori");
    expect(ori?.id).toBe("Ori");
    expect(ori?.anecdotes).toHaveLength(3);
    expect(await loadConstellationStory("fr", "And")).toBeNull();
  });
});
