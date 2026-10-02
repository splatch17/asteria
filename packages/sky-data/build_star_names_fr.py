"""Build the French common names of the IAU-named stars (packages/content/fr/star-names.json).

Sources (see docs/DATA_SOURCES.md):
  - IAU Catalog of Star Names (WGSN, IAU-CSN.txt, CC BY): official name, V magnitude, HIP number
  - Wikidata (CC0): French label, aliases and French Wikipedia article title of the item whose
    Hipparcos number (P528, qualifier catalog = Hipparcos Q537199) matches

Rule (reproducible, no hand-typed names):
  1. The French candidates are the frwiki article title without its parenthetical disambiguation
     ("Régulus (étoile)" -> "Régulus"), the French Wikidata label and the French aliases.
  2. A candidate is kept only if it is the IAU name with French diacritics added ("Bételgeuse"
     for Betelgeuse, "Véga" for Vega, "Saïph" for Saiph): identical once accents are removed,
     spaces and case included, so older spellings ("Al Na'ir") are not picked up. Other
     candidates are Bayer designations ("Alpha Centauri") or other names and are not used, unless
     listed in FRENCH_USAGE below with a documented reason.
  3. The output lists every star with V <= 3 (even when the name is unchanged) and every star
     whose French name differs from the IAU name.

Usage: python build_star_names_fr.py   (writes packages/content/fr/star-names.json and prints the
candidates that were rejected, for review)
"""

from __future__ import annotations

import json
import re
import sys
import unicodedata
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).parent))
from build_stars import IAU_CSN_URL, cached  # noqa: E402

ROOT = Path(__file__).parent
OUT = ROOT.parent / "content" / "fr" / "star-names.json"
MAG_ALWAYS = 3.0
WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"
USER_AGENT = "Asteria-sky-data/0.1 (https://github.com/splatch17/asteria)"

# French names that are not a respelling of the IAU name but are the established French usage,
# each with the reference that documents it. Keep this list short and justified.
FRENCH_USAGE: dict[int, tuple[str, str]] = {}


def parse_iau_csn_full(text: str) -> dict[int, tuple[str, float | None]]:
    """HIP -> (IAU name with diacritics, V magnitude or None)."""
    lines = text.splitlines()
    header = next(line for line in lines if line.startswith("#Name/ASCII"))
    start_diacritics = header.index("Name/Diacritics")
    start_designation = header.index("Designation")
    out: dict[int, tuple[str, float | None]] = {}
    for line in lines:
        if line.startswith(("#", "$")) or not line.strip():
            continue
        name = line[start_diacritics:start_designation].strip()
        fields = line[start_designation:].split()
        date_idx = next((i for i, f in enumerate(fields) if re.match(r"\d{4}-\d{2}-\d{2}$", f)), None)
        if date_idx is None or not fields[date_idx - 4].isdigit():
            continue
        try:
            mag = float(fields[date_idx - 6])
        except ValueError:
            mag = None
        out[int(fields[date_idx - 4])] = (name, mag)
    return out


def fold(name: str) -> str:
    """The name without its diacritics ("Bételgeuse" -> "Betelgeuse", "Saïph" -> "Saiph")."""
    decomposed = unicodedata.normalize("NFD", name)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


# Candidate priority: the frwiki article title is the most established usage, aliases the least.
PRIORITY = {"title": 0, "label": 1, "alias": 2}


def wikidata_french(hips: list[int]) -> dict[int, list[tuple[int, str]]]:
    """HIP -> French names of the matching Wikidata items as (priority, name): frwiki article
    title (without its parenthetical disambiguation), French label, French aliases."""
    values = " ".join(f'"HIP {h}"' for h in hips)
    query = f"""
SELECT ?hip ?kind ?name WHERE {{
  VALUES ?hip {{ {values} }}
  ?item p:P528 ?st . ?st ps:P528 ?hip ; pq:P972 wd:Q537199 .
  {{ ?item rdfs:label ?name BIND("label" AS ?kind) }}
  UNION {{ ?item skos:altLabel ?name BIND("alias" AS ?kind) }}
  UNION {{ ?a schema:about ?item ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?name
          BIND("title" AS ?kind) }}
  FILTER(lang(?name) = "fr")
}}"""
    resp = requests.post(
        WIKIDATA_SPARQL,
        data={"query": query, "format": "json"},
        headers={"User-Agent": USER_AGENT, "Accept": "application/sparql-results+json"},
        timeout=120,
    )
    resp.raise_for_status()
    out: dict[int, list[tuple[int, str]]] = {}
    for row in resp.json()["results"]["bindings"]:
        hip = int(row["hip"]["value"].removeprefix("HIP "))
        name = re.sub(r"\s*\(.*\)$", "", row["name"]["value"]).strip()
        out.setdefault(hip, []).append((PRIORITY[row["kind"]["value"]], name))
    return {hip: sorted(set(c)) for hip, c in out.items()}


def main() -> int:
    iau = parse_iau_csn_full(cached("IAU-CSN.txt", IAU_CSN_URL))  # UTF-8 (#75)
    candidates = wikidata_french(sorted(iau))
    names: dict[str, str] = {}
    rejected: list[str] = []
    for hip, (name, mag) in sorted(iau.items(), key=lambda kv: (kv[1][1] is None, kv[1][1] or 0)):
        fr = name
        found = [c for _, c in candidates.get(hip, [])]
        # Best-ranked candidate that is the IAU name or a respelling of it: when the frwiki
        # title is the plain IAU name ("Deneb"), an accented alias ("Déneb") is not used.
        same = next((c for c in found if fold(c) == fold(name)), None)
        if hip in FRENCH_USAGE:
            fr = FRENCH_USAGE[hip][0]
        elif same:
            fr = same
        elif mag is not None and mag <= MAG_ALWAYS and name not in found:
            rejected.append(f"HIP {hip}: {name} (V={mag}) -> {sorted(found)}")
        if fr != name or (mag is not None and mag <= MAG_ALWAYS):
            names[str(hip)] = fr
    doc = {
        "format": "asteria-star-names",
        "version": 1,
        "locale": "fr",
        "sources": [
            "IAU WGSN, IAU Catalog of Star Names (IAU-CSN.txt, 2022-04-04), CC BY",
            "Wikidata, French Wikipedia titles, labels and aliases by Hipparcos number, CC0",
        ],
        "names": names,
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    changed = sum(1 for h, n in names.items() if n != iau[int(h)][0])
    print(f"{len(names)} names written to {OUT} ({changed} differ from the IAU name)")
    print("V <= 3 stars whose IAU name is not among the French names (review for FRENCH_USAGE):")
    for line in rejected:
        print("  " + line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
