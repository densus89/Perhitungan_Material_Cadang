import type { Coordinates, LocationPriority } from "./types";

const earthRadiusKm = 6371.0088;
const radians = (degrees: number) => degrees * Math.PI / 180;
const compareName = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

export function haversineDistanceKm(from: Coordinates, to: Coordinates): number {
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  // Clamp round-off at coincident/antipodal points to retain a finite distance.
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(Math.min(1, Math.max(0, a))));
}

/** Tuple serialization prevents collisions even when names contain separators. */
export function locationKey(row: Pick<LocationPriority, "upt" | "gi">): string {
  return JSON.stringify([row.upt, row.gi]);
}

export function sortLocationPriorities(rows: readonly LocationPriority[], gandul: Coordinates): LocationPriority[] {
  return rows.map((row) => ({ ...row, distanceKm: haversineDistanceKm(row, gandul) })).sort((left, right) => {
    const condition = compareName(left.condition, right.condition);
    if (condition) return condition;
    // Known ages precede missing ages; missing is never a zero-year-old asset.
    if (left.assetAgeYears === null && right.assetAgeYears !== null) return 1;
    if (left.assetAgeYears !== null && right.assetAgeYears === null) return -1;
    if (left.assetAgeYears !== null && right.assetAgeYears !== null) {
      const age = right.assetAgeYears - left.assetAgeYears;
      if (age) return age;
    }
    return left.distanceKm - right.distanceKm
      || compareName(left.gi, right.gi)
      || compareName(left.upt, right.upt)
      || compareName(left.id, right.id);
  });
}
