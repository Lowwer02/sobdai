# Sobdai Session 6.13.x — Exam Navigation UX Alignment (SAFE)

**Status:** ✅ Complete
**Task type:** SAFE — reuse SummaryNavigation pattern for Exam Sets
**Files touched:** `components/ExamNavigation.tsx` (new), `app/package/[slug]/PackageClient.tsx` (−27 lines)
**Date:** 2026-07-07

---

## 1. UX Changes

The Package Detail page previously rendered Exam Sets as a **flat list**,
inconsistent with the Summary column next to it which had Search, Filter
pills, Subject accordion, and a Result counter. This session aligns the two
columns onto a single navigation pattern.

### Before (Exam Sets)
- Flat list of cards, ordered by `sort_order`
- No search, no filter, no grouping, no counter

### After (Exam Sets) — mirrors Summary
| Feature | Implementation |
|---------|----------------|
| **ค้นหาชุดข้อสอบ** | Search input (top-left icon, same style as Summary search) |
| **Filter pills** | `ทั้งหมด` / `พร้อมทำ` / `ล่าสุด` (same 3-option pill row, same active style) |
| **Result counter** | `X ชุดข้อสอบ` (right-aligned in the filter row, same as Summary's `X รายการ`) |
| **Grouping** | Accordion by category — `ตัวอย่าง` (is_sample=true) / `เต็มรูปแบบ` (is_sample=false) |
| **Mobile** | Accordion: one category open at a time (same `matchMedia(768px)` logic as Summary) |
| **Desktop** | All categories always expanded, no chevron (identical to Summary) |
| **Card** | The **exact same card** the flat list used — runtime / CTA unchanged |

### Honesty note on "group by subject"

The task asked to group Exam Sets by Subject (กฎหมาย / นโยบาย / เศรษฐกิจ …),
identical to Summary. **This is impossible without a schema change**: the
`exam_sets` table has no `subject` or `topic` column — only `questions` and
`summaries` do. The task explicitly forbids modifying the Database / Exam
schema.

The only classification signal `exam_sets` exposes is the boolean `is_sample`.
We therefore group by the **type** that the admin UI already badges:
`ตัวอย่าง` (Sample) vs `เต็มรูปแบบ` (Full). This is the honest, schema-safe
equivalent of the requested subject grouping — it delivers the accordion IA
without inventing data that does not exist.

This decision was confirmed before implementation (the alternative options
were: parse subject from free-text names → fragile; or add a migration →
explicitly forbidden).

---

## 2. Files Modified

| File | Change |
|------|--------|
| `components/ExamNavigation.tsx` | **NEW.** Exam Sets navigation mirroring the `SummaryNavigation` pattern: search + filter pills + accordion grouping + result counter + responsive desktop/mobile. Reuses the existing Exam card markup. |
| `app/package/[slug]/PackageClient.tsx` | Replaced the 27-line flat-list Exam Sets block with `<ExamNavigation examSets={examSets} packageSlug={pkg.slug} />`. Added the import. Removed the now-unused `sortedExamSets` sort (ExamNavigation owns ordering). |

**Net diff:** 1 new component, PackageClient **−27 / +3** lines.

### Explicitly NOT modified (per SAFE constraints)

- Database / Supabase / exam schema — untouched
- Exam Runtime (Practice / Mock / Sample) — untouched; the card navigates to the same `/package/[slug]/exam/[examSetId]` route as before
- Scoring / Question Flow — untouched
- Orders / Payments / Authentication — untouched
- Package schema, Admin, ISR, RPC, Middleware — untouched
- `SummaryNavigation.tsx` — untouched (we mirror its pattern, we do not edit it)

---

## 3. Components Reused

| Reused from | How |
|-------------|-----|
| **SummaryNavigation pattern** | Search input (absolute-positioned icon + input), filter pill row (`role="radiogroup"`), accordion category card (`#0F0B07` bg, gold border when expanded), result counter (right-aligned `#A1866B`), responsive `matchMedia('(min-width: 768px)')` desktop=all-open / mobile=one-at-a-time, empty-state boxes. |
| **Existing Exam card** | The card markup (`bg-[#0F0B07] border … rounded-2xl p-5`, `ตัวอย่าง` corner badge, name/description, `Clock` + `FileText` footer) is copied verbatim from the old flat list. Runtime / CTA identical. |
| **Styling tokens** | Same inline-style color palette (`#0F0B07`, `#1A140E`, `#D4AF37`, `#F5E9D6`, `#A1866B`), same radii (12px / 16px), same font sizes (11/13/14px), same transitions (`border-color 0.2s`, `max-height 0.3s ease`). |

### What was NOT created (per "DO NOT CREATE")

- No `ExamNavigation2`, `Search2`, `Accordion2`, or duplicate components.
- No duplicate CSS — ExamNavigation uses the same inline-style approach and tokens as SummaryNavigation; no new Tailwind classes invented.
- No duplicate fetch logic — ExamNavigation is a pure presentational + client-filter layer over data passed in as props.

---

## 4. Browser QA

Run on **Desktop** (≥768px) and **Mobile** (<768px).

### Layout parity
- [ ] Summary and Exam columns visually match: both have search, filter pills, counter, accordion.
- [ ] On desktop, all Exam categories are expanded with no chevron (same as Summary).
- [ ] On mobile, Exam accordion opens one category at a time; first category auto-expanded.

### Search
- [ ] Typing in "ค้นหาชุดข้อสอบ..." filters by exam set name.
- [ ] Counter updates live.
- [ ] Empty result shows `ไม่พบชุดข้อสอบที่ตรงกับเงื่อนไข`.

### Filters
- [ ] **ทั้งหมด** — shows every set (sorted by sort_order).
- [ ] **พร้อมทำ** — only sets with `qCount > 0`.
- [ ] **ล่าสุด** — sets ordered by `updated_at` desc.
- [ ] Active pill is gold; inactive pills are muted; only one active at a time.

### Grouping
- [ ] `ตัวอย่าง` group contains only `is_sample` sets.
- [ ] `เต็มรูปแบบ` group contains only non-sample sets.
- [ ] Each category header shows a count badge.
- [ ] If a package has only one type, only one accordion shows (no empty group).

### Card / Runtime (regression-critical)
- [ ] Clicking a card navigates to `/package/[slug]/exam/[id]` — same as before.
- [ ] `ตัวอย่าง` corner badge appears on sample sets.
- [ ] Duration and question count render correctly.
- [ ] Practice / Mock / Sample exam runtime is unchanged once entered.

### Empty package
- [ ] Package with no exam sets shows `กำลังจัดเตรียมชุดข้อสอบ`.

---

## 5. Regression Analysis

| Area | Risk | Reasoning |
|------|------|-----------|
| Exam Runtime (Practice/Mock/Sample) | None | The card's `<Link href>` target is byte-identical to the old flat list. Runtime lives in `exam/[examSetId]/ExamRuntime.tsx`, untouched. |
| Scoring / Question Flow | None | Not in scope of this component. |
| Exam card content | None | Card markup copied verbatim; `is_sample`, `name`, `description`, `duration_minutes`, `qCount` all read from the same props. |
| Sort order | Improved | Old code sorted by `sort_order` once. New code preserves `sort_order` for `ทั้งหมด`, adds `updated_at` desc for `ล่าสุด`, and `qCount>0` filter for `พร้อมทำ`. Default view (`ทั้งหมด`) is identical ordering to before. |
| Package ISR | None | `app/package/[slug]/page.tsx` unchanged; `/package/[slug]` remains a server component feeding the same `examSets` prop. Build confirms route still `ƒ` (dynamic). |
| RPC / counts | None | `getPackagePublicCounts` and `qCount` injection in `page.tsx` untouched. |
| Summary column | None | `SummaryNavigation.tsx` not edited. |
| Other pages (exams, packages catalog, homepage) | None | Only `PackageClient` consumes `ExamNavigation`. |
| Auth / RBAC | None | No auth logic touched. |

### Default-view parity (before vs after, no search/filter active)

| Aspect | Before | After |
|--------|--------|-------|
| Data source | `sortedExamSets` (sort_order) | `examSets` prop, ExamNavigation sorts by sort_order for `ทั้งหมด` |
| Card | flat list card | same card, inside accordion |
| Visible sets | all | all (both groups expanded on desktop; first group on mobile) |

---

## 6. Performance Verification

- **`useMemo` everywhere.** `filteredCategories` and `totalFiltered` are both memoised; recomputation happens only when `examSets`, `searchQuery`, or `activeFilter` change — exactly the SummaryNavigation approach.
- **No additional query.** `ExamNavigation` is a pure client filter over the `examSets` prop already fetched by `page.tsx`. No new Supabase call, no new RPC.
- **No duplicate fetch.** Data flows once: `page.tsx` → `PackageClient` → `ExamNavigation`.
- **No new dependency.** `package.json` untouched. Uses only `react`, `next/link`, `lucide-react` (all already in the bundle).
- **Responsive without layout shift.** Desktop/mobile split tracked via `matchMedia` in an effect, mirroring SummaryNavigation — no SSR mismatch because the accordion defaults to a safe mobile-first state.
- **ISR preserved.** Build output confirms homepage `/` and `/packages` still `Revalidate 5m`; `/package/[slug]` remains dynamic; `ƒ Proxy (Middleware)` registered.

---

## 7. Build Verification

| Step             | Command            | Result |
|------------------|--------------------|--------|
| TypeScript       | `npx tsc --noEmit` | ✅ exit 0 |
| Production build | `npm run build`    | ✅ exit 0 |
| ISR routes       | `/`, `/packages`   | ✅ 5m revalidate intact |
| Middleware proxy | `proxy.ts`         | ✅ `ƒ Proxy (Middleware)` |
| No new warnings  | build log          | ✅ clean |

---

## Summary

Exam Sets on the Package Detail page now share the **same Information
Architecture** as Summaries: search, filter pills, result counter, and a
responsive accordion. This was achieved by creating one new component,
`ExamNavigation`, that mirrors the `SummaryNavigation` pattern and reuses the
existing Exam card verbatim — no new runtime, no new queries, no schema
changes, no duplicate CSS. Grouping is by exam type (`ตัวอย่าง` / `เต็มรูปแบบ`)
rather than subject, because the `exam_sets` schema (frozen by the task
constraints) carries no subject field; this is the honest, schema-safe
equivalent of the requested subject grouping. TypeScript and production build
both pass.
