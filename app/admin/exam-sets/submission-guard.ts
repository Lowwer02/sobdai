// app/admin/exam-sets/submission-guard.ts
// ----------------------------------------------------------------------------
// Pure helpers that back ExamSetForm's submission lifecycle. Extracted so the
// duplicate-Exam-Set guard can be unit-tested without React (this module has
// no React / Supabase / browser dependencies). The form wires these into a
// synchronous ref so a Save double-click can never invoke the Server Action
// twice.
//
// Background (see audit): `useTransition().isPending` flips true on a LATER
// render, not synchronously in the click handler, so `disabled={isPending}`
// does not stop a fast second click. Each createExamSetAction call INSERTs a
// new exam_sets parent row, so re-entry on the Create route produces duplicate
// parents with growing question counts (31/32/36/39).
//
// Design goals, enforced by the state machine:
//   1. First submit is allowed; a concurrent submit while one is in flight is
//      rejected synchronously.
//   2. A FAILED submit releases the lock so the Admin can retry.
//   3. A successful CREATE keeps the form locked until navigation away (so a
//      second Save during the brief window before router.replace resolves can
//      never re-CREATE).
//   4. A successful UPDATE (Edit mode) releases the lock so the Admin can save
//      again later — Edit workflow is unchanged.
//
// Mirrors the style of ./bulk-status.ts and ./exam-set-selection.ts (pure
// helpers + a sibling .test.ts using node:test).

/**
 * The states ExamSetForm submission can occupy.
 *
 *   idle      — no submit in flight; a new submit is allowed
 *   submitting — a submit is in flight; concurrent submits are rejected
 *   created   — a Create just succeeded; the form is locked until navigation
 *               to the Edit route completes. Re-entering would INSERT again,
 *               so this state never transitions back to idle within the same
 *               Create workflow.
 */
export type SubmissionState = 'idle' | 'submitting' | 'created'

/**
 * Whether `attemptSubmit` should proceed given the current state.
 *
 * `created` is terminal for the Create workflow: once a parent row exists and
 * we are navigating to /edit, no further submit from this form instance may
 * run (subsequent saves happen on the Edit route via updateExamSetAction).
 */
export function canSubmit(state: SubmissionState): boolean {
  return state === 'idle'
}

/**
 * Decide the next submission state after a create/save attempt resolves.
 *
 * Create success → 'created' (locked until navigation; the returned id drives
 *   router.replace to /edit).
 * Update success → 'idle' (Edit mode stays re-savable).
 * Any failure    → 'idle'  (release the lock so the Admin can retry).
 *
 * @param isCreate true on the Create route (no existing parent row yet).
 * @param success  whether the Server Action returned success.
 */
export function nextSubmissionState(
  isCreate: boolean,
  success: boolean
): SubmissionState {
  if (success && isCreate) return 'created'
  return 'idle'
}

/**
 * Build the Edit route the Create workflow must navigate to after a successful
 * create, using the id returned by createExamSetAction.
 *
 * Returns null when no id was returned (caller should not navigate). The route
 * shape mirrors the existing dynamic segment app/admin/exam-sets/[id]/edit.
 */
export function editRouteForCreate(examSetId: string | null | undefined): string | null {
  if (!examSetId || examSetId.trim().length === 0) return null
  return `/admin/exam-sets/${examSetId}/edit`
}
