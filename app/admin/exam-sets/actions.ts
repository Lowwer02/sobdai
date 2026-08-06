'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'

import {
  normalizeBulkIds,
  isBulkExamSetTarget,
  classifyTransitionEligibility,
  concurrentUpdateSourceStatuses,
  reconcileConcurrentChange,
  BULK_REASON,
} from './bulk-status'
import type { ExamSetStatus } from './status-filter'

export async function deleteExamSetAction(id: string) {
  try {
    const { supabase } = await requirePermission('content.delete')
    
    const { error, data } = await supabase
      .from('exam_sets')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Delete failed. You may not have permission.')

    revalidatePath('/admin/exam-sets')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

type CreateExamSetInput = {
  package_id: string
  name: string
  description?: string
  duration_minutes: number
  is_sample: boolean
  sort_order: number
  display_order: number
  question_ids: string[]
  exam_type?: 'document' | 'simulation'
  // subject/document are NOT free-form: they must be chosen from Question Bank
  // metadata (get_question_metadata()). Validated by assertMetadataValues().
  // Pass undefined/null to leave them unset.
  subject?: string | null
  document?: string | null
}

export async function createExamSetAction(data: CreateExamSetInput) {
  let createdExamSetId: string | null = null

  try {
    const { supabase } = await requirePermission('content.write')
    const inputError = validateCreateExamSetInput(data)
    if (inputError) {
      return { success: false, error: inputError }
    }

    await assertMetadataValues(supabase, {
      subject: data.subject ?? null,
      document: data.document ?? null,
    })

    // 1. Insert Exam Set
    const { data: examSet, error: insertError } = await supabase
      .from('exam_sets')
      .insert({
        package_id: data.package_id,
        name: data.name,
        description: data.description,
        duration_minutes: data.duration_minutes,
        is_sample: data.is_sample,
        sort_order: data.sort_order,
        display_order: data.display_order,
        exam_type: data.exam_type ?? 'document',
        subject: data.subject ?? null,
        document: data.document ?? null,
        status: 'draft'
      })
      .select()
      .single()

    if (insertError) throw insertError
    createdExamSetId = examSet.id

    // 2. Insert Questions if any
    if (data.question_ids && data.question_ids.length > 0) {
      const junctionData = data.question_ids.map((qId, index) => ({
        exam_set_id: examSet.id,
        question_id: qId,
        sort_order: index
      }))

      const { error: junctionError, data: junctionResult } = await supabase
        .from('exam_set_questions')
        .insert(junctionData)
        .select('exam_set_id')

      if (junctionError) throw junctionError
      if (!junctionResult || junctionResult.length !== junctionData.length) {
        throw new Error('Some questions could not be linked. You may not have permission.')
      }
    }

    revalidatePath('/admin/exam-sets')
    revalidatePath('/admin/packages')
    return { success: true, id: examSet.id }
  } catch (err: unknown) {
    const error =
      err instanceof Error && err.message.trim().length > 0
        ? err.message
        : 'Exam Set creation failed.'

    // The Exam Set insert and question-junction insert are separate writes in
    // the existing architecture. Report an inserted draft explicitly when the
    // second write fails so callers can lock retries and surface recovery.
    return createdExamSetId
      ? {
          success: false,
          error,
          id: createdExamSetId,
          partial: true as const,
        }
      : { success: false, error }
  }
}

function validateCreateExamSetInput(
  data: CreateExamSetInput
): string | null {
  const value: unknown = data
  if (typeof value !== 'object' || value === null) {
    return 'Exam Set settings are required.'
  }
  if (
    typeof data.package_id !== 'string' ||
    data.package_id.trim().length === 0
  ) {
    return 'Package is required.'
  }
  if (
    typeof data.name !== 'string' ||
    data.name.trim().length === 0
  ) {
    return 'Exam Set name is required.'
  }
  if (data.name.trim().length > 200) {
    return 'Exam Set names cannot exceed 200 characters.'
  }
  if (
    data.description !== undefined &&
    (typeof data.description !== 'string' ||
      data.description.length > 2_000)
  ) {
    return 'Exam Set descriptions cannot exceed 2,000 characters.'
  }
  if (
    !Number.isInteger(data.duration_minutes) ||
    data.duration_minutes < 1
  ) {
    return 'Duration must be a positive whole number of minutes.'
  }
  if (
    typeof data.is_sample !== 'boolean' ||
    !Number.isInteger(data.sort_order) ||
    !Number.isInteger(data.display_order)
  ) {
    return 'Exam Set availability and ordering values are invalid.'
  }
  if (
    !Array.isArray(data.question_ids) ||
    data.question_ids.length > 1_000 ||
    data.question_ids.some(
      (questionId) =>
        typeof questionId !== 'string' ||
        questionId.trim().length === 0
    )
  ) {
    return 'Exam Set Question identifiers are invalid.'
  }
  if (new Set(data.question_ids).size !== data.question_ids.length) {
    return 'Exam Set Questions must be unique.'
  }
  if (
    data.exam_type !== undefined &&
    data.exam_type !== 'document' &&
    data.exam_type !== 'simulation'
  ) {
    return 'Exam Set type is invalid.'
  }
  if (
    (data.subject !== undefined &&
      data.subject !== null &&
      typeof data.subject !== 'string') ||
    (data.document !== undefined &&
      data.document !== null &&
      typeof data.document !== 'string')
  ) {
    return 'Exam Set metadata is invalid.'
  }

  return null
}

export async function updateExamSetAction(id: string, data: {
  package_id: string
  name: string
  description?: string
  duration_minutes: number
  is_sample: boolean
  sort_order: number
  display_order: number
  question_ids: string[]
  exam_type?: 'document' | 'simulation'
  // subject/document: chosen from Question Bank metadata only (validated below).
  subject?: string | null
  document?: string | null
}) {
  try {
    const { supabase } = await requirePermission('content.write')

    // Validate subject/document ONLY when the caller explicitly provides them.
    // Omission (undefined) now means "leave unchanged" (see patch object below),
    // so we must not treat omission as a null-set and try to validate null.
    await assertMetadataValues(supabase, {
      subject: data.subject === undefined ? null : data.subject,
      document: data.document === undefined ? null : data.document,
    })

    // Patch object: only the always-managed fields are sent unconditionally.
    // exam_type / subject / document are included ONLY when explicitly
    // provided, so an edit save that omits them preserves the existing values
    // instead of overwriting them with defaults. Fixes QA Bug #1.
    const patch: Record<string, unknown> = {
      package_id: data.package_id,
      name: data.name,
      description: data.description,
      duration_minutes: data.duration_minutes,
      is_sample: data.is_sample,
      sort_order: data.sort_order,
      display_order: data.display_order,
    }
    if (data.exam_type !== undefined) patch.exam_type = data.exam_type
    if (data.subject !== undefined) patch.subject = data.subject
    if (data.document !== undefined) patch.document = data.document

    // 1. Update Exam Set
    const { error: updateError, data: updateData } = await supabase
      .from('exam_sets')
      .update(patch)
      .eq('id', id)
      .select('id')

    if (updateError) throw updateError
    if (!updateData || updateData.length === 0) throw new Error('Update failed. You may not have permission.')

    // 2. Delete existing questions mapping
    const { error: deleteError } = await supabase
      .from('exam_set_questions')
      .delete()
      .eq('exam_set_id', id)
      
    if (deleteError) throw deleteError

    // 3. Insert new questions mapping
    if (data.question_ids && data.question_ids.length > 0) {
      const junctionData = data.question_ids.map((qId, index) => ({
        exam_set_id: id,
        question_id: qId,
        sort_order: index
      }))

      const { error: junctionError, data: junctionResult } = await supabase
        .from('exam_set_questions')
        .insert(junctionData)
        .select('exam_set_id')

      if (junctionError) throw junctionError
      if (!junctionResult || junctionResult.length !== junctionData.length) {
        throw new Error('Some questions could not be linked. You may not have permission.')
      }
    }

    revalidatePath('/admin/exam-sets')
    revalidatePath('/admin/packages')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function publishDraftQuestionsInExamSetAction(examSetId: string) {
  try {
    const { supabase } = await requirePermission('content.write')

    // 1. Get all questions in the exam set
    const { data: esq, error: fetchError } = await supabase
      .from('exam_set_questions')
      .select('question_id, questions!inner(id, status)')
      .eq('exam_set_id', examSetId)

    if (fetchError) throw fetchError

    // 2. Filter for Draft questions
    const draftIds = esq
      .map((item: any) => item.questions)
      .filter((q: any) => q && q.status === 'Draft')
      .map((q: any) => q.id)

    if (draftIds.length === 0) return { success: true, count: 0 }

    // 3. Update status to Published
    const { error: updateError, data: updateData } = await supabase
      .from('questions')
      .update({ status: 'Published', updated_at: new Date().toISOString() })
      .in('id', draftIds)
      .select('id')

    if (updateError) throw updateError
    if (!updateData || updateData.length === 0) throw new Error('Update failed. You may not have permission.')

    revalidatePath('/admin/exam-sets')
    revalidatePath('/admin/questions')
    return { success: true, count: updateData.length }

  } catch (err: any) {
    console.error('Action error:', err)
    return { success: false, error: err.message }
  }
}

// ─── Exam Set status lifecycle ──────────────────────────────────────────
// Separate from publishDraftQuestionsInExamSetAction above (which only
// publishes Question rows and is intentionally unchanged). This action governs
// exam_sets.status. Publishing runs the read-only validate_exam_set_for_publish
// RPC (migration 026) first; on failure it returns the RPC's message and does
// NOT change status. draft/archived are direct writes, no validation.

// Publish rules (>=1 question, no duplicate questions, unique sort_order) are
// enforced atomically in Postgres by the validate_exam_set_for_publish RPC,
// which is read-only and never writes. Extracted as a helper so both the
// single-item action below and the bulk action (bulkSetExamSetStatusAction)
// apply the SAME publish validation — bulk must never bypass it.
//
// Returns { valid: true } on success, or { valid: false, message } with a
// user-safe message (straight from the RPC) on failure. Throws only on an RPC
// transport error, matching the single-item behavior.
async function validateExamSetForPublish(
  supabase: Awaited<ReturnType<typeof requirePermission>>['supabase'],
  id: string
): Promise<{ valid: true } | { valid: false; message: string }> {
  const { data: vRows, error: vError } = (await (supabase as any).rpc(
    'validate_exam_set_for_publish',
    { p_exam_set_id: id }
  )) as {
    data: { valid: boolean; error_code: string | null; message: string | null }[] | null
    error: { message: string } | null
  }

  if (vError) throw vError
  const row = vRows && vRows[0]
  if (!row || !row.valid) {
    return { valid: false, message: row?.message ?? 'Exam Set is not ready to publish.' }
  }
  return { valid: true }
}

export async function setExamSetStatusAction(
  id: string,
  status: 'draft' | 'published' | 'archived'
) {
  try {
    // Publishing is a distinct permission from ordinary edits.
    const permission = status === 'published' ? 'content.publish' : 'content.write'
    const { supabase } = await requirePermission(permission)

    // Publish rules are enforced atomically in Postgres by the
    // validate_exam_set_for_publish RPC (migration 026). It is read-only — it
    // never writes. We perform the UPDATE here only after it returns valid,
    // so RLS remains the write authority.
    if (status === 'published') {
      const v = await validateExamSetForPublish(supabase, id)
      if (!v.valid) {
        return { success: false, error: v.message, error_code: null }
      }
    }

    const { error: updateError, data: updateData } = await supabase
      .from('exam_sets')
      .update({ status })
      .eq('id', id)
      .select('id')

    if (updateError) throw updateError
    if (!updateData || updateData.length === 0)
      throw new Error('Update failed. You may not have permission.')

    revalidatePath('/admin/exam-sets')
    return { success: true }
  } catch (err: any) {
    console.error('Action error:', err)
    return { success: false, error: err.message }
  }
}

// ─── Bulk Publish / Bulk Archive (Phase 3A) ─────────────────────────────
//
// One server action handles both targets. Mirrors setExamSetStatusAction:
//   - permission is split by target (publish = content.publish; archive =
//     content.write), exactly like the single action (actions.ts ↑).
//   - publish reuses the SAME validateExamSetForPublish helper, run per
//     eligible draft set, so bulk can never bypass publish validation.
//
// Safety:
//   - ids are runtime-validated + trimmed + deduped by normalizeBulkIds; the
//     count is capped at MAX_BULK_EXAM_SET_IDS (15) to mirror the page-scoped
//     Phase 2 selection — the server never trusts the client count.
//   - records are FETCHED first; ids not returned (missing or RLS-hidden) are
//     reported with a generic reason, never revealing existence.
//   - the final UPDATE re-checks the eligible SOURCE status (concurrent guard);
//     only that single SQL statement is atomic — validation and update are
//     separate operations. Eligible ids not returned by the update are reported
//     as a concurrent change.
//   - no raw SQL/Supabase errors are returned to the client.
//
// Result: a typed partial-success shape. Predictable per-item failures (wrong
// status, publish validation failure, record unavailable, concurrent change)
// are reported inside skipped/failed; the top-level action error is reserved
// for cases where the request cannot be processed at all (malformed input,
// invalid target, unexpected exception).
export async function bulkSetExamSetStatusAction(
  ids: unknown,
  targetStatus: unknown
) {
  try {
    // Runtime guards — types alone are not enough for a Server Action.
    if (!isBulkExamSetTarget(targetStatus)) {
      return {
        success: false,
        error: 'Invalid request: unsupported bulk action.',
      } as const
    }
    const target = targetStatus
    const normalized = normalizeBulkIds(ids)
    if (!normalized.ok) {
      return { success: false, error: normalized.error } as const
    }

    // Permission split, identical to the single action.
    const permission =
      target === 'published' ? 'content.publish' : 'content.write'
    const { supabase } = await requirePermission(permission)

    // Fetch the real records (id + name + current status). Anything not
    // returned is either missing or hidden by RLS → generic reason.
    const { data: rows, error: fetchError } = (await supabase
      .from('exam_sets')
      .select('id, name, status')
      .in('id', normalized.ids)) as {
      data: { id: string; name: string; status: ExamSetStatus }[] | null
      error: { message: string } | null
    }
    if (fetchError) {
      // Initial fetch failure — action-level error. Don't leak the SQL message.
      return {
        success: false,
        error: 'Could not load the selected Exam Sets. Please try again.',
      } as const
    }

    const byId = new Map<string, { id: string; name: string; status: ExamSetStatus }>()
    for (const r of rows ?? []) byId.set(r.id, r)

    const succeeded: { id: string; name: string }[] = []
    const skipped: { id: string; name: string; reason: string }[] = []
    const failed: { id: string; name: string; reason: string }[] = []

    // Phase 1: classify each requested id.
    const eligibleIds: string[] = []
    for (const id of normalized.ids) {
      const record = byId.get(id)
      if (!record) {
        failed.push({ id, name: id, reason: BULK_REASON.UNAVAILABLE })
        continue
      }
      const cls = classifyTransitionEligibility(record.status, target)
      if (!cls.eligible) {
        skipped.push({ id, name: record.name, reason: cls.reason })
        continue
      }
      eligibleIds.push(id)
    }

    // Phase 2 (publish only): run the publish-rule RPC for each eligible draft.
    // Reuses the single-item helper so the rules cannot diverge.
    const validatedIds: string[] = []
    if (target === 'published') {
      for (const id of eligibleIds) {
        const record = byId.get(id)!
        const v = await validateExamSetForPublish(supabase, id)
        if (!v.valid) {
          failed.push({ id, name: record.name, reason: BULK_REASON.NOT_READY_TO_PUBLISH })
        } else {
          validatedIds.push(id)
        }
      }
    } else {
      validatedIds.push(...eligibleIds)
    }

    // Phase 3: single atomic UPDATE that re-checks the eligible SOURCE status.
    // If the list ends up empty, skip the write entirely.
    if (validatedIds.length > 0) {
      const sourceStatuses = concurrentUpdateSourceStatuses(target)
      const { data: updated, error: updateError } = (await supabase
        .from('exam_sets')
        .update({ status: target })
        .in('id', validatedIds)
        .in('status', sourceStatuses)
        .select('id')) as {
        data: { id: string }[] | null
        error: { message: string } | null
      }

      if (updateError) {
        // Final update failed — report the eligible items as failed with a safe
        // reason rather than leaking the Supabase error.
        for (const id of validatedIds) {
          const record = byId.get(id)!
          failed.push({
            id,
            name: record.name,
            reason:
              'The update could not be completed. Please try again.',
          })
        }
      } else {
        const updatedIds = new Set((updated ?? []).map((r) => r.id))
        for (const id of validatedIds) {
          const record = byId.get(id)!
          if (updatedIds.has(id)) {
            succeeded.push({ id, name: record.name })
          } else {
            // Eligible + validated, but the status predicate filtered it out →
            // the row's status changed between fetch and update.
            failed.push({
              id,
              name: record.name,
              reason: reconcileConcurrentChange(),
            })
          }
        }
      }
    }

    revalidatePath('/admin/exam-sets')
    return {
      success: true,
      target,
      succeeded,
      skipped,
      failed,
    } as const
  } catch (err: any) {
    // Unexpected exception — never surface raw details to the client.
    console.error('bulkSetExamSetStatusAction error:', err)
    return {
      success: false,
      error: 'Something went wrong. Please try again.',
    } as const
  }
}

// ─── Subject / Document metadata guard ──────────────────────────────────
//
// exam_sets.subject and exam_sets.document are plain TEXT (no normalized
// lookup tables exist — migration 019 defers them). To keep values consistent
// across Questions and Exam Sets — and to make a future migration to FK
// lookup tables trivial — they must be chosen from the DISTINCT, non-null set
// already present in the Question Bank (exposed by get_question_metadata(),
// migration 022). This helper rejects any supplied value that is not in that
// set, so the field can never be free-form in the Admin UI.
//
// Pass null/undefined for either field to leave it unset (allowed — an Exam
// Set need not be scoped to a subject or document).
async function assertMetadataValues(
  supabase: any,
  values: { subject: string | null; document: string | null }
) {
  const wantsSubject = values.subject != null && values.subject !== ''
  const wantsDocument = values.document != null && values.document !== ''
  if (!wantsSubject && !wantsDocument) return

  // The RPC is a custom Postgres function not covered by auto-generated DB
  // types (this project has none), so we cast through `any` like the other RPC
  // callers — see app/admin/exam-sets/questions.action.ts (fetchUniqueFilters).
  type MetaRow = {
    subjects: string[] | null
    documents: string[] | null
  }
  const { data: metaRows, error: metaError } = (await (supabase as any).rpc(
    'get_question_metadata'
  )) as { data: MetaRow[] | null; error: { message: string } | null }

  if (metaError) {
    throw new Error(`Could not verify subject/document: ${metaError.message}`)
  }
  const meta = (metaRows && metaRows[0]) || { subjects: null, documents: null }

  if (wantsSubject && !(meta.subjects ?? []).includes(values.subject as string)) {
    throw new Error(
      `Subject "${values.subject}" is not a recognized value. ` +
        'Choose one from the Question Bank metadata.'
    )
  }
  if (wantsDocument && !(meta.documents ?? []).includes(values.document as string)) {
    throw new Error(
      `Document "${values.document}" is not a recognized value. ` +
        'Choose one from the Question Bank metadata.'
    )
  }
}
