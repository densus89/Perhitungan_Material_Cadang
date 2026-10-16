// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { workbookBytes, headers, assetRow } from "../../fixtures/asset-workbooks";
import type { AssetImportWorkerRequest, AssetImportWorkerResult } from "../../../src/features/import/asset-import.worker";
it("returns serializable hashes, candidate totals and only the first 100 preview rows", async () => {
  const postMessage = vi.fn(); const scope = { postMessage, onmessage: null as null | ((event: { data: AssetImportWorkerRequest }) => Promise<void>) };
  vi.stubGlobal("self", scope); await import("../../../src/features/import/asset-import.worker");
  const bytes = await workbookBytes([{ name: "DATA", rows: [headers, ...Array.from({ length: 125 }, () => assetRow)] }]);
  await scope.onmessage!({ data: { file: new File([bytes], "synthetic.xlsx"), ruleVersion: "synthetic-v1" } });
  const result = postMessage.mock.calls.at(-1)![0] as Extract<AssetImportWorkerResult, { type: "result" }>;
  expect(result.type).toBe("result"); expect(result.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(result.summary.candidateRows).toBe(125); expect(result.preview).toHaveLength(100); expect(result).not.toHaveProperty("rows");
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});
