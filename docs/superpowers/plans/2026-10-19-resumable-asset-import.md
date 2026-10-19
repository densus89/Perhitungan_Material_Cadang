# Resumable Asset Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a 141,105-row asset workbook complete reliably through multiple idempotent Vercel requests while preserving the existing validation, audit, review, and activation contracts.

**Architecture:** PostgreSQL stores an immutable manifest for every committed 2,000-row chunk and a short-lived server-only lease on the processing run. Each request deterministically rebuilds the same rows from the private workbook, commits at most twelve missing chunks, and returns persistent progress; the browser continues until finalization or offers a safe resume after interruption.

**Tech Stack:** Next.js 16.4 App Router, React 19.3, TypeScript 5.9 strict mode, Node.js 24, pnpm 11, ExcelJS 4.4, Zod 4.6, Supabase/PostgreSQL/Storage, Vitest 5, React Testing Library, pgTAP, and Playwright 1.64.

**Spec:** `docs/superpowers/specs/2026-10-19-resumable-asset-import-design.md`

## Global Constraints

- Runtime remains `node >=24.15.0 <25`; package manager remains `pnpm@11.25.0`; no new queue, worker service, cron, or package dependency is introduced.
- Processing stays on the Node.js Route Handler with Vercel `maxDuration = 300`, but every hosted process request must finish below 240 seconds.
- Persistence chunks contain at most 2,000 paired rows and valuations; one request commits at most twelve chunks/24,000 rows in windows of two RPCs.
- The workbook remains the authoritative private source and is re-parsed server-side; the browser never supplies canonical rows, offsets, IDs, hashes, chunk size, or lease tokens.
- Asset row IDs use UUID v5 derived from run ID, import sheet ID, and source row number; identical run inputs must reproduce identical IDs and global hashes.
- Only `processing_protocol_version='resumable-v1'` requires a manifest; existing `legacy-v1` COMPLETE runs remain valid.
- A chunk marker, its snapshot rows, and its valuations commit in one transaction; replay with identical metadata succeeds without duplication and replay with different metadata fails closed.
- Leases expire after 240 seconds, never cross the server/browser boundary, and cannot be reused after expiry or reclaim.
- Only a gap-free, count-exact, hash-exact manifest can finalize; submit/review/activation contracts are unchanged.
- All new RPCs are actor-checked service-only definers with `search_path=''`; no operational workbook, row data, credentials, or lease tokens enter Git or logs.

## Review Focus

- A committed later chunk with an earlier missing chunk must resume the missing index rather than infer progress from row count; pinned by Task 2 planner tests and Task 4 service tests.
- A response lost after commit must replay idempotently without duplicate rows, valuations, or markers; pinned by Task 1 pgTAP and Task 7 hosted E2E.
- A stale lease owner must be unable to commit, release, fail, or finalize after another request reclaims the run; pinned by Task 1 concurrency pgTAP.
- Mapping/source/rule changes during a partial run must stop continuation without modifying committed chunks or the active pointer; pinned by Task 4 concurrency tests.
- Two tabs or an automatic loop plus a manual click must not start parallel mutations or create a second run; pinned by Task 6 hook tests and Task 7 E2E.

---

### Task 1: Durable Chunk Manifest, Lease, and Atomic RPCs

**Files:**
- Create: `supabase/migrations/202610190001_resumable_asset_import.sql`
- Modify: `supabase/tests/004_asset_import_schema.test.sql`
- Modify: `supabase/tests/005_asset_import_rls.test.sql`
- Modify: `supabase/tests/007_asset_import_atomic_lifecycle.test.sql`
- Modify: `src/lib/supabase/database.types.ts`

**Interfaces:**
- Consumes: existing asset run/session/version lock order, `private.assert_asset_actor`, packed 32-column row arrays, and packed 23-column valuation arrays.
- Produces: `asset_import_chunks`; resumable columns on `asset_import_runs`; RPCs `claim_asset_import_processing`, `commit_asset_import_chunk`, and `release_asset_import_processing`; manifest-aware `finalize_asset_import_run`/`fail_asset_import_run`; restored 2,000-row `insert_asset_import_batch` boundary for legacy tests only.

- [ ] **Step 1: Add failing schema and privilege assertions**

Assert exact columns/checks/keys for `asset_import_chunks`, protocol/lease columns on runs, 2,000-row packed limit, immutable manifest trigger, RLS, no direct service write, and service-only execution grants for all three new RPCs.

- [ ] **Step 2: Add failing lifecycle and concurrency assertions**

Cover claim of a new `resumable-v1` run, active-lease conflict, expiry/reclaim, stale-token rejection, atomic paired commit plus marker, identical replay, mismatched replay, out-of-range chunk, missing-manifest finalization, gap detection, exact successful finalization, response-lost replay, and stale-owner fail/release/finalize rejection.

- [ ] **Step 3: Run focused pgTAP and verify RED**

Run: `pnpm db:test -- supabase/tests/004_asset_import_schema.test.sql supabase/tests/005_asset_import_rls.test.sql supabase/tests/007_asset_import_atomic_lifecycle.test.sql`

Expected: FAIL because the manifest, lease columns, and RPCs do not exist.

- [ ] **Step 4: Implement migration `202610190001`**

Use `processing_protocol_version text not null default 'legacy-v1' check (...)`, nullable token/expiry, nonnegative attempts, and a manifest primary key `(import_run_id, chunk_index)` plus unique `(import_run_id, start_ordinal)`. `claim_asset_import_processing(...) returns jsonb`; `commit_asset_import_chunk(...) returns integer`; `release_asset_import_processing(...) returns uuid`. Keep lease/token checks inside the same database lock order as lifecycle transitions.

- [ ] **Step 5: Validate and apply the migration**

Run: `supabase db push --linked --dry-run --yes`

Expected: only `202610190001_resumable_asset_import.sql` is pending.

Run: `supabase db push --linked --yes`

Expected: migration applies successfully.

- [ ] **Step 6: Regenerate the exact database types**

Run `pnpm db:types`, update `src/lib/supabase/database.types.ts` with the generated linked schema, and verify `asset_import_chunks` plus all new run/RPC fields are present without unrelated hand-written type changes.

- [ ] **Step 7: Run the Task 1 database gate**

Run: `pnpm db:test`

Run: `pnpm db:lint`

Expected: every pgTAP assertion passes and database lint reports no errors.

- [ ] **Step 8: Commit the durable protocol**

Run: `git add supabase/migrations/202610190001_resumable_asset_import.sql supabase/tests src/lib/supabase/database.types.ts`

Run: `git commit -m "feat: add resumable asset import protocol"`

### Task 2: Deterministic IDs, Chunk Planning, and Progress Math

**Files:**
- Create: `src/server/import/resumable.ts`
- Create: `tests/server/import/resumable.test.ts`

**Interfaces:**
- Consumes: UUID run/sheet IDs and persisted row/valuation record shapes.
- Produces: `deterministicAssetRowId(runId: string, sheetId: string, sourceRowNumber: number): string`; `assetChunkHash(records, excluded): string`; `planMissingChunks(rows, valuations, completedIndexes, options?): AssetChunk[]`; `importProgress(expectedRows, completedChunks): ImportProgress`.

- [ ] **Step 1: Write failing deterministic-ID tests**

Assert RFC-4122 UUID v5 shape, identical output for identical inputs, different output for different run/sheet/row inputs, and rejection of invalid UUIDs or nonpositive source rows.

- [ ] **Step 2: Write failing planner/progress tests**

Assert 2,000-row chunking, maximum twelve returned chunks, paired row/valuation enforcement, missing-index selection across manifest holes, stable per-chunk hashes, final short chunk, zero/partial/complete progress, and percent clamped to `0..100` from manifest counts rather than database row count. Pin hash exclusions to `created_at` for rows and `created_at`, `approved_by`, `approved_at`, and `approval_notes` for valuations so a replay rebuilt later produces the same marker metadata.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/server/import/resumable.test.ts --maxWorkers=1`

Expected: FAIL because `resumable.ts` does not exist.

- [ ] **Step 4: Implement the pure resumable helpers**

Use Node `createHash("sha1")` with a documented namespace-byte implementation for UUID v5. Export `ASSET_CHUNK_SIZE = 2000` and `REQUEST_CHUNK_LIMIT = 12`; do not accept these values from an HTTP payload.

- [ ] **Step 5: Run the Task 2 gate and commit**

Run: `pnpm exec vitest run tests/server/import/resumable.test.ts --maxWorkers=1`

Expected: PASS.

Run: `git add src/server/import/resumable.ts tests/server/import/resumable.test.ts && git commit -m "feat: plan deterministic asset chunks"`

### Task 3: Persistence Adapter and Test Fakes

**Files:**
- Modify: `src/server/import/dependencies.ts`
- Modify: `tests/server/import/dependencies.test.ts`
- Modify: `tests/server/import/fakes.ts`
- Modify: `tests/server/import/lifecycle-fixture.ts`
- Create: `tests/server/import/resumable-fixture.test.ts`

**Interfaces:**
- Consumes: Task 1 RPCs/types and Task 2 `AssetChunk`/`ImportProgress`.
- Produces on `ImportDependencies`: `processingRun(importId)`, `claimProcessing(actorId, input)`, `completedChunks(runId)`, `commitChunk(actorId, runId, leaseToken, chunk)`, `releaseProcessing(actorId, runId, leaseToken)`, and lease-aware `finalize`/`failRun`.

- [ ] **Step 1: Add failing adapter tests**

Assert exact RPC names/arguments, packed row order, no token in returned public objects, manifest reads ordered by `chunk_index`, replay count validation, and sanitized persistence diagnostics. Retain the adapter-side rejection above 2,000 paired rows.

- [ ] **Step 2: Add failing fake lifecycle tests**

Model lease claim/conflict/expiry, chunk marker idempotency, manifest holes, release, and finalization prerequisites in the in-memory fixture so service tests exercise the same state machine.

- [ ] **Step 3: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/server/import/dependencies.test.ts tests/server/import/resumable-fixture.test.ts --maxWorkers=2`

Expected: FAIL on missing dependency methods and fake state.

- [ ] **Step 4: Implement the adapter and fakes**

Keep Supabase transport details in `dependencies.ts`; the orchestrator must consume typed methods and never build raw RPC payloads. Fake marker writes must be atomic with fake row/valuation writes.

- [ ] **Step 5: Run the Task 3 gate and commit**

Run: `pnpm exec vitest run tests/server/import/dependencies.test.ts tests/server/import/resumable-fixture.test.ts --maxWorkers=2`

Expected: PASS.

Run: `git add src/server/import/dependencies.ts tests/server/import/dependencies.test.ts tests/server/import/fakes.ts tests/server/import/lifecycle-fixture.ts tests/server/import/resumable-fixture.test.ts && git commit -m "feat: adapt persistence for resumable imports"`

### Task 4: Resumable Server Orchestration

**Files:**
- Modify: `src/server/import/process-workbook.ts`
- Modify: `src/server/import/service.ts`
- Modify: `tests/server/import/process-workbook.test.ts`
- Modify: `tests/server/import/concurrency.test.ts`

**Interfaces:**
- Consumes: Task 2 deterministic helpers and Task 3 dependency methods.
- Produces: existing `processStoredWorkbook(actor, importId, deps): Promise<ImportResponse>` with partial `PROCESSING` responses; all existing callers keep the same function name.

- [ ] **Step 1: Write failing partial-run tests**

Use more than 24,000 synthetic records at the orchestration boundary and assert the first call returns `PROCESSING` with persistent progress, a second call uses the same run and deterministic IDs, completed chunks are skipped, and the final call preserves the existing READY/NEEDS_FIX result contract.

- [ ] **Step 2: Write failing interruption and compatibility tests**

Cover a manifest hole, lost response replay, lease conflict, expired lease resume, changed mapping/source/rule, legacy COMPLETE load, partial-run submit rejection, finalize retry after comparison failure, and no second run from concurrent calls.

- [ ] **Step 3: Run focused service tests and verify RED**

Run: `pnpm exec vitest run tests/server/import/process-workbook.test.ts tests/server/import/concurrency.test.ts --maxWorkers=2`

Expected: FAIL because the current function rejects any PROCESSING run and attempts all rows in one call.

- [ ] **Step 4: Refactor preparation to be deterministic**

Choose the compatible existing run ID or generate a candidate ID before creating row records; replace random row IDs with `deterministicAssetRowId`. Preserve canonical/layout checks, valuation rules, summaries, and global PostgreSQL-compatible hashes exactly.

- [ ] **Step 5: Implement claim, bounded commit, partial return, and finalization**

Claim only after preparation/hashes are known; select missing chunks from manifest; commit at most twelve in windows of two; release in success/partial paths; never call `failRun` for a recoverable connection/lease conflict. Emit only sanitized phase/count timing logs.

- [ ] **Step 6: Run the Task 4 gate and commit**

Run: `pnpm exec vitest run tests/server/import/process-workbook.test.ts tests/server/import/concurrency.test.ts --maxWorkers=2`

Expected: PASS with existing valuation/comparison assertions unchanged.

Run: `git add src/server/import/process-workbook.ts src/server/import/service.ts tests/server/import/process-workbook.test.ts tests/server/import/concurrency.test.ts && git commit -m "feat: resume bounded asset processing"`

### Task 5: Progress Response and HTTP Semantics

**Files:**
- Modify: `src/domain/asset-import/schemas.ts`
- Modify: `src/server/import/http.ts`
- Modify: `src/server/import/workspace.ts`
- Modify: `src/server/import/service.ts`
- Modify: `tests/server/import/http.test.ts`
- Modify: `tests/server/import/routes.test.ts`
- Modify: `tests/server/import/service.test.ts`
- Modify: `tests/server/import/review.test.ts`

**Interfaces:**
- Consumes: Task 2 `ImportProgress` and Task 4 partial `ImportResponse`.
- Produces: strict `importProgressSchema`; optional `ImportResponse.progress`; HTTP 202 for PROCESSING mutations; GET draft/workspace progress reconstructed from run plus manifest.

- [ ] **Step 1: Write failing schema/route/workspace tests**

Assert strict progress fields, HTTP 202 with private/no-store headers, HTTP 200 final response, GET persistence across reload, draft completed/expected row display, malformed progress rejection, and no lease/token fields in any response.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm exec vitest run tests/server/import/http.test.ts tests/server/import/routes.test.ts tests/server/import/service.test.ts tests/server/import/review.test.ts --maxWorkers=2`

Expected: FAIL because progress is absent and every successful mutation returns 200.

- [ ] **Step 3: Implement strict public progress and status selection**

Define `{ completedRows, expectedRows, completedChunks, expectedChunks, percent }` as nonnegative bounded integers/numbers. `assetImportMutation` returns 202 only when the parsed result stage is PROCESSING. Load paths calculate progress from markers and never trust a client offset.

- [ ] **Step 4: Run the Task 5 gate and commit**

Run: `pnpm exec vitest run tests/server/import/http.test.ts tests/server/import/routes.test.ts tests/server/import/service.test.ts tests/server/import/review.test.ts --maxWorkers=2`

Expected: PASS.

Run: `git add src/domain/asset-import/schemas.ts src/server/import/http.ts src/server/import/workspace.ts src/server/import/service.ts tests/server/import/http.test.ts tests/server/import/routes.test.ts tests/server/import/service.test.ts tests/server/import/review.test.ts && git commit -m "feat: expose persistent import progress"`

### Task 6: Automatic Browser Continuation and Manual Resume

**Files:**
- Modify: `src/features/import/import-client.ts`
- Modify: `src/features/import/useAssetImport.ts`
- Modify: `src/features/import/ImportWorkspace.tsx`
- Modify: `src/features/import/import.module.css`
- Modify: `tests/ui/import-flow.test.tsx`
- Modify: `tests/ui/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: Task 5 PROCESSING response/progress and existing `api.process(id)`.
- Produces: sequential `continueProcessing(importId, initial?)` behavior inside `useAssetImport`; progress UI; enabled `Lanjutkan proses` for stored PROCESSING drafts.

- [ ] **Step 1: Write failing hook tests**

Mock two 202 PROCESSING responses followed by one 200 final response and assert strictly sequential POSTs, visible monotonic progress, one busy mutation, final READY state, and attempt limit `ceil(expectedChunks / 12) + 2`. Cover network failure, manual resume, double click/two-tab-equivalent reentry, conflict reload, and unmount cancellation with no extra mutation.

- [ ] **Step 2: Write failing accessibility/navigation tests**

Assert a labeled progress element with current/maximum, live status text, keyboard-accessible `Lanjutkan proses`, PROCESSING draft row counts, disabled duplicate action while a request is active, and no source remapping requirement when resuming stored processing.

- [ ] **Step 3: Run focused UI tests and verify RED**

Run: `pnpm exec vitest run tests/ui/import-flow.test.tsx tests/ui/workspace-navigation.test.tsx --maxWorkers=2`

Expected: FAIL because the hook sends only one process request and PROCESSING is locked without a resume action.

- [ ] **Step 4: Implement the continuation loop**

Keep one in-flight request, update `remember` after every 202, stop on final/error/unmount/attempt limit, and route automatic failure through the existing authoritative GET recovery. Do not retry a rejected mutation blindly.

- [ ] **Step 5: Add progress and resume presentation**

Display persisted counts/percent without exposing chunk internals or tokens. `Lanjutkan proses` calls the same bounded continuation; `Periksa status` remains read-only.

- [ ] **Step 6: Run the Task 6 gate and commit**

Run: `pnpm exec vitest run tests/ui/import-flow.test.tsx tests/ui/workspace-navigation.test.tsx --maxWorkers=2`

Expected: PASS, including accessibility assertions.

Run: `git add src/features/import tests/ui && git commit -m "feat: continue asset imports from the browser"`

### Task 7: Hosted Acceptance, Recovery, and Operational Handoff

**Files:**
- Modify: `tests/e2e/support/asset-scenario.ts`
- Modify: `tests/e2e/asset-import.spec.ts`
- Modify: `tests/e2e/asset-import-scale.spec.ts`
- Modify: `docs/operations/asset-import-runbook.md`
- Modify: `.superpowers/sdd/2026-10-15-asset-snapshot-import-and-valuation/progress.md`
- Modify: `.superpowers/sdd/2026-10-15-asset-snapshot-import-and-valuation/task-8-report.md`

**Interfaces:**
- Consumes: deployed Tasks 1–6 and exact synthetic cleanup markers.
- Produces: multi-response E2E evidence, interruption/reload evidence, exact cleanup proof, and operator guidance for resumable leases/chunks.

- [ ] **Step 1: Update E2E support and write failing journeys**

Collect every `/process/` response duration/status/body until final. Assert at least two 202 responses at scale, every process response below 240,000 ms, monotonic persisted progress, reload/manual continuation, simulated lost response replay, final 141,105/141,105 counts, COMPLETE status, exact comparison, and cleanup of manifest plus all existing synthetic resources.

- [ ] **Step 2: Run local E2E-focused tests and verify behavior**

PowerShell: set `$env:CI='1'` for the command, then run `pnpm exec playwright test tests/e2e/asset-import.spec.ts --project=chromium --workers=1`; remove the temporary variable afterward.

Expected: PASS on representative small/multi-chunk fixtures; the destructive 141,105 gate remains explicitly environment-gated.

- [ ] **Step 3: Update the runbook and evidence ledger**

Document automatic continuation, manual resume, lease conflict/expiry, safe stale-run failure, chunk-manifest diagnostics, no manual pointer edits, and exact cleanup order. Record the prior single-request failures as architectural evidence and the new test commands/results without secrets.

- [ ] **Step 4: Commit the hosted acceptance coverage and runbook**

Run: `git add tests/e2e/support/asset-scenario.ts tests/e2e/asset-import.spec.ts tests/e2e/asset-import-scale.spec.ts docs/operations/asset-import-runbook.md`

Run: `git commit -m "test: cover resumable hosted imports"`

The `.superpowers/sdd/...` evidence ledger remains a local operational record when ignored by Git; do not force-add it.

- [ ] **Step 5: Run the complete local/database quality gate**

Run: `pnpm exec vitest run --maxWorkers=4 --reporter=dot`

Run: `pnpm db:test`

Run: `pnpm db:lint`

Run: `pnpm lint`

Run sequentially after build: `pnpm build` then `pnpm exec tsc --noEmit`

Expected: 0 failures, 0 lint errors, and a successful production build.

- [ ] **Step 6: Push and wait for the exact Vercel preview commit**

Run: `git push origin codex/supabase-foundation-auth`

Expected: GitHub/Vercel status for the pushed SHA is success before hosted testing.

- [ ] **Step 7: Run the hosted 141,105-row acceptance gate**

Set the existing protected E2E environment in-process, `E2E_BASE_URL` to the branch preview, and `E2E_SCALE_ROWS=141105`.

Run: `pnpm exec playwright test tests/e2e/asset-import-scale.spec.ts --project=chromium --workers=1`

Expected: PASS; multiple 202 responses; every request under 240 seconds; exactly 141,105 rows and valuations; COMPLETE run; exact isolated cleanup reports zero units and removes the source object plus three users.

- [ ] **Step 8: Perform final review and close the branch evidence**

Review the full branch against the spec, fix all High/Medium findings, rerun affected gates, confirm `git status --short` is empty and remote SHA matches. If the final review requires tracked corrections, commit those exact files and push again; do not manufacture an empty evidence commit.
