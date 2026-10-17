// @vitest-environment node
import { expect, it } from "vitest";
import { readAssetWorkbook } from "../../../src/lib/spreadsheet/read-asset-workbook";
import { assetRow, headers, workbookBytes } from "../../fixtures/asset-workbooks";
it("measures adapter load separately from canonicalization and hashing without changing complete-row results", async () => {
  const measurements: { phase: string; durationMs: number }[] = [];
  const bytes = await workbookBytes([{ name: "DATA_ASET", rows: [headers, assetRow, assetRow] }]);
  const result = await readAssetWorkbook(bytes, { ruleVersion: "test", collectRows: true, onPhase: (measurement: { phase: string; durationMs: number }) => measurements.push(measurement) });
  expect(result.summary.candidateRows).toBe(2);
  expect(measurements.map(item => item.phase)).toEqual(["workbookParse", "canonicalization"]);
  expect(measurements.every(item => Number.isFinite(item.durationMs) && item.durationMs >= 0)).toBe(true);
});
