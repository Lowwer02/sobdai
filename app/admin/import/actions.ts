'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import type { ParsedQuestion } from '@/lib/markdownParser'

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
    // Only fields that have a DB column are inserted. The parser also
    // extracts v2.1 fields (document_type, learning_objective,
    // knowledge_coverage, blueprint, question_type, choice_count) but those
    // have no column yet (Content Template v2.1 future phase) and are
    // intentionally NOT included here to avoid insert errors.
    const payload = questions.map((q, i) => ({
      question_code: codes[i], // immutable business identifier (allocation-only RPC)
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
      law: q.law || null,
      topic: q.topic || null,
      tags: q.tags,
      status: 'Draft' // Initially import as Draft
    }))

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
