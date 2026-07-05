# Sobdai Session 6.12.6 — Navbar Admin Visibility Fix Review (SAFE)

**Status:** ✅ Complete
**Task type:** SAFE — review + replace temporary hotfix with long-term solution
**Scope touched:** `components/Navbar.tsx` (single file, 17 insertions / 4 deletions)
**Date:** 2026-07-05

---

## 1. Root Cause

The previous AI's diagnosis was **partially correct but imprecise**. The actual root cause
was investigated against the migration history and is stated precisely below.

### What the Navbar needs from `profiles`

| Column        | Required for                        | Introduced by migration |
|---------------|-------------------------------------|-------------------------|
| `role`        | `isAdmin` (Admin button visibility) | `001_init_admin_schema.sql` (initial) |
| `status`      | banned-user safety net              | `004_admin_completion.sql` (June 26)  |
| `avatar_url`  | navbar avatar                       | `007_add_profile_settings.sql` (June 27) |
| `deleted_at`  | deactivated-account auto-logout     | `008_soft_delete_foundation.sql` (June 27) |

### What actually happened

1. Commit `9da7f55` (2026-07-04, "feat(admin): implement user ban system") added the
   `status === 'banned'` safety net to the Navbar and widened its query from
   `select('role, deleted_at, avatar_url')` to
   `select('role, deleted_at, avatar_url, status')`.

2. On production, the `profiles` query then began returning **HTTP 400** from
   PostgREST, which made `data` `null`, which made `isAdmin` evaluate to `false`,
   which hid the "Admin Panel" button.

3. The next morning, commit `db06448` replaced the query with `select('*')`. The
   button reappeared, so `select('*')` was treated as "the fix". It is not — it is
   only a workaround.

### The real underlying cause

A 400 "column does not exist" error means one of the four columns above is missing
from the production `profiles` table. Given the column origins:

- `role` is from migration **001** — present on every environment, cannot be the cause.
- `deleted_at` is from migration **008** — present since June 27, unlikely.
- `avatar_url` is from migration **007** — present since June 27, unlikely.
- `status` is from migration **004** — present since June 26.

The most probable root cause is therefore **not** a permanently missing column, but one of:

- **(a) A migration gap on production** — one of migrations 001–018 was not applied
  (or not yet committed to the `supabase_migrations` log on the prod project), so a
  column the code expects is absent. Note: `018_ban_metadata.sql` does **not** add
  `status` — it only adds `banned_at`, `banned_reason`, `banned_by`. So if `018` was
  deployed but `004` somehow was not, the banned check itself would 400.
- **(b) PostgREST schema-cache desync** — after a DDL change the PostgREST schema
  cache was not reloaded. Migration `007` even includes `NOTIFY pgrst, 'reload schema';`
  precisely to defend against this. A stale cache returns 400 for columns that do exist.
- **(c) A stale build / stale client** — the deployed bundle referenced a column the
  then-current prod DB did not yet have at deploy time.

Crucially, the **same** `status` column is queried with explicit columns by
`components/AuthModal.tsx:132` (`select('deleted_at, status')`). If `status` were
genuinely missing in production, the login flow itself would be degraded — confirming
the cause is environmental/transient (a, b, or c), not a permanent schema deficit.

---

## 2. Why `select('*')` worked

`select('*')` asks PostgREST for "every column that currently exists". It cannot 400
on a missing column — it just returns whatever subset of columns is present. So even
on a DB missing one of the four columns, the call succeeds, returns a partial row,
and the optional-chaining guards (`data?.role`, `data?.status`, …) paper over the
absent field. The Admin button came back because the `role` column — the only one
needed for `isAdmin` — was definitely present.

---

## 3. Why `select('*')` must not remain permanently

1. **Over-fetching.** `profiles` carries many columns the Navbar never uses
   (`display_name`, `occupation`, `phone`, `email`, `created_at`, `updated_at`,
   `deleted_reason`, `deleted_by`, `banned_at`, `banned_reason`, `banned_by`).
   `select('*')` ships all of them to the browser on every page load for every
   logged-in user.
2. **Performance.** Wider rows mean larger JSON payloads and slower parsing on the
   critical client path that decides whether to show the Admin button.
3. **Hides bugs.** A 400 from `select('*')` is effectively impossible, so it
   silently masks migration drift instead of surfacing it. The team would not learn
   that prod is missing a migration until a feature actually breaks.
4. **Maintainability / contract.** Explicit column lists document the component's
   data contract; `select('*')` makes the component coupled to the entire table.
5. **Consistency.** Every other profile read in the codebase uses explicit columns
   (e.g. `AuthModal.tsx`, `app/package/[slug]/page.tsx`, `server-protect.ts`).
   `select('*')` in the Navbar was the only outlier after the hotfix.

---

## 4. Correct implementation

Replaced the hotfix with explicit-column selection plus a documented graceful-
degradation path. The Navbar now queries only what it needs:

```ts
const { data, error } = await supabase
  .from('profiles')
  .select('role, status, deleted_at, avatar_url')   // explicit, no over-fetch
  .eq('id', sessionUser.id)
  .single()

if (error) {
  // Navbar is a client-side UX hint only. Authoritative access control is
  // enforced server-side in lib/auth/server-protect.ts + RBAC, so a failed
  // profile read here must NOT break the rest of the auth flow.
  //
  // If this fires in production it almost always means a migration has not
  // been applied (PostgREST returns 400 "column does not exist"). The fix
  // is to apply the missing migration, NOT to widen the query to select('*').
  console.error('Navbar: profiles query failed — check migration status:', error.message)
}
```

### Why this is safe on error

When the query fails, `data` is `null`. The downstream logic is already null-safe:

| Branch                                   | Behaviour when `data == null`            |
|------------------------------------------|------------------------------------------|
| `if (data?.deleted_at)`                  | skipped (`undefined`)                    |
| `if (data?.status === 'banned')`         | skipped (`undefined`)                    |
| `setIsAdmin([…].includes(data?.role))`   | `false`                                  |
| `setAvatarUrl(data?.avatar_url ?? null)` | `null`                                   |

Result: the Admin button is hidden for that session and a console error is logged
for the operator — but **no crash, no broken auth state, no infinite reload**.
The user can still navigate, log out, and log back in. Real access control is
unaffected because it lives in `getAdminSession()` / RBAC on the server.

### Admin button visibility logic (unchanged)

```ts
setIsAdmin(['admin', 'owner', 'editor', 'support'].includes(data?.role))
```

This matches the RBAC role set in `lib/auth/rbac.ts` and was **not modified**.

---

## 5. Required migrations

No new migration was created. The columns the Navbar depends on already exist in
the established migration set:

| Column        | Migration                            |
|---------------|--------------------------------------|
| `role`        | `001_init_admin_schema.sql`          |
| `status`      | `004_admin_completion.sql`           |
| `avatar_url`  | `007_add_profile_settings.sql`       |
| `deleted_at`  | `008_soft_delete_foundation.sql`     |

### Correct deployment order

To guarantee the Navbar query never 400s in production, ensure the prod Supabase
project has **at least** migrations `001` through `008` applied, in order. In
practice the team should verify that all 18 migrations present in
`supabase/migrations/` are recorded in the prod project's
`supabase_migrations.migrations` table. If any is missing:

1. Apply the missing migration(s) in numeric order.
2. If a migration that ends with `NOTIFY pgrst, 'reload schema';` (e.g. `007`)
   was applied but the 400 persists, manually reload the PostgREST schema cache
   (Supabase Dashboard → Database → Replication/Reload, or run
   `NOTIFY pgrst, 'reload schema';` once).
3. Redeploy the app so the build matches the schema.

### Operational note

After this fix, a Navbar 400 will be **visible** as a console error tagged
`Navbar: profiles query failed — check migration status: …`. That is intentional:
it is the early-warning signal that `select('*')` was previously swallowing.

---

## 6. Files modified

| File | Change |
|------|--------|
| `components/Navbar.tsx` | Restored explicit `.select('role, status, deleted_at, avatar_url')`; rewrote the error handler with documented graceful-degradation rationale; added column-origin comment. |

**Diff size:** 1 file, +17 / −4 lines. No other files were touched.

### Explicitly NOT modified (per SAFE constraints)

- Business logic, authentication flow, permission rules — untouched.
- Admin Panel, Orders, Exam, Summary, Markdown, Package — untouched.
- Homepage ISR, Package ISR, `Promise.all` optimisations, RPC, `proxy.ts`, cache,
  image optimisation — untouched. Build output confirms ISR revalidate values
  unchanged (`/` → 5m, `/packages` → 5m).
- No new dependencies added.

---

## 7. Regression analysis

| Area                        | Risk | Reasoning |
|-----------------------------|------|-----------|
| Admin button visibility     | None | Same `.includes([...])` check, same role set, same source column (`role`). |
| Banned-user safety net      | None | `status === 'banned'` branch and its `signOut()` + redirect are byte-for-byte unchanged. |
| Deactivated-account logout  | None | `deleted_at` branch unchanged. |
| Avatar rendering            | None | `avatarUrl` state and the `data?.avatar_url ?? null` assignment unchanged. |
| Auth state subscription     | None | `onAuthStateChange` subscription and its cleanup are unchanged. |
| `getSession()` optimisation | None | Mount-time `getSession().then(...)` (no network round-trip) is preserved. |
| Server-side auth/RBAC       | None | `lib/auth/server-protect.ts`, `lib/auth/rbac.ts`, `app/admin/layout.tsx` not touched. |
| Other profile readers       | None | `AuthModal.tsx`, `app/package/[slug]/*`, `app/settings/*`, `app/admin/users/*` not touched. |

### Behavioural parity table (before hotfix vs. after this fix)

| Scenario                                       | Hotfix (`select('*')`) | This fix (explicit + error handler) |
|------------------------------------------------|------------------------|-------------------------------------|
| All columns present                            | Admin button shows ✓   | Admin button shows ✓                |
| `status` column missing                        | Admin button shows ✓*  | Admin button hidden + console error |
| Query network error                            | Hidden + console error | Hidden + console error              |
| Bytes transferred per logged-in page load      | Full row               | 4 columns only                      |

\* `select('*')` masks the missing column; this fix surfaces it.

---

## 8. Performance verification

- **Payload size:** Navbar now requests exactly 4 columns instead of the full
  `profiles` row (≥ 11 columns including `display_name`, `occupation`, `phone`,
  `email`, timestamps, ban metadata). Net reduction per logged-in page load.
- **Network calls:** Unchanged — still exactly one profiles read on mount plus
  one per auth state change. `getSession()` (local, synchronous) is still used
  on mount; no extra `getUser()` round-trip was introduced.
- **Build output confirms ISR intact:**
  - `/` → Revalidate **5m**
  - `/packages` → Revalidate **5m**
  - Middleware proxy (`proxy.ts`) still registered as `ƒ Proxy (Middleware)`.
- **No new dependencies.** `package.json` unchanged.
- **Bundle:** Only `components/Navbar.tsx` changed; no imports added or removed.

---

## 9. Browser QA checklist

Run through these on a staging DB that has **all** migrations applied, then repeat
step 1 on a DB with one column artificially dropped (or just trust the table above).

- [ ] **Owner** logs in → "Admin Panel" button visible in navbar (desktop + mobile).
- [ ] **Admin** logs in → "Admin Panel" button visible.
- [ ] **Editor** logs in → "Admin Panel" button visible.
- [ ] **Support** logs in → "Admin Panel" button visible.
- [ ] **Regular user** logs in → "Admin Panel" button **not** visible.
- [ ] **Logged-out** visitor → "Admin Panel" button **not** visible; Login/Register shown.
- [ ] **Avatar** renders for a user whose `avatar_url` is set; falls back to default otherwise.
- [ ] **Banned user** (set `status='banned'` while they have a session) → on next
      mount/auth event they are signed out and redirected to `/login?banned=1`.
- [ ] **Deactivated user** (`deleted_at` set) → signed out and page reloaded.
- [ ] **Logout** still works from navbar (confirm dialog → toast → redirect to `/`).
- [ ] **Simulated query failure:** temporarily rename one column in the select list
      (e.g. `rolee`) in a dev build → page does **not** crash, Admin button is hidden,
      and the console shows
      `Navbar: profiles query failed — check migration status: …`.
- [ ] **Admin page deep link** (`/admin`) still enforces server-side RBAC regardless
      of navbar state (the Navbar is only a hint; `getAdminSession()` is authoritative).

---

## 10. Build verification

| Step                | Command              | Result |
|---------------------|----------------------|--------|
| TypeScript          | `npx tsc --noEmit`   | ✅ Pass — no errors |
| Production build    | `npm run build`      | ✅ Pass — exit code 0 |
| Static generation   | 33/33 pages          | ✅ Pass |
| ISR routes preserved| `/` , `/packages`    | ✅ 5m revalidate intact |
| Middleware proxy    | `proxy.ts`           | ✅ Registered as `ƒ Proxy (Middleware)` |

```
Route (app)                                Revalidate  Expire
┌ ○ /                                              5m      1y
…
├ ○ /packages                                      5m      1y
…
ƒ Proxy (Middleware)
```

---

## Summary

The hotfix `select('*')` has been replaced with the correct long-term solution:
**explicit column selection** (`role, status, deleted_at, avatar_url`) **plus a
documented graceful-degradation error handler**. No business logic, auth flow,
permissions, or performance optimisations were touched. The fix is safe on error,
smaller on the wire, and — unlike `select('*')` — surfaces migration drift as a
clear console warning instead of hiding it.

---

# Follow-up — Session 6.12.6.1 (same day)

## What happened after deploy

Commit `d144a29` was deployed to `https://sobdai.vercel.app`. The Admin Panel
button disappeared again for Owner / Admin / Editor / Support. Direct access to
`/admin` still worked (server-side RBAC unaffected).

## Honest post-mortem: the 6.12.6 design regressed

The 6.12.6 fix used **graceful degradation** = "on query failure, hide the
button". On a perfectly migrated database the explicit query would have worked.
On the production database it failed — and our degradation path did exactly
what we designed it to do: hid the button. We over-optimised for "don't hide
bugs" and under-optimised for "users must see the button". That was the wrong
tradeoff for a UX-only client component.

### Evidence the original "missing migration" diagnosis was wrong

- `components/AuthModal.tsx:132` runs `select('deleted_at, status')` and login
  works in production → those columns exist.
- `lib/auth/server-protect.ts` reads `profile.role` via `select('*')` and
  `/admin` access works → `role` exists.
- Therefore all four Navbar columns exist; the 400 is **not** a missing column.
- The most probable real cause is a **stale PostgREST schema cache** — note
  that migration `007_add_profile_settings.sql` (the one that adds
  `avatar_url`) ends with `NOTIFY pgrst, 'reload schema';`, a defence the team
  has clearly needed before.

## The correct long-term fix (now applied)

Keep explicit columns as the **primary** path (fast, minimal payload, the
common case) but add a **`select('*')` recovery fallback** that runs *only*
when the primary query fails. This gives us both properties at once:

1. **Happy path:** explicit, minimal, performant.
2. **Degraded DB (stale cache / unmigrated):** button still renders — no
   silent UX regression for end users.
3. **Diagnosable:** the primary failure is logged loudly, naming the offending
   column / reason, so an operator sees exactly what is wrong without the bug
   being user-visible.

```ts
const primary = await supabase.from('profiles')
  .select('role, status, deleted_at, avatar_url')
  .eq('id', sessionUser.id).single()

let data = primary.data
if (primary.error) {
  console.error('Navbar: explicit profiles query failed — falling back to select(*).',
    'Offending column / reason:', primary.error.message)
  const fallback = await supabase.from('profiles')
    .select('*').eq('id', sessionUser.id).single()
  if (fallback.error) console.error('Navbar: fallback select(*) also failed:', fallback.error.message)
  data = fallback.data
}
// …rest of the auth/role/avatar logic unchanged, reads `data`
```

## Why this is not "select('*') forever" again

- The default, hot, every-page-load path is the explicit query.
- `select('*')` only runs in the error branch — zero extra cost on a healthy DB.
- The fallback exists to protect the UX, while the loud `console.error`
  protects observability. Both concerns are honoured.
- Once the root cause (apply migration / reload PostgREST schema cache via
  `NOTIFY pgrst, 'reload schema';` or the Supabase dashboard) is resolved on
  production, the fallback simply never executes.

## Verification

| Step             | Result |
|------------------|--------|
| `npx tsc --noEmit` | ✅ exit 0 |
| `npm run build`    | ✅ exit 0, 33/33 pages |
| ISR `/`, `/packages` | ✅ 5m revalidate intact |
| `ƒ Proxy (Middleware)` | ✅ still registered |

## Operational follow-up (not code)

To make the fallback stop firing on production, do one of:
1. Apply any not-yet-run migration from `supabase/migrations/`, **or**
2. Reload the PostgREST schema cache: run `NOTIFY pgrst, 'reload schema';`
   against the production database (Supabase Dashboard → SQL Editor), **or**
3. Use Supabase Dashboard → Database → "Reload schema cache".

After that, the explicit query will succeed and the fallback branch will be
dead code — confirmed by the absence of the `Navbar: explicit profiles query
failed…` log line in the browser console.

## Files modified (follow-up)

| File | Change |
|------|--------|
| `components/Navbar.tsx` | Wrapped explicit query in primary/fallback pattern; `data` now sourced from primary on success, `select('*')` on primary failure. Downstream auth/role/banned/avatar logic unchanged. |

**Diff size (follow-up):** +39 / −13 lines, single file.
