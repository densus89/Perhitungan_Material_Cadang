// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { assertTapPassed, wrapTapSql } from "../../scripts/db-test.mjs";

describe("linked pgTAP result validation", () => {
  it("accepts all-ok results with a matching plan", () => {
    expect(assertTapPassed("1..2\nok 1 - enums exist\nok 2 - tables exist")).toBe(2);
  });

  it("rejects a failing assertion even if the CLI exits successfully", () => {
    expect(() => assertTapPassed("1..2\nok 1 - enums exist\nnot ok 2 - tables exist\n# missing table"))
      .toThrow(/failed/i);
  });

  it("rejects missing plan instead of claiming an empty result passed", () => {
    expect(() => assertTapPassed("ok 1 - table exists")).toThrow(/plan/i);
    expect(() => assertTapPassed("")).toThrow(/plan/i);
  });

  it("rejects incomplete, duplicate, and out-of-order result sequences", () => {
    expect(() => assertTapPassed("1..2\nok 1 - table exists")).toThrow(/count/i);
    expect(() => assertTapPassed("1..2\nok 1 - first\nok 1 - duplicate")).toThrow(/sequence/i);
    expect(() => assertTapPassed("1..2\nok 2 - second\nok 1 - first")).toThrow(/sequence/i);
  });

  it("rejects bailout and a zero-test plan", () => {
    expect(() => assertTapPassed("1..1\nBail out! broken setup")).toThrow(/bail/i);
    expect(() => assertTapPassed("1..0")).toThrow(/plan/i);
  });
});

describe("pgTAP SQL capture wrapper", () => {
  it("captures top-level SELECT output and returns it before rollback", () => {
    const wrapped = wrapTapSql("begin; select plan(1); select ok(true, 'a;b'); select * from finish(); rollback;");
    expect(wrapped).toContain("insert into pg_temp.codex_tap_output");
    expect(wrapped).toContain("select ok(true, 'a;b')");
    expect(wrapped.trim()).toMatch(/select tap from pg_temp\.codex_tap_output order by ordinal;\s*rollback;$/i);
    expect((wrapped.match(/insert into pg_temp\.codex_tap_output/g) ?? [])).toHaveLength(3);
  });

  it("preserves setup, comments, and quoted blocks without capturing nested SELECTs", () => {
    const wrapped = wrapTapSql("begin; -- SELECT in a comment;\ncreate extension if not exists pgtap; do $$ begin perform 1; end $$; select ok(true, 'it''s valid'); rollback;");
    expect(wrapped).toContain("do $$ begin perform 1; end $$;");
    expect(wrapped).toContain("select ok(true, 'it''s valid')");
    expect((wrapped.match(/insert into pg_temp\.codex_tap_output/g) ?? [])).toHaveLength(1);
  });

  it("refuses test SQL that could commit fixture data", () => {
    expect(() => wrapTapSql("select plan(1); select ok(true); commit;")).toThrow(/transaction/i);
    expect(() => wrapTapSql("begin; select plan(1); commit; rollback;")).toThrow(/commit/i);
  });

  it("rejects escape strings before an escaped quote can hide a COMMIT", () => {
    const sql = String.raw`begin;
insert into public.unit_induk (code, name) values (E'it\'s_one', 'x');
commit;
insert into public.unit_induk (code, name) values (E'it\'s_two', 'y');
select plan(1);
select ok(true);
rollback;`;
    expect(() => wrapTapSql(sql)).toThrow(/unsupported.*escape/i);
  });

  it("rejects backslash string escapes independently of session string settings", () => {
    const sql = String.raw`begin;
set local standard_conforming_strings = off;
insert into public.unit_induk (code, name) values ('it\'s_one', 'x');
commit;
insert into public.unit_induk (code, name) values ('it\'s_two', 'y');
select plan(1);
select ok(true);
rollback;`;
    expect(() => wrapTapSql(sql)).toThrow(/unsupported.*escape/i);
  });

  it.each(["abort", "ABORT WORK", "abort transaction", "prepare transaction 'synthetic-test'", "PREPARE /* comment */ TRANSACTION 'synthetic-test'"])(
    "rejects the transaction-ending statement %s",
    (statement) => {
      expect(() => wrapTapSql(`begin; ${statement}; select plan(1); select ok(true); rollback;`))
        .toThrow(/transaction/i);
    },
  );

  it.each(["001_foundation_schema.test.sql", "001_foundation_behavior.test.sql"])(
    "continues to wrap the ordinary SQL in %s",
    (filename) => {
      const sql = readFileSync(new URL(`../../supabase/tests/${filename}`, import.meta.url), "utf8");
      expect(() => wrapTapSql(sql)).not.toThrow();
    },
  );
});
