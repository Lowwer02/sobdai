/**
 * lib/assessment/types.ts
 * ----------------------------------------------------------------------------
 * Assessment Runtime — domain types.
 *
 * Source of truth: "Assessment Platform Master Specification v1.0"
 *   - Part I §8 (Terminology): Attempt, Session, Outcome, Runtime
 *   - Part IV §22 (Assessment Attempt): one Attempt → one Outcome, immutable
 *   - Part IV §24 (Assessment Lifecycle): Ready → Started → In Progress →
 *     Submitted → Completed → Outcome Generated
 *   - Constitution AI-004: One Attempt produces One Outcome
 *   - Constitution AI-005: Outcome is immutable
 *   - Constitution AI-003: Runtime executes; it does not analyze/recommend
 *
 * These are pure domain types — no DB coupling, no UI coupling. They name the
 * concepts the Epic 1 runtime operates on. Persistence (Epic 2), Analytics
 * (later), and Recommendation (later) will consume the same shapes.
 *
 * Epic 1 scope (this file): types only. No Outcome persistence exists yet —
 * the Outcome produced here is an in-memory object handed to the Result view,
 * which is functionally what the runtime already did, now behind a named,
 * testable boundary.
 */

// ─── Assessment Type / Profile ──────────────────────────────────────────────
// Per the spec (Part II §10), every Assessment Type is a "Profile" of the one
// Runtime. In Epic 1 the runtime only carries two modes (Practice, Simulation
// as "mock"); future types (Weekly Challenge, Final) extend this enum without
// changing the runtime architecture (Constitution AI-008: Types are Profiles).

/**
 * Assessment execution mode. Drives runtime behavior per the spec:
 *  - 'practice'   → formative: untimed, immediate per-question feedback,
 *                   free navigation (Part II §10.1).
 *  - 'simulation' → summative "mock": timed, sealed feedback until submit
 *                   (Part II §10.2; "Simulation measures readiness, it does
 *                   not teach content").
 *
 * The runtime today is driven by the ?mode= query param ('practice' | 'mock').
 * 'mock' is treated as 'simulation' behaviorally; the union keeps the door
 * open for an explicit 'simulation' value without renaming the public URL.
 */
export type AssessmentMode = 'practice' | 'simulation'

/**
 * Map an arbitrary incoming mode string (URL query param) to a canonical
 * AssessmentMode. Unknown / missing → 'simulation' (the pre-existing default
 * for non-practice). Pure function; no side effects.
 */
export function normalizeMode(raw: string | undefined): AssessmentMode {
  if (raw === 'practice') return 'practice'
  // 'mock' and any other value (including undefined) → summative behavior.
  // This preserves the pre-Epic-1 default exactly.
  return 'simulation'
}

// ─── Attempt Lifecycle ──────────────────────────────────────────────────────
// Per Part IV §24 (Assessment Lifecycle). Epic 1 implements the Runtime-owned
// portion (Ready → In Progress → Completed); the downstream states
// (Outcome Generated → Analytics → Recommendation → History) are owned by
// later systems — the Runtime terminates at Outcome generation.

/**
 * The Attempt lifecycle states owned by the Runtime.
 *
 * Mapping to the existing UI state machine (ExamRuntime's 3-state machine):
 *   - READY        — (implicit) the runtime component is mounted, no attempt
 *                    started. Not a distinct UI status today; modeled here for
 *                    spec fidelity (§24 "Ready → Started").
 *   - IN_PROGRESS  — UI 'IN_PROGRESS' (answering questions).
 *   - SUBMITTED    — UI 'CONFIRM_SUBMIT' (learner requested submit, awaiting
 *                    confirmation). A transitional Runtime state.
 *   - COMPLETED    — UI 'REVIEW' (submitted, Outcome generated, viewing result).
 *
 * `STARTED` from the spec is folded into IN_PROGRESS (the moment of START is
 * when the component mounts and IN_PROGRESS begins); modeling it separately
 * adds a state with no distinct Runtime behavior in Epic 1.
 */
export type AttemptStatus = 'READY' | 'IN_PROGRESS' | 'SUBMITTED' | 'COMPLETED'

// ─── A single answered question — the irreducible unit of the Outcome ───────
// This is the Outcome's "answer summary" entry: one question's result. The
// per-question metadata (subject/law/topic) travels with it so any derived
// analysis (weak topics, subject breakdown) is computable from the Outcome
// alone — without re-fetching the questions.

export interface AnsweredQuestion {
  /** The question id. */
  questionId: string
  /** The choice the learner selected, or null if unanswered. */
  selected: string | null
  /** The correct choice. */
  correct: string
  /** True iff selected === correct (false when unanswered). */
  isCorrect: boolean
  /** Was the question flagged by the learner during the attempt? */
  flagged: boolean
  /** Question metadata carried into the Outcome for downstream derivation. */
  subject: string | null
  law: string | null
  topic: string | null
}

// ─── Weak Topic (derived within the Outcome) ────────────────────────────────
/**
 * A topic/subject/law label under which the learner lost marks. Same shape the
 * existing result screen renders, now produced by the Outcome boundary rather
 * than inline in the runtime component.
 *
 * NOTE: This is Outcome-derived diagnostic data (which questions were missed,
 * grouped by their tags). It is NOT "Analytics" in the spec's sense — Analytics
 * is a cross-attempt reasoning layer (Part IV §27) that consumes many Outcomes.
 * Single-attempt weak-topic identification is part of the Outcome itself, which
 * is why it lives here and not in a (non-existent) Analytics module.
 */
export interface WeakTopic {
  name: string
  count: number
  /** 'Topic' | 'Subject' | 'Law' — which tag dimension this weakness is on. */
  type: string
}

/**
 * Per-subject aggregate. Consumed by the share card (and available to future
 * Result/Analytics consumers). Same shape as the pre-refactor `subjectBreakdown`.
 */
export interface SubjectBreakdownEntry {
  subject: string
  correct: number
  total: number
}

// ─── The Outcome ────────────────────────────────────────────────────────────
// Part IV §25 (Assessment Outcome). "Outcome is the official result of an
// Attempt. Outcome is the Source of Truth for every system after Runtime."
//
// Epic 1 produces this object in-memory at submit; Epic 2 will persist it.
// Constitution AI-005 (immutable): once generated, consumers must not mutate.

/**
 * The Assessment Outcome — the canonical, immutable product of one completed
 * Attempt. Produced once by the Runtime at submission (see `computeOutcome`).
 *
 * Design notes:
 *  - Carries its own provenance (attemptId, examSetId, packageId, mode,
 *    timestamps) so downstream systems (Epic 2+ persistence/analytics) can
 *    reason about it without reaching back into Runtime state.
 *  - `verdict` is derived from `accuracy` vs `passingScore` — NOT a hard-coded
 *    threshold. The passing score is data (exam_sets.passing_score), per the
 *    approved Q2 decision.
 *  - Contains the per-question AnsweredQuestion[] (the "answer summary"),
 *    from which weakTopics and subjectBreakdown are derived — so the Outcome
 *    is self-contained for any future consumer.
 */
export interface AssessmentOutcome {
  /** Stable identity of this attempt (generated client-side for Epic 1; Epic 2 will assign a persisted id). */
  attemptId: string
  examSetId: string
  packageId: string
  /** Canonical execution mode (practice | simulation). */
  mode: AssessmentMode

  // ── Overall performance ──
  /** Total questions in the assessment. */
  total: number
  /** Questions answered correctly. */
  score: number
  /** Questions answered (any choice), i.e. attempts made. */
  answeredCount: number
  /** score / total * 100, rounded. 0 when total is 0. */
  accuracy: number
  /** Seconds the attempt consumed (wall-clock). */
  timeUsedSeconds: number

  // ── Verdict ──
  /** Passing accuracy % from the exam set (data, not hard-coded). */
  passingScore: number
  /** True iff accuracy >= passingScore. False when total === 0. */
  passed: boolean

  // ── Answer summary (the irreducible core) ──
  questions: AnsweredQuestion[]

  // ── Derived diagnostics (single-attempt; computed from the answer summary) ──
  weakTopics: WeakTopic[]
  subjectBreakdown: SubjectBreakdownEntry[]

  // ── Timing ──
  /** ISO timestamp the attempt was submitted (Outcome generation moment). */
  completedAt: string
}

// ─── AttemptHistoryItem — shared domain model (Persistence + Analytics) ──────
// Moved out of app/assessment/actions.ts during the Milestone 1 Refactor #1:
// shared Assessment domain types must live in the Assessment domain, not inside
// a server-action module. Both the Persistence layer (app/assessment/actions.ts)
// and the Analytics layer (lib/assessment/analytics.ts) consume this shape — so
// it is a shared domain model by definition, and is owned here.
//
// It is the row shape of a persisted Outcome as read back from
// exam_attempts — the raw material the Analytics derivation consumes.

/**
 * One persisted Outcome as retrieved from the attempts store. This is the raw
 * input to Analytics derivation (computePersonalAnalytics) and the unit of
 * learning history surfaced to the learner.
 *
 * Field naming intentionally matches the `exam_attempts` table columns, not the
 * in-memory AssessmentOutcome camelCase shape; the persistence action is the
 * boundary that maps between the two. (See app/assessment/actions.ts.)
 */
export interface AttemptHistoryItem {
  id: string
  exam_set_id: string
  package_id: string
  mode: AssessmentMode
  total: number
  score: number
  answered_count: number
  accuracy: number
  time_used_seconds: number
  passing_score: number
  passed: boolean
  /** The per-question answer summary (Outcome Layer 3). */
  answer_summary: AnsweredQuestion[]
  completed_at: string
}
