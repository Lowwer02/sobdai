// Bulk Publish / Bulk Archive helpers for the Admin Exam Sets list (Phase 3A).
//
// Pure module — no React, no "use client", no browser APIs, no Supabase client.
// Safe to import from the Client Component and from the unit test.
//
// Scope: only `published` and `archived` targets are supported by bulk in this
// phase. Bulk Delete, Duplicate, Move Package, Revert/Restore and Select-All
// Across Pages are explicitly out of scope.

import { ExamSetStatus } from './status-filter'

// ─── Target status ──────────────────────────────────────────────────────────
//
// The only statuses a bulk operation may move Exam Sets TO. `draft` is NOT a
// valid bulk target in Phase 3A (Revert/Restore remain single-item only).
export type BulkExamSetTarget = 'published' | 'archived'

export const BULK_EXAM_SET_TARGETS: readonly BulkExamSetTarget[] = [
  'published',
  'archived',
] as const

// ─── Batch limit ────────────────────────────────────────────────────────────
//
// Phase 2 selection is page-scoped (see ./exam-set-selection.ts): selected ids
// can only ever come from the current page. The Exam Sets list page currently
// shows at most 15 records per page (see page.tsx `const limit = 15`), so the
// server enforces the SAME boundary rather than trusting the client. A request
// with more ids than can fit on a page is rejected before any DB work happens.
export const MAX_BULK_EXAM_SET_IDS = 15

// ─── Safe, user-facing failure reasons ──────────────────────────────────────
//
// These strings are surfaced in the Admin UI toast. They are deliberately
// generic so they never leak whether a record exists-but-is-RLS-hidden, never
// quote SQL/Supabase messages, and never include ids.
export const BULK_REASON = {
  UNAVAILABLE:
    'Exam set is unavailable or you do not have permission to update it.',
  CONCURRENT_CHANGE:
    'Status changed before the action completed. Refresh and try again.',
  ALREADY_PUBLISHED: 'Already published.',
  ALREADY_ARCHIVED: 'Already archived.',
  CANNOT_PUBLISH_FROM_ARCHIVED:
    'Cannot publish from archived — restore to draft first.',
  NOT_READY_TO_PUBLISH:
    'Not ready to publish (requires at least one question, no duplicate questions, and unique display order).',
} as const

// ─── Runtime input normalization ────────────────────────────────────────────
//
// A Server Action receives `unknown` over the network; TypeScript types alone
// are not a guarantee. This guard validates shape at runtime and returns a
// discriminated union so the caller MUST handle the error case.
export type NormalizeBulkIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string }

/**
 * Validate + normalize the bulk `ids` argument.
 *
 * Accepts `unknown` and enforces at runtime:
 *   - input is an array
 *   - every accepted id is a non-empty, trimmed string
 *   - whitespace-only ids are dropped
 *   - ids are de-duplicated (case/whitespace-sensitive)
 *   - the normalized list is not empty
 *   - the normalized list does not exceed MAX_BULK_EXAM_SET_IDS
 *
 * Returns `{ ok: false, error }` for any malformed input; the caller returns
 * this as a safe action-level error rather than throwing to the client.
 */
export function normalizeBulkIds(input: unknown): NormalizeBulkIdsResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: 'Invalid request: expected a list of Exam Sets.' }
  }

  const seen = new Set<string>()
  for (const raw of input) {
    if (typeof raw !== 'string') continue
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue
    seen.add(trimmed)
  }

  const ids = Array.from(seen)

  if (ids.length === 0) {
    return { ok: false, error: 'No Exam Sets selected.' }
  }
  if (ids.length > MAX_BULK_EXAM_SET_IDS) {
    return {
      ok: false,
      error: `Cannot update more than ${MAX_BULK_EXAM_SET_IDS} Exam Sets at once.`,
    }
  }
  return { ok: true, ids }
}

/**
 * Runtime guard for the bulk target status. Only `published` and `archived`
 * are accepted; `draft` and arbitrary strings are rejected.
 */
export function isBulkExamSetTarget(value: unknown): value is BulkExamSetTarget {
  return value === 'published' || value === 'archived'
}

// ─── Transition eligibility ─────────────────────────────────────────────────
//
// Phase 3A enforces the SAME allowed transitions as the single-item UI
// (TRANSITIONS in ExamSetsClient.tsx), but on the SERVER — bulk has no per-row
// UI to hide unavailable transitions, so we must reject them explicitly and
// report them as `skipped` (a predictable, non-fatal outcome).
//
// Allowed transitions in this phase:
//   publish: draft → published
//   archive: draft → archived, published → archived
export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string }

export function classifyTransitionEligibility(
  currentStatus: ExamSetStatus,
  target: BulkExamSetTarget
): EligibilityResult {
  switch (target) {
    case 'published':
      if (currentStatus === 'published') {
        return { eligible: false, reason: BULK_REASON.ALREADY_PUBLISHED }
      }
      if (currentStatus === 'archived') {
        return { eligible: false, reason: BULK_REASON.CANNOT_PUBLISH_FROM_ARCHIVED }
      }
      // draft
      return { eligible: true }

    case 'archived':
      if (currentStatus === 'archived') {
        return { eligible: false, reason: BULK_REASON.ALREADY_ARCHIVED }
      }
      // draft or published
      return { eligible: true }
  }
}

/**
 * The current-status predicate the final UPDATE must re-check, per target.
 *
 * Because fetch + (publish) validation happen before the final update, another
 * request could change a record's status in between. The final update therefore
 * filters on the eligible SOURCE status as well as the id, so a concurrently
 * mutated row is not overwritten. Only the final SQL UPDATE statement is
 * atomic; validation and update are separate operations.
 *
 * Returns the list of source statuses the UPDATE must still match.
 */
export function concurrentUpdateSourceStatuses(
  target: BulkExamSetTarget
): ExamSetStatus[] {
  switch (target) {
    case 'published':
      return ['draft']
    case 'archived':
      return ['draft', 'published']
  }
}

/**
 * Given an id that was classified eligible + (for publish) passed validation
 * but was NOT returned by the final re-checking UPDATE, decide its reason.
 * `dbStatusNow` is the row's status at fetch time (the only status we know);
 * since the update predicates on a fresh current status, a missing row means
 * the status changed in between (or RLS no longer grants write) → concurrent.
 */
export function reconcileConcurrentChange(): string {
  return BULK_REASON.CONCURRENT_CHANGE
}

// ─── Result types ───────────────────────────────────────────────────────────
export interface BulkStatusOutcome {
  id: string
  name: string
}
export interface BulkStatusItemResult extends BulkStatusOutcome {
  reason: string
}
export interface BulkStatusSuccess {
  success: true
  target: BulkExamSetTarget
  succeeded: BulkStatusOutcome[]
  skipped: BulkStatusItemResult[]
  failed: BulkStatusItemResult[]
}
export interface BulkStatusFailure {
  success: false
  error: string
}
export type BulkStatusResult = BulkStatusSuccess | BulkStatusFailure

// ─── Client-side feedback formatting ────────────────────────────────────────
//
// Maps a server result into the toasts the Admin sees. Two cases:
//   - full success → a single success toast
//   - partial      → a summary toast + ONE warning toast with reasons grouped
//                    and counted (never one toast per Exam Set)
//
// All copy is safe (no ids, no database messages) and concise.
export interface BulkFeedback {
  /** Primary toast (success for full, summary for partial). */
  primary: { message: string; type: 'success' | 'warning' }
  /** Optional secondary warning toast with grouped reasons. Omitted on full success. */
  reasons?: { message: string; type: 'warning' }
}

// Overall cap for the assembled detail string, AND a per-reason cap so a single
// long reason cannot crowd out the grouping counts or the "more reasons"
// indicator. Both keep the toast concise.
const MAX_REASON_DETAIL_LENGTH = 180
const MAX_REASON_TEXT_LENGTH = 60

/** Human label for a target status, used in toast copy. */
function targetLabel(target: BulkExamSetTarget): string {
  return target === 'published' ? 'เผยแพร่' : 'จัดเก็บ'
}
/** Past-tense noun for the count line, e.g. "เผยแพร่ 8 ชุดข้อสอบ". */
function targetVerbPast(target: BulkExamSetTarget): string {
  return target === 'published' ? 'เผยแพร่' : 'จัดเก็บ'
}

/**
 * Plan the toasts for a bulk result. Pure — given a BulkStatusSuccess it
 * returns exactly what the UI should emit.
 */
export function planBulkFeedback(result: BulkStatusSuccess): BulkFeedback {
  const { target, succeeded, skipped, failed } = result
  const sk = skipped.length
  const fl = failed.length

  // Full success: one success toast.
  if (sk === 0 && fl === 0) {
    return {
      primary: {
        message: `${targetVerbPast(target)} ${succeeded.length} ชุดข้อสอบ`,
        type: 'success',
      },
    }
  }

  // Partial: summary toast + one grouped-reasons warning toast.
  const summary = `${targetVerbPast(target)}สำเร็จ ${succeeded.length} ชุด${
    sk > 0 ? ` · ข้าม ${sk} ชุด` : ''
  }${fl > 0 ? ` · ไม่สำเร็จ ${fl} ชุด` : ''}`

  return {
    primary: { message: summary, type: 'warning' },
    reasons: {
      message: formatAggregatedReasons(skipped, failed),
      type: 'warning',
    },
  }
}

/**
 * Build a single concise warning string aggregating all skipped + failed
 * reasons. Identical reasons are grouped and counted; the list is capped and
 * truncates with an indicator when more unique reasons exist than shown.
 */
export function formatAggregatedReasons(
  skipped: BulkStatusItemResult[],
  failed: BulkStatusItemResult[]
): string {
  const counts = new Map<string, number>()
  for (const item of [...skipped, ...failed]) {
    counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1)
  }

  // Stable order: by descending count, then by first-seen.
  const order = Array.from(counts.keys())
  order.sort((a, b) => {
    const d = (counts.get(b) ?? 0) - (counts.get(a) ?? 0)
    return d !== 0 ? d : 0 // preserve first-seen for ties (stable sort)
  })

  const MAX_UNIQUE_REASONS = 3
  const shown = order.slice(0, MAX_UNIQUE_REASONS)
  const hiddenCount = order.length - shown.length

  // Truncate each reason's text first, so one long reason can't crowd out the
  // counts or the "more reasons" indicator.
  const parts = shown.map((reason) => {
    const text =
      reason.length > MAX_REASON_TEXT_LENGTH
        ? `${reason.slice(0, MAX_REASON_TEXT_LENGTH - 1)}…`
        : reason
    const c = counts.get(reason) ?? 0
    return c > 1 ? `${text} (${c})` : text
  })

  // Build the "more reasons" indicator first so it participates in the overall
  // cap (we always want it visible when there are hidden reasons).
  const more = hiddenCount > 0 ? `และอีก ${hiddenCount} สาเหตุ` : ''
  let message = parts.join(' · ')
  if (more) message = message ? `${message} · ${more}` : more

  if (message.length > MAX_REASON_DETAIL_LENGTH) {
    message = `${message.slice(0, MAX_REASON_DETAIL_LENGTH - 1)}…`
  }
  return message
}
