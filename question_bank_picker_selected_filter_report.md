# Sobdai Session 6.12.7 — Question Bank Picker Selected Filter (SAFE)

**Status:** ✅ Complete
**Task type:** SAFE — additive client-side UX filter
**Scope touched:** `components/admin/QuestionPicker.tsx` (single file, +62 / −9 lines)
**Date:** 2026-07-05

---

## 1. UX Improvement

Admins assembling Exam Sets often select dozens of questions out of a bank of
hundreds. Previously the only way to see which questions were already selected
was to page through the picker and visually scan for the gold-highlighted cards.

This session adds a **client-side "Question Status" filter** to the Question
Bank Picker modal (Admin → Exam Sets → Create/Edit → "Add Questions"):

| Option (UI) | Shows |
|-------------|-------|
| **ทั้งหมด** | Every question (existing behaviour, unchanged) |
| **เลือกแล้ว** | Only currently-selected questions — across all server pages |
| **ยังไม่ได้เลือก** | Only not-yet-selected questions on the loaded set |

Plus a live **เลือกแล้ว X ข้อ** counter in the picker top toolbar that updates
the instant any card is toggled.

The net effect: an admin who has selected 32 of 150 questions can switch to
**เลือกแล้ว** and see all 32 in one place (paginated 10/page → 4 pages),
without hunting across 15 server pages.

---

## 2. Files Modified

| File | Change |
|------|--------|
| `components/admin/QuestionPicker.tsx` | Added `useMemo` import; added `QuestionStatusFilter` type + `PAGE_SIZE` const; added `statusFilter` state; added three `useMemo` hooks (`selectedIdSet`, `displayQuestions`, `pagedQuestions`) + `effectiveTotal`; added status `<select>`; added เลือกแล้ว counter `<span>`; rewired grid render + footer to use the memoised values. |

**Diff size:** 1 file, +62 / −9. No other files were touched.

### Why only this file

`QuestionPicker` is consumed solely by `components/admin/ExamSetForm.tsx`, which
is itself shared by both:

- `app/admin/exam-sets/create/page.tsx` (Create Exam Set)
- `app/admin/exam-sets/[id]/edit/page.tsx` (Edit Exam Set)

So both Create and Edit get the feature for free from a single edit.

### Explicitly NOT modified (per SAFE constraints)

- Question selection logic (`handleAdd`, `handleRemove`) — unchanged.
- Bulk Select / "Select All (Current Page)" (`handleSelectAll`) — unchanged; still operates on the loaded `questions` page.
- Question Card markup — unchanged.
- Save Exam Set flow / `ExamSetForm` / `onSubmit` — unchanged.
- Server actions `fetchQuestionsForPicker`, `fetchUniqueFilters` — unchanged.
- Database schema — unchanged.
- No new dependencies.

---

## 3. Filtering Logic

All filtering is **client-side** and uses `useMemo`. No new API calls, no
re-fetches when the status filter changes (`statusFilter` is deliberately
omitted from the existing fetch `useEffect` dependency array).

### State added

```ts
type QuestionStatusFilter = 'all' | 'selected' | 'unselected'
const PAGE_SIZE = 10
const [statusFilter, setStatusFilter] = useState<QuestionStatusFilter>('all')
```

No duplicated selection state — the existing `selectedQuestions` prop array is
reused as the single source of truth.

### Memo pipeline

```ts
// 1. O(1) membership lookup, recomputed only when selection changes.
const selectedIdSet = useMemo(
  () => new Set(selectedQuestions.map(q => q.id)),
  [selectedQuestions]
)

// 2. Full filtered set (pre-pagination).
//    - 'all'        → server-paginated `questions` (unchanged)
//    - 'selected'   → entire `selectedQuestions` array, cross-page
//    - 'unselected' → loaded `questions` minus selected ids
const displayQuestions = useMemo<Question[]>(() => {
  if (statusFilter === 'selected')   return selectedQuestions
  if (statusFilter === 'unselected') return questions.filter(q => !selectedIdSet.has(q.id))
  return questions
}, [statusFilter, selectedQuestions, questions, selectedIdSet])

// 3. Authoritative total. In 'all' mode the server knows about questions
//    beyond the loaded page; in the other two modes the set is fully
//    client-side, so its length is the total.
const effectiveTotal = statusFilter === 'all' ? totalCount : displayQuestions.length

// 4. Pagination slice. In 'all' mode the server already returns the page,
//    so render it as-is; otherwise slice client-side at PAGE_SIZE.
const pagedQuestions = useMemo(() => {
  if (statusFilter === 'all') return questions
  const from = (page - 1) * PAGE_SIZE
  return displayQuestions.slice(from, from + PAGE_SIZE)
}, [statusFilter, questions, displayQuestions, page])
```

### How the filters combine

The five existing filters (Search, Subject, Topic, Difficulty, Common/Specific)
are **server-side** — they shape the `questions` array returned by
`fetchQuestionsForPicker`. The new Status filter is **client-side** and slices
that result further. The composition is therefore:

```
displayQuestions = StatusFilter( ServerFilters( all questions ) )
```

Concrete combinations:

| Scenario | Result |
|----------|--------|
| Subject = "กฎหมาย" + Status = **เลือกแล้ว** | Shows every *selected* question (cross-page) — Subject is informational context in this mode. |
| Subject = "กฎหมาย" + Status = **ยังไม่ได้เลือก** | Shows not-yet-selected questions *from the loaded "กฎหมาย" page* — correct narrowing. |
| Search = "สัญญา" + Status = **ยังไม่ได้เลือก** | Not-yet-selected matches for "สัญญา" on the current page. |
| Difficulty = "Hard" + Status = **ทั้งหมด** | Same as before — server returns Hard questions, paginated. |

Changing the Status filter resets `page` to 1 (consistent with how every other
filter already behaves).

### Behavioural notes (intentional, spec-aligned)

- In **เลือกแล้ว**, clicking a card removes it from the selection → it
  disappears from the list immediately (toggle semantics).
- In **ยังไม่ได้เลือก**, clicking a card adds it → it disappears from the
  list immediately (it is now selected).
- The **Select All (Current Page)** button keeps working off the loaded
  `questions` page — its visibility guard (`questions.length > 0`) is
  unchanged.

---

## 4. Performance

- **No new API calls.** `statusFilter` is excluded from the fetch effect's
  dependency array; switching it never triggers `fetchQuestionsForPicker`.
- **No duplicated state.** The selection source of truth remains the parent's
  `selectedQuestions` prop. The only new state is the `statusFilter` enum.
- **`useMemo` everywhere.** `selectedIdSet`, `displayQuestions`, and
  `pagedQuestions` are all memoised; recomputation happens only when their
  specific dependencies change.
- **O(1) membership check.** `isSelected` on each card now uses
  `selectedIdSet.has(q.id)` instead of `selectedQuestions.some(...)` —
  per-card lookup drops from O(n) to O(1). On a 10-card page with 32 selected
  this is negligible, but it scales better as selection grows.
- **Constant page size.** Client-side pagination reuses the same `PAGE_SIZE`
  (10) as the server, so the rendered grid never changes density.
- **No new dependencies** added to `package.json`.

### Homepage / Package ISR, proxy, caches — all untouched

Build output confirms:

```
┌ ○ /                Revalidate 5m
├ ○ /packages        Revalidate 5m
ƒ Proxy (Middleware)
```

---

## 5. Regression Analysis

| Area | Risk | Reasoning |
|------|------|-----------|
| `handleAdd` / `handleRemove` | None | Functions unchanged. Cards still call them via the same `onClick`. |
| `handleSelectAll` (Select All Current Page) | None | Still iterates the loaded `questions`; guard `questions.length > 0` unchanged. |
| Question card markup | None | Card JSX, classes, click handler identical; only the iteration source changed from `questions` to `pagedQuestions`. |
| Selection persistence across pages | None | Selection lives in parent state; server page changes don't drop it. |
| Save Exam Set | None | `onChange` still lifts the same `Question[]` to `ExamSetForm`; `question_ids` mapping in submit is unchanged. |
| Server-side fetch effect | None | Same deps, same call; only the literal `10` was replaced with the `PAGE_SIZE` const (value identical). |
| Default ("ทั้งหมด") path | None | When `statusFilter === 'all'`, `displayQuestions` returns `questions`, `effectiveTotal` returns `totalCount`, `pagedQuestions` returns `questions` — byte-for-byte the pre-change render path. |
| Create vs Edit | None | Both render `QuestionPicker` via `ExamSetForm`; both inherit the feature. Edit pre-fills `selectedQuestionsData`, which feeds the same prop. |
| Empty states | Improved | `pagedQuestions.length === 0` now drives the "No questions found" message, so it correctly fires in filtered-empty cases (e.g. เลือกแล้ว with nothing selected). |
| Pagination footer | None | Recomputed from `effectiveTotal`/`PAGE_SIZE`; numerically identical in 'all' mode. |

### Default-mode parity (before vs. after, `statusFilter === 'all'`)

| Expression | Before | After |
|------------|--------|-------|
| Rendered set | `questions` | `pagedQuestions` ≡ `questions` |
| `isSelected` | `selectedQuestions.some(sq => sq.id === q.id)` | `selectedIdSet.has(q.id)` (same result, faster) |
| Total | `totalCount` | `effectiveTotal` ≡ `totalCount` |
| Next disabled | `page * 10 >= totalCount` | `page * PAGE_SIZE >= effectiveTotal` ≡ same |

---

## 6. Browser QA

Manual checklist. Run on both **Desktop** and **Mobile** viewports.

### Per-filter verification

- [ ] **ทั้งหมด** — full list renders; pagination works (Prev/Next); counter
      shows current selection count.
- [ ] **เลือกแล้ว** — only selected questions appear; if > 10, pagination
      activates; e.g. 32 selected → "Showing 1 to 10 of 32", 4 pages.
- [ ] **ยังไม่ได้เลือก** — only unselected questions on the loaded set appear.

### Selected counter

- [ ] Counter reads `เลือกแล้ว 0 ข้อ` when nothing is selected.
- [ ] Counter increments the instant a card is clicked to add.
- [ ] Counter decrements the instant a card is clicked to remove.
- [ ] Counter survives a server-side filter change (Search/Subject/etc.) since
      selection is independent.

### Filter combinations

- [ ] **Search + เลือกแล้ว** — switching to เลือกแล้ว keeps selection visible
      regardless of search text.
- [ ] **Subject + ยังไม่ได้เลือก** — narrows to unselected on that subject's
      loaded page.
- [ ] **Difficulty + ทั้งหมด** — unchanged behaviour.
- [ ] **Status change resets page** — switching any Status option returns to
      page 1.

### Toggle while filtered

- [ ] **เลือกแล้ว → click a card** — it removes from selection and disappears
      from this view (counter decrements).
- [ ] **ยังไม่ได้เลือก → click a card** — it adds to selection and disappears
      from this view (counter increments).

### Pagination under filter

- [ ] **เลือกแล้ว, 25 selected** — pages 1–3 (10/10/5); Next disabled on page 3;
      Prev disabled on page 1.
- [ ] Footer "Showing X to Y of Z" matches in all modes; shows `0 to 0 of 0`
      when the filtered set is empty.

### Bulk / Select All

- [ ] **Select All (Current Page)** still adds the loaded server page's
      questions regardless of Status filter.
- [ ] Counter jumps by the number added.

### Cross-cutting

- [ ] Mobile: filter row wraps cleanly; dropdowns remain tappable.
- [ ] Desktop: filter row fits on one line at typical widths.
- [ ] Modal scroll area still scrolls independently of the page.
- [ ] Save Exam Set persists the exact selected set (no drift).

---

## 7. Build Verification

| Step                | Command            | Result |
|---------------------|--------------------|--------|
| TypeScript          | `npx tsc --noEmit` | ✅ Pass — exit 0, no errors |
| Production build    | `npm run build`    | ✅ Pass — exit 0 |
| Static generation   | 33/33 pages        | ✅ Pass |
| ISR routes preserved| `/`, `/packages`   | ✅ 5m revalidate intact |
| Middleware proxy    | `proxy.ts`         | ✅ Registered as `ƒ Proxy (Middleware)` |

```
Route (app)                                Revalidate  Expire
┌ ○ /                                              5m      1y
…
├ ○ /packages                                      5m      1y
…
ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

---

## Summary

Added a pure client-side **Question Status** filter (ทั้งหมด / เลือกแล้ว /
ยังไม่ได้เลือก) and a live **เลือกแล้ว X ข้อ** counter to the Question Bank
Picker. The feature is contained entirely in `components/admin/QuestionPicker.tsx`,
adds no API calls, duplicates no state, and uses `useMemo` throughout. The
default `ทั้งหมด` path is byte-for-byte equivalent to the prior behaviour, and
selection / bulk-select / save flows are untouched. TypeScript and production
build both pass.
