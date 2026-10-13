# Supabase Foundation and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the deployed static mockup into a server-capable, authenticated application with Supabase persistence, invite-only `@pln.co.id` accounts, role/unit authorization, tested RLS, and DIV RST user administration.

**Architecture:** Next.js 16 runs dynamically on Vercel and uses cookie-based Supabase SSR sessions refreshed by root `proxy.ts`. PostgreSQL migrations own profiles, roles, Unit Induk assignments, dataset/version registry, approvals, and audit records; RLS is the security boundary, while server services repeat authorization before every privileged operation. Existing calculation pages remain available as clearly labeled demo modules during this phase.

**Tech Stack:** Next.js 16.4.0, React 19.3.0, TypeScript 5.9.3, Node 24.15.x, pnpm 11.25.0, Supabase JS 2.117.3, Supabase SSR 0.12.7, Supabase CLI 2.120.0, Zod 4.6.7, PostgreSQL/pgTAP, Vitest 5, Testing Library 16, Playwright 1.64, Vercel.

**Spec:** `docs/superpowers/specs/2026-10-13-persistent-data-and-access-design.md`

## Global Constraints

- This is phase 1 of four: (1) foundation/auth, (2) upload/version comparison/approval, (3) RFQ/calculation/location, and (4) national dashboard/audit/capacity/initial JBB migration.
- Preserve all current demo calculation flows and tests until their persistent replacements land; relabel them as demo, never as operational results.
- Remove `output: "export"`; authenticated routes require the Next.js server runtime. Keep `trailingSlash: true` unless a test proves an auth callback conflict.
- Use Next.js 16 root `proxy.ts`, not deprecated `middleware.ts`; Proxy refreshes sessions and improves routing UX, but every server mutation performs its own authorization.
- Use cookie-based PKCE sessions through `@supabase/ssr`; authenticated pages must not use ISR or shared response caching.
- Only exact `@pln.co.id` addresses are valid. Normalize case and surrounding whitespace; reject subdomains and suffix tricks such as `user@pln.co.id.evil.com`.
- Roles are exactly `RST_ADMIN`, `RST_REVIEWER`, `UNIT_OPERATOR`, and `VIEWER`.
- All authenticated users may eventually view national summaries; phase 1 exposes detailed dataset metadata only to RST roles or assigned Unit Induk users.
- Store role and unit authorization in relational tables controlled by admins, not user-editable Auth metadata.
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may reach the browser. `SUPABASE_SECRET_KEY`, database passwords, CLI tokens, and service-role credentials are server-only and never committed.
- Create a separate Supabase Free development project in the Singapore region. Do not apply unreviewed migrations to a production project and never run `supabase db reset --linked`.
- Docker is not installed on the current host. Run pgTAP against the linked empty development project with `supabase test db --linked`; retain the same tests for local Docker/CI later.
- GitHub contains migrations, tests, source, synthetic seed records, and `.env.example` only. Operational workbooks and real account credentials stay out of Git and deployment bundles.
- Keep the installed Next.js version pinned and follow the bundled `node_modules/next/dist/docs` guidance for Proxy, cookies, Route Handlers, and Server Actions.
- Every task follows TDD, runs its focused tests, and ends in a separate commit.

## Review Focus

- Deceptive or mixed-case email input must accept only the normalized exact `@pln.co.id` domain; Task 4 pins this with domain tests.
- A disabled account or stale/expired session must lose workspace access even if a browser still holds cookies; Tasks 3, 4, and 7 pin this in RLS, actor-loading, and layout tests.
- A Unit Operator must never read or mutate another Unit Induk's detail; Task 3 pins both SELECT and write denial in pgTAP.
- An Auth invite that succeeds while role/unit persistence fails must not leave a usable orphan account; Task 6 pins compensation and audit behavior with service tests.
- Proxy matching must not block login, callback, password setup, Next.js assets, or public static files, and server operations must not rely on Proxy alone; Tasks 4 and 5 pin route-policy behavior.

---

### Task 1: Dynamic runtime, dependencies, and environment contract

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `next.config.ts`
- Create: `.env.example`
- Create: `src/config/env.ts`
- Create: `tests/config/env.test.ts`
- Create: `tests/config/next-config.test.ts`

**Interfaces:**
- Consumes: current Next.js mockup configuration.
- Produces: `parsePublicEnv(input): PublicEnv`, `parseServerEnv(input): ServerEnv`, `getPublicEnv(): PublicEnv`, and `getServerEnv(): ServerEnv`; dynamic Next.js build configuration; pinned Supabase dependencies and CLI scripts.

- [ ] **Step 1: Write failing environment-contract tests**

Assert that `parsePublicEnv` requires valid URL and non-empty publishable key, `parseServerEnv` requires a non-empty secret key and site URL, and error output names the missing variable without printing supplied secret values.

- [ ] **Step 2: Write the failing Next configuration test**

Import `next.config.ts` and assert `output` is absent, `trailingSlash` remains `true`, and images remain unoptimized until image handling is intentionally changed.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm test -- tests/config/env.test.ts tests/config/next-config.test.ts`

Expected: FAIL because `src/config/env.ts` is missing and the config still has `output: "export"`.

- [ ] **Step 4: Install exact dependencies and add scripts**

Run: `pnpm add @supabase/supabase-js@2.117.3 @supabase/ssr@0.12.7 zod@4.6.7`

Run: `pnpm add -D supabase@2.120.0`

Add scripts: `supabase`, `db:test` (`supabase test db --linked`), `db:lint` (`supabase db lint --linked`), and `db:types` (`supabase gen types typescript --linked --schema public`).

- [ ] **Step 5: Implement environment parsing and document variable names**

Define `PublicEnv` as `{ supabaseUrl: string; supabasePublishableKey: string }` and `ServerEnv` as `PublicEnv & { supabaseSecretKey: string; siteUrl: string }`. Read `process.env` lazily inside getters so importing modules does not leak or eagerly stringify secrets.

`.env.example` contains empty values only for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, and `NEXT_PUBLIC_SITE_URL`.

- [ ] **Step 6: Switch Next.js from static export to server runtime**

Remove only `output: "export"` from `next.config.ts`; preserve existing options. Update metadata description in `app/layout.tsx` from a mockup-only claim to an authenticated planning workspace while retaining demo labels inside calculation modules.

- [ ] **Step 7: Run the Task 1 quality gate**

Run: `pnpm test -- tests/config/env.test.ts tests/config/next-config.test.ts`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all commands exit 0 without requiring real secret values during build.

- [ ] **Step 8: Commit the dynamic runtime foundation**

Run: `git add package.json pnpm-lock.yaml next.config.ts .env.example app/layout.tsx src/config tests/config`

Run: `git commit -m "chore: prepare dynamic Supabase runtime"`

### Task 2: Supabase project, core schema, and generated database types

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202610130001_foundation.sql`
- Create: `supabase/seed.sql`
- Create: `supabase/tests/001_foundation_schema.test.sql`
- Create: `src/lib/supabase/database.types.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: an empty Supabase Free development project in Singapore and CLI authentication supplied outside Git.
- Produces: enums `app_role`, `account_status`, `dataset_type`, `dataset_status`, and `approval_action`; core tables and constraints; Auth profile trigger; deterministic Unit Induk seed records; generated `Database` TypeScript type.

- [ ] **Step 1: Create and link the isolated development project**

Create one Supabase Free project in region Singapore, record its project ref and database password in the user's credential store, then run `pnpm supabase login` and `pnpm supabase link --project-ref <project-ref>`.

Expected: `pnpm supabase projects list` marks the new empty development project as linked. No credential is written to tracked files.

- [ ] **Step 2: Initialize Supabase files and write the failing schema test**

Run: `pnpm supabase init`

In `001_foundation_schema.test.sql`, assert the five enums and these tables exist: `unit_induk`, `profiles`, `user_role_assignments`, `user_unit_assignments`, `datasets`, `dataset_versions`, `approval_events`, and `audit_events`. Assert foreign keys and the unique `(dataset_id, version_number)` constraint.

- [ ] **Step 3: Run the schema test and verify failure**

Run: `pnpm db:test -- supabase/tests/001_foundation_schema.test.sql`

Expected: FAIL because the foundation migration has not been applied.

- [ ] **Step 4: Implement the foundation migration**

Create the exact enums:

- `app_role`: `RST_ADMIN`, `RST_REVIEWER`, `UNIT_OPERATOR`, `VIEWER`.
- `account_status`: `INVITED`, `ACTIVE`, `DISABLED`.
- `dataset_type`: `ASSET`, `HISTORY`, `PRICE`, `LEAD_TIME`, `LOCATION`, `RFQ_REFERENCE`.
- `dataset_status`: `DRAFT`, `NEEDS_FIX`, `READY_TO_SUBMIT`, `PENDING_RST`, `REJECTED`, `ACTIVE`, `HISTORICAL`, `TRASH`.
- `approval_action`: `SUBMITTED`, `APPROVED`, `REJECTED`, `RETURNED`, `ACTIVATED`, `RESTORED`, `TRASHED`, `PURGED`.

Enable `pgcrypto` and `pgtap` in the `extensions` schema. Use UUID primary keys and timezone-aware timestamps. `profiles.id` references `auth.users(id)` and stores normalized email/display name/status. Add a database constraint for the exact PLN domain. An `auth.users` trigger inserts an `INVITED` profile; missing role means no application access. Add an `activate_my_profile()` RPC that may only change the current authenticated profile from `INVITED` to `ACTIVE`.

`datasets.active_version_id` is nullable and references `dataset_versions` after both tables exist. Add indexes for role lookup, unit assignment, dataset unit/type, version status, and audit target/time.

- [ ] **Step 5: Add synthetic Unit Induk seed rows**

Seed these canonical codes/names idempotently: `BABEL`, `MMU`, `NTB`, `NTT`, `P3BKAL`, `P3BS`, `P3BSUL`, `PPB`, `UIT JBB`, `UIT JBM`, and `UIT JBT`. Do not seed operational assets, real users, passwords, or workbook content.

- [ ] **Step 6: Review the pending migration**

Run: `pnpm supabase db push --dry-run --linked`

Expected: only `202610130001_foundation.sql` is pending.

- [ ] **Step 7: Apply the migration and run the schema test**

Run: `pnpm supabase db push --linked`

Run: `pnpm db:test -- supabase/tests/001_foundation_schema.test.sql`

Expected: PASS.

- [ ] **Step 8: Generate database types**

Run: `pnpm db:types > src/lib/supabase/database.types.ts`

- [ ] **Step 9: Verify no secrets are staged**

Ensure `.gitignore` covers `.env*` except `.env.example`, Supabase `.temp/`, `.branches/`, and CLI credential artifacts.

Run: `git diff --check`

Run: `git status --short`

Expected: only schema/config/test/type files are staged; no `.env`, access token, database password, or operational data appears.

- [ ] **Step 10: Commit the schema foundation**

Run: `git add supabase src/lib/supabase/database.types.ts .gitignore`

Run: `git commit -m "feat: add persistent application schema"`

### Task 3: Database authorization helpers, RLS, and storage policy skeleton

**Files:**
- Create: `supabase/migrations/202610130002_authorization.sql`
- Create: `supabase/tests/002_authorization_rls.test.sql`

**Interfaces:**
- Consumes: Task 2 tables and enums.
- Produces: private SQL helpers `current_app_role()`, `is_rst()`, `is_rst_admin()`, and `can_access_unit(unit_id uuid)`; RLS/grants for all phase-1 tables; private `source-files` Storage bucket placeholder with no client write access yet.

- [ ] **Step 1: Write failing pgTAP authorization tests**

Create transactional test users for each role and two Unit Induk assignments. Assert:

- unauthenticated users cannot select application tables;
- `RST_ADMIN` can read all profiles, roles, assignments, datasets, versions, approvals, and audit rows;
- `RST_REVIEWER` reads all dataset/version detail but cannot manage users or delete records;
- `UNIT_OPERATOR` reads and creates draft metadata only for assigned units and is denied another unit;
- `VIEWER` cannot read detailed dataset/version rows;
- disabled profiles lose access regardless of role;
- authenticated users cannot update their own role/status or append arbitrary audit records;
- no authenticated client can upload to `source-files` before the phase-2 signed-upload policy exists.

- [ ] **Step 2: Run the RLS test and confirm failure**

Run: `pnpm db:test -- supabase/tests/002_authorization_rls.test.sql`

Expected: FAIL because RLS helpers and policies do not exist.

- [ ] **Step 3: Implement least-privilege grants and RLS**

Create helper functions in a non-exposed `private` schema using `security definer`, explicit `search_path`, and revoked public execute privileges. Enable RLS on every public table. Revoke default broad grants, then grant only operations required by policies.

Policies must use relational `user_role_assignments` and `user_unit_assignments`; never trust `raw_user_meta_data`. Audit and approval event tables are append-only for application users. Service-role bypass remains server-only.

- [ ] **Step 4: Create the private bucket skeleton**

Insert bucket `source-files` as private. Do not add general authenticated upload/read policies in phase 1; phase 2 will issue scoped signed uploads after a draft version exists.

- [ ] **Step 5: Review and apply the RLS migration**

Run: `pnpm supabase db push --dry-run --linked`

Run: `pnpm supabase db push --linked`

- [ ] **Step 6: Run database authorization tests and lint**

Run: `pnpm db:test -- supabase/tests/002_authorization_rls.test.sql`

Run: `pnpm db:lint`

Expected: tests PASS and lint has no security errors. Document any advisory-only lint output in the commit message body.

- [ ] **Step 7: Regenerate database types**

Run: `pnpm db:types > src/lib/supabase/database.types.ts`

- [ ] **Step 8: Commit database authorization**

Run: `git add supabase src/lib/supabase/database.types.ts`

Run: `git commit -m "feat: enforce role and unit data isolation"`

### Task 4: Supabase clients, actor model, and session Proxy

**Files:**
- Create: `src/domain/access.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/update-session.ts`
- Create: `src/server/auth/actor.ts`
- Create: `proxy.ts`
- Create: `tests/domain/access.test.ts`
- Create: `tests/server/auth/actor.test.ts`
- Create: `tests/server/auth/proxy-policy.test.ts`

**Interfaces:**
- Consumes: `Database` generated in Task 2/3 and environment getters from Task 1.
- Produces: `AppRole`, `Actor`, `normalizePlnEmail(email): string`, `isAllowedPlnEmail(email): boolean`, `can(role, permission): boolean`, `createBrowserSupabaseClient()`, `createServerSupabaseClient()`, `createAdminSupabaseClient()`, `loadActor(client): Promise<Actor | null>`, `requireActor(client): Promise<Actor>`, and `updateSession(request): Promise<NextResponse>`.

- [ ] **Step 1: Write failing access-domain tests**

Cover trimmed/mixed-case valid email, non-PLN email, `@sub.pln.co.id`, `@pln.co.id.evil.com`, missing local part, and role permissions for user administration, dataset review, own-unit write, and national-summary read.

- [ ] **Step 2: Write failing actor and Proxy policy tests**

Use fake Supabase query/auth adapters. Assert `loadActor` returns user ID, normalized email, display name, role, assigned unit IDs, and status for an active user; returns `null` for missing role, disabled profile, non-PLN email, or missing Auth user.

Assert public routes `/login`, `/auth/callback`, and `/auth/set-password` remain reachable; unauthenticated workspace routes redirect to `/login`; authenticated `/login` redirects to `/ringkasan`; static assets and Next internals are excluded by the Proxy matcher.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm test -- tests/domain/access.test.ts tests/server/auth/actor.test.ts tests/server/auth/proxy-policy.test.ts`

Expected: FAIL because access/session modules do not exist.

- [ ] **Step 4: Implement typed browser, server, and admin clients**

The browser client uses only public environment values. The server client awaits Next.js `cookies()` and implements `getAll`/`setAll` for `@supabase/ssr`. The admin client imports `server-only`, uses `SUPABASE_SECRET_KEY`, disables session persistence/refresh, and is never imported by a client component.

- [ ] **Step 5: Implement actor loading and authorization primitives**

Define:

```ts
interface Actor {
  userId: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "ACTIVE";
  unitIndukIds: readonly string[];
}
```

Actor loading calls `auth.getUser()` and queries profile/role/assignments under the user's session. `requireActor` throws a typed unauthenticated/forbidden error that Route Handlers and layouts translate consistently.

- [ ] **Step 6: Implement Next.js 16 session Proxy**

Root `proxy.ts` delegates cookie refresh to `updateSession`. Matcher excludes `_next/static`, `_next/image`, favicon, common public assets, and authentication callback resources. Redirects are convenience behavior only; route handlers and server services repeat checks.

- [ ] **Step 7: Run the Task 4 quality gate**

Run: `pnpm test -- tests/domain/access.test.ts tests/server/auth/actor.test.ts tests/server/auth/proxy-policy.test.ts`

Run: `pnpm lint`

- [ ] **Step 8: Commit the session boundary**

Run: `git add proxy.ts src/domain/access.ts src/lib/supabase src/server/auth tests/domain/access.test.ts tests/server/auth`

Run: `git commit -m "feat: add secure Supabase session boundary"`

### Task 5: Invite completion, login, password recovery, and logout

**Files:**
- Create: `src/server/auth/service.ts`
- Create: `src/features/auth/LoginForm.tsx`
- Create: `src/features/auth/SetPasswordForm.tsx`
- Create: `src/features/auth/LogoutButton.tsx`
- Create: `app/login/page.tsx`
- Create: `app/auth/callback/route.ts`
- Create: `app/auth/set-password/page.tsx`
- Create: `app/auth/forgot-password/page.tsx`
- Create: `app/auth/actions.ts`
- Create: `tests/server/auth/service.test.ts`
- Create: `tests/ui/auth-flow.test.tsx`

**Interfaces:**
- Consumes: Task 4 Supabase clients, PLN email validator, and actor errors; Task 2 `activate_my_profile()` RPC.
- Produces: `signIn(input, gateway)`, `requestPasswordReset(input, gateway)`, `completeInvite(input, gateway)`, and `signOut(gateway)` service functions plus accessible Indonesian auth pages/actions.

- [ ] **Step 1: Write failing auth-service tests**

Assert invalid domains are rejected before a gateway call; sign-in maps invalid credentials to a generic Indonesian error; password-reset redirect uses `${siteUrl}/auth/callback?next=/auth/set-password`; invite completion requires matching passwords of at least 12 characters, updates the password, then calls `activate_my_profile`; logout clears the session.

- [ ] **Step 2: Write failing UI tests**

Assert labels, autocomplete attributes, error/status announcements, disabled pending state, password confirmation, a forgot-password link, and no disclosure of whether an arbitrary email account exists.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm test -- tests/server/auth/service.test.ts tests/ui/auth-flow.test.tsx`

Expected: FAIL because services and pages do not exist.

- [ ] **Step 4: Implement service functions and Server Actions**

Keep Supabase calls in the injected gateway/service layer so tests do not need network access. Server Actions recreate a server client, validate input, call the service, and return serializable field/form state. Never return raw Supabase errors or keys to the browser.

- [ ] **Step 5: Implement callback and pages**

The callback validates the `next` target against an internal allowlist, exchanges the PKCE code, and redirects to password setup for invited/recovery flows. Authenticated pages use `dynamic = "force-dynamic"`. Password setup refuses requests without a valid session.

- [ ] **Step 6: Verify the hosted Auth configuration**

In Supabase development settings, set Site URL to the local app during development and add exact callback URLs for localhost and the Vercel preview/production host. Disable public sign-up. Retain email confirmation/invitation templates; do not add a third-party SMTP provider in phase 1.

- [ ] **Step 7: Run the Task 5 quality gate**

Run: `pnpm test -- tests/server/auth/service.test.ts tests/ui/auth-flow.test.tsx`

Run: `pnpm lint`

Run: `pnpm build`

Expected: PASS with development environment variables present locally.

- [ ] **Step 8: Commit authentication flows**

Run: `git add app/login app/auth src/features/auth src/server/auth/service.ts tests/server/auth/service.test.ts tests/ui/auth-flow.test.tsx`

Run: `git commit -m "feat: add PLN account authentication flows"`

### Task 6: DIV RST user administration and bootstrap

**Files:**
- Create: `src/domain/user-admin.ts`
- Create: `src/server/admin/user-service.ts`
- Create: `app/api/admin/users/invite/route.ts`
- Create: `app/api/admin/users/[userId]/route.ts`
- Create: `app/(workspace)/admin/pengguna/page.tsx`
- Create: `src/features/admin/UserManagement.tsx`
- Create: `scripts/bootstrap-admin.mjs`
- Create: `tests/domain/user-admin.test.ts`
- Create: `tests/server/admin/user-service.test.ts`
- Create: `tests/ui/user-management.test.tsx`

**Interfaces:**
- Consumes: Task 4 `Actor`, `requireActor`, public/server/admin Supabase clients, roles, and Unit Induk records.
- Produces: `InviteUserInput`, `UpdateUserAccessInput`, `validateUserAccess(input)`, `inviteUser(actor, input, deps)`, `updateUserAccess(actor, input, deps)`, admin API routes, and a one-time local bootstrap command.

- [ ] **Step 1: Write failing domain and service tests**

Assert only `RST_ADMIN` can invite/change access; email must be exact PLN domain; `UNIT_OPERATOR` requires at least one Unit Induk; RST roles may omit unit assignment; duplicate invites return a stable conflict result; failed role/unit persistence deletes the newly created Auth user and appends a failure audit event; successful invitations append a success audit event without storing invitation tokens.

- [ ] **Step 2: Write failing user-management UI tests**

Assert the table shows email, display name, role, Unit Induk, status, and last update; invite form supports role/unit assignment; non-admin rendering has no invite/disable controls; pending and error states are announced accessibly.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm test -- tests/domain/user-admin.test.ts tests/server/admin/user-service.test.ts tests/ui/user-management.test.tsx`

Expected: FAIL because the domain/service/UI do not exist.

- [ ] **Step 4: Implement invitation and access services**

Use the user-session client to establish the caller Actor, then use the server-only admin client for Auth administration and controlled persistence. Invitation redirect is `${siteUrl}/auth/callback?next=/auth/set-password`. Treat Auth creation plus DB assignments as a compensated workflow: on DB failure, delete the new Auth user; report cleanup failure in audit and server logs without exposing secrets.

Disabling sets `profiles.status = DISABLED`; actor loading and RLS block the account immediately even if an old browser cookie remains. It does not delete audit history. Access updates replace role/unit assignments and append audit events.

- [ ] **Step 5: Implement API routes and admin UI**

Route handlers accept/return JSON with Zod validation, return 401/403/409/422/500 consistently, and never trust role/unit IDs from the browser without database validation. The page is force-dynamic and server-loads users/units; interactive form mutations refresh the list.

- [ ] **Step 6: Implement and run the one-time admin bootstrap**

`scripts/bootstrap-admin.mjs` requires `BOOTSTRAP_ADMIN_EMAIL`, exact PLN domain, Supabase URL/publishable/secret keys, and an explicit `--confirm` flag. It creates or invites the first user, assigns `RST_ADMIN`, and exits without printing credentials or tokens. It refuses to run when an active RST admin already exists unless `--allow-existing` is explicitly supplied.

- [ ] **Step 7: Run the Task 6 quality gate**

Run: `pnpm test -- tests/domain/user-admin.test.ts tests/server/admin/user-service.test.ts tests/ui/user-management.test.tsx`

Run: `pnpm lint`

- [ ] **Step 8: Commit user administration**

Run: `git add app/api/admin 'app/(workspace)/admin' src/domain/user-admin.ts src/server/admin src/features/admin scripts/bootstrap-admin.mjs tests/domain/user-admin.test.ts tests/server/admin tests/ui/user-management.test.tsx`

Run: `git commit -m "feat: add RST user administration"`

### Task 7: Protected workspace and session-aware application shell

**Files:**
- Create: `src/state/AuthWorkspaceProvider.tsx`
- Create: `src/features/auth/AuthenticatedWorkspace.tsx`
- Modify: `app/(workspace)/layout.tsx`
- Modify: `app/page.tsx`
- Modify: `src/components/shell/AppShell.tsx`
- Modify: `src/components/shell/TopBar.tsx`
- Modify: `src/components/shell/SideNav.tsx`
- Modify: `tests/ui/workspace-navigation.test.tsx`
- Modify: `tests/ui/dashboard.test.tsx`
- Create: `tests/ui/authenticated-shell.test.tsx`

**Interfaces:**
- Consumes: Task 4 `Actor` and server actor loader; Task 5 logout action; Task 6 admin route.
- Produces: `AuthWorkspaceProvider`, `useActor()`, and `AuthenticatedWorkspace({ actor, children })`; async protected workspace layout; role-aware navigation and user context.

- [ ] **Step 1: Write failing authenticated-shell tests**

Assert the shell shows the actor name/email, role label, assigned Unit Induk names, and logout control; admin sees `Kelola Pengguna`; reviewer/operator/viewer do not. Assert demo calculation pages retain a visible “Data Demo” warning after authentication.

- [ ] **Step 2: Adapt existing navigation tests before changing the server layout**

Replace direct rendering of the future async `WorkspaceLayout` with `AuthenticatedWorkspace` and a fixed synthetic `Actor`. Preserve all existing same-layout demo state assertions and navigation coverage.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `pnpm test -- tests/ui/authenticated-shell.test.tsx tests/ui/workspace-navigation.test.tsx tests/ui/dashboard.test.tsx`

Expected: FAIL because the authenticated wrapper/context does not exist.

- [ ] **Step 4: Implement the authenticated wrapper and protected layout**

The async workspace layout creates a server client, calls `requireActor`, redirects unauthenticated users to `/login`, and renders `AuthenticatedWorkspace`. The client wrapper composes `AuthWorkspaceProvider`, the existing `DemoWorkspaceProvider`, and `AppShell` so current demo state remains functional.

Root `/` creates a server client and redirects authenticated users to `/ringkasan` and unauthenticated users to `/login`; it no longer manually nests the workspace layout.

- [ ] **Step 5: Update shell copy and role-aware navigation**

Replace demo avatar/context with actor identity while keeping a prominent `Data Demo` label on calculation modules. Add an Administration section visible only to `RST_ADMIN`; do not hide links as the sole authorization mechanism.

- [ ] **Step 6: Run the workspace regression suite**

Run: `pnpm test`

Run: `pnpm lint`

Run: `pnpm build`

Expected: all existing 69+ tests plus new auth tests pass; build emits dynamic server routes rather than an `out/` static export.

- [ ] **Step 7: Commit the protected workspace**

Run: `git add app src/components/shell src/features/auth/AuthenticatedWorkspace.tsx src/state/AuthWorkspaceProvider.tsx tests/ui`

Run: `git commit -m "feat: protect workspace with role-aware shell"`

### Task 8: Hosted integration tests, Vercel configuration, and phase-1 handoff

**Files:**
- Modify: `playwright.config.ts`
- Create: `tests/e2e/auth.setup.ts`
- Create: `tests/e2e/auth.teardown.ts`
- Create: `tests/e2e/auth.spec.ts`
- Modify: `tests/e2e/workspace.spec.ts`
- Modify: `README.md`
- Create: `docs/operations/supabase-setup.md`
- Modify: `SESSION_HANDOFF.md` (ignored internal document; local update only)

**Interfaces:**
- Consumes: complete Tasks 1–7, linked Supabase development project, Vercel project access, and server-only E2E credentials.
- Produces: authenticated Playwright coverage, reproducible environment/deployment instructions, Vercel runtime variables, and a verified phase-1 deployment.

- [ ] **Step 1: Write failing authenticated E2E scenarios**

Use a development-only synthetic `@pln.co.id` test user created by global setup and removed by teardown. Cover:

- unauthenticated `/ringkasan/` redirects to `/login`;
- valid admin login reaches the workspace and `/admin/pengguna/`;
- operator login can view `/ringkasan/` but receives 403/redirect from admin APIs/pages;
- logout invalidates workspace access;
- existing demo workflow navigation still functions after authentication.

- [ ] **Step 2: Update Playwright to run the dynamic app**

Replace the static `tests/e2e/serve-static.mjs` web server with `pnpm dev` for local verification or `pnpm start` after `pnpm build` in CI. Use environment variables for Supabase/E2E credentials; never write storage-state or passwords to tracked locations.

- [ ] **Step 3: Run E2E tests and fix integration-only defects**

Run: `pnpm test:e2e`

Expected: all auth scenarios and updated workspace scenarios PASS against the isolated Supabase development project.

- [ ] **Step 4: Document setup and recovery**

`docs/operations/supabase-setup.md` must cover project creation in Singapore, CLI link, migration dry-run/push, pgTAP, Auth Site URL/redirects, public sign-up disabled, first-admin bootstrap, Vercel variable names, secret rotation, Free-tier pause behavior, and the explicit ban on `db reset --linked` outside disposable projects.

README links to the design, this plan, and operations guide. Do not include real project refs, URLs containing secrets, database passwords, or API key values.

- [ ] **Step 5: Configure Vercel and verify preview/production**

Set the four application environment variables in Vercel through its encrypted environment settings. Deploy a preview first, validate callback URLs/login, then promote the same commit. Confirm no secret appears in client bundles or browser network responses.

- [ ] **Step 6: Run the complete quality gate**

Run: `pnpm test`

Run: `pnpm db:test`

Run: `pnpm db:lint`

Run: `pnpm lint`

Run: `pnpm build`

Run: `pnpm test:e2e`

Expected: all commands exit 0. Record counts and deployment URL in the handoff; do not claim phase-2 import persistence exists.

- [ ] **Step 7: Commit the phase-1 integration**

Run: `git add playwright.config.ts tests/e2e README.md docs/operations`

Run: `git commit -m "test: verify authenticated Supabase foundation"`

## Phase Boundary and Next Plans

This plan is complete when users can be invited, verify/set a password, sign in, receive role/unit assignments, and access a server-rendered workspace under tested RLS. Existing ABC/RFQ/policy/location screens remain synthetic.

After this plan passes, write separate plans in this order:

1. **Persistent import and approval:** private resumable upload, workbook parsing, mapping profiles, validation/staging, full-snapshot version comparison, RST approval, activation, history, trash, and restore.
2. **RFQ and calculation engine:** versioned RFQ references/decisions, 14 transformer guards, ABC and A1/A2/B1/B2/C parity, calculation runs, history coverage, and overlap prevention.
3. **National results and operations:** national coverage dashboard, P0–P4 location ranking, capacity warnings, audit/notifications, exports, initial UIT JBB migration, and production hardening.
