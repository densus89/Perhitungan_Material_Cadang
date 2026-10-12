# Material Cadang Mockup V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish a polished, interactive v1 web mockup for ABC analysis, RFQ approval, inventory policy, and UPT/GI placement priorities using synthetic demonstration data.

**Architecture:** A static-exported Next.js application runs entirely in the browser and is organized by business workflow. Pure domain helpers own RFQ approval behavior and location sorting; React routes render an enterprise workspace with synthetic fixtures and session-local interaction. This mockup demonstrates the approved workflow but does not claim production Excel parsing, full calculation parity, or persistence beyond the browser session.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS variables/modules, Recharts, Lucide React, Vitest, Testing Library, Playwright, pnpm, GitHub, Vercel.

**Spec:** `PRD.md` version 1.1

## Global Constraints

- Interface language is Indonesian and desktop-first, with responsive fallback for narrower screens.
- The mockup must display a visible `Data Demo` label and use only synthetic records; operational spreadsheets, PDFs, PPTs, CSVs, and `reference-analysis/` never enter Git history or the deployment bundle.
- P0 is most critical and P4 is best; location order is condition, oldest age, shortest Haversine distance to `-6.343459, 106.787061`, then GI and UPT name.
- Location ranking does not allocate or multiply the ideal spare quantity.
- Exact RFQ matches may be accepted automatically; near matches remain `MENUNGGU_APPROVAL`; rejected or unmatched specifications remain standalone.
- The 14 transformer variants remain distinct; `150/20 kV` and `150/22/10 kV` are never auto-grouped.
- Approval operates per normalized specification and supports one row, selected rows, and all filtered pending rows with confirmation.
- Class C always displays ideal quantity 0 regardless of lead time.
- No API, database, authentication, analytics, or upload to a server in v1.
- Static export must build successfully for Vercel; UI state may use browser memory/localStorage only.
- Accessibility target for the primary flows is WCAG 2.2 AA: keyboard actions, visible focus, semantic labels, non-color status text, and chart data alternatives.

## Review Focus

- A near-match approval must update all rows sharing the normalized specification and must not affect hidden rows outside the chosen filtered approval scope.
- A rejected/unmatched transformer must remain visible as a standalone group rather than disappear from policy results.
- Missing asset age must never be treated as age zero; distance becomes the next sort key.
- Duplicate GI names across UPTs must remain distinct because the location key is UPT + GI.
- Repeated ideal quantity on location rows must be labeled as reference context and never summed as allocation.

---

### Task 1: Project foundation, repository safety, and quality gates

**Files:**
- Create: `.gitignore`
- Create: `.npmrc`
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `eslint.config.mjs`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `app/layout.tsx`
- Create: `app/globals.css`
- Create: `app/page.tsx`
- Create: `tests/setup.ts`
- Create: `tests/smoke/home.test.tsx`
- Create: `public/.gitkeep`

**Interfaces:**
- Consumes: `PRD.md` version 1.1 and the Global Constraints above.
- Produces: `pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm build`, and `pnpm test:e2e` scripts; a static-export-capable Next.js shell.

- [ ] **Step 1: Add a failing smoke test**

Create `tests/smoke/home.test.tsx` asserting that the root page renders `Perencanaan Material Cadang` and `Data Demo`.

- [ ] **Step 2: Run the smoke test and confirm the project is not yet runnable**

Run: `pnpm test -- tests/smoke/home.test.tsx`
Expected: FAIL because the package configuration and root page do not exist.

- [ ] **Step 3: Scaffold the minimal static Next.js project**

Configure `next.config.ts` with `output: "export"`; use TypeScript strict mode. Add only the dependencies required by this plan. The root page must be a minimal placeholder that satisfies the smoke test.

- [ ] **Step 4: Add repository exclusions before Git initialization**

`.gitignore` must exclude `node_modules`, `.next`, `out`, coverage, Playwright output, environment files, `reference-analysis/`, `*.xlsx`, `*.xls`, `*.csv`, `*.pdf`, `*.pptx`, the six Apps Script `.txt` sources, and other local operational/reference artifacts. Keep application source, synthetic fixtures, README, and the approved implementation plan trackable.

- [ ] **Step 5: Install locked dependencies and run quality gates**

Run: `pnpm install`
Run: `pnpm test -- tests/smoke/home.test.tsx`
Run: `pnpm lint`
Run: `pnpm build`
Expected: all commands exit 0 and `out/index.html` exists.

- [ ] **Step 6: Initialize Git and commit the foundation**

Run: `git init -b main`
Run: `git add .gitignore .npmrc package.json pnpm-lock.yaml next.config.ts tsconfig.json eslint.config.mjs vitest.config.ts playwright.config.ts app tests public docs/superpowers/plans/2026-10-12-material-cadang-mockup-v1.md`
Run: `git status --short`
Expected: no operational/reference files are staged.
Run: `git commit -m "chore: initialize material cadang mockup"`

### Task 2: Synthetic domain model and deterministic business helpers

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/location-priority.ts`
- Create: `src/domain/rfq-approval.ts`
- Create: `src/demo/fixtures.ts`
- Create: `tests/domain/location-priority.test.ts`
- Create: `tests/domain/rfq-approval.test.ts`

**Interfaces:**
- Consumes: no UI state.
- Produces: `sortLocationPriorities(rows, gandul): LocationPriority[]`, `applyApproval(scope, decision): MappingSuggestion[]`, and typed synthetic fixtures covering A1/A2/B1/B2/C, exact/near/standalone RFQ states, P0–P4, duplicate GI names, and missing ages.

- [ ] **Step 1: Write failing location-priority tests**

Assert P0 precedes P1–P4, older age precedes younger age for equal condition, missing/equal age falls through to shorter Haversine distance, duplicate GI names remain separate by UPT, and the ideal quantity remains unchanged on every row.

- [ ] **Step 2: Run the location tests and verify failure**

Run: `pnpm test -- tests/domain/location-priority.test.ts`
Expected: FAIL because domain types/functions are missing.

- [ ] **Step 3: Implement location types and sorting**

Define explicit `AssetCondition = "P0" | "P1" | "P2" | "P3" | "P4"`; keep `assetAgeYears` nullable. Implement stable Haversine distance in kilometers and deterministic GI/UPT tie-breaking.

- [ ] **Step 4: Run the location tests**

Run: `pnpm test -- tests/domain/location-priority.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing RFQ approval tests**

Cover approve-one, approve-selected, approve-all-filtered, normalized-specification propagation, rejection to standalone, and a transformer guard proving `150/20 kV` cannot be accepted as `150/22/10 kV` automatically.

- [ ] **Step 6: Implement RFQ approval helpers and fixtures**

Define `MappingStatus`, `ApprovalMethod`, `MappingSuggestion`, `PolicyRow`, and `LocationPriority`. Keep near matches pending until an explicit decision. Generate synthetic data only.

- [ ] **Step 7: Run domain tests and commit**

Run: `pnpm test -- tests/domain`
Expected: PASS.
Run: `git add src/domain src/demo tests/domain`
Run: `git commit -m "feat: add demo domain rules"`

### Task 3: Enterprise workspace shell and dashboard

**Files:**
- Create: `src/components/shell/AppShell.tsx`
- Create: `src/components/shell/SideNav.tsx`
- Create: `src/components/shell/TopBar.tsx`
- Create: `src/components/ui/Badge.tsx`
- Create: `src/components/ui/KpiCard.tsx`
- Create: `src/components/ui/StatusBanner.tsx`
- Create: `src/components/charts/AbcCurve.tsx`
- Create: `src/components/charts/ClassDistribution.tsx`
- Create: `app/(workspace)/layout.tsx`
- Create: `app/(workspace)/ringkasan/page.tsx`
- Modify: `app/page.tsx`
- Create: `tests/ui/dashboard.test.tsx`

**Interfaces:**
- Consumes: synthetic summary and ABC fixtures from `src/demo/fixtures.ts`.
- Produces: reusable workspace shell and `/ringkasan` route with KPIs, class distribution, ABC curve, audit/status panel, and links to the remaining flows.

- [ ] **Step 1: Write a failing dashboard accessibility/render test**

Assert the page exposes a navigation landmark, `Data Demo`, KPI names, text labels for every ABC class, an accessible table alternative for charts, and visible links for Impor, Pemetaan RFQ, Analisis ABC, Inventory Policy, and Prioritas Lokasi.

- [ ] **Step 2: Run the dashboard test and verify failure**

Run: `pnpm test -- tests/ui/dashboard.test.tsx`
Expected: FAIL because components/routes are missing.

- [ ] **Step 3: Implement the shell and visual system**

Use a light enterprise workspace, dark navy sidebar, restrained teal accent, dense white data surfaces, 8px spacing rhythm, readable system fonts, explicit status text, and visible keyboard focus. Avoid marketing hero layouts and oversized cards.

- [ ] **Step 4: Implement responsive charts and table alternatives**

Use Recharts only inside client components. Every chart must provide the same key values in a semantic table or list.

- [ ] **Step 5: Run tests, lint, and commit**

Run: `pnpm test -- tests/ui/dashboard.test.tsx`
Run: `pnpm lint`
Expected: PASS.
Run: `git add app src/components tests/ui/dashboard.test.tsx`
Run: `git commit -m "feat: build enterprise dashboard shell"`

### Task 4: Import, data-quality, and RFQ approval mock flows

**Files:**
- Create: `src/state/DemoWorkspaceProvider.tsx`
- Create: `src/features/import/ImportWorkspace.tsx`
- Create: `src/features/mapping/MappingReview.tsx`
- Create: `src/features/mapping/ApprovalToolbar.tsx`
- Create: `src/features/mapping/MappingDetailDrawer.tsx`
- Create: `app/(workspace)/impor/page.tsx`
- Create: `app/(workspace)/pemetaan-rfq/page.tsx`
- Create: `tests/ui/import-flow.test.tsx`
- Create: `tests/ui/mapping-approval.test.tsx`

**Interfaces:**
- Consumes: `MappingSuggestion[]`, `applyApproval`, and synthetic source-file metadata.
- Produces: browser-session demo state, import wizard mock, validation summary, filtered approval table, single/selected/all-filtered approval, rejection, and manual target selection.

- [ ] **Step 1: Write failing import-flow tests**

Assert that selecting a local filename displays only file metadata, shows the stages Unggah → Mapping → Validasi → Siap, and clearly states that mockup v1 does not parse or upload operational content.

- [ ] **Step 2: Write failing approval interaction tests**

Assert approve-one propagates to the normalized specification, selected approval affects checked pending rows only, all-filtered opens a confirmation containing the exact count, rejected rows become `SPESIFIKASI_MANDIRI`, and incompatible transformer variants cannot be bulk approved.

- [ ] **Step 3: Run both tests and verify failure**

Run: `pnpm test -- tests/ui/import-flow.test.tsx tests/ui/mapping-approval.test.tsx`
Expected: FAIL because routes/provider/features are missing.

- [ ] **Step 4: Implement session-local demo state and import mock**

Keep all state in React and optionally localStorage under a versioned demo key. Do not read workbook rows in this mockup. Provide reset-to-demo-data.

- [ ] **Step 5: Implement mapping review and audit detail**

Display original specification, proposed RFQ, structured differences, affected asset count, status, and approval method. Bulk actions must operate on the filtered pending ID set displayed in the confirmation.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm test -- tests/ui/import-flow.test.tsx tests/ui/mapping-approval.test.tsx`
Expected: PASS.
Run: `git add app src/state src/features/import src/features/mapping tests/ui`
Run: `git commit -m "feat: add RFQ approval workflow"`

### Task 5: ABC analysis and inventory policy views

**Files:**
- Create: `src/features/abc/AbcAnalysis.tsx`
- Create: `src/features/abc/AbcResultTable.tsx`
- Create: `src/features/policy/PolicyWorkspace.tsx`
- Create: `src/features/policy/PolicyDetailDrawer.tsx`
- Create: `app/(workspace)/analisis-abc/page.tsx`
- Create: `app/(workspace)/inventory-policy/page.tsx`
- Create: `tests/ui/abc-policy.test.tsx`

**Interfaces:**
- Consumes: synthetic `AbcResult[]`, `PolicyRow[]`, and RFQ approval state.
- Produces: Filtered/Whitelist tabs, cumulative chart/table, dense ranking table, policy method/status table, formula explanation drawer, and explicit C=0 behavior.

- [ ] **Step 1: Write failing ABC/policy tests**

Assert mode tabs have separate totals, filtering does not mutate rank, A1 shows Mandatory, A2/B1 positive failure shows Optimum, B1 zero failure/B2 shows Economic, C shows `Tidak dicadangkan` and 0 for every lead-time example, and pending RFQ mappings remain labeled draft.

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- tests/ui/abc-policy.test.tsx`
Expected: FAIL because the features/routes are missing.

- [ ] **Step 3: Implement ABC analysis**

Show price rank, effective quantity, acquisition value, value-before, quantity-through, class/category, and audit reason. Keep visual filters local to the view.

- [ ] **Step 4: Implement policy workspace and explanation drawer**

Show method, ideal quantity, population/history/lead time/price inputs, and reliability/cost/combined numbers for the synthetic optimum example. Do not claim the combined optimum always achieves 99%.

- [ ] **Step 5: Run tests and commit**

Run: `pnpm test -- tests/ui/abc-policy.test.tsx`
Expected: PASS.
Run: `git add app src/features/abc src/features/policy tests/ui/abc-policy.test.tsx`
Run: `git commit -m "feat: add ABC and policy workspaces"`

### Task 6: UPT/GI placement-priority view

**Files:**
- Create: `src/features/location/LocationPriorityWorkspace.tsx`
- Create: `src/features/location/LocationPriorityTable.tsx`
- Create: `src/features/location/LocationDetailDrawer.tsx`
- Create: `app/(workspace)/prioritas-lokasi/page.tsx`
- Create: `tests/ui/location-priority.test.tsx`

**Interfaces:**
- Consumes: `sortLocationPriorities`, synthetic policy rows, asset/location fixtures.
- Produces: complete P0–P4 location list, condition/UPT/GI filters, reason text for rank order, distance display, and non-allocation quantity context.

- [ ] **Step 1: Write the failing location UI test**

Assert all P0–P4 rows are present initially, P0 rows lead, condition filter hides but does not delete other conditions, worst condition represents a multi-asset UPT, missing age falls through to distance, duplicate GI names show their UPT, and `Jumlah ideal referensi` is accompanied by `bukan alokasi per lokasi`.

- [ ] **Step 2: Run the test and verify failure**

Run: `pnpm test -- tests/ui/location-priority.test.tsx`
Expected: FAIL because the route/features are missing.

- [ ] **Step 3: Implement the location workspace**

Use a sortable/filterable dense table and detail drawer; a simple coordinate summary is sufficient for v1—do not add a map SDK or external tile dependency.

- [ ] **Step 4: Run the test and commit**

Run: `pnpm test -- tests/ui/location-priority.test.tsx`
Expected: PASS.
Run: `git add app src/features/location tests/ui/location-priority.test.tsx`
Run: `git commit -m "feat: add location priority workspace"`

### Task 7: Demo export, accessibility, browser tests, and product documentation

**Files:**
- Create: `src/features/export/export-demo.ts`
- Create: `src/features/export/ExportWorkspace.tsx`
- Create: `app/(workspace)/ekspor/page.tsx`
- Create: `tests/domain/export-demo.test.ts`
- Create: `tests/e2e/workspace.spec.ts`
- Create: `README.md`
- Modify: `app/globals.css`
- Modify: relevant components from Tasks 3–6 for accessibility fixes found by tests.

**Interfaces:**
- Consumes: current synthetic workspace state.
- Produces: downloadable sanitized JSON/CSV demo snapshots, end-to-end navigation coverage, responsive/focus styling, and setup/deployment documentation.

- [ ] **Step 1: Write failing export tests**

Assert exported location rows contain `idealQuantityReference` once per row with `allocationStatus: "REFERENCE_ONLY"`, approval audit rows contain method/status, and no operational file path/source identifier is present.

- [ ] **Step 2: Write a failing Playwright journey**

Cover dashboard → mapping approval → policy → P0 location filter → export; assert the visible `Data Demo` label and keyboard-accessible navigation.

- [ ] **Step 3: Implement demo export and README**

Document mockup scope, local commands, static export, privacy boundary, known non-production features, and Vercel deployment. Do not claim Excel calculation parity.

- [ ] **Step 4: Run the full local verification suite**

Run: `pnpm test`
Run: `pnpm lint`
Run: `pnpm build`
Run: `pnpm exec playwright install chromium`
Run: `pnpm test:e2e`
Expected: all commands exit 0; static output exists; the browser journey passes.

- [ ] **Step 5: Perform visual QA**

Open the built app at desktop and narrow viewport widths. Verify no clipped tables/headers, focus visibility, contrast, chart readability, drawer behavior, empty/filter states, and absence of internal/operational data.

- [ ] **Step 6: Commit the completed mockup**

Run: `git add app src tests README.md package.json pnpm-lock.yaml`
Run: `git commit -m "feat: complete material cadang mockup v1"`

### Task 8: GitHub publication and Vercel production deployment

**Files:**
- Modify: `README.md` only if the final deployment URL or deployment notes need recording.

**Interfaces:**
- Consumes: verified `main` branch and static Next.js configuration.
- Produces: GitHub repository `https://github.com/densus89/Perhitungan_Material_Cadang` and a production deployment in the `densus` Vercel account.

- [ ] **Step 1: Audit the exact Git payload**

Run: `git status --short`
Run: `git ls-files`
Run: `git grep -n -I -E "Buku Pengelolaan|docs.google.com/spreadsheets|reference-analysis|gi_powerinspect|RFQ2.xlsx" -- . ":(exclude)PRD.md" ":(exclude)SESSION_HANDOFF.md"`
Expected: only application source, synthetic fixtures, plan, and safe documentation are tracked; no operational/reference files or credentials are present.

- [ ] **Step 2: Attach the empty GitHub remote and push**

Run: `git remote add origin https://github.com/densus89/Perhitungan_Material_Cadang.git`
Run: `git push -u origin main`
Expected: push succeeds to the authorized repository. If command-line credentials are unavailable, use the authenticated GitHub browser session without exposing tokens.

- [ ] **Step 3: Import the GitHub repository into Vercel**

In the authenticated `densus` Vercel account, import `densus89/Perhitungan_Material_Cadang`, keep the detected Next.js framework settings, and deploy the production branch `main`. Do not add secrets because the mockup has no server integrations.

- [ ] **Step 4: Verify production**

Open the production URL and check HTTP success, dashboard rendering, navigation, RFQ approval interactions, P0 filter, responsive layout, and demo export. Confirm the deployment contains no operational data.

- [ ] **Step 5: Record and publish the deployment URL if needed**

Update `README.md` with the verified production URL, rerun `pnpm test && pnpm lint && pnpm build`, commit with `docs: add production deployment`, and push `main`.

