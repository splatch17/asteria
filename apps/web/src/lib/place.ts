/**
 * Where the sky is seen from. Four kinds of place: the default (Paris, until the player says
 * where they are), their own position (geolocation), a city chosen in the list (lib/cities), or
 * coordinates typed by hand. Stored under `asteria.place`; the records written before the city
 * picker ({ name: "mine" | null, latitude, longitude }) are read as they are.
 */
export type PlaceKind = null | "mine" | "city" | "custom";

export interface Place {
  /** null = the default city (its name is translated at render time). */
  name: PlaceKind;
  /** A city's name (« Lyon »). */
  label?: string;
  latitude: number;
  longitude: number;
}

export const PLACE_KEY = "asteria.place";
export const DEFAULT_PLACE: Place = { name: null, latitude: 48.8566, longitude: 2.3522 };

const inRange = (latitude: unknown, longitude: unknown): boolean =>
  typeof latitude === "number" &&
  typeof longitude === "number" &&
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  Math.abs(latitude) <= 90 &&
  Math.abs(longitude) <= 180;

/** A stored record as a place, or null when it is not one. */
export function toPlace(saved: unknown): Place | null {
  if (typeof saved !== "object" || saved === null) return null;
  const { name, label, latitude, longitude } = saved as Record<string, unknown>;
  if (!inRange(latitude, longitude)) return null;
  const at = { latitude: latitude as number, longitude: longitude as number };
  if (name === null || name === undefined) return { name: null, ...at };
  if (name === "mine") return { name: "mine", ...at };
  if (name === "city" && typeof label === "string" && label.trim())
    return { name: "city", label: label.trim().slice(0, 80), ...at };
  // A city without its name, or a kind this version does not know: the coordinates still hold.
  return { name: "custom", ...at };
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadPlace(store: Store | null): Place {
  try {
    const raw = store?.getItem(PLACE_KEY) ?? null;
    return (raw === null ? null : toPlace(JSON.parse(raw))) ?? DEFAULT_PLACE;
  } catch {
    return DEFAULT_PLACE;
  }
}

export function savePlace(store: Store | null, place: Place): void {
  try {
    store?.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // not persisted: acceptable
  }
}

/**
 * Whether a place is far enough east or west of the device's time zone for its clock to mislead:
 * the hours shown are the device's, so a sky chosen for Sydney from Paris is 9 hours off the
 * local evening. Compares the place's mean solar time (longitude / 15) with the device's UTC
 * offset (`timezoneOffsetMinutes` as Date.getTimezoneOffset gives it, west positive); more than
 * `hours` apart, on the shorter way round the globe.
 */
export function farFromDeviceClock(
  longitude: number,
  timezoneOffsetMinutes: number,
  hours = 2.5,
): boolean {
  const solar = longitude / 15;
  const device = -timezoneOffsetMinutes / 60;
  const apart = Math.abs(((((solar - device) % 24) + 36) % 24) - 12);
  return apart > hours;
}

/** Whether the player said where they are (anything but the default city). */
export const isChosenPlace = (place: Place): boolean => place.name !== null;
