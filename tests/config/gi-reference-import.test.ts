// @vitest-environment node
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseGiReference, parseImportArguments, runGiImport } from "../../scripts/import-gi-reference.mjs";

const header = "No,func loc id,Unit Induk,UPT,Nama GI,lat,long";
const valid = `${header}\r\n1,F-1,UIT JBB,UPT Sintetis,GI Sintetis,-6.2,106.8\r\n`;
const bytes = (text: string) => Buffer.from(text);
describe("audited GI reference import", () => {
  it("reads exact quoted CSV headers, preserves zero coordinates and hashes original bytes", () => {
    const source = bytes(`\ufeff${header}\r\n1,F-1,UIT JBB,"UPT, Sintetis","GI \"\"S\"\"",0,0\r\n`);
    const parsed = parseGiReference(source);
    expect(parsed.summary).toMatchObject({ sourceRows: 1, validRows: 1, uniqueKeys: 1, duplicateRows: 0, blockingErrors: 0, sha256: createHash("sha256").update(source).digest("hex") });
    expect(parsed.rows).toEqual([{ unit_induk_key: "UIT JBB", upt: "UPT, SINTETIS", nama_gi: 'GI "S"', latitude: 0, longitude: 0 }]);
  });
  it.each(["no", "func_loc_id", "nama gi", "latitude"])("rejects an aliased or missing exact header %s", wrong => {
    const columns = header.split(","); columns[wrong === "no" ? 0 : wrong === "func_loc_id" ? 1 : wrong === "nama gi" ? 4 : 5] = wrong;
    expect(() => parseGiReference(bytes(valid.replace(header, columns.join(","))))).toThrow("INVALID_CSV_HEADERS");
  });
  it("rejects duplicated required headers and malformed quoted CSV without disclosing rows", () => {
    expect(() => parseGiReference(bytes(valid.replace(header, header + ",lat")))).toThrow("INVALID_CSV_HEADERS");
    expect(() => parseGiReference(bytes(header + '\n1,F-1,UIT JBB,"PRIVATE DATA,-6,106'))).toThrow("INVALID_CSV");
  });
  it("blocks invalid/missing keys and nonfinite/out-of-range coordinates while retaining aggregate reasons", () => {
    const parsed = parseGiReference(bytes(`${header}\n1,,UIT JBB,UPT,GI,-6,106\n2,F2,,UPT,GI,-6,106\n3,F3,UIT JBB,,GI,-6,106\n4,F4,UIT JBB,UPT,,0,0\n5,F5,UIT JBB,UPT,GI5,NaN,106\n6,F6,UIT JBB,UPT,GI6,91,181\n7,F7,UIT JBB,UPT,GI7,,0\n`));
    expect(parsed.summary).toMatchObject({ sourceRows: 7, validRows: 0, blockingErrors: 7, errorCounts: { MISSING_KEY: 4, INVALID_COORDINATES: 3 } });
    expect(parsed.rows).toEqual([]);
  });
  it("reconciles only identical normalized GI coordinates and blocks every coordinate or functional-location conflict", () => {
    const parsed = parseGiReference(bytes(`${valid}2,F-2, UIT   JBB , upt sintetis ,gi sintetis,-6.20,106.80\n3,F-3,UIT JBB,UPT Sintetis,GI Sintetis,-6.3,106.8\n4,F-1,UIT JBB,UPT Sintetis,GI Other,-6.2,106.8\n`));
    expect(parsed.summary).toMatchObject({ sourceRows: 4, duplicateRows: 1, blockingErrors: 2, errorCounts: { CONFLICTING_GI_KEY: 1, CONFLICTING_FUNCTIONAL_LOCATION: 1 } });
  });
  it("requires exactly one mode, a source version and explicit UUID actor for confirmation", () => {
    expect(parseImportArguments(["--", "--file", "private.csv", "--source-version", "gi-v1", "--dry-run"])).toEqual({ file: "private.csv", sourceVersion: "gi-v1", mode: "dry-run", actorId: null });
    for (const args of [[], ["--file", "x", "--source-version", "v"], ["--file", "x", "--source-version", "v", "--dry-run", "--confirm"], ["--file", "x", "--source-version", "v", "--confirm"], ["--file", "x", "--source-version", "v", "--dry-run", "--unknown"]]) expect(() => parseImportArguments(args)).toThrow("INVALID_ARGUMENTS");
  });
  it("dry-runs without credentials and prints only source aggregates, never labels or file paths", async () => {
    const output: unknown[] = [];
    const result = await runGiImport({ args: ["--file", "PRIVATE_PATH.csv", "--source-version", "gi-v1", "--dry-run"], env: {}, read: async () => bytes(valid), log: (value: unknown) => output.push(value) });
    expect(result).toBe(0);
    expect(output).toHaveLength(1);
    expect(output[0]).toMatchObject({ mode: "dry-run", sourceVersion: "gi-v1", sourceRows: 1, uniqueKeys: 1, blockingErrors: 0 });
    expect(JSON.stringify(output)).not.toMatch(/PRIVATE_PATH|UPT Sintetis|GI Sintetis|F-1|-6\.2|106\.8/);
  });
  it("fails closed before RPC on validation errors or missing server credentials", async () => {
    const rpc = vi.fn(); const client = { rpc };
    const args = ["--file", "private.csv", "--source-version", "gi-v1", "--confirm", "--actor-id", "d5080000-0001-4000-8000-000000000001"];
    await expect(runGiImport({ args, env: {}, client, read: async () => bytes(valid), log: () => {} })).rejects.toThrow("SERVER_CREDENTIALS_REQUIRED");
    expect(await runGiImport({ args, env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "PRIVATE_SECRET" }, client, read: async () => bytes(valid.replace("-6.2", "NaN")), log: () => {} })).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("confirms with one atomic audited RPC and sanitizes unexpected service errors", async () => {
    const rpc = vi.fn(async () => ({ data: { rowCount: 1, replacedCount: 0 }, error: null })); const output: unknown[] = [];
    const args = ["--file", "private.csv", "--source-version", "gi-v1", "--confirm", "--actor-id", "d5080000-0001-4000-8000-000000000001"];
    const options = { args, env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", SUPABASE_SECRET_KEY: "PRIVATE_SECRET" }, client: { rpc }, read: async () => bytes(valid), log: (value: unknown) => output.push(value) };
    expect(await runGiImport(options)).toBe(0);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("replace_gi_location_reference", { p_actor_id: args.at(-1), p_source_version: "gi-v1", p_source_hash: createHash("sha256").update(bytes(valid)).digest("hex"), p_rows: [{ unit_induk_key: "UIT JBB", upt: "UPT SINTETIS", nama_gi: "GI SINTETIS", latitude: -6.2, longitude: 106.8 }] });
    expect(JSON.stringify(output)).not.toContain("PRIVATE_SECRET");
    rpc.mockResolvedValueOnce({ data: null, error: { message: "PRIVATE_SECRET row data" } } as never);
    await expect(runGiImport(options)).rejects.toThrow(/^GI_REFERENCE_REPLACE_FAILED$/);
  });
});
