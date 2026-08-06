// Multi-selection helpers for the Admin Exam Sets list (Phase 2).
//
// Pure module — no React, no "use client", no browser APIs, no Supabase client.
// Safe to import from the Client Component and directly from the unit test.
//
// Selection key: the Exam Set `id` (UUID string). Only ids are stored — never
// full Exam Set objects.
//
// Invariants enforced by every function here (see spec §"Keep the selection
// invariant strict"):
//   1. A selected id may only remain if it is present on the current page.
//      Helpers that operate per-page therefore subtract anything off-page.
//   2. An empty page is never "all selected" and never indeterminate.
//   3. Duplicate ids are irrelevant — storage is a Set, which de-duplicates.
//   4. React state is never mutated: every mutator returns a NEW Set.

/**
 * Toggle a single id. Returns a NEW Set; the input is never mutated.
 *
 * @example
 *   toggleExamSetSelection(new Set(['a']), 'b') // Set { 'a', 'b' }
 *   toggleExamSetSelection(new Set(['a']), 'a') // Set {}
 */
export function toggleExamSetSelection(
  current: Set<string>,
  id: string
): Set<string> {
  const next = new Set(current)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Set or clear the selection for the CURRENT PAGE only.
 *
 * - `selected = true`  → every page id is selected (off-page ids are dropped,
 *   so no stale id can survive a page change).
 * - `selected = false` → every page id is deselected (off-page ids are also
 *   dropped, keeping the invariant that nothing remains off-page).
 *
 * This helper does NOT assume off-page ids can never exist — it actively
 * removes them, so it is safe to use for the header checkbox in BOTH
 * directions regardless of what the Set currently holds.
 *
 * @example
 *   setExamSetPageSelection(new Set(['a','z']), ['a','b'], true)  // Set { 'a','b' }
 *   setExamSetPageSelection(new Set(['a','b']), ['a','b'], false) // Set {}
 */
export function setExamSetPageSelection(
  current: Set<string>,
  pageIds: string[],
  selected: boolean
): Set<string> {
  // Always scope the result to exactly the current page. This enforces the
  // invariant: after any header action, no off-page id remains.
  if (!selected) return new Set()
  const next = new Set<string>()
  for (const id of pageIds) next.add(id)
  // `current` is intentionally not unioned in — preserving off-page ids would
  // violate the invariant for this page-scoped UI. (return next)
  return next
}

/**
 * Selection summary for the current page. Drives the header checkbox tri-state
 * and the "Selected N" count shown in the UI.
 *
 * - `selectedCount`: how many CURRENT-PAGE ids are selected (NOT
 *   `current.size`, which could include ids that are no longer visible). This
 *   is the number shown to the user and the basis for the tri-state.
 * - `allSelected`: true only when the page is non-empty AND every page id is
 *   selected. An empty page is never "all selected".
 * - `someSelected`: true when at least one page id is selected but not all
 *   (drives the indeterminate state). Empty page → false.
 *
 * @example
 *   getExamSetPageSelectionState(new Set(), [])           // {0, false, false}
 *   getExamSetPageSelectionState(new Set(['a']), ['a','b']) // {1, false, true}
 *   getExamSetPageSelectionState(new Set(['a','b']), ['a','b']) // {2, true, false}
 *   // off-page id 'z' is ignored for the count/state:
 *   getExamSetPageSelectionState(new Set(['a','z']), ['a']) // {1, true, false}
 */
export function getExamSetPageSelectionState(
  current: Set<string>,
  pageIds: string[]
): {
  selectedCount: number
  allSelected: boolean
  someSelected: boolean
} {
  // De-duplicate defensively. In practice pageIds has unique ids (DB PKs), but
  // the helper must stay correct if a caller ever passes duplicates — duplicate
  // ids must not inflate the count.
  const uniquePageIds = new Set(pageIds)
  let selectedCount = 0
  for (const id of uniquePageIds) {
    if (current.has(id)) selectedCount += 1
  }
  const pageLength = uniquePageIds.size
  const allSelected = pageLength > 0 && selectedCount === pageLength
  const someSelected = selectedCount > 0 && !allSelected
  return { selectedCount, allSelected, someSelected }
}
