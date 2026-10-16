/**
 * Magnetic declination from the World Magnetic Model 2025 (WMM2025, NOAA NCEI / BGS; public
 * domain), valid 2025.0–2030.0. A phone compass points to magnetic north; the sky needs true
 * north: true heading = magnetic heading + declination (east positive). The difference is about
 * 1° in France but about −17° to −19° in French Guiana, enough to put the wrong stars on screen.
 *
 * Method: WMM2025 technical report (Chulliat et al., 2025), §1.2 — geodetic → geocentric
 * spherical coordinates on WGS 84, Schmidt semi-normalised associated Legendre functions,
 * field (X′, Y′, Z′) summed to degree 12, rotated back to the geodetic frame.
 * Tested against the official WMM2025 test values (see DATA_SOURCES.md).
 */

/** [n, m, g, h, ġ, ḣ]: Gauss coefficients (nT) at 2025.0 and their secular variation (nT/year). */
const WMM2025: readonly (readonly [number, number, number, number, number, number])[] = [
  [1, 0, -29351.8, 0, 12, 0],
  [1, 1, -1410.8, 4545.4, 9.7, -21.5],
  [2, 0, -2556.6, 0, -11.6, 0],
  [2, 1, 2951.1, -3133.6, -5.2, -27.7],
  [2, 2, 1649.3, -815.1, -8, -12.1],
  [3, 0, 1361, 0, -1.3, 0],
  [3, 1, -2404.1, -56.6, -4.2, 4],
  [3, 2, 1243.8, 237.5, 0.4, -0.3],
  [3, 3, 453.6, -549.5, -15.6, -4.1],
  [4, 0, 895, 0, -1.6, 0],
  [4, 1, 799.5, 278.6, -2.4, -1.1],
  [4, 2, 55.7, -133.9, -6, 4.1],
  [4, 3, -281.1, 212, 5.6, 1.6],
  [4, 4, 12.1, -375.6, -7, -4.4],
  [5, 0, -233.2, 0, 0.6, 0],
  [5, 1, 368.9, 45.4, 1.4, -0.5],
  [5, 2, 187.2, 220.2, 0, 2.2],
  [5, 3, -138.7, -122.9, 0.6, 0.4],
  [5, 4, -142, 43, 2.2, 1.7],
  [5, 5, 20.9, 106.1, 0.9, 1.9],
  [6, 0, 64.4, 0, -0.2, 0],
  [6, 1, 63.8, -18.4, -0.4, 0.3],
  [6, 2, 76.9, 16.8, 0.9, -1.6],
  [6, 3, -115.7, 48.8, 1.2, -0.4],
  [6, 4, -40.9, -59.8, -0.9, 0.9],
  [6, 5, 14.9, 10.9, 0.3, 0.7],
  [6, 6, -60.7, 72.7, 0.9, 0.9],
  [7, 0, 79.5, 0, 0, 0],
  [7, 1, -77, -48.9, -0.1, 0.6],
  [7, 2, -8.8, -14.4, -0.1, 0.5],
  [7, 3, 59.3, -1, 0.5, -0.8],
  [7, 4, 15.8, 23.4, -0.1, 0],
  [7, 5, 2.5, -7.4, -0.8, -1],
  [7, 6, -11.1, -25.1, -0.8, 0.6],
  [7, 7, 14.2, -2.3, 0.8, -0.2],
  [8, 0, 23.2, 0, -0.1, 0],
  [8, 1, 10.8, 7.1, 0.2, -0.2],
  [8, 2, -17.5, -12.6, 0, 0.5],
  [8, 3, 2, 11.4, 0.5, -0.4],
  [8, 4, -21.7, -9.7, -0.1, 0.4],
  [8, 5, 16.9, 12.7, 0.3, -0.5],
  [8, 6, 15, 0.7, 0.2, -0.6],
  [8, 7, -16.8, -5.2, 0, 0.3],
  [8, 8, 0.9, 3.9, 0.2, 0.2],
  [9, 0, 4.6, 0, 0, 0],
  [9, 1, 7.8, -24.8, -0.1, -0.3],
  [9, 2, 3, 12.2, 0.1, 0.3],
  [9, 3, -0.2, 8.3, 0.3, -0.3],
  [9, 4, -2.5, -3.3, -0.3, 0.3],
  [9, 5, -13.1, -5.2, 0, 0.2],
  [9, 6, 2.4, 7.2, 0.3, -0.1],
  [9, 7, 8.6, -0.6, -0.1, -0.2],
  [9, 8, -8.7, 0.8, 0.1, 0.4],
  [9, 9, -12.9, 10, -0.1, 0.1],
  [10, 0, -1.3, 0, 0.1, 0],
  [10, 1, -6.4, 3.3, 0, 0],
  [10, 2, 0.2, 0, 0.1, 0],
  [10, 3, 2, 2.4, 0.1, -0.2],
  [10, 4, -1, 5.3, 0, 0.1],
  [10, 5, -0.6, -9.1, -0.3, -0.1],
  [10, 6, -0.9, 0.4, 0, 0.1],
  [10, 7, 1.5, -4.2, -0.1, 0],
  [10, 8, 0.9, -3.8, -0.1, -0.1],
  [10, 9, -2.7, 0.9, 0, 0.2],
  [10, 10, -3.9, -9.1, 0, 0],
  [11, 0, 2.9, 0, 0, 0],
  [11, 1, -1.5, 0, 0, 0],
  [11, 2, -2.5, 2.9, 0, 0.1],
  [11, 3, 2.4, -0.6, 0, 0],
  [11, 4, -0.6, 0.2, 0, 0.1],
  [11, 5, -0.1, 0.5, -0.1, 0],
  [11, 6, -0.6, -0.3, 0, 0],
  [11, 7, -0.1, -1.2, 0, 0.1],
  [11, 8, 1.1, -1.7, -0.1, 0],
  [11, 9, -1, -2.9, -0.1, 0],
  [11, 10, -0.2, -1.8, -0.1, 0],
  [11, 11, 2.6, -2.3, -0.1, 0],
  [12, 0, -2, 0, 0, 0],
  [12, 1, -0.2, -1.3, 0, 0],
  [12, 2, 0.3, 0.7, 0, 0],
  [12, 3, 1.2, 1, 0, -0.1],
  [12, 4, -1.3, -1.4, 0, 0.1],
  [12, 5, 0.6, 0, 0, 0],
  [12, 6, 0.6, 0.6, 0.1, 0],
  [12, 7, 0.5, -0.1, 0, 0],
  [12, 8, -0.1, 0.8, 0, 0],
  [12, 9, -0.4, 0.1, 0, 0],
  [12, 10, -0.2, -1, -0.1, 0],
  [12, 11, -1.3, 0.1, 0, 0],
  [12, 12, -0.7, 0.2, -0.1, -0.1],
];
const EPOCH = 2025.0;
const N_MAX = 12;
/** Geomagnetic reference radius (km) and WGS 84 ellipsoid. */
const RE = 6371.2;
const A = 6378.137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const RAD = Math.PI / 180;

/** Decimal year of a date (UTC), as the model's time argument. */
export function decimalYear(date: Date): number {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 1);
  const end = Date.UTC(y + 1, 0, 1);
  return y + (date.getTime() - start) / (end - start);
}

/**
 * Magnetic declination in degrees (east positive) at a geodetic latitude and longitude
 * (degrees, east positive), height above the ellipsoid (km) and decimal year.
 * Not meaningful within a few degrees of the magnetic poles (the compass is useless there).
 */
export function magneticDeclination(
  latitude: number,
  longitude: number,
  heightKm = 0,
  year = EPOCH,
): number {
  const dt = year - EPOCH;
  const phi = latitude * RAD;
  const lambda = longitude * RAD;
  // Geodetic → geocentric spherical (radius r, geocentric latitude phiC).
  const sinPhi = Math.sin(phi);
  const rc = A / Math.sqrt(1 - E2 * sinPhi * sinPhi);
  const p = (rc + heightKm) * Math.cos(phi);
  const z = (rc * (1 - E2) + heightKm) * sinPhi;
  const r = Math.hypot(p, z);
  const phiC = Math.asin(z / r);
  // Schmidt semi-normalised P(n, m)(cos θ) and dP/dθ, θ the geocentric colatitude.
  const x = Math.sin(phiC); // cos θ
  const s = Math.cos(phiC); // sin θ
  const P: number[][] = [];
  const dP: number[][] = [];
  for (let n = 0; n <= N_MAX; n++) {
    P.push(new Array<number>(n + 1).fill(0));
    dP.push(new Array<number>(n + 1).fill(0));
  }
  P[0]![0] = 1;
  for (let n = 1; n <= N_MAX; n++) {
    for (let m = 0; m <= n; m++) {
      if (m === n) {
        const k = n === 1 ? 1 : Math.sqrt((2 * n - 1) / (2 * n));
        P[n]![n] = k * s * P[n - 1]![n - 1]!;
        dP[n]![n] = k * (s * dP[n - 1]![n - 1]! + x * P[n - 1]![n - 1]!);
      } else {
        const a = Math.sqrt(n * n - m * m);
        const b = Math.sqrt((n - 1) * (n - 1) - m * m);
        const p2 = n - 2 >= m ? P[n - 2]![m]! : 0;
        const dp2 = n - 2 >= m ? dP[n - 2]![m]! : 0;
        P[n]![m] = ((2 * n - 1) * x * P[n - 1]![m]! - b * p2) / a;
        dP[n]![m] = ((2 * n - 1) * (x * dP[n - 1]![m]! - s * P[n - 1]![m]!) - b * dp2) / a;
      }
    }
  }
  // Field in the geocentric frame: X′ north, Y′ east, Z′ down.
  let X = 0;
  let Y = 0;
  let Z = 0;
  for (const [n, m, g0, h0, dg, dh] of WMM2025) {
    const g = g0 + dt * dg;
    const h = h0 + dt * dh;
    const ratio = Math.pow(RE / r, n + 2);
    const cosM = Math.cos(m * lambda);
    const sinM = Math.sin(m * lambda);
    const gh = g * cosM + h * sinM;
    X += ratio * gh * dP[n]![m]!;
    Y += ratio * m * (g * sinM - h * cosM) * P[n]![m]!;
    Z -= (n + 1) * ratio * gh * P[n]![m]!;
  }
  Y /= s;
  // Back to the geodetic frame (only X changes the declination; Y is unchanged).
  const d = phiC - phi;
  const Xg = X * Math.cos(d) - Z * Math.sin(d);
  return Math.atan2(Y, Xg) / RAD;
}
