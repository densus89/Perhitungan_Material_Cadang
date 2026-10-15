import { PERDIR_0299_ALIASES, PERDIR_0299_RULES, type UsefulLifeAlias, type UsefulLifeRule } from "../../reference/useful-life-perdir-0299";
import type { CanonicalAssetInput } from "./types";

export interface UsefulLifeAsset extends CanonicalAssetInput { assetFunction?: string | null }
export interface UsefulLifeOptions { asOf: string; rules?: readonly UsefulLifeRule[]; aliases?: readonly UsefulLifeAlias[] }
export interface UsefulLifeResolution {
  status: "RESOLVED" | "AMBIGUOUS" | "UNRESOLVED";
  years: number | null;
  method: "EXACT_CODE" | "APPROVED_ALIAS" | "UNRESOLVED";
  rule: UsefulLifeRule | null;
  alias: UsefulLifeAlias | null;
  candidateRuleIds: string[];
  manualApprovalRequired: boolean;
}

export function normalizeAssetText(value: string | null | undefined): string {
  return (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

export function resolveUsefulLife(asset: UsefulLifeAsset, options: UsefulLifeOptions): UsefulLifeResolution {
  const rules = (options.rules ?? PERDIR_0299_RULES).filter((rule) => isIsoDate(options.asOf) && rule.effectiveFrom <= options.asOf && (!rule.effectiveTo || options.asOf < rule.effectiveTo) && Number.isFinite(rule.years) && rule.years > 0 && (!asset.assetFunction || normalizeAssetText(asset.assetFunction) === rule.assetFunction));
  const exact = rules.filter((rule) => asset.kodeClassAsset === rule.classCode && asset.kodeJenis === rule.typeCode && asset.kodeSubjenis === rule.subtypeCode);
  const aliases = (options.aliases ?? PERDIR_0299_ALIASES).filter((alias) => normalizeAssetText(alias.alias) === normalizeAssetText(asset.namaPeralatan) && alias.approvedBy?.trim() && alias.approvedAt && isIsoDate(alias.approvedAt) && alias.approvedAt <= options.asOf && alias.evidence.trim());
  const aliasRules = rules.filter((rule) => aliases.some((alias) => alias.ruleIds.includes(rule.id)));
  const candidates = exact.length ? exact : aliasRules;
  const resolved = candidates.length === 1;
  return {
    status: resolved ? "RESOLVED" : candidates.length > 1 ? "AMBIGUOUS" : "UNRESOLVED",
    years: resolved ? candidates[0].years : null,
    method: resolved ? exact.length ? "EXACT_CODE" : "APPROVED_ALIAS" : "UNRESOLVED",
    rule: resolved ? candidates[0] : null,
    alias: resolved && !exact.length ? aliases.find((alias) => alias.ruleIds.includes(candidates[0].id)) ?? null : null,
    candidateRuleIds: candidates.map((rule) => rule.id).sort(), manualApprovalRequired: !resolved,
  };
}
