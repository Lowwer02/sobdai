/**
 * lib/engine/scoring/signals.ts
 * ----------------------------------------------------------------------------
 * Candidate Ranking E-3C.1 — Signal Extraction.
 *
 * Source of truth (FROZEN architecture — do not redesign):
 *   - Candidate Ranking Architecture v1.0 §2.1 (Stage Map), §2.3 (Stage
 *     Contracts), §3 (Signal Extraction), §12 (Boundaries).
 *   - Scoring Model Specification v1.0 §3 (Raw Signals), §6 (Confidence
 *     vocabulary/propagation), §10.1 (Raw Signal contract), §11.2 (Never
 *     Invent Values), §12.2 (content boundary).
 *
 * WHAT THIS MODULE IS.
 *  - Stage 1 only: extracts RawSignal records from CandidateSet metadata.
 *  - Pure, synchronous, deterministic, and CandidateSet-bounded.
 *  - Metadata-only: no Bank, no content, no LLM, no scoring.
 *
 * WHAT THIS MODULE IS NOT.
 *  - Does NOT compute Components, normalized values, Composites, Confidence,
 *    Penalties, ordering, tie resolution, selection, or allocation.
 *  - Does NOT repair missing metadata or infer values from fallbacks.
 *  - Does NOT mutate the CandidateSet.
 */

import type { Candidate, CandidateSet } from '../generator/contracts'
import type {
  RawSignal,
  RawSignalSource,
  SignalExtractionConfidence,
} from './contracts'

// ═══════════════════════════════════════════════════════════════════════════
// 1. Stage-1 output contracts
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Deterministic source order for the closed RawSignalSource inventory.
 *
 * Mirrors Scoring contracts §2 and Scoring Model §4.1 Component inputs. This is
 * an extraction/audit order only, not a scoring priority.
 */
export const RAW_SIGNAL_SOURCE_ORDER: readonly RawSignalSource[] = [
  'difficulty',
  'pattern',
  'learning_objective',
  'document',
  'topic',
  'tier',
  'blueprint_type',
  'usage_count',
  'last_used_at',
  'generator_confidence',
] as const

/**
 * Per-Candidate completeness picture produced by Signal Extraction.
 *
 * Candidate Ranking §3.5 requires a summary of which required signals are
 * Known and which are not. The keys reuse the frozen Scoring integrity
 * vocabulary exactly.
 */
export interface SignalCompletenessSummary {
  readonly questionCode: string
  readonly byIntegrity: Readonly<Record<SignalExtractionConfidence, readonly RawSignalSource[]>>
  readonly overallIntegrity: SignalExtractionConfidence
}

/**
 * All Raw Signals extracted for one Candidate.
 */
export interface ExtractedCandidateSignals {
  readonly questionCode: string
  readonly signals: readonly RawSignal[]
  readonly completeness: SignalCompletenessSummary
}

/**
 * Run-level Stage-1 summary. Pure counts and source buckets only; no scoring.
 */
export interface SignalExtractionSummary {
  readonly totalCandidates: number
  readonly totalSignals: number
  readonly questionCodes: readonly string[]
  readonly byIntegrity: Readonly<Record<SignalExtractionConfidence, readonly RawSignalSource[]>>
}

/**
 * Signal Extraction output: Raw Signals per Candidate plus completeness
 * summaries. This is the complete Stage-1 artifact consumed by later scoring
 * stages.
 */
export interface SignalExtractionOutput {
  readonly candidates: readonly ExtractedCandidateSignals[]
  readonly summary: SignalExtractionSummary
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Public API — Signal Extraction
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract Raw Signals from a CandidateSet.
 *
 * Determinism notes:
 *  - Candidate output is canonicalized by Question Code so CandidateSet array
 *    encounter order cannot leak into Stage-1 output.
 *  - Signal output follows RAW_SIGNAL_SOURCE_ORDER for every Candidate.
 *  - Missing CandidateSet fields are represented as `integrity: 'missing'`;
 *    values are never invented.
 *
 * @spec Candidate Ranking Architecture v1.0 §3; Scoring Model Specification
 *       v1.0 §10.1.
 */
export function extractSignals(candidateSet: CandidateSet): SignalExtractionOutput {
  assertWellFormedCandidateSet(candidateSet)

  const candidates = [...candidateSet.candidates].sort(compareCandidatesByQuestionCode)
  const extracted = candidates.map(extractCandidateSignals)

  return {
    candidates: extracted,
    summary: summarizeExtraction(extracted),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Candidate extraction
// ═══════════════════════════════════════════════════════════════════════════

function extractCandidateSignals(candidate: Candidate): ExtractedCandidateSignals {
  const questionCode = candidate.identity.questionCode
  const signals: RawSignal[] = [
    presentSignal(questionCode, 'difficulty', candidate.metadata.difficulty),
    nullableSignal(questionCode, 'pattern', candidate.metadata.questionPattern, {
      fieldName: 'metadata.questionPattern',
      completeness: candidate.completeness.questionPattern,
      missingNote: 'metadata.questionPattern missing (IG-2 gap)',
    }),
    nullableSignal(questionCode, 'learning_objective', candidate.metadata.learningObjective, {
      fieldName: 'metadata.learningObjective',
      completeness: candidate.completeness.learningObjective,
      missingNote: 'metadata.learningObjective missing (IG-2 gap)',
    }),
    presentSignal(questionCode, 'document', candidate.metadata.document),
    nullableSignal(questionCode, 'topic', candidate.metadata.topic, {
      fieldName: 'metadata.topic',
      missingNote: 'metadata.topic missing from CandidateSet metadata',
    }),
    presentSignal(questionCode, 'tier', candidate.metadata.tier),
    nullableSignal(questionCode, 'blueprint_type', candidate.metadata.blueprintType, {
      fieldName: 'metadata.blueprintType',
      completeness: candidate.completeness.blueprintType,
      missingNote: 'metadata.blueprintType missing (IG-2 gap)',
    }),
    missingSignal(
      questionCode,
      'usage_count',
      'usage_count is not carried by the current CandidateSet contract'
    ),
    missingSignal(
      questionCode,
      'last_used_at',
      'last_used_at is not carried by the current CandidateSet contract'
    ),
    generatorConfidenceSignal(questionCode, candidate),
  ]

  return {
    questionCode,
    signals,
    completeness: summarizeCandidateSignals(questionCode, signals),
  }
}

function presentSignal(questionCode: string, source: RawSignalSource, value: unknown): RawSignal {
  if (isAbsent(value)) {
    return missingSignal(questionCode, source, `${source} missing from CandidateSet metadata`)
  }
  return {
    questionCode,
    source,
    value,
    integrity: 'known',
    extractionNote: null,
  }
}

function nullableSignal(
  questionCode: string,
  source: RawSignalSource,
  value: unknown,
  opts: {
    readonly fieldName: string
    readonly completeness?: 'complete' | 'incomplete'
    readonly missingNote: string
  }
): RawSignal {
  if (isAbsent(value)) {
    return missingSignal(questionCode, source, opts.missingNote)
  }
  if (opts.completeness === 'incomplete') {
    return {
      questionCode,
      source,
      value,
      integrity: 'incomplete',
      extractionNote: `${opts.fieldName} present, but Candidate completeness marks the axis incomplete`,
    }
  }
  return {
    questionCode,
    source,
    value,
    integrity: 'known',
    extractionNote: null,
  }
}

function missingSignal(questionCode: string, source: RawSignalSource, note: string): RawSignal {
  return {
    questionCode,
    source,
    value: null,
    integrity: 'missing',
    extractionNote: note,
  }
}

function generatorConfidenceSignal(questionCode: string, candidate: Candidate): RawSignal {
  const confidence = candidate.confidence
  if (confidence.level === 'full') {
    return {
      questionCode,
      source: 'generator_confidence',
      value: confidence,
      integrity: 'known',
      extractionNote: null,
    }
  }
  return {
    questionCode,
    source: 'generator_confidence',
    value: confidence,
    integrity: 'incomplete',
    extractionNote: confidence.reason ?? 'Generator confidence reduced',
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Summaries
// ═══════════════════════════════════════════════════════════════════════════

function summarizeCandidateSignals(
  questionCode: string,
  signals: readonly RawSignal[]
): SignalCompletenessSummary {
  const byIntegrity = emptyIntegrityBuckets()
  for (const signal of signals) {
    byIntegrity[signal.integrity].push(signal.source)
  }
  return {
    questionCode,
    byIntegrity,
    overallIntegrity: overallIntegrity(byIntegrity),
  }
}

function summarizeExtraction(
  candidates: readonly ExtractedCandidateSignals[]
): SignalExtractionSummary {
  const byIntegrity = emptyIntegrityBuckets()
  let totalSignals = 0
  for (const candidate of candidates) {
    totalSignals += candidate.signals.length
    for (const signal of candidate.signals) {
      byIntegrity[signal.integrity].push(signal.source)
    }
  }

  return {
    totalCandidates: candidates.length,
    totalSignals,
    questionCodes: candidates.map((candidate) => candidate.questionCode),
    byIntegrity,
  }
}

function emptyIntegrityBuckets(): Record<SignalExtractionConfidence, RawSignalSource[]> {
  return {
    known: [],
    incomplete: [],
    missing: [],
    conflicting: [],
  }
}

function overallIntegrity(
  byIntegrity: Readonly<Record<SignalExtractionConfidence, readonly RawSignalSource[]>>
): SignalExtractionConfidence {
  if (byIntegrity.conflicting.length > 0) return 'conflicting'
  if (byIntegrity.missing.length > 0) return 'missing'
  if (byIntegrity.incomplete.length > 0) return 'incomplete'
  return 'known'
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Malformed CandidateSet guard
// ═══════════════════════════════════════════════════════════════════════════

function assertWellFormedCandidateSet(candidateSet: CandidateSet): void {
  const value = candidateSet as unknown
  if (!isRecord(value) || !Array.isArray(value['candidates'])) {
    throw new Error('Fatal Signal Extraction error: malformed CandidateSet (missing candidates array)')
  }

  const seenCodes = new Set<string>()
  for (const candidate of candidateSet.candidates) {
    if (!isRecord(candidate)) {
      throw new Error('Fatal Signal Extraction error: malformed CandidateSet candidate')
    }
    if (!isRecord(candidate.identity) || !isNonEmptyString(candidate.identity.questionCode)) {
      throw new Error('Fatal Signal Extraction error: candidate missing identity.questionCode')
    }
    if (seenCodes.has(candidate.identity.questionCode)) {
      throw new Error(
        `Fatal Signal Extraction error: duplicate Candidate questionCode ${candidate.identity.questionCode}`
      )
    }
    seenCodes.add(candidate.identity.questionCode)
    if (
      !isRecord(candidate.metadata) ||
      !isRecord(candidate.completeness) ||
      !isRecord(candidate.confidence) ||
      !isRecord(candidate.provenance)
    ) {
      throw new Error(
        `Fatal Signal Extraction error: malformed Candidate facets for ${candidate.identity.questionCode}`
      )
    }
  }
}

function compareCandidatesByQuestionCode(a: Candidate, b: Candidate): number {
  const left = a.identity.questionCode
  const right = b.identity.questionCode
  return left < right ? -1 : left > right ? 1 : 0
}

function isAbsent(value: unknown): boolean {
  return value === null || value === undefined || value === ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
