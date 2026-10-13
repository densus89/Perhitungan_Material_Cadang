import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function assertTapPassed(tap) {
  const lines = tap.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.some((line) => /^Bail out!/i.test(line))) throw new Error("pgTAP bailout");
  const plans = lines.filter((line) => /^1\.\.\d+(?:\s|$)/.test(line));
  if (plans.length !== 1) throw new Error("pgTAP requires exactly one plan");
  const count = Number(plans[0].match(/^1\.\.(\d+)/)[1]);
  if (count < 1) throw new Error("pgTAP requires a nonempty plan");
  if (lines.some((line) => /^not ok\b/.test(line))) throw new Error("pgTAP assertions failed");
  const results = lines.filter((line) => /^ok\s+\d+(?:\s|$)/.test(line));
  if (results.length !== count) throw new Error("pgTAP result count does not match plan");
  results.forEach((line, index) => {
    if (Number(line.match(/^ok\s+(\d+)/)[1]) !== index + 1) {
      throw new Error("pgTAP result sequence does not match plan");
    }
  });
  return count;
}

// Only top-level SELECT statements are captured. Quoted SQL/DO bodies and setup
// statements remain intact; the authoritative test file is never modified.
function sqlStatements(sql) {
  const statements = [];
  let current = "";
  let quote = "";
  let commentDepth = 0;
  for (let index = 0; index < sql.length; index++) {
    const char = sql[index];
    const next = sql[index + 1];
    if (commentDepth) {
      if (char === "/" && next === "*") { commentDepth++; index++; }
      else if (char === "*" && next === "/") { commentDepth--; index++; }
      continue;
    }
    if (quote) {
      if (sql.startsWith(quote, index)) {
        current += quote;
        index += quote.length - 1;
        if ((quote === "'" || quote === '"') && sql[index + 1] === quote) {
          current += sql[++index];
        } else quote = "";
      } else current += char;
      continue;
    }
    if (char === "-" && next === "-") {
      while (index < sql.length && sql[index] !== "\n") index++;
      current += "\n";
      continue;
    }
    if (char === "/" && next === "*") { commentDepth = 1; index++; current += " "; continue; }
    const dollarQuote = char === "$" ? sql.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z_0-9]*)?\$/)?.[0] : undefined;
    if (char === "'" || char === '"' || dollarQuote) {
      quote = dollarQuote ?? char;
      current += quote;
      index += quote.length - 1;
    } else if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += char;
  }
  if (quote || commentDepth) throw new Error("Unterminated SQL quote or comment");
  if (current.trim()) statements.push(current.trim());
  return statements;
}

export function wrapTapSql(sql) {
  const statements = sqlStatements(sql);
  if (!/^begin$/i.test(statements[0] ?? "") || !/^rollback$/i.test(statements.at(-1) ?? "")) {
    throw new Error("pgTAP test must use a BEGIN/ROLLBACK transaction");
  }
  const body = statements.slice(1, -1);
  if (body.some((statement) => /^(?:commit|end|begin|rollback)\b/i.test(statement))) {
    throw new Error("pgTAP test must not commit or change its transaction");
  }
  const captured = body.map((statement) => /^select\b/i.test(statement)
    ? `insert into pg_temp.codex_tap_output (tap) select result.value from (${statement}) as assertion cross join lateral jsonb_each_text(to_jsonb(assertion)) as result;`
    : `${statement};`);
  return [
    "begin;",
    "create temporary table codex_tap_output (ordinal bigint generated always as identity, tap text) on commit drop;",
    "grant select, insert on pg_temp.codex_tap_output to public;",
    "grant usage on sequence pg_temp.codex_tap_output_ordinal_seq to public;",
    ...captured,
    "reset role;",
    "select tap from pg_temp.codex_tap_output order by ordinal;",
    "rollback;",
  ].join("\n");
}

function testFiles(paths) {
  return paths.flatMap((path) => path.endsWith(".sql") || path.endsWith(".pg")
    ? [resolve(path)]
    : readdirSync(path, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() || /\.(sql|pg)$/.test(entry.name) ? testFiles([join(path, entry.name)]) : []));
}

function run() {
  const args = process.argv.slice(2).filter((arg) => arg !== "--");
  const files = testFiles(args.length ? args : ["supabase/tests"]).sort();
  if (!files.length) throw new Error("No pgTAP SQL tests found");
  const cli = resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/supabase/dist/supabase.js");
  for (const file of files) {
    const temporary = mkdtempSync(join(tmpdir(), "codex-pgtap-"));
    try {
      const wrapper = join(temporary, "test.sql");
      writeFileSync(wrapper, wrapTapSql(readFileSync(file, "utf8")));
      const result = spawnSync(process.execPath, [cli, "db", "query", "--linked", "--file", wrapper,
        "--output", "json", "--output-format", "text", "--agent", "no"], { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      if (result.error || result.status !== 0) throw new Error(`Linked SQL runner failed for ${file}`);
      const rows = JSON.parse(result.stdout);
      if (!Array.isArray(rows) || rows.some((row) => typeof row.tap !== "string")) {
        throw new Error("Linked SQL runner returned invalid TAP rows");
      }
      const tap = rows.map((row) => row.tap).join("\n");
      console.log(tap);
      console.log(`${file}: ${assertTapPassed(tap)} assertions passed`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { run(); } catch (error) {
    console.error(error instanceof Error ? error.message : "pgTAP runner failed");
    process.exitCode = 1;
  }
}
