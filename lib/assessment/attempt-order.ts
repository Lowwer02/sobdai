/**
 * lib/assessment/attempt-order.ts
 * ----------------------------------------------------------------------------
 * Attempt Question Order — deterministic, attempt-scoped question ordering.
 *
 * Repeat Exam Question Shuffle V1. This module changes ONLY the order in which
 * a learner sees the SAME Exam Set questions on a repeat attempt. It never
 * changes Exam Set membership, never samples a subset, never adds/removes
 * questions, never shuffles answer choices, and has nothing to do with the
 * Assessment Assembly Engine (lib/engine/) — it is deliberately separate.
 *
 * ─── The versioned session contract ──────────────────────────────────────────
 *
 * assessment_sessions.question_order_version (migration 101) decides ordering:
 *
 *   0 = BASE ORDER. Present the questions in exam_set_questions.sort_order,
 *       exactly the pre-feature behavior. Every session created before this
 *       feature deployed has version 0 stamped by the column DEFAULT and keeps
 *       base order forever — it is never re-evaluated.
 *   1 = REPEAT SHUFFLE v1. Same question set, deterministic permutation seeded
 *       by the session's own id.
 *
 * The decision is made EXACTLY ONCE, at session creation, by
 * getOrCreateMyAssessmentSession (see nextSessionOrderVersion below). Resume
 * reads the stored version; it never recalculates, so the order of an
 * in-progress attempt can never change mid-flight.
 *
 * ─── FREEZE CONTRACT — read before editing ──────────────────────────────────
 *
 * seededShuffleV1 below is FROZEN. Its output for a given (sessionId, input
 * array) is a persisted behavioral contract: an in-progress version-1 session
 * must see byte-identical order across every refresh/resume. Editing the hash,
 * the PRNG, or the loop would silently reshuffle resumed sessions (answers
 * survive — they key by question id — but the saved positional current_index
 * would land on a different question). If a different algorithm is ever
 * needed, add a NEW version (2) end-to-end: new column value, new function,
 * widened CHECK — never modify v1 in place. The golden tests in
 * attempt-order.test.ts pin v1's exact output; they must never be regenerated
 * to match a changed implementation.
 *
 * ─── Purity ─────────────────────────────────────────────────────────────────
 *
 * Pure functions only: no Math.random, no Date.now, no React, no Supabase, no
 * browser/node APIs, no mutation of input arguments. Deterministic on any
 * machine, in any runtime (server action, RSC, client component, node:test).
 */

// ─── Version constants ──────────────────────────────────────────────────────

/** Legacy/base ordering: exam_set_questions.sort_order, unchanged. */
export const BASE_ORDER_VERSION = 0 as const

/** Repeat shuffle algorithm v1 (this feature). */
export const REPEAT_SHUFFLE_VERSION = 1 as const

/** Closed set of supported values (mirrors the DB CHECK from migration 101). */
export const SUPPORTED_QUESTION_ORDER_VERSIONS = [
  BASE_ORDER_VERSION,
  REPEAT_SHUFFLE_VERSION,
] as const

export type QuestionOrderVersion = (typeof SUPPORTED_QUESTION_ORDER_VERSIONS)[number]

/** Narrow an unknown value (e.g. a freshly-read DB cell) to a supported version. */
export function isSupportedQuestionOrderVersion(raw: unknown): raw is QuestionOrderVersion {
  return raw === BASE_ORDER_VERSION || raw === REPEAT_SHUFFLE_VERSION
}

// ─── Creation-time decision ─────────────────────────────────────────────────

/**
 * Decide the ordering version for a NEW session. Called exactly once, on the
 * INSERT path of getOrCreateMyAssessmentSession — never on resume.
 *
 * Product rule: any previously completed attempt of the same Exam Set (either
 * mode) makes the next session a repeat → version 1. Otherwise → version 0,
 * which preserves today's first-attempt experience exactly.
 *
 * Pure; the caller owns the authoritative existence check (exam_attempts rows
 * are written only by the persistOutcome server action, with user_id resolved
 * from the session — never from the client).
 */
export function nextSessionOrderVersion(
  hasPriorCompletedAttempt: boolean,
): QuestionOrderVersion {
  return hasPriorCompletedAttempt ? REPEAT_SHUFFLE_VERSION : BASE_ORDER_VERSION
}

// ─── Deterministic primitives ───────────────────────────────────────────────

/**
 * cyrb53 — small, well-known string hash (public domain, bryc.code).
 * Produces a 53-bit integer. Stable across machines and runtimes; used ONLY
 * here to derive the shuffle seed from the session id. FROZEN as part of v1.
 */
function cyrb53(str: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507)
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507)
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/**
 * mulberry32 — small deterministic PRNG (public domain, Tommy Ettinger).
 * Takes a 32-bit seed and returns a () => number in [0, 1). FROZEN as part
 * of v1.
 */
function mulberry32(a: number): () => number {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Fold the 53-bit hash into the 32-bit seed mulberry32 expects. NB: the high
 * bits must come from division — `h >>> 32` is a no-op in JS (shift counts are
 * taken mod 32), which would collapse every session to seed 0. FROZEN (v1).
 */
function seedFromSessionId(sessionId: string): number {
  const h = cyrb53(sessionId)
  const lo = h >>> 0
  const hi = Math.floor(h / 4294967296)
  return (lo ^ hi) >>> 0
}

/**
 * FROZEN v1 shuffle: descending Fisher–Yates driven by mulberry32 seeded from
 * the session id. Mutates the array it is GIVEN — every caller therefore owns
 * a fresh copy first (applyAttemptQuestionOrder). DO NOT EDIT (see freeze
 * contract at the top of this file).
 */
function seededShuffleV1<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed)
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const tmp = items[i]
    items[i] = items[j]
    items[j] = tmp
  }
  return items
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface AttemptOrderOptions {
  /** The assessment_session id — the per-attempt seed. */
  sessionId: string
  /** The stored question_order_version of that session. */
  questionOrderVersion: number
}

/**
 * Produce the ordered question list for one attempt.
 *
 *   version 0 (or anything unrecognized) → the input order, unchanged
 *   version 1                            → the frozen deterministic
 *                                          permutation for this session id
 *
 * Never mutates the input; always returns a new array. The caller passes the
 * base list (exam_set_questions.sort_order as fetched by the exam page) and
 * must use the returned array as the SINGLE ordered list the runtime consumes
 * (display, navigation, autosave position, submit).
 */
export function applyAttemptQuestionOrder<T>(
  questions: readonly T[],
  opts: AttemptOrderOptions,
): T[] {
  if (!Array.isArray(questions)) return []
  const copy = [...questions]
  // Unknown/legacy versions (including 0) deliberately fall through to base
  // order — a future version the running code does not know must degrade to
  // the pre-feature behavior rather than crash or guess.
  if (opts?.questionOrderVersion !== REPEAT_SHUFFLE_VERSION) return copy
  const sessionId = typeof opts?.sessionId === 'string' ? opts.sessionId : ''
  return seededShuffleV1(copy, seedFromSessionId(sessionId))
}
