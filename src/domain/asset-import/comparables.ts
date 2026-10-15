import type { AssetRowProvenance } from "./types";
import { isIsoDate, normalizeAssetText, resolveUsefulLife, type UsefulLifeAsset, type UsefulLifeOptions, type UsefulLifeResolution } from "./useful-life";

export interface ApprovedRfqGroup { id: string; approvedBy: string; approvedAt: string }
export interface Coordinates { latitude: number; longitude: number }
export interface ComparableAsset extends UsefulLifeAsset {
  id?: string;
  normalizedSpecification?: string | null;
  approvedRfqGroup?: ApprovedRfqGroup | null;
  coordinates?: Coordinates | null;
  provenance?: AssetRowProvenance;
}
export type ComparableTier = "SAME_GI" | "SAME_UPT" | "SAME_UNIT" | "NEAREST_LOCATION" | "NATIONAL";
export interface DonorEvidence {
  id: string; referencePrice: number; basis: "CURRENT_REPLACEMENT_PRICE" | "GROSSED_UP_BOOK_VALUE";
  priceDate: string | null; distanceKm: number | null; compatibility: "EXACT_SPECIFICATION" | "APPROVED_RFQ";
  rfqGroup: ApprovedRfqGroup | null; provenance: AssetRowProvenance | null;
  donorAgeYears: number | null; remainingLifeFactor: number | null; usefulLife: UsefulLifeResolution | null;
}
export interface RejectedDonorEvidence { id: string; code: "DONOR_ID_CONFLICT" }
export interface ComparableSelection {
  status: "RESOLVED" | "UNRESOLVED"; tier: ComparableTier | null; median: number | null;
  candidateCount: number; min: number | null; max: number | null; dispersion: number | null;
  selectedDonorIds: string[]; donors: DonorEvidence[]; rejectedDonors: RejectedDonorEvidence[]; warnings: string[];
}
export interface AgeResolution {
  status: "OPERATION_DATE" | "PROVIDED_AGE" | "AGE_IMPUTED" | "UNRESOLVED";
  years: number | null; tier: Exclude<ComparableTier, "NEAREST_LOCATION"> | null;
  donorIds: string[]; cohort: { id: string; years: number; provenance: AssetRowProvenance | null }[];
  manualApprovalRequired: boolean; rejectedDonors: RejectedDonorEvidence[]; warnings: string[];
}
export interface ComparableOptions extends Partial<UsefulLifeOptions> {
  /** Audited MVP review thresholds, not PERDIR requirements. */
  minimumRemainingLifeFactor?: number;
  highDispersionThreshold?: number;
  stalePriceYears?: number;
}

export function isNonnegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
export function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : sorted[middle - 1] / 2 + sorted[middle] / 2;
}
export function assetEvidenceId(asset: ComparableAsset): string | null {
  return asset.id?.trim() || (asset.provenance ? `${asset.provenance.sheetName}!${asset.provenance.rowNumber}` : asset.noAset?.trim() || asset.tid?.trim() || null);
}
/** Fixed field order makes identity checking independent of input object key order.
 * Condition and notes are excluded: neither is evidence for technical, price or age selection.
 * Non-finite numbers stay distinct from null, so invalid conflicts cannot disappear in JSON.
 */
function donorMaterialEvidence(asset: ComparableAsset): string {
  return JSON.stringify([
    asset.unitInduk, asset.upt, asset.namaGi, asset.bayPenghantar, asset.tid, asset.noAset,
    asset.namaPeralatan, asset.spesifikasiMara, asset.jumlah, asset.satuan,
    asset.tanggalOperasi, asset.usiaAsetTahun, asset.kodeClassAsset, asset.kodeJenis, asset.kodeSubjenis,
    asset.nilaiBukuSap, asset.hargaPengadaanSaatIni, asset.tanggalReferensiHarga, asset.nilaiAbcInput, asset.kodeMaterial,
    asset.assetFunction ?? null, asset.normalizedSpecification ?? null,
    asset.approvedRfqGroup ? [asset.approvedRfqGroup.id, asset.approvedRfqGroup.approvedBy, asset.approvedRfqGroup.approvedAt] : null,
    asset.coordinates ? [asset.coordinates.latitude, asset.coordinates.longitude] : null,
    asset.provenance ? [asset.provenance.sheetName, asset.provenance.rowNumber] : null,
  ], (_key, value: unknown) => typeof value === "number" && !Number.isFinite(value) ? String(value) : value);
}
function deduplicateDonors(donors: readonly ComparableAsset[]) {
  const records = new Map<string, { asset: ComparableAsset; material: string }>(), conflicts = new Set<string>();
  for (const asset of donors) {
    const id = assetEvidenceId(asset);
    if (!id) continue;
    const material = donorMaterialEvidence(asset), previous = records.get(id);
    if (!previous) records.set(id, { asset, material });
    else if (previous.material !== material) conflicts.add(id);
  }
  const rejectedDonors: RejectedDonorEvidence[] = [...conflicts].sort().map((id) => ({ id, code: "DONOR_ID_CONFLICT" }));
  const unique = [...records].filter(([id]) => !conflicts.has(id)).sort(([a], [b]) => a.localeCompare(b)).map(([, record]) => record.asset);
  return { unique, rejectedDonors, warnings: rejectedDonors.length ? ["DONOR_ID_CONFLICT"] : [] };
}
function same(a: string | null, b: string | null): boolean {
  return !!normalizeAssetText(a) && normalizeAssetText(a) === normalizeAssetText(b);
}
function approved(group: ApprovedRfqGroup | null | undefined, asOf?: string): group is ApprovedRfqGroup {
  return !!(group?.id.trim() && group.approvedBy.trim() && isIsoDate(group.approvedAt) && (!asOf || group.approvedAt <= asOf));
}
function compatibility(target: ComparableAsset, donor: ComparableAsset, asOf?: string): DonorEvidence["compatibility"] | null {
  if (!same(target.namaPeralatan, donor.namaPeralatan) || !same(target.satuan, donor.satuan)) return null;
  const a = normalizeAssetText(target.normalizedSpecification ?? target.spesifikasiMara);
  const b = normalizeAssetText(donor.normalizedSpecification ?? donor.spesifikasiMara);
  // Even an RFQ group cannot silently collapse explicitly different voltage variants.
  const voltage = (spec: string) => (spec.match(/\d+(?:[.,]\d+)?(?:\s*\/\s*\d+(?:[.,]\d+)?)*\s*KV\b/g) ?? []).map((part) => part.replace(/\s/g, "")).join("|");
  const va = voltage(normalizeAssetText(target.spesifikasiMara)), vb = voltage(normalizeAssetText(donor.spesifikasiMara));
  if (va && vb && va !== vb) return null;
  if (a && a === b) return "EXACT_SPECIFICATION";
  if (approved(target.approvedRfqGroup, asOf) && approved(donor.approvedRfqGroup, asOf) && target.approvedRfqGroup.id === donor.approvedRfqGroup.id) return "APPROVED_RFQ";
  return null;
}
function locationTier(target: ComparableAsset, donor: ComparableAsset): Exclude<ComparableTier, "NEAREST_LOCATION"> {
  if (same(target.unitInduk, donor.unitInduk)) {
    if (same(target.upt, donor.upt)) return same(target.namaGi, donor.namaGi) ? "SAME_GI" : "SAME_UPT";
    return "SAME_UNIT";
  }
  return "NATIONAL";
}
function validCoordinates(value: Coordinates | null | undefined): value is Coordinates {
  return !!value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}
function distance(target: ComparableAsset, donor: ComparableAsset): number | null {
  if (!validCoordinates(target.coordinates) || !validCoordinates(donor.coordinates)) return null;
  const rad = Math.PI / 180, a = target.coordinates, b = donor.coordinates;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function knownAssetAge(asset: ComparableAsset, asOf?: string): Pick<AgeResolution, "years" | "status"> {
  if (asset.tanggalOperasi) {
    if (!asOf || !isIsoDate(asOf)) return { years: null, status: "UNRESOLVED" };
    const date = new Date(`${asset.tanggalOperasi}T00:00:00Z`), now = new Date(`${asOf.slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== asset.tanggalOperasi || !Number.isFinite(now.getTime()) || date > now) return { years: null, status: "UNRESOLVED" };
    // Fractional calendar years keep exact anniversaries exact, including leap years.
    const years = now.getUTCFullYear() - date.getUTCFullYear();
    const anniversary = new Date(date); anniversary.setUTCFullYear(date.getUTCFullYear() + years);
    const lower = new Date(anniversary); lower.setUTCFullYear(anniversary.getUTCFullYear() + (now < anniversary ? -1 : 0));
    const upper = new Date(lower); upper.setUTCFullYear(lower.getUTCFullYear() + 1);
    return { years: years - (now < anniversary ? 1 : 0) + (now.getTime() - lower.getTime()) / (upper.getTime() - lower.getTime()), status: "OPERATION_DATE" };
  }
  return isNonnegativeNumber(asset.usiaAsetTahun) ? { years: asset.usiaAsetTahun, status: "PROVIDED_AGE" } : { years: null, status: "UNRESOLVED" };
}
export function imputeAssetAge(target: ComparableAsset, cohort: readonly ComparableAsset[], options: ComparableOptions = {}): AgeResolution {
  const known = knownAssetAge(target, options.asOf);
  if (known.years !== null) return { ...known, tier: null, donorIds: [], cohort: [], manualApprovalRequired: false, rejectedDonors: [], warnings: [] };
  // Invalid supplied age/date is not an absent age eligible for automatic imputation.
  if (target.tanggalOperasi || target.usiaAsetTahun !== null) return { ...known, tier: null, donorIds: [], cohort: [], manualApprovalRequired: true, rejectedDonors: [], warnings: [] };
  const deduplicated = deduplicateDonors(cohort);
  const candidates = deduplicated.unique.flatMap((donor) => {
    const id = assetEvidenceId(donor), age = knownAssetAge(donor, options.asOf);
    return donor !== target && id && id !== assetEvidenceId(target) && age.years !== null && compatibility(target, donor, options.asOf) ? [{ id, years: age.years, tier: locationTier(target, donor), provenance: donor.provenance ?? null }] : [];
  });
  for (const tier of ["SAME_GI", "SAME_UPT", "SAME_UNIT", "NATIONAL"] as const) {
    const selected = candidates.filter((entry) => entry.tier === tier).sort((a, b) => a.id.localeCompare(b.id));
    if (selected.length) return { years: median(selected.map((entry) => entry.years)), status: "AGE_IMPUTED", tier, donorIds: selected.map((entry) => entry.id), cohort: selected.map(({ id, years, provenance }) => ({ id, years, provenance })), manualApprovalRequired: true, rejectedDonors: deduplicated.rejectedDonors, warnings: [...deduplicated.warnings, "AGE_IMPUTED", ...(selected.length === 1 ? ["SINGLE_DONOR"] : [])] };
  }
  return { years: null, status: "UNRESOLVED", tier: null, donorIds: [], cohort: [], manualApprovalRequired: true, rejectedDonors: deduplicated.rejectedDonors, warnings: deduplicated.warnings };
}
export function priceDateWarnings(date: string | null, asOf?: string, stalePriceYears = 3): string[] {
  if (!date) return ["MISSING_PRICE_DATE"];
  if (!isIsoDate(date)) return ["INVALID_PRICE_DATE"];
  if (asOf && date > asOf) return ["FUTURE_PRICE_DATE"];
  if (asOf && Date.parse(asOf) - Date.parse(date) > stalePriceYears * 365.25 * 86400000) return ["STALE_PRICE"];
  return [];
}
export function rankComparableCandidates(target: ComparableAsset, candidates: readonly ComparableAsset[], options: ComparableOptions = {}): ComparableSelection {
  const deduplicated = deduplicateDonors(candidates);
  const eligible = deduplicated.unique.flatMap((donor) => {
    const id = assetEvidenceId(donor), match = compatibility(target, donor, options.asOf);
    if (donor === target || !id || id === assetEvidenceId(target) || !match) return [];
    const priceWarnings = priceDateWarnings(donor.tanggalReferensiHarga, options.asOf, options.stalePriceYears);
    if (priceWarnings.includes("INVALID_PRICE_DATE") || priceWarnings.includes("FUTURE_PRICE_DATE")) return [];
    let referencePrice: number, basis: DonorEvidence["basis"], donorAgeYears: number | null = null, remainingLifeFactor: number | null = null, usefulLife: UsefulLifeResolution | null = null;
    if (isNonnegativeNumber(donor.hargaPengadaanSaatIni) && donor.hargaPengadaanSaatIni > 0) {
      referencePrice = donor.hargaPengadaanSaatIni; basis = "CURRENT_REPLACEMENT_PRICE";
    } else {
      const asOf = options.asOf ?? donor.tanggalReferensiHarga;
      if (!asOf) return [];
      usefulLife = resolveUsefulLife(donor, { ...options, asOf });
      donorAgeYears = knownAssetAge(donor, asOf).years;
      const book = isNonnegativeNumber(donor.nilaiBukuSap) ? donor.nilaiBukuSap : donor.nilaiBukuSap === null && isNonnegativeNumber(donor.nilaiAbcInput) ? donor.nilaiAbcInput : null;
      if (book === null || donorAgeYears === null || usefulLife.years === null) return [];
      // Divide remaining years directly: 1 - 32/40 rounds below the exact 0.20 cutoff.
      remainingLifeFactor = (usefulLife.years - donorAgeYears) / usefulLife.years;
      if (remainingLifeFactor < (options.minimumRemainingLifeFactor ?? 0.2) || remainingLifeFactor <= 0) return [];
      referencePrice = book / remainingLifeFactor; basis = "GROSSED_UP_BOOK_VALUE";
      if (!Number.isFinite(referencePrice) || referencePrice <= 0) return [];
    }
    const distanceKm = distance(target, donor), localTier = locationTier(target, donor);
    const tier: ComparableTier = localTier === "NATIONAL" && distanceKm !== null ? "NEAREST_LOCATION" : localTier;
    const evidence: DonorEvidence = { id, referencePrice, basis, priceDate: donor.tanggalReferensiHarga, distanceKm, compatibility: match, rfqGroup: match === "APPROVED_RFQ" ? donor.approvedRfqGroup ?? null : null, provenance: donor.provenance ?? null, donorAgeYears, remainingLifeFactor, usefulLife };
    return [{ tier, evidence }];
  });
  for (const tier of ["SAME_GI", "SAME_UPT", "SAME_UNIT", "NEAREST_LOCATION", "NATIONAL"] as const) {
    let selected = eligible.filter((entry) => entry.tier === tier).map((entry) => entry.evidence);
    if (!selected.length) continue;
    if (tier === "NEAREST_LOCATION") {
      const nearest = Math.min(...selected.map((entry) => entry.distanceKm!));
      selected = selected.filter((entry) => Math.abs(entry.distanceKm! - nearest) < 0.000001);
    }
    const newest = selected.map((entry) => entry.priceDate).filter((date): date is string => date !== null).sort().at(-1);
    if (newest) selected = selected.filter((entry) => entry.priceDate === newest);
    selected.sort((a, b) => a.id.localeCompare(b.id));
    const prices = selected.map((entry) => entry.referencePrice), value = median(prices);
    const min = prices.reduce((result, price) => Math.min(result, price), Infinity), max = prices.reduce((result, price) => Math.max(result, price), -Infinity);
    const dispersion = value > 0 ? (max - min) / value : 0;
    const warnings = [...new Set([...deduplicated.warnings, ...selected.flatMap((entry) => priceDateWarnings(entry.priceDate, options.asOf, options.stalePriceYears))])];
    if (selected.length === 1) warnings.push("SINGLE_DONOR");
    if (dispersion > (options.highDispersionThreshold ?? 0.5)) warnings.push("HIGH_DISPERSION");
    if (tier !== "SAME_GI") warnings.push(`DONOR_${tier}`);
    return { status: "RESOLVED", tier, median: value, candidateCount: selected.length, min, max, dispersion, selectedDonorIds: selected.map((entry) => entry.id), donors: selected, rejectedDonors: deduplicated.rejectedDonors, warnings };
  }
  return { status: "UNRESOLVED", tier: null, median: null, candidateCount: 0, min: null, max: null, dispersion: null, selectedDonorIds: [], donors: [], rejectedDonors: deduplicated.rejectedDonors, warnings: deduplicated.warnings };
}
