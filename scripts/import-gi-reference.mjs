import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HEADERS = ["No", "func loc id", "Unit Induk", "UPT", "Nama GI", "lat", "long"];
const normalize = value => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toUpperCase();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** RFC 4180 quoting, BOM and CRLF. Errors never include source content. */
function csvRecords(text) {
  const records = []; let record = [], field = "", quoted = false, closed = false;
  text = text.replace(/^\ufeff/, "");
  const emit = () => { record.push(field); if (record.some(value => value.trim())) records.push(record); record = []; field = ""; closed = false; };
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ",") { record.push(field); field = ""; closed = false; }
    else if (char === "\r" || char === "\n") { emit(); if (char === "\r" && text[index + 1] === "\n") index++; }
    else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw new Error("INVALID_CSV");
    else field += char;
  }
  if (quoted) throw new Error("INVALID_CSV");
  if (field || record.length || closed) emit();
  return records;
}

export function parseGiReference(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const [headers, ...records] = csvRecords(text);
  if (!headers || HEADERS.some(header => headers.filter(value => value === header).length !== 1)) throw new Error("INVALID_CSV_HEADERS");
  const indexes = Object.fromEntries(HEADERS.map(header => [header, headers.indexOf(header)]));
  const summary = { sourceRows: records.length, validRows: 0, uniqueKeys: 0, duplicateRows: 0, blockingErrors: 0, errorCounts: {}, sha256: createHash("sha256").update(bytes).digest("hex") };
  const locations = new Map(), functionalLocations = new Map();
  const error = code => { summary.blockingErrors++; summary.errorCounts[code] = (summary.errorCounts[code] ?? 0) + 1; };
  if (!records.length) error("EMPTY_REFERENCE");
  for (const record of records) {
    if (record.length !== headers.length) { error("INVALID_COLUMN_COUNT"); continue; }
    const get = header => record[indexes[header]].trim();
    if (!["No", "func loc id", "Unit Induk", "UPT", "Nama GI"].every(header => get(header)) || !/^[1-9]\d*$/.test(get("No"))) { error("MISSING_KEY"); continue; }
    const coordinate = header => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(get(header)) ? Number(get(header)) : NaN;
    const latitude = coordinate("lat"), longitude = coordinate("long");
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) { error("INVALID_COORDINATES"); continue; }
    const row = { unit_induk_key: normalize(get("Unit Induk")), upt: normalize(get("UPT")), nama_gi: normalize(get("Nama GI")), latitude, longitude };
    const key = JSON.stringify([row.unit_induk_key, row.upt, row.nama_gi]), point = JSON.stringify([latitude, longitude]);
    const functionalKey = normalize(get("func loc id")), functional = functionalLocations.get(functionalKey);
    if (functional && functional !== key + point) { error("CONFLICTING_FUNCTIONAL_LOCATION"); continue; }
    functionalLocations.set(functionalKey, key + point);
    const previous = locations.get(key);
    if (previous && (previous.latitude !== latitude || previous.longitude !== longitude)) { error("CONFLICTING_GI_KEY"); continue; }
    if (previous) summary.duplicateRows++; else locations.set(key, row);
    summary.validRows++;
  }
  const rows = [...locations.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row);
  summary.uniqueKeys = rows.length;
  return { rows, summary };
}

export function parseImportArguments(input) {
  const args = input.filter(value => value !== "--"), values = new Map();
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (!["--file", "--source-version", "--actor-id", "--dry-run", "--confirm"].includes(key) || values.has(key)) throw new Error("INVALID_ARGUMENTS");
    if (["--dry-run", "--confirm"].includes(key)) values.set(key, true);
    else { const value = args[++index]; if (!value?.trim() || value.startsWith("--")) throw new Error("INVALID_ARGUMENTS"); values.set(key, value); }
  }
  const file = values.get("--file"), sourceVersion = values.get("--source-version"), actorId = values.get("--actor-id") ?? null;
  if (!file || !sourceVersion || sourceVersion.length > 120 || Boolean(values.get("--dry-run")) === Boolean(values.get("--confirm")) || actorId && !uuid.test(actorId) || values.get("--confirm") && !actorId) throw new Error("INVALID_ARGUMENTS");
  return { file, sourceVersion, mode: values.has("--confirm") ? "confirm" : "dry-run", actorId };
}

/** @param {{args:string[],env?:Record<string,string|undefined>,read?:(path:string)=>Promise<Uint8Array>,log?:(value:unknown)=>unknown,client?:{rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{data:{rowCount:number,replacedCount:number}|null,error:unknown}>}}} options */
export async function runGiImport({ args, env = process.env, read = readFile, log = value => console.log(JSON.stringify(value)), client }) {
  const options = parseImportArguments(args);
  const parsed = parseGiReference(await read(options.file));
  log({ mode: options.mode, sourceVersion: options.sourceVersion, ...parsed.summary });
  if (parsed.summary.blockingErrors) return 1;
  if (options.mode === "dry-run") return 0;
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !env.SUPABASE_SECRET_KEY?.trim()) throw new Error("SERVER_CREDENTIALS_REQUIRED");
  const service = client ?? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  let result;
  try { result = await service.rpc("replace_gi_location_reference", { p_actor_id: options.actorId, p_source_version: options.sourceVersion, p_source_hash: parsed.summary.sha256, p_rows: parsed.rows }); }
  catch { throw new Error("GI_REFERENCE_REPLACE_FAILED"); }
  if (result.error || !result.data || result.data.rowCount !== parsed.rows.length) throw new Error("GI_REFERENCE_REPLACE_FAILED");
  log({ mode: "confirmed", sourceVersion: options.sourceVersion, sha256: parsed.summary.sha256, rowCount: result.data.rowCount, replacedCount: result.data.replacedCount });
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = await runGiImport({ args: process.argv.slice(2) }); }
  catch (error) { const allowed = /^(INVALID_ARGUMENTS|INVALID_CSV_HEADERS|INVALID_CSV|SERVER_CREDENTIALS_REQUIRED|GI_REFERENCE_REPLACE_FAILED)$/; console.error(error instanceof Error && allowed.test(error.message) ? error.message : "GI_REFERENCE_IMPORT_FAILED"); process.exitCode = 1; }
}
