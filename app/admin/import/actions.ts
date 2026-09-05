'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import type { ParsedQuestion } from '@/lib/markdownParser'
import { isValidDocumentCode } from '@/lib/markdownParser'
import { buildQuestionInsertRow } from '@/lib/question-import-row'

export async function importQuestionsAction(questions: ParsedQuestion[]) {
  try {
    const { supabase } = await requirePermission('content.write')



    if (questions.length === 0) {
      return { success: false, error: 'No valid questions to import' }
    }

    // Allocate immutable question_codes BEFORE building the insert payload.
    //
    // question_code is generated ONLY here (the importer), per the milestone
    // contract — the DB does not default-fill it, so no other insert path can
    // mint a code. allocate_question_codes(n) advances the sequence n times and
    // returns already-formatted codes (e.g. ['Q-000001','Q-000002']); it does
    // not insert or validate anything. The importer is responsible for merging
    // the returned codes into the Question rows below.
    //
    // The RPC is a custom Postgres function not covered by auto-generated DB
    // types (this project has none), so we cast through `any` like the other
    // RPC callers (see app/admin/exam-sets/questions.action.ts —
    // get_question_metadata, get_question_usage_counts).
    const { data: codeRows, error: allocError } = (await (supabase as any).rpc(
      'allocate_question_codes',
      { n: questions.length }
    )) as { data: string[] | null; error: { message: string } | null }

    if (allocError) {
      console.error('allocate_question_codes RPC failed:', allocError.message)
      return { success: false, error: allocError.message }
    }
    const codes = codeRows ?? []
    if (codes.length !== questions.length) {
      // Defensive: should never happen — the allocator returns exactly n codes
      // (empty array only for n <= 0, which we already rejected above).
      return { success: false, error: 'Failed to allocate question codes' }
    }

    // Prepare payload (status defaults to Draft based on DB schema).
    //
    // The ParsedQuestion → insert-row mapping lives in
    // lib/question-import-row.ts (pure, unit-tested). Document Code Intake V1
    // adds q.document_code → questions.document_code, preserved exactly.
    //
    // Defense in depth: the parser already rejects malformed DocumentCodes
    // with a field-level diagnostic, but this action is the storage gate —
    // re-check here so a malformed code can never reach the Bank even if the
    // action is invoked directly.
    const malformed = questions.find(
      (q) => q.document_code !== '' && !isValidDocumentCode(q.document_code)
    )
    if (malformed) {
      return {
        success: false,
        error: `Invalid **DocumentCode:** format: "${malformed.document_code}" — use uppercase A–Z, digits 0–9, and hyphens only (e.g. DOC-ACT-STATE-ADMIN-2534)`
      }
    }

    const payload = questions.map((q, i) => buildQuestionInsertRow(q, codes[i]))

    // Batch insert into Supabase
    const { data, error } = await supabase
      .from('questions')
      .insert(payload)
      .select('id')

    if (error) {
      console.error('Batch insert error:', error)
      return { success: false, error: error.message }
    }

    // Note: Revalidating the questions path (placeholder for when we build it)
    revalidatePath('/admin/questions')
    
    return { 
      success: true, 
      count: data?.length || 0 
    }

  } catch (error: any) {
    console.error('Import Action error:', error)
    return { success: false, error: error.message }
  }
}
