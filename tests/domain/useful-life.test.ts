import { describe, expect, it } from "vitest";
import { resolveUsefulLife } from "../../src/domain/asset-import/useful-life";
import { PERDIR_0299_RULES, type UsefulLifeAlias } from "../../src/reference/useful-life-perdir-0299";
import { valuationAsset } from "../fixtures/asset-valuation";

describe("audited useful life", () => {
  it.each([
    ["10600", "07", "102", "TRANS", 40], ["10700", "08", null, "TRANS", 40],
    ["10800", "09", "111", "TRANS", 40], ["10900", "11", "101", "TRANS", 40],
    ["11100", "13", "102", "DISTRIBUSI", 25], ["11400", "16", "105", "TELE INFORMASI DATA", 10],
    ["11600", "17", "112", "TELE INFORMASI DATA", 10], ["11700", "18", "102", "TRANS", 5],
  ])("resolves verified %s/%s/%s for %s", (kodeClassAsset, kodeJenis, kodeSubjenis, assetFunction, years) => {
    const result = resolveUsefulLife({ ...valuationAsset({ kodeClassAsset, kodeJenis, kodeSubjenis }), assetFunction }, { asOf: "2026-10-15" });
    expect(result).toMatchObject({ status: "RESOLVED", years, method: "EXACT_CODE", manualApprovalRequired: false });
    expect(result.rule?.sourceLocator).toContain("PDF page");
    expect(result.rule?.effectiveFrom).toBe("2016-01-01");
  });
  const alias: UsefulLifeAlias = { alias: "TRAFO", ruleIds: ["trans-general-office"], approvedBy: "RST synthetic", approvedAt: "2026-01-01", evidence: "Synthetic approved mapping" };
  it("prefers exact code over curated equipment aliases", () => {
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2026-10-15", aliases: [alias] }).years).toBe(40);
  });
  it("requires approval for ambiguous or unapproved aliases and has no global fallback", () => {
    const asset = valuationAsset({ kodeClassAsset: null, kodeJenis: null, kodeSubjenis: null });
    expect(resolveUsefulLife(asset, { asOf: "2026-10-15" })).toMatchObject({ status: "UNRESOLVED", years: null });
    expect(resolveUsefulLife(asset, { asOf: "2026-10-15", aliases: [{ ...alias, ruleIds: ["trans-general-office", "trans-transformer"] }] })).toMatchObject({ status: "AMBIGUOUS", manualApprovalRequired: true });
    expect(resolveUsefulLife(asset, { asOf: "2026-10-15", aliases: [{ ...alias, approvedBy: null }] }).status).toBe("UNRESOLVED");
    expect(resolveUsefulLife(asset, { asOf: "2026-10-15", aliases: [alias] })).toMatchObject({ years: 5, method: "APPROVED_ALIAS", alias });
  });
  it("selects effective rule versions and fails closed on overlapping versions", () => {
    const rule = PERDIR_0299_RULES.find((entry) => entry.id === "trans-transformer")!;
    const rules = [{ ...rule, id: "old", effectiveTo: "2020-01-01" }, { ...rule, id: "new", effectiveFrom: "2020-01-01", years: 30 }];
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2019-12-31", rules }).years).toBe(40);
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2020-01-01", rules }).years).toBe(30);
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2015-12-31" }).years).toBeNull();
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2026-10-15", rules: [rule, { ...rule, id: "overlap" }] }).status).toBe("AMBIGUOUS");
    expect(resolveUsefulLife(valuationAsset(), { asOf: "2026-99-99" }).status).toBe("UNRESOLVED");
  });
});
