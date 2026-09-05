/**
 * lib/question-import-row.ts
 * ----------------------------------------------------------------------------
 * Document Code Intake V1 — pure ParsedQuestion → questions insert-row mapper.
 *
 * Extracted verbatim from app/admin/import/actions.ts so the persistence
 * mapping is unit-testable without Supabase ('use server' modules may only
 * export async functions, so the helper cannot live there). The import action
 * calls this for every parsed question.
 *
 * Contract:
 *   - q.document_code  → document_code, preserved EXACTLY (never derived from
 *     q.document, never rewritten); empty → NULL (legacy/no-code path).
 *   - question_code stays the importer-allocated immutable business code.
 *   - All other mappings are unchanged from the pre-V1 importer.
 */

import { normalizeSection, normalizeEnumAxis } from './ig2'
import type { ParsedQuestion } from './markdownParser'

export function buildQuestionInsertRow(q: ParsedQuestion, questionCode: string) {
  const sectionNorm = normalizeSection(q.section)
  return {
    question_code: questionCode, // immutable business identifier (allocation-only RPC)
    content: q.content,
    choice_a: q.choice_a,
    choice_b: q.choice_b,
    choice_c: q.choice_c,
    choice_d: q.choice_d,
    correct_answer: q.correct_answer,
    hint: q.hint || null,
    full_explanation: q.full_explanation || null,
    why_a_wrong: q.why_a_wrong || null,
    why_b_wrong: q.why_b_wrong || null,
    why_c_wrong: q.why_c_wrong || null,
    why_d_wrong: q.why_d_wrong || null,
    reference: q.reference || null,
    difficulty: q.difficulty,
    category: q.category || null,
    subject: q.subject || null,
    document: q.document || null,
    // Document Code Intake V1 — stable machine identity of the source
    // document, persisted verbatim; empty → NULL for legacy content. The
    // human-readable display text stays in `document` (above); neither field
    // substitutes for the other.
    document_code: q.document_code || null,
    law: q.law || null,
    topic: q.topic || null,
    tags: q.tags,
    // IG-2 axes — empty/whitespace → NULL. Enum axes trimmed; section
    // normalized to canonical (NFC + en-dash ranges). The DB CHECK
    // constraints (migration 027) are the final enum authority; an
    // invalid enum value here surfaces as a PostgREST insert error,
    // which the existing error path reports to the caller.
    blueprint_type: normalizeEnumAxis(q.blueprint) || null,
    learning_objective: normalizeEnumAxis(q.learning_objective) || null,
    question_pattern: normalizeEnumAxis(q.question_pattern) || null,
    section: sectionNorm || null,
    status: 'Draft' // Initially import as Draft
  }
}
