import { describe, expect, it } from "vitest";
import { haversineDistanceKm, locationKey, sortLocationPriorities } from "@/src/domain/location-priority";
import type { LocationPriority } from "@/src/domain/types";

const gandul = { latitude: -6.343459, longitude: 106.787061 };
const row = (id: string, overrides: Partial<LocationPriority> = {}): LocationPriority => ({
  id, policyId: "policy-demo", materialName: "Material Demo", upt: "UPT Demo", gi: id,
  condition: "P2", assetAgeYears: 10, latitude: -6.343459, longitude: 106.787061,
  assetCount: 1, idealQuantityReference: 3, allocationStatus: "REFERENCE_ONLY", ...overrides,
});

describe("location priorities", () => {
  it("puts the most critical P0 condition before P1 through P4", () => {
    const rows = [row("p4", { condition: "P4" }), row("p1", { condition: "P1" }), row("p3", { condition: "P3" }), row("p0", { condition: "P0" }), row("p2")];
    expect(sortLocationPriorities(rows, gandul).map((item) => item.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
  });

  it("places older assets first within the same condition even when farther away", () => {
    expect(sortLocationPriorities([row("young", { assetAgeYears: 2 }), row("old", { assetAgeYears: 30, latitude: -7 })], gandul).map((item) => item.id)).toEqual(["old", "young"]);
  });

  it("places a known age, including zero, before missing age without changing null", () => {
    const result = sortLocationPriorities([row("missing", { assetAgeYears: null }), row("known", { assetAgeYears: 0, latitude: -7 })], gandul);
    expect(result.map((item) => item.id)).toEqual(["known", "missing"]);
    expect(result[1].assetAgeYears).toBeNull();
  });

  it.each([null, 12])("uses the shortest distance for equal ages (%s)", (age) => {
    expect(sortLocationPriorities([row("far", { assetAgeYears: age, latitude: -7 }), row("near", { assetAgeYears: age })], gandul).map((item) => item.id)).toEqual(["near", "far"]);
  });

  it("breaks equal priorities by GI then UPT and retains duplicate GI names", () => {
    const rows = [row("b", { gi: "GI Kembar", upt: "UPT B" }), row("a", { gi: "GI Kembar", upt: "UPT A" }), row("first", { gi: "GI Awal", upt: "UPT Z" })];
    const result = sortLocationPriorities(rows, gandul);
    expect(result.map((item) => item.id)).toEqual(["first", "a", "b"]);
    expect(new Set(result.map(locationKey)).size).toBe(3);
    expect(sortLocationPriorities([...rows].reverse(), gandul)).toEqual(result);
  });

  it("preserves every ideal quantity reference and does not mutate source rows", () => {
    const rows = [row("first", { condition: "P4", idealQuantityReference: 8 }), row("second", { condition: "P0", idealQuantityReference: 8 })];
    const snapshot = structuredClone(rows);
    const result = sortLocationPriorities(rows, gandul);
    expect(result.map((item) => item.idealQuantityReference)).toEqual([8, 8]);
    expect(result.every((item) => item.allocationStatus === "REFERENCE_ONLY")).toBe(true);
    expect(rows).toEqual(snapshot);
    expect(result[0].distanceKm).toBe(0);
  });

  it("calculates kilometers accurately including coincident and antipodal points", () => {
    expect(haversineDistanceKm(gandul, gandul)).toBe(0);
    expect(haversineDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })).toBeCloseTo(111.195, 3);
    expect(haversineDistanceKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 180 })).toBeCloseTo(20015.114, 3);
  });
});
