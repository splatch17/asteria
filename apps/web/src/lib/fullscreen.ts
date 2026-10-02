/**
 * Fullscreen (#59): Fullscreen API on the whole document, hidden where it cannot work
 * (iPhone Safari has no element fullscreen) and where the app already fills the screen
 * (installed PWA with `display: fullscreen`).
 */

export const FULLSCREEN_STORAGE_KEY = "asteria.fullscreen";

export interface FullscreenEnvironment {
  /** `document.fullscreenEnabled` and `requestFullscreen` exist. */
  enabled: boolean;
  /** Currently in API fullscreen (`document.fullscreenElement`). */
  active: boolean;
  /** `(display-mode: fullscreen)` matched outside API fullscreen: installed app. */
  installedFullscreen: boolean;
}

/** Whether to show the fullscreen button. */
export function showFullscreenButton(env: FullscreenEnvironment): boolean {
  if (env.active) return true; // always offer the way out
  return env.enabled && !env.installedFullscreen;
}

/**
 * Browsers only enter fullscreen on a user gesture: a remembered preference is restored on the
 * first tap of the session, if the button would be shown and we are not already there.
 */
export function shouldRestoreFullscreen(remembered: boolean, env: FullscreenEnvironment): boolean {
  return remembered && !env.active && showFullscreenButton(env);
}

export function readFullscreenEnvironment(): FullscreenEnvironment {
  const doc = document as Document & { webkitFullscreenEnabled?: boolean };
  const active = !!document.fullscreenElement;
  return {
    enabled:
      !!(document.fullscreenEnabled ?? doc.webkitFullscreenEnabled) &&
      typeof document.documentElement.requestFullscreen === "function",
    active,
    installedFullscreen: !active && matchMedia("(display-mode: fullscreen)").matches,
  };
}

export async function enterFullscreen(): Promise<boolean> {
  try {
    // navigationUI "hide": Android hides the system navigation bar as well.
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    return true;
  } catch {
    return false;
  }
}

export async function exitFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
  } catch {
    // already out (e.g. the system back gesture won the race)
  }
}
