import { createHash } from "node:crypto";
import { createAssetImport } from "../../../src/server/import/service";
import { workbookBytes, headers, assetRow } from "../../fixtures/asset-workbooks";
import { actor, unitId, fakeDependencies } from "./fakes";

export async function fixture(rows: unknown[][] = [assetRow], labels: string[] = headers) {
  const fake = fakeDependencies(); const bytes = await workbookBytes([{ name: "DATA", rows: [labels, ...rows] }]);
  fake.tables.unit_induk = [{ id: unitId, code: "UNIT DEMO", name: "Unit Demo" }];
  fake.tables.useful_life_rules = [{ id: "50000000-0000-4000-8000-000000000001", rule_version: "synthetic-v1", function_code: "TRANS", class_code: "10600", type_code: "07", subtype_code: "102", useful_life_years: 40, effective_from: "2016-01-01", effective_to: null, source_document: "Synthetic rule", source_locator: "Synthetic 1", source_hash: "a".repeat(64) }];
  const input = { unitId, fileName: "synthetic.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" as const, byteSize: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
  const created = await createAssetImport(actor, input, fake.deps); fake.objects.set(created.upload!.path, bytes);
  return { ...fake, bytes, input, created };
}
