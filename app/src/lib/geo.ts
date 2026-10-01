export type LatLng = [number, number];

export function km(a: LatLng, b: LatLng): number {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b[0] - a[0]) * toR, dLng = (b[1] - a[1]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Urban driving: ~22 km/h average door to door, 6 min minimum. */
export const travelMin = (a: LatLng, b: LatLng) => Math.max(6, Math.round(km(a, b) * 1.35 / 22 * 60));

export function inPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i], [yj, xj] = poly[j];
    if ((yi > p[0]) !== (yj > p[0]) && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function lerp(a: LatLng, b: LatLng, t: number): LatLng { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

export function bearing(a: LatLng, b: LatLng) { return (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; }

export function bounds(points: LatLng[]): [LatLng, LatLng] {
  const lats = points.map(p => p[0]), lngs = points.map(p => p[1]);
  return [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
}
