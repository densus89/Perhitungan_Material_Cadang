# Asset Snapshot Import and Valuation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, auditable asset-snapshot workflow that accepts legacy or canonical Excel workbooks, resolves book-value inputs safely, and activates a complete unit snapshot only after DIV RST approval.

**Architecture:** A small Client Component and Web Worker provide local structure detection and preview, while private Supabase Storage preserves the source workbook. A Node.js Route Handler re-parses the stored file with the same versioned domain rules, writes a replaceable processing run in batches, and finalizes only a complete run. Supabase RLS isolates unit drafts; server-only service-role workflows handle signed uploads, submission, comparison, approval, and atomic activation.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, TypeScript 5.9 strict mode, Node.js 24, pnpm 11, ExcelJS 4.4.0, Zod 4.6, Supabase/PostgreSQL/Storage, Vitest 5, React Testing Library, pgTAP, and Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-15-asset-snapshot-import-and-valuation-design.md`

## Global Constraints

- Runtime remains `node >=24.15.0 <25` and package manager remains `pnpm@11.25.0`.
- Follow Next.js 16.4 App Router conventions: pages are Server Components by default, browser-only parsing lives behind a narrow Client Component boundary, and APIs use Web `Request`/`Response` Route Handlers.
- Accept `.xlsx` only in this phase, maximum 50 MiB; reject `.xls`, `.xlsm`, `.csv`, macro-enabled workbooks, and mismatched MIME/extension combinations before upload.
- `UNIT_INDUK`, `UPT`, equipment/specification, positive quantity, unit, and P0-P4 condition are canonical requirements; P0 is most critical and P4 is best.
- The canonical sheet is `DATA_ASET`; `3400` is only a supported legacy alias. Sheet and header detection must be content-based.
- Preserve the original specification. Approximate RFQ grouping is never automatic and only an already approved RFQ group may satisfy the technical compatibility gate.
- Classification value is `nilaiABC`: actual SAP book value, provided adjusted book value, or an estimated depreciated book value. Raw current/new acquisition price never enters ABC classification directly.
- The downstream ABC engine must emit `A1`, `A2`, `B1`, `B2`, and `C`; class C remains visible/auditable but receives no spare allocation. New acquisition price is a separate downstream input for Optimum Spare on A2 and B1.
- Missing age may use the approved compatible-cohort median with `AGE_IMPUTED`; P0-P4 must never be used to infer age.
- Zero book value is valid; empty, negative, non-finite, or formula-error values are not silently converted to zero.
- The browser preview is advisory. Only the server re-parse of the private stored file can mark a version ready to submit.
- Source workbooks remain in the private `source-files` bucket. The service-role key stays server-only, and all state-changing routes verify Actor, unit scope, origin, content type, and input schema.
- A unit upload is always a complete snapshot. Submission never deletes the active version; DIV RST approval atomically switches the active pointer and retains the old version as history.
- Do not commit operational workbooks or row data. Tests and benchmarks generate synthetic fixtures only.
- The processing Route Handler uses the Node.js runtime and `maxDuration = 300`; hosted acceptance requires the representative 141,105-row run to complete within that boundary and below the Hobby memory limit.

## Review Focus

- Shifted headers, duplicate `MARA`, example rows, and helper columns must map deterministically or stop for confirmation; covered in Task 2 parser tests.
- Formula cells with missing/error cache values and locale-formatted numeric text must never become silent zeroes; covered in Task 2 and Task 3 tests.
- Missing age must use only a technically compatible cohort in the prescribed location order and must never use condition P0-P4; covered in Task 3 tests.
- A failed or retried 141k-row server processing run must not expose partial rows as the current draft result; covered in Task 4 database tests and Task 5 service tests.
- Cross-unit users and unauthenticated callers must not read files, mappings, rows, comparisons, or mutations; covered in Task 4 pgTAP and Task 5 Route Handler tests.

---

### Task 1: Canonical Asset Contract and Downloadable Excel Template

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/domain/asset-import/types.ts`
- Create: `src/domain/asset-import/fields.ts`
- Create: `src/lib/spreadsheet/build-asset-template.ts`
- Create: `app/api/templates/asset-snapshot/route.ts`
- Create: `tests/domain/asset-import-fields.test.ts`
- Create: `tests/server/import/template-route.test.ts`

**Interfaces:**
- Consumes: existing `AssetCondition` semantics and `requireActor(client)`.
- Produces: `CanonicalAssetField`, `CANONICAL_ASSET_FIELDS`, `AssetCondition`, `CanonicalAssetInput`, `ValuationSource`, `RowIssue`, `buildAssetTemplate(): Promise<Uint8Array>`, and authenticated `GET /api/templates/asset-snapshot/`.

- [ ] **Step 1: Add failing canonical-field tests**

Assert `CANONICAL_ASSET_FIELDS` contains the exact columns from the spec; distinguishes required, conditional, and optional fields; exposes legacy aliases such as `NAMAGI`, `MARA`, `NO ASSET`, and `nilai_buku_SAP`; and does not define calculated fields as editable input.

- [ ] **Step 2: Add failing template and route tests**

Load the returned bytes with ExcelJS and assert sheets `PETUNJUK`, `DATA_ASET`, and `REFERENSI` exist; `DATA_ASET` has the canonical headers in fixed order; condition validation lists `P0` through `P4`; no operational example is embedded; the filename is `template-snapshot-aset.xlsx`; unauthenticated access returns 401; and a valid Actor receives private, no-store response headers.

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `pnpm test -- tests/domain/asset-import-fields.test.ts tests/server/import/template-route.test.ts`

Expected: FAIL because the canonical contract, generator, and route do not exist.

- [ ] **Step 4: Install the workbook dependency**

Run: `pnpm add exceljs@4.4.0`

Expected: `package.json` and `pnpm-lock.yaml` pin ExcelJS 4.4.0 without unrelated dependency updates.

- [ ] **Step 5: Implement the canonical domain contract**

Define exact unions and interfaces:

```ts
type AssetCondition = "P0" | "P1" | "P2" | "P3" | "P4";
type FieldRequirement = "REQUIRED" | "CONDITIONAL" | "OPTIONAL";
type ValuationSource =
  | "SAP_BOOK_VALUE"
  | "PROVIDED_ADJUSTED_VALUE"
  | "SYSTEM_DEPRECIATION"
  | "ESTIMATED_SAME_GI"
  | "ESTIMATED_SAME_UPT"
  | "ESTIMATED_NEAREST_LOCATION"
  | "ESTIMATED_NATIONAL"
  | "UNRESOLVED";
```

`CanonicalAssetInput` must keep `nilaiAbcInput` separate from `hargaPengadaanSaatIni`; calculated values and issue codes belong to result types, not editable input fields.

- [ ] **Step 6: Build the template and authenticated download route**

`buildAssetTemplate()` creates styled frozen headers, autofilter, number/date formats, field comments, and list validation sourced from `REFERENSI`. The route imports `server-only` dependencies indirectly through the existing server client, calls `requireActor`, and returns an attachment without caching.

- [ ] **Step 7: Run the Task 1 quality gate**

Run: `pnpm test -- tests/domain/asset-import-fields.test.ts tests/server/import/template-route.test.ts`

Run: `pnpm lint`

Expected: PASS with no lint warnings.

- [ ] **Step 8: Commit the template contract**

Run: `git add package.json pnpm-lock.yaml src/domain/asset-import src/lib/spreadsheet/build-asset-template.ts app/api/templates tests/domain/asset-import-fields.test.ts tests/server/import/template-route.test.ts`

Run: `git commit -m "feat: add canonical asset workbook template"`

### Task 2: Adaptive Workbook Detection and Canonical Row Parsing

**Files:**
- Create: `src/domain/asset-import/normalize-header.ts`
- Create: `src/domain/asset-import/detect-layout.ts`
- Create: `src/domain/asset-import/parse-value.ts`
- Create: `src/domain/asset-import/canonicalize-row.ts`
- Create: `src/lib/spreadsheet/read-asset-workbook.ts`
- Create: `tests/fixtures/asset-workbooks.ts`
- Create: `tests/domain/asset-layout-detection.test.ts`
- Create: `tests/domain/asset-row-parsing.test.ts`
- Create: `tests/server/import/read-asset-workbook.test.ts`

**Interfaces:**
- Consumes: Task 1 field definitions and ExcelJS.
- Produces: `normalizeHeader(value): string`, `detectWorkbookLayout(workbook): WorkbookLayoutProposal`, `parseLocalizedNumber(value): ParsedNumber`, `canonicalizeAssetRow(row, mapping, provenance): CanonicalizedAssetRow`, and `readAssetWorkbook(bytes, options): Promise<ParsedAssetWorkbook>`.

- [ ] **Step 1: Write failing header and layout tests**

Generate small in-memory workbooks for: canonical `DATA_ASET`; renamed legacy `3400`; header on row 1 and row 5; duplicate `MARA` where the second column contains asset numbers; example rows followed by a spacer; and an unrelated helper sheet. Assert the correct sheet/header is proposed, duplicate columns remain distinct by index, confidence is reported, and ambiguous required fields require confirmation.

- [ ] **Step 2: Write failing row and number parsing tests**

Cover integer/decimal numbers, Indonesian grouping text, blank, actual zero, negative, `#N/A`, `#VALUE!`, non-finite values, date/age precedence, P0-P4 validation, positive quantity, and preservation of source sheet/row/column addresses. Assert formula cells retain formula provenance but are errors when their cached result is absent or invalid.

- [ ] **Step 3: Write failing end-to-end workbook reader tests**

Assert the reader scans the first 50 rows of every sheet, returns only candidate data rows, excludes examples/spacers/subtotals/helper columns, limits preview output without truncating total counts, and returns deterministic layout and canonical hashes for identical bytes and rule version.

- [ ] **Step 4: Run parser tests and verify failure**

Run: `pnpm test -- tests/domain/asset-layout-detection.test.ts tests/domain/asset-row-parsing.test.ts tests/server/import/read-asset-workbook.test.ts`

Expected: FAIL because parsing modules do not exist.

- [ ] **Step 5: Implement normalized header matching and scoring**

Normalize case, whitespace, newlines, underscores, and punctuation. Score a row by distinct required/conditional field hits plus sampled column-type compatibility. A sheet name match adds score but never bypasses field requirements. Return column-index mappings rather than a header-name dictionary so duplicate labels remain auditable.

- [ ] **Step 6: Implement safe cell conversion and row candidacy**

Never execute formulas, macros, or external links. Treat ExcelJS cached scalar results as untrusted values that still pass type validation. Keep actual zero. Mark invalid numeric tokens as issues. Require identity/location plus equipment or specification, quantity, and unit before treating a row as a candidate; keep rejected-row counts and reasons in the summary.

- [ ] **Step 7: Implement the shared workbook reader**

Use ExcelJS only as the file adapter. Keep the detection/canonicalization functions independent of browser or server APIs. `ReadAssetWorkbookOptions` includes `ruleVersion`, optional confirmed mapping, `previewLimit`, and `collectRows`; the browser uses `collectRows: false`, while the authoritative server run streams canonical results to a batch callback rather than retaining every row twice.

- [ ] **Step 8: Run the Task 2 quality gate**

Run: `pnpm test -- tests/domain/asset-layout-detection.test.ts tests/domain/asset-row-parsing.test.ts tests/server/import/read-asset-workbook.test.ts`

Run: `pnpm lint`

Expected: PASS and no operational fixture appears in Git.

- [ ] **Step 9: Commit the adaptive parser**

Run: `git add src/domain/asset-import src/lib/spreadsheet/read-asset-workbook.ts tests/fixtures/asset-workbooks.ts tests/domain/asset-layout-detection.test.ts tests/domain/asset-row-parsing.test.ts tests/server/import/read-asset-workbook.test.ts`

Run: `git commit -m "feat: parse legacy and canonical asset workbooks"`

### Task 3: Useful-Life, Comparable Selection, and Valuation Rules

**Files:**
- Create: `src/reference/useful-life-perdir-0299.ts`
- Create: `src/domain/asset-import/useful-life.ts`
- Create: `src/domain/asset-import/comparables.ts`
- Create: `src/domain/asset-import/valuation.ts`
- Create: `src/domain/asset-import/validate-row.ts`
- Create: `tests/domain/useful-life.test.ts`
- Create: `tests/domain/asset-comparables.test.ts`
- Create: `tests/domain/asset-valuation.test.ts`
- Create: `tests/domain/asset-validation.test.ts`

**Interfaces:**
- Consumes: Task 2 `CanonicalizedAssetRow`, parsed numeric values, normalized specification, and provenance.
- Produces: `resolveUsefulLife(asset, rules): UsefulLifeResolution`, `rankComparableCandidates(target, candidates): ComparableSelection`, `imputeAssetAge(target, cohort): AgeResolution`, `calculateDepreciatedBookValue(referencePrice, ageYears, usefulLifeYears): number`, `resolveAssetValuation(asset, context): ValuationResolution`, and `validateAssetRow(asset, valuation): RowValidationResult`.

- [ ] **Step 1: Write failing useful-life tests**

Assert exact code mapping wins over curated alias; ambiguous aliases require manual approval; effective dates select the correct rule version; and verified reference examples resolve transmission/GI/OHL/underground cable to 40 years, distribution transformer to 25, data/telecom to 10, and general equipment to 5. Assert no global 40-year fallback exists.

- [ ] **Step 2: Write failing comparable and age-imputation tests**

Assert exact normalized specification or approved RFQ group is a hard gate; incompatible voltage variants such as 150/20 kV and 150/22/10 kV never mix; location order is same GI, same UPT, same Unit Induk, nearest coordinates, then national; newest price basis wins; ties use median; one donor and high dispersion generate warnings; and no candidate returns unresolved.

Assert missing age uses median from compatible same-GI, same-UPT, same-unit, then national cohorts; conditions P0-P4 are ignored; and an empty compatible cohort remains unresolved.

- [ ] **Step 3: Write failing valuation and validation tests**

Assert source order is SAP book value, provided adjusted value, then depreciated reference price. Assert SAP zero is valid, raw new acquisition price is never returned unchanged as `nilaiABC`, full depreciation floors at zero, target age—not donor age—is applied to current replacement price, near-end-of-life book-value donors cannot be grossed up, and every estimate carries donor/rule evidence plus manual-approval status where required.

Assert missing equipment/specification/quantity/unit, invalid condition, negative/error values, ambiguous useful life, duplicate identity conflict, and unresolved value are blocking errors; numeric text, missing IDs, estimated value/age, one donor, stale price, high dispersion, and fully depreciated zero are warnings.

- [ ] **Step 4: Run domain tests and verify failure**

Run: `pnpm test -- tests/domain/useful-life.test.ts tests/domain/asset-comparables.test.ts tests/domain/asset-valuation.test.ts tests/domain/asset-validation.test.ts`

Expected: FAIL because useful-life and valuation modules do not exist.

- [ ] **Step 5: Implement the versioned useful-life reference**

Transcribe only verified PERDIR 0299.P/DIR/2016 reference rows required by the supported asset families, preserving function, class, type, subtype, years, effective date, source document, and source locator. Alias mappings are separate curated records with explicit approval metadata; absence or ambiguity is not guessed.

- [ ] **Step 6: Implement deterministic donor selection**

Return the selected tier, median, candidate count, min/max, dispersion, selected donor IDs, distances, price dates, and warning codes. Current replacement-price donors ignore donor age; book-value-only donors require usable donor age and a stable remaining-life factor.

- [ ] **Step 7: Implement valuation and row validation**

Use the exact straight-line formula from the spec and separate `valueSource`, `calculationMethod`, `ageStatus`, and `manualApprovalRequired`. Preserve `hargaPengadaanSaatIni` independently for the later Optimum Spare phase.

- [ ] **Step 8: Run the Task 3 quality gate**

Run: `pnpm test -- tests/domain/useful-life.test.ts tests/domain/asset-comparables.test.ts tests/domain/asset-valuation.test.ts tests/domain/asset-validation.test.ts`

Run: `pnpm lint`

Expected: PASS with no unchecked `any` or implicit fallback.

- [ ] **Step 9: Commit valuation rules**

Run: `git add src/reference src/domain/asset-import tests/domain/useful-life.test.ts tests/domain/asset-comparables.test.ts tests/domain/asset-valuation.test.ts tests/domain/asset-validation.test.ts`

Run: `git commit -m "feat: resolve asset book values with audited evidence"`

### Task 4: Supabase Persistence, RLS, and Atomic Version Operations

**Files:**
- Create: `supabase/migrations/202610150003_asset_import_persistence.sql`
- Create: `supabase/tests/004_asset_import_schema.test.sql`
- Create: `supabase/tests/005_asset_import_rls.test.sql`
- Create: `supabase/tests/006_asset_version_workflow.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: existing `datasets`, `dataset_versions`, `approval_events`, `audit_events`, access helpers, and private `source-files` bucket.
- Produces: typed persistent asset-import tables, the `gi_location_references` coordinate master, storage constraints, indexes, RLS policies, `public.finalize_asset_import_run(...)`, `public.submit_asset_version(...)`, `public.return_asset_version(...)`, and `public.activate_asset_version(...)` RPCs callable only by `service_role`.

- [ ] **Step 1: Write failing schema tests**

Assert enums and tables exist for `source_files`, `import_sessions`, `import_sheets`, `mapping_profiles`, `import_column_mappings`, `asset_import_runs`, `asset_snapshot_rows`, `useful_life_rules`, `asset_class_mappings`, `asset_valuations`, `gi_location_references`, `version_comparisons`, and `asset_version_changes`. Assert foreign keys, unit/version ownership, unique object paths, one current run per import session, unique normalized Unit Induk/UPT/GI coordinate keys, row identity indexes, warning/error GIN indexes, and no mutable calculated column on source mapping rows.

- [ ] **Step 2: Write failing RLS and storage-boundary tests**

Prove operator A can read its own unit draft summaries and rows but not operator B's; RST roles can review all units; viewers cannot mutate; authenticated clients cannot write source metadata, bulk rows, valuations, comparisons, approval events, audit events, or storage objects directly; and service-role functions still reject an actor ID without the required relational role/unit scope.

- [ ] **Step 3: Write failing workflow tests**

Cover retry isolation: rows in a failed processing run never become current. Cover finalization: only a complete run with matching counts/hashes becomes `current_run_id`. Cover submit: blocking errors prevent `PENDING_RST`. Cover activation: version becomes `ACTIVE`, previous active becomes `HISTORICAL`, dataset pointer switches, approval/audit events append, and the transaction rolls back completely on any invariant failure.

- [ ] **Step 4: Run database tests and verify failure**

Run: `pnpm db:test -- supabase/tests/004_asset_import_schema.test.sql`

Run: `pnpm db:test -- supabase/tests/005_asset_import_rls.test.sql`

Run: `pnpm db:test -- supabase/tests/006_asset_version_workflow.test.sql`

Expected: FAIL because the persistence migration does not exist.

- [ ] **Step 5: Implement the schema and efficient indexes**

Store typed canonical query columns on `asset_snapshot_rows`; keep compact provenance and issue-code arrays as JSONB/text arrays; store selected donor evidence on the one-to-one `asset_valuations`; keep file bytes only in private Storage. `asset_import_runs` owns batch rows and has `PROCESSING`, `FAILED`, or `COMPLETE`; an import session points to exactly one finalized current run. `gi_location_references` stores normalized `Unit Induk`, `UPT`, `Nama GI`, latitude, longitude, source hash/version, and audit timestamps so nearest-location selection does not depend on the asset workbook carrying coordinates.

Configure `source-files` for private `.xlsx` objects up to 50 MiB. Do not add broad authenticated object policies; server code issues path-scoped signed upload tokens.

- [ ] **Step 6: Implement least-privilege policies and transaction RPCs**

Reuse `private.can_access_unit`, `private.is_rst`, and `private.is_rst_admin`. Client reads follow unit/RST scope; application writes flow through server-only service-role code. Each service-role RPC independently verifies the supplied actor against relational assignments and records immutable approval/audit events.

- [ ] **Step 7: Run migration, database tests, and lint**

Run: `pnpm supabase db push --dry-run --linked`

Run: `pnpm db:test`

Run: `pnpm db:lint`

Expected: dry-run contains only the new migration; all pgTAP tests pass; lint reports no security errors.

- [ ] **Step 8: Regenerate and type-check database definitions**

Run: `pnpm db:types > src/lib/supabase/database.types.ts`

Run: `pnpm build`

Expected: generated types include every new table/enum/RPC and the existing application compiles.

- [ ] **Step 9: Commit persistence and authorization**

Run: `git add supabase src/lib/supabase/database.types.ts`

Run: `git commit -m "feat: persist unit-scoped asset snapshots"`

### Task 5: Signed Upload, Authoritative Processing, and Submission APIs

**Files:**
- Create: `src/domain/asset-import/schemas.ts`
- Create: `src/server/import/dependencies.ts`
- Create: `src/server/import/http.ts`
- Create: `src/server/import/service.ts`
- Create: `src/server/import/process-workbook.ts`
- Create: `app/api/imports/route.ts`
- Create: `app/api/imports/[importId]/route.ts`
- Create: `app/api/imports/[importId]/upload-complete/route.ts`
- Create: `app/api/imports/[importId]/mapping/route.ts`
- Create: `app/api/imports/[importId]/process/route.ts`
- Create: `app/api/imports/[importId]/submit/route.ts`
- Create: `tests/server/import/http.test.ts`
- Create: `tests/server/import/service.test.ts`
- Create: `tests/server/import/process-workbook.test.ts`
- Create: `tests/server/import/routes.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4 parser, validation, valuation, database types/RPCs, server/admin Supabase clients, and `requireActor`.
- Produces: `createAssetImport(actor, input, deps)`, `completeSourceUpload(actor, input, deps)`, `saveImportMapping(actor, input, deps)`, `processStoredWorkbook(actor, importId, deps)`, `loadAssetImport(actor, importId, deps)`, and `submitAssetVersion(actor, importId, deps)` plus private no-store JSON routes.

- [ ] **Step 1: Write failing HTTP-boundary tests**

Assert 401/403 actor failures occur before creating an admin client; operator scope is restricted to assigned units; RST roles cannot masquerade as unit uploaders; cross-origin mutations, wrong content type, invalid UUIDs, non-`.xlsx` names, MIME mismatch, size over 50 MiB, and forged storage paths return stable 4xx responses; server exceptions never expose keys, tokens, paths outside actor scope, or raw workbook content.

- [ ] **Step 2: Write failing service lifecycle tests**

Assert create returns a draft/version/import ID plus one-use signed upload path under `unit/<unitId>/dataset/<datasetId>/version/<versionId>/<fileId>.xlsx`; upload completion verifies object existence, size, and SHA-256; mapping saves column indexes and confirmation actor; an approved mapping profile is suggested only when its normalized header fingerprint and unit scope match; resuming returns the current stage; and submit is rejected until a finalized run has zero blocking errors.

- [ ] **Step 3: Write failing authoritative-processing tests**

Use generated workbook bytes and fake batch persistence. Assert the stored bytes—not browser preview rows—are parsed; browser/server hashes and selected layout must match; rows are inserted in bounded batches; failed batch/run leaves the prior current run untouched; retry creates a new run; final counts/source distribution/issue totals are persisted; and active-version comparison is computed only after successful finalization.

- [ ] **Step 4: Run server tests and verify failure**

Run: `pnpm test -- tests/server/import/http.test.ts tests/server/import/service.test.ts tests/server/import/process-workbook.test.ts tests/server/import/routes.test.ts`

Expected: FAIL because the import service and routes do not exist.

- [ ] **Step 5: Implement schemas and the common Route Handler boundary**

Use Zod for all request/response inputs. `assetImportMutation(request, schema, handler)` repeats Actor, origin, JSON content type, unit ownership, no-store headers, and sanitized-error behavior. GET is dynamic and no-store. Never accept actor IDs, dataset IDs, version status, storage bucket, or object path as trusted client authority.

- [ ] **Step 6: Implement signed upload and resumable draft services**

The server creates/reuses the unit's `ASSET` dataset, allocates the next version, creates source/import metadata, and generates a non-upsert signed upload token. Completion verifies Storage metadata and SHA-256 before marking the source available. Repeated completion with identical evidence is idempotent; different bytes require a new source file and processing run. Confirmed mappings remain session-specific until DIV RST approves their normalized header fingerprint as a reusable mapping-profile version.

- [ ] **Step 7: Implement authoritative processing**

The process route exports `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and `maxDuration = 300`. It downloads the private object with the service role, verifies hash, loads the effective useful-life rules and GI-coordinate reference version, parses with the confirmed mapping/rule version, resolves valuation, writes at most 1,000 canonical rows per batch, marks the run failed on any incomplete batch, and calls finalization only after count/hash reconciliation. Missing coordinates skip only the nearest-GI tier, add a warning, and continue to the national tier.

- [ ] **Step 8: Implement comparison and submission**

Create summary and row-level changes keyed first by asset number and otherwise by a deterministic composite identity hash. Compare additions/removals/changes, condition distribution, source-value distribution, issue counts, and total `nilaiABC`. Submission calls the database RPC, never activates, and leaves the prior active snapshot unchanged.

- [ ] **Step 9: Run the Task 5 quality gate**

Run: `pnpm test -- tests/server/import`

Run: `pnpm lint`

Run: `pnpm build`

Expected: PASS; Next.js recognizes all dynamic Node Route Handlers and no secret crosses the client bundle.

- [ ] **Step 10: Commit the server import lifecycle**

Run: `git add app/api/imports src/domain/asset-import/schemas.ts src/server/import tests/server/import`

Run: `git commit -m "feat: process private asset workbooks"`

### Task 6: Browser Preview, Mapping Confirmation, Quality Review, and Draft Resume UI

**Files:**
- Modify: `app/(workspace)/impor/page.tsx`
- Modify: `src/features/import/ImportWorkspace.tsx`
- Create: `src/features/import/asset-import.worker.ts`
- Create: `src/features/import/import-client.ts`
- Create: `src/features/import/useAssetImport.ts`
- Create: `src/features/import/ImportSourceStep.tsx`
- Create: `src/features/import/ImportMappingStep.tsx`
- Create: `src/features/import/ImportQualityStep.tsx`
- Create: `src/features/import/ImportComparisonStep.tsx`
- Create: `src/features/import/import.module.css`
- Modify: `tests/ui/import-flow.test.tsx`
- Create: `tests/ui/import-mapping.test.tsx`
- Create: `tests/ui/import-quality.test.tsx`
- Create: `tests/server/auth/workspace-routes.test.tsx`

**Interfaces:**
- Consumes: Task 1 template route, Task 2 shared parser, Task 5 import APIs, browser Supabase client, and authenticated Actor/unit context.
- Produces: `AssetImportWorkerRequest`, `AssetImportWorkerResult`, `createAssetImportClient()`, `useAssetImport(initialDrafts, actorUnits)`, and a production `/impor/` workflow that can resume persisted drafts.

- [ ] **Step 1: Replace the metadata-only test with failing production-flow tests**

Assert only assigned units are selectable; template download is visible; only `.xlsx` up to 50 MiB is accepted; selecting a file starts a Worker rather than parsing on the main thread; preview displays sheet/header proposal, total candidate/rejected counts, first 100 rows, hash, and uncertainty; and no upload/process action is enabled before required mapping confirmation.

- [ ] **Step 2: Write failing mapping and quality tests**

Assert duplicate headers are labeled by column letter/index; ambiguous required targets cannot map to the same source column; confirmed mappings persist; errors and warnings are filterable; actual zero displays as valid; estimated values display source/donor evidence; age-imputed rows require acknowledgement; formula errors remain errors; and submission is disabled while blocking errors exist.

- [ ] **Step 3: Write failing resume/comparison tests**

Assert reopening `/impor/` lists persisted drafts, their file/time/stage/counts, and resumes the correct step. Assert comparison shows additions/removals/changes and value-source shifts, a full-snapshot warning is explicit, and the submit action says it requests DIV RST approval rather than replacing data immediately.

- [ ] **Step 4: Run UI tests and verify failure**

Run: `pnpm test -- tests/ui/import-flow.test.tsx tests/ui/import-mapping.test.tsx tests/ui/import-quality.test.tsx tests/server/auth/workspace-routes.test.tsx`

Expected: FAIL because the demo workspace still controls import.

- [ ] **Step 5: Implement the Web Worker boundary**

Instantiate the Worker with `new Worker(new URL("./asset-import.worker.ts", import.meta.url), { type: "module" })`. It computes SHA-256, reads layout with `collectRows: false`, and returns only serializable summary/mapping/preview data. Terminate it on replacement/unmount and surface progress/errors without freezing the UI.

- [ ] **Step 6: Implement upload and processing orchestration**

Create draft/signature through the API, upload directly to Supabase with `uploadToSignedUrl`, mark completion, save confirmed mapping, then trigger and await authoritative processing. If the connection is lost, reload persisted import status through GET; do not start a second run automatically. A deliberate retry creates a new isolated run.

- [ ] **Step 7: Split and implement the production wizard**

Keep `ImportWorkspace` as the state/composition boundary and give each step one focused component. Remove all demo-source and reset-demo controls from this page. Preserve accessible labels, status announcements, keyboard controls, responsive tables, and clear distinctions among local preview, server-validated draft, submitted version, and active version.

- [ ] **Step 8: Run the Task 6 quality gate**

Run: `pnpm test -- tests/ui/import-flow.test.tsx tests/ui/import-mapping.test.tsx tests/ui/import-quality.test.tsx tests/server/auth/workspace-routes.test.tsx`

Run: `pnpm lint`

Run: `pnpm build`

Expected: PASS and production build bundles the Worker without importing server-only modules into the client graph.

- [ ] **Step 9: Commit the import workspace**

Run: `git add 'app/(workspace)/impor/page.tsx' src/features/import tests/ui/import-flow.test.tsx tests/ui/import-mapping.test.tsx tests/ui/import-quality.test.tsx tests/server/auth/workspace-routes.test.tsx`

Run: `git commit -m "feat: replace demo import with persistent asset workflow"`

### Task 7: DIV RST Review, Return, Approval, History, and Trash Controls

**Files:**
- Create: `src/server/review/asset-version-service.ts`
- Create: `src/server/review/http.ts`
- Create: `app/api/reviews/asset-versions/route.ts`
- Create: `app/api/reviews/asset-versions/[versionId]/route.ts`
- Create: `app/api/reviews/asset-versions/[versionId]/return/route.ts`
- Create: `app/api/reviews/asset-versions/[versionId]/approve/route.ts`
- Create: `app/api/reviews/asset-versions/[versionId]/trash/route.ts`
- Create: `app/(workspace)/review-snapshot/page.tsx`
- Create: `src/features/import/AssetVersionReview.tsx`
- Create: `src/features/import/VersionDiffTable.tsx`
- Modify: `src/components/shell/SideNav.tsx`
- Create: `tests/server/review/asset-version-service.test.ts`
- Create: `tests/server/review/asset-version-routes.test.ts`
- Create: `tests/ui/asset-version-review.test.tsx`
- Modify: `tests/ui/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 4 transactional RPCs, Task 5 comparison data, `requireActor`, and existing role-aware shell.
- Produces: `listPendingAssetVersions(actor, filters, deps)`, `loadAssetVersionReview(actor, versionId, deps)`, `returnAssetVersion(actor, input, deps)`, `approveAndActivateAssetVersion(actor, input, deps)`, and `trashAssetVersion(actor, input, deps)` plus the DIV RST review page.

- [ ] **Step 1: Write failing review-service and route tests**

Assert RST_ADMIN and RST_REVIEWER can list/review/return/approve submitted versions; operators/viewers receive 403; approval is rejected for a stale comparison, unresolved blocking error, incomplete run, or already superseded version; return requires notes; activation calls one atomic RPC; an explicitly checked mapping fingerprint can be promoted to a reusable approved profile as part of the audited approval; only RST_ADMIN may trash a non-active duplicate/history version; active versions and evidence referenced by approval cannot be purged through this phase.

- [ ] **Step 2: Write failing review UI tests**

Assert the queue filters by unit, status, issue code, value source, and warning. The detail shows source file metadata, mapping provenance, diff summary, P0-P4 distribution, `nilaiABC` source split, estimated donor evidence, age-imputation evidence, and full row detail. Reusing the mapping for future identical fingerprints requires a separate checked control and appears in the approval audit. Bulk acknowledgement applies only to the visible compatible filtered selection and every action requires an explicit note/confirmation.

- [ ] **Step 3: Run review tests and verify failure**

Run: `pnpm test -- tests/server/review/asset-version-service.test.ts tests/server/review/asset-version-routes.test.ts tests/ui/asset-version-review.test.tsx tests/ui/workspace-navigation.test.tsx`

Expected: FAIL because the review workflow does not exist.

- [ ] **Step 4: Implement fail-closed RST server services**

Use the user session to establish the Actor and a server-only admin client for reviewed mutations. Re-read version/run/error/comparison state immediately before the RPC. Append action, actor, note, and scope to approval/audit logs; never trust UI totals or selected warning status.

- [ ] **Step 5: Implement review routes and workspace**

All routes are dynamic/no-store. Add `Review Snapshot` navigation for both RST roles, but keep route authorization server-side. Display historical versions read-only. The approval result clearly names the newly active version and the version moved to history.

- [ ] **Step 6: Run the Task 7 quality gate**

Run: `pnpm test -- tests/server/review tests/ui/asset-version-review.test.tsx tests/ui/workspace-navigation.test.tsx`

Run: `pnpm db:test`

Run: `pnpm lint`

Run: `pnpm build`

Expected: PASS and activation remains atomic under database tests.

- [ ] **Step 7: Commit review and activation**

Run: `git add app/api/reviews 'app/(workspace)/review-snapshot' src/server/review src/features/import/AssetVersionReview.tsx src/features/import/VersionDiffTable.tsx src/components/shell/SideNav.tsx tests/server/review tests/ui/asset-version-review.test.tsx tests/ui/workspace-navigation.test.tsx`

Run: `git commit -m "feat: add RST asset snapshot approval"`

### Task 8: Scale Verification, Hosted E2E, Operations, and UIT JBB Pilot

**Files:**
- Modify: `package.json`
- Create: `scripts/import-gi-reference.mjs`
- Create: `tests/config/gi-reference-import.test.ts`
- Create: `tests/performance/asset-import.bench.ts`
- Create: `tests/e2e/asset-import.spec.ts`
- Create: `docs/operations/asset-import-runbook.md`
- Modify: `docs/operations/supabase-setup.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: completed Tasks 1–7, linked Supabase project, deployed Vercel preview, and an untracked local copy of the UIT JBB workbook.
- Produces: `pnpm reference:gi`, `pnpm bench:asset-import`, hosted end-to-end evidence, operator/recovery instructions, and a reconciled but not auto-approved UIT JBB draft.

- [ ] **Step 1: Add and test the audited GI coordinate importer**

`scripts/import-gi-reference.mjs` accepts `--file`, `--source-version`, and exactly one of `--dry-run` or `--confirm`. Parse the supplied columns `No`, `func loc id`, `Unit Induk`, `UPT`, `Nama GI`, `lat`, and `long`; reject missing keys, invalid coordinates, and conflicting normalized GI keys; compute the source SHA-256; and call a service-role RPC that replaces one reference version atomically and appends an audit event. The script must not print credentials or row-level operational data.

Add script: `"reference:gi": "node scripts/import-gi-reference.mjs"`.

Run: `pnpm test -- tests/config/gi-reference-import.test.ts`

Expected: dry-run reports only aggregate valid/error counts and hash; `--confirm` requires configured Supabase server credentials and explicit RST admin actor identity.

- [ ] **Step 2: Add the synthetic scale benchmark**

Generate 141,105 rows with canonical, legacy, duplicate-header, zero, missing-age, localized-number, and formula-error samples. Measure workbook parse, canonicalization, valuation, batch serialization, peak process memory, and total duration without writing the generated workbook to Git.

Add script: `"bench:asset-import": "vitest bench tests/performance/asset-import.bench.ts --run"`.

- [ ] **Step 3: Add authenticated E2E scenarios**

Cover operator template download; private signed upload of a small generated workbook; mapping confirmation; validation error correction/re-upload; draft resume; submit; RST return; resubmit; approval; previous-version history; cross-unit denial; and class/value contract copy that distinguishes `nilaiABC` from the acquisition price reserved for later A2/B1 Optimum Spare calculations.

- [ ] **Step 4: Run local scale and integration gates**

Run: `pnpm bench:asset-import`

Run: `pnpm test`

Run: `pnpm db:test`

Run: `pnpm db:lint`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all correctness commands exit 0. The benchmark report states time and peak memory; if it exceeds 300 seconds or approaches 2 GiB, stop rollout and optimize batching/parser memory before deployment.

- [ ] **Step 5: Document operations and recovery**

The runbook covers template distribution, complete-snapshot meaning, allowed format/size, GI-coordinate reference dry-run/confirmation, draft resume, source-file privacy, retry semantics, mapping/profile review, issue resolution, RST review/activation, historical comparison, safe trash behavior, rule-version reprocessing, and recovery after timeout. Document that no one should delete the old active dataset to “make room” for a new upload.

- [ ] **Step 6: Deploy a preview and run hosted E2E**

Apply the migration through linked Supabase dry-run/push, regenerate types, deploy the exact commit to Vercel preview with Fluid Compute enabled, then run:

Run: `E2E_BASE_URL=<preview-url> pnpm test:e2e -- tests/e2e/asset-import.spec.ts`

Expected: all hosted scenarios pass; source objects require authorized signed access; the processing route completes under its 300-second limit.

- [ ] **Step 7: Run the UIT JBB pilot without committing source data**

First run `pnpm reference:gi -- --file <untracked-gi-powerinspect-csv> --source-version <approved-version> --dry-run`, then repeat with `--confirm` after DIV RST checks the aggregate result. Upload `ABC Analysis Aset Unit Transmisi UIT JBB_REV.xlsx` through the production UI as a draft. Confirm 141,105 candidate rows or explain every variance through visible parsing rules. Reconcile the baseline of 7,798 usable SAP values, 133,015 adjusted values, 19 price-only rows, 273 unresolved candidates, and 1,492 missing-age candidates. DIV RST reviews the discrepancy/export report before any activation.

- [ ] **Step 8: Run the final full quality gate**

Run: `pnpm test`

Run: `pnpm db:test`

Run: `pnpm db:lint`

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm test:e2e`

Expected: all commands exit 0, the hosted pilot is auditable, and no operational workbook or credential is tracked.

- [ ] **Step 9: Commit scale verification and operations**

Run: `git add package.json scripts/import-gi-reference.mjs tests/config/gi-reference-import.test.ts tests/performance/asset-import.bench.ts tests/e2e/asset-import.spec.ts docs/operations README.md`

Run: `git commit -m "test: verify asset import at unit scale"`

## Phase Boundary and Next Plan

This plan ends when an asset workbook can become an approved, active, versioned canonical snapshot with auditable `nilaiABC`, useful-life, warnings, valuation evidence, and original/new acquisition price preserved separately.

It deliberately does not implement RFQ normalization or the production calculation engine. The next plan must consume the active snapshot and implement, in order:

1. approved RFQ normalization, including the 14 distinct transformer variants and manual approval for near matches;
2. ABC classification that always outputs `A1`, `A2`, `B1`, `B2`, or `C`;
3. inventory policies where A2 and B1 use Optimum Spare and its new acquisition price input;
4. class C remains in results/audit but always stops before spare-allocation calculation;
5. history-based methods treat absent six-year history as zero, while A1 remains population-based without history.
