/** Names of the line icons drawn by components/Icon.svelte. */
export const ICON_NAMES = [
  "play",
  "pause",
  "now",
  "lines",
  "night",
  "range",
  "earth",
  "sky",
  "planets",
  "paths",
  "layers",
  "conNames",
  "starNames",
  "eqGrid",
  "azGrid",
  "ecliptic",
  "seeThrough",
  "fullscreen",
  "fullscreenExit",
  "realistic",
  "locate",
  "aim",
  "expand",
  "collapse",
  // Library (#90)
  "library",
  "back",
  "search",
  "catalog",
  "story",
  "games",
  "explore",
  "target",
  "sun",
  "moon",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

export const isIconName = (name: string): name is IconName =>
  (ICON_NAMES as readonly string[]).includes(name);
