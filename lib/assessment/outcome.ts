/**
 * lib/assessment/outcome.ts
 * ----------------------------------------------------------------------------
 * Assessment Outcome — computation boundary.
 *
 * Source of truth: "Assessment Platform Master Specification v1.0"
 *   - Part IV §25: Outcome is the official result of an Attempt; Source of
 *     Truth for every system after Runtime.
 *   - Constitution AI-004: One Attempt → One Outcome.
 *   - Constitution AI-005: Outcome is immutable.
 *   - Constitution AI-003: Runtime executes; it does not analyze. The Runtime
 *     DELEGATES verdict/diagnostic computation to this boundary — it does not
 *     inline it. (Per approved Q1 decision: outcome computation belongs to the
 *     Outcome boundary and is allowed; Analytics begins only after Outcome.)
 *
 * What this module is:
 *   - Pure functions. No React, no DB, no side effects, no I/O.
 *   - The single, named place where an Attempt becomes an Outcome.
 *   - The home for verdict logic (pass/fail from exam_sets.passing_score — per
 *     approved Q2 decision: use passing_score, remove hard-coded thresholds).
 *
 * What this module is NOT:
 *   - NOT Analytics. Analytics (Part IV §27) reasons across many Outcomes;
 *     this module produces ONE Outcome. Single-attempt weak-topic identification
 *     is part of the Outcome itself, not cross-attempt analysis.
 *   - NOT persistence. Epic 1 produces the Outcome in-memory; Epic 2 persists.
 *
 * Epic 1 scope: in-memory Outcome computation. This is the trigger surface that
 * Epic 2 will route to persistence without changing the contract.
 */

import type {
  AnsweredQuestion,
  AssessmentMode,
  AssessmentOutcome,
  SubjectBreakdownEntry,
  WeakTopic,
} from './types'

// ─── Inputs ─────────────────────────────────────────────────────────────────
// Minimal input shape for computeOutcome. Kept structural so the Runtime can
// pass its own question type without an import cycle. Only the fields needed
// to compute the Outcome are required.

/**
 * The slice of a runtime Question that computeOutcome needs. Structural — any
 * object with these fields works, so the runtime's local Question interface
 * satisfies it without adaptation.
 */
export interface OutcomeQuestion {
  id: string
  correct_answer: string
  subject: string | null
  law: string | null
  topic: string | null
}

export interface ComputeOutcomeInput {
  examSetId: string
  packageId: string
  mode: AssessmentMode
  /**
   * Minimum accuracy % (0-100) required to pass. Comes from
   * exam_sets.passing_score (default 60). Data, not a hard-coded threshold.
   */
  passingScore: number
  /** Seconds consumed by the attempt. */
  timeUsedSeconds: number
  /** The full question list for this assessment, in order. */
  questions: OutcomeQuestion[]
  /** Map of questionId → selected choice. Unanswered questions are absent. */
  answers: Record<string, string>
  /** Map of questionId → flagged. */
  flagged: Record<string, boolean>
  /**
   * Optional attempt id. When omitted, one is generated (client-side uuid-ish)
   * so the Outcome always has an identity for Epic 1 in-memory use. Epic 2 will
   * supply the persisted id.
   */
  attemptId?: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a lightweight client-side attempt id for Epic 1 (in-memory Outcome).
 * Not a security-sensitive id; just needs to be unique within a session. Epic 2
 * replaces this with a persisted DB id. Uses crypto when available, falls back
 * to a timestamp+random tail.
 */
function generateAttemptId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID()
    }
  } catch {
    /* ignore — fall through */
  }
  return `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Build the per-question answer summary: the irreducible core of the Outcome.
 * Each entry is self-describing (carries its own subject/law/topic), so every
 * downstream derivation is computable from this array alone.
 */
function buildAnswerSummary(
  questions: OutcomeQuestion[],
  answers: Record<string, string>,
  flagged: Record<string, boolean>,
): AnsweredQuestion[] {
  return questions.map((q) => {
    const selected = answers[q.id] ?? null
    return {
      questionId: q.id,
      selected,
      correct: q.correct_answer,
      isCorrect: selected != null && selected === q.correct_answer,
      flagged: Boolean(flagged[q.id]),
      subject: q.subject ?? null,
      law: q.law ?? null,
      topic: q.topic ?? null,
    }
  })
}

/**
 * Derive weak topics (top 3) from wrong answers, grouping by topic, subject,
 * and law — exactly the pre-refactor behavior, now operating on the answer
 * summary rather than inline in the component.
 */
function deriveWeakTopics(summary: AnsweredQuestion[]): WeakTopic[] {
  const wrong = summary.filter((a) => !a.isCorrect)
  const counts: Record<string, { count: number; type: string }> = {}
  for (const wq of wrong) {
    if (wq.topic) {
      counts[wq.topic] = {
        count: (counts[wq.topic]?.count ?? 0) + 1,
        type: 'Topic',
      }
    }
    if (wq.subject) {
      counts[wq.subject] = {
        count: (counts[wq.subject]?.count ?? 0) + 1,
        type: 'Subject',
      }
    }
    if (wq.law) {
      counts[wq.law] = {
        count: (counts[wq.law]?.count ?? 0) + 1,
        type: 'Law',
      }
    }
  }
  return Object.entries(counts)
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
}

/**
 * Derive the per-subject aggregate (correct/total) from the answer summary.
 * Falls back to "ทั่วไป" (General) when a question has no subject — preserving
 * the pre-refactor subjectBreakdown shape consumed by the share card.
 */
function deriveSubjectBreakdown(summary: AnsweredQuestion[]): SubjectBreakdownEntry[] {
  const map = new Map<string, { correct: number; total: number }>()
  for (const a of summary) {
    const key = a.subject ?? 'ทั่วไป'
    const entry = map.get(key) ?? { correct: 0, total: 0 }
    entry.total += 1
    if (a.isCorrect) entry.correct += 1
    map.set(key, entry)
  }
  return Array.from(map.entries()).map(([subject, v]) => ({ subject, ...v }))
}

// ─── The Outcome trigger ────────────────────────────────────────────────────

/**
 * Compute the Outcome for one completed Attempt.
 *
 * This is the Runtime → Outcome handoff (Part IV §24: "Outcome Generated").
 * The Runtime calls this exactly once, at submission, with the attempt's
 * final answers/flagging/timing. The returned object is the canonical,
 * immutable record every downstream system reads.
 *
 * Pure & deterministic: the same inputs always yield the same Outcome. No
 * randomness in scoring; the only non-deterministic element is the optional
 * client-generated attemptId (stable once produced).
 *
 * Edge cases handled explicitly:
 *  - total === 0: accuracy 0, passed false (no questions ⇒ no measurement).
 *  - passingScore clamped to [0, 100] defensively.
 *  - Unanswered questions: counted as wrong (isCorrect false), consistent with
 *    prior behavior and real-exam semantics.
 */
export function computeOutcome(input: ComputeOutcomeInput): AssessmentOutcome {
  const {
    examSetId,
    packageId,
    mode,
    timeUsedSeconds,
    questions,
    answers,
    flagged,
    attemptId,
  } = input

  // Defensive clamp on passing score (data may come from untrusted sources).
  const passingScore = Math.max(0, Math.min(100, Math.trunc(input.passingScore)))

  const total = questions.length
  const summary = buildAnswerSummary(questions, answers, flagged)
  const score = summary.filter((a) => a.isCorrect).length
  const answeredCount = summary.filter((a) => a.selected != null).length
  const accuracy = total > 0 ? Math.round((score / total) * 100) : 0
  const passed = total > 0 && accuracy >= passingScore

  return {
    attemptId: attemptId ?? generateAttemptId(),
    examSetId,
    packageId,
    mode,
    total,
    score,
    answeredCount,
    accuracy,
    timeUsedSeconds,
    passingScore,
    passed,
    questions: summary,
    weakTopics: deriveWeakTopics(summary),
    subjectBreakdown: deriveSubjectBreakdown(summary),
    completedAt: new Date().toISOString(),
  }
}
