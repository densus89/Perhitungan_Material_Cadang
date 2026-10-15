import { PERDIR_0299_VERSION } from "../../reference/useful-life-perdir-0299";
import type { CanonicalizedAssetRow, ValuationSource } from "./types";
import { imputeAssetAge, isNonnegativeNumber, priceDateWarnings, rankComparableCandidates, type AgeResolution, type ComparableAsset, type ComparableOptions, type ComparableSelection } from "./comparables";
import { resolveUsefulLife, type UsefulLifeResolution } from "./useful-life";

export interface ValuationContext extends ComparableOptions {
  asOf: string;
  candidates?: readonly ComparableAsset[];
  cohort?: readonly ComparableAsset[];
}
export interface ValuationResolution {
  nilaiABC: number | null;
  hargaPengadaanSaatIni: number | null;
  valueSource: ValuationSource;
  calculationMethod: "DIRECT_BOOK_VALUE" | "STRAIGHT_LINE" | "UNRESOLVED";
  ageStatus: AgeResolution["status"];
  manualApprovalRequired: boolean;
  usefulLife: UsefulLifeResolution;
  warnings: string[];
  evidence: {
    ruleVersion: string; calculatedAt: string;
    sourceField: "nilaiBukuSap" | "nilaiAbcInput" | "hargaPengadaanSaatIni" | null;
    sourceCell: CanonicalizedAssetRow["sources"][keyof CanonicalizedAssetRow["sources"]] | null;
    referencePrice: number | null; priceDate: string | null; ageYears: number | null; usefulLifeYears: number | null;
    rule: UsefulLifeResolution["rule"]; age: AgeResolution; comparables: ComparableSelection | null;
    policy: { minimumRemainingLifeFactor: number; highDispersionThreshold: number; stalePriceYears: number };
  };
}

/** Analytical estimate from the approved design section 9, not a statutory revaluation. */
export function calculateDepreciatedBookValue(referencePrice: number, ageYears: number, usefulLifeYears: number): number {
  if (!isNonnegativeNumber(referencePrice) || !isNonnegativeNumber(ageYears) || !Number.isFinite(usefulLifeYears) || usefulLifeYears <= 0) throw new RangeError("Depreciation requires a finite nonnegative price/age and positive useful life");
  return Math.max(0, referencePrice * (1 - Math.min(ageYears, usefulLifeYears) / usefulLifeYears));
}

export function resolveAssetValuation(input: ComparableAsset | CanonicalizedAssetRow, context: ValuationContext): ValuationResolution {
  const row = "asset" in input ? input : null;
  const asset: ComparableAsset = row ? { ...row.asset, provenance: row.provenance } : input as ComparableAsset;
  const usefulLife = resolveUsefulLife(asset, context);
  const age = imputeAssetAge(asset, context.cohort ?? [], context);
  const evidence: ValuationResolution["evidence"] = {
    ruleVersion: usefulLife.rule?.ruleVersion ?? PERDIR_0299_VERSION, calculatedAt: context.asOf, sourceField: null, sourceCell: null,
    referencePrice: null, priceDate: null, ageYears: age.years, usefulLifeYears: usefulLife.years, rule: usefulLife.rule, age, comparables: null,
    policy: { minimumRemainingLifeFactor: context.minimumRemainingLifeFactor ?? 0.2, highDispersionThreshold: context.highDispersionThreshold ?? 0.5, stalePriceYears: context.stalePriceYears ?? 3 },
  };
  const base = { hargaPengadaanSaatIni: asset.hargaPengadaanSaatIni, usefulLife, ageStatus: age.status, evidence };
  const fieldHasError = (field: keyof ComparableAsset) => row?.issues.some((issue) => issue.severity === "ERROR" && issue.field === field);
  if (isNonnegativeNumber(asset.nilaiBukuSap) && !fieldHasError("nilaiBukuSap")) {
    evidence.sourceField = "nilaiBukuSap"; evidence.sourceCell = row?.sources.nilaiBukuSap ?? null;
    return { ...base, nilaiABC: asset.nilaiBukuSap, valueSource: "SAP_BOOK_VALUE", calculationMethod: "DIRECT_BOOK_VALUE", manualApprovalRequired: age.status === "AGE_IMPUTED", warnings: age.warnings };
  }
  if (isNonnegativeNumber(asset.nilaiAbcInput) && !fieldHasError("nilaiAbcInput")) {
    evidence.sourceField = "nilaiAbcInput"; evidence.sourceCell = row?.sources.nilaiAbcInput ?? null;
    return { ...base, nilaiABC: asset.nilaiAbcInput, valueSource: "PROVIDED_ADJUSTED_VALUE", calculationMethod: "DIRECT_BOOK_VALUE", manualApprovalRequired: age.status === "AGE_IMPUTED", warnings: ["PROVIDED_ADJUSTED_VALUE", ...age.warnings] };
  }
  const unresolved = (): ValuationResolution => ({ ...base, nilaiABC: null, valueSource: "UNRESOLVED", calculationMethod: "UNRESOLVED", manualApprovalRequired: true, warnings: [...new Set([...age.warnings, ...(evidence.comparables?.warnings ?? [])])] });
  if (usefulLife.years === null || age.years === null || fieldHasError("usiaAsetTahun") || fieldHasError("tanggalOperasi")) return unresolved();
  let referencePrice: number | null = null, valueSource: ValuationSource = "SYSTEM_DEPRECIATION", warnings = [...age.warnings];
  if (isNonnegativeNumber(asset.hargaPengadaanSaatIni) && !fieldHasError("hargaPengadaanSaatIni")) {
    evidence.sourceField = "hargaPengadaanSaatIni"; evidence.sourceCell = row?.sources.hargaPengadaanSaatIni ?? null;
    evidence.priceDate = asset.tanggalReferensiHarga;
    const dateWarnings = priceDateWarnings(evidence.priceDate, context.asOf, context.stalePriceYears);
    if (dateWarnings.includes("INVALID_PRICE_DATE") || dateWarnings.includes("FUTURE_PRICE_DATE") || fieldHasError("tanggalReferensiHarga")) return unresolved();
    referencePrice = asset.hargaPengadaanSaatIni;
    warnings.push(...dateWarnings);
  } else {
    const comparables = rankComparableCandidates(asset, context.candidates ?? [], context);
    evidence.comparables = comparables;
    if (comparables.median === null || comparables.tier === null) return unresolved();
    referencePrice = comparables.median;
    evidence.priceDate = comparables.donors[0].priceDate;
    const tierSources = { SAME_GI: "ESTIMATED_SAME_GI", SAME_UPT: "ESTIMATED_SAME_UPT", SAME_UNIT: "ESTIMATED_SAME_UNIT", NEAREST_LOCATION: "ESTIMATED_NEAREST_LOCATION", NATIONAL: "ESTIMATED_NATIONAL" } as const;
    valueSource = tierSources[comparables.tier]; warnings.push(...comparables.warnings);
  }
  evidence.referencePrice = referencePrice;
  const nilaiABC = calculateDepreciatedBookValue(referencePrice, age.years, usefulLife.years);
  warnings.push("ESTIMATED_VALUE");
  if (age.years >= usefulLife.years) warnings.push("FULLY_DEPRECIATED");
  warnings = [...new Set(warnings)];
  return { ...base, nilaiABC, valueSource, calculationMethod: "STRAIGHT_LINE", manualApprovalRequired: age.manualApprovalRequired || valueSource !== "SYSTEM_DEPRECIATION" || warnings.some((warning) => ["STALE_PRICE", "MISSING_PRICE_DATE", "HIGH_DISPERSION"].includes(warning)), warnings };
}
