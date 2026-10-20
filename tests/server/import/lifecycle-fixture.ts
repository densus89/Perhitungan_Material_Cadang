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

export async function resumableFixture(expectedRows = 2) {
  const result = await fixture();
  const session = result.tables.import_sessions.find((row) => row.id === result.created.importId)!;
  const sheetId = "80000000-0000-4000-8000-000000000001";
  const mappingHash = "b".repeat(64);
  result.tables.import_sheets = [{
    id: sheetId,
    import_session_id: session.id,
    unit_induk_id: session.unit_induk_id,
    name: "DATA",
    selected: true,
    header_row: 1,
    layout_hash: mappingHash,
    diagnostics: {},
    row_count: expectedRows + 1,
    column_count: headers.length,
    created_at: result.deps.now(),
  }];
  return {
    ...result,
    claimInput: {
      importId: String(session.id),
      expectedRevision: String(session.mapping_revision),
      run: {
        id: "30000000-0000-4000-8000-000000000001",
        expected_row_count: expectedRows,
        expected_valuation_count: expectedRows,
        source_hash: result.input.sha256,
        mapping_hash: mappingHash,
        rule_version: "synthetic-v1",
        expected_rows_hash: "c".repeat(64),
        expected_valuations_hash: "d".repeat(64),
      },
    },
  };
}
