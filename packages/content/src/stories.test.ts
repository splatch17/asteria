import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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

interface Source {
  title?: string;
  url?: string;
  license?: string;
}

interface Story {
  id?: string;
  sources: Source[];
  sections: Map<string, string>;
}

const unquote = (v: string) => v.trim().replace(/^"(.*)"$/, "$1");

/** Minimal parser for the frontmatter subset we use (id + list of flat source objects). */
function parse(markdown: string): Story {
  const text = markdown.replace(/\r\n/g, "\n");
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error("missing frontmatter");
  const story: Story = { sources: [], sections: new Map() };
  let current: Source | undefined;
  for (const line of fm[1]!.split("\n")) {
    const id = /^id:\s*(.+)$/.exec(line);
    if (id) story.id = unquote(id[1]!);
    const field = /^\s{2}(?:- )?\s*(title|url|license):\s*(.+)$/.exec(line);
    if (!field) continue;
    if (/^\s{2}- /.test(line)) {
      current = {};
      story.sources.push(current);
    }
    if (current) current[field[1] as keyof Source] = unquote(field[2]!);
  }
  const body = text.slice(fm[0].length);
  for (const part of body.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    story.sections.set(part.slice(0, nl).trim(), part.slice(nl + 1).trim());
  }
  return story;
}

describe.each(IDS)("constellation story %s", (id) => {
  const story = parse(readFileSync(fileURLToPath(new URL(`${id}.md`, DIR)), "utf8"));

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
    expect(story.sources.some((s) => s.url?.startsWith("https://fr.wikipedia.org/"))).toBe(true);
  });

  it("has a non-empty ## Histoire section", () => {
    expect(story.sections.get("Histoire")?.length ?? 0).toBeGreaterThan(0);
  });

  it("has exactly 3 bullets under ## Anecdotes", () => {
    const anecdotes = story.sections.get("Anecdotes") ?? "";
    expect(anecdotes.split("\n").filter((l) => /^- \S/.test(l))).toHaveLength(3);
  });
});
