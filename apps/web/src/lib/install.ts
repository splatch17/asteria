/**
 * Installing the app (#160). Android browsers offer « Installer l'appli » themselves; iOS has no
 * prompt, the app is added from Safari's share menu. The settings show that path on iOS only,
 * until the app runs from the home screen.
 */

/** iPhone, iPod or iPad (iPadOS presents itself as a Mac with a touch screen). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true;
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
}

/** The app runs from the home screen rather than in a browser tab. */
export function isStandalone(displayModeStandalone: boolean, iosStandalone?: boolean): boolean {
  return displayModeStandalone || iosStandalone === true;
}

/** Show the « Sur l'écran d'accueil » hint: iOS, in the browser. */
export function needsIosInstallHint(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  const installed = isStandalone(
    matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches,
    nav.standalone,
  );
  return isIos(nav.userAgent, nav.maxTouchPoints ?? 0) && !installed;
}
