'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'


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

export async function createExamSetAction(data: {
  package_id: string
  name: string
  description?: string
  duration_minutes: number
  is_sample: boolean
  sort_order: number
  display_order: number
  question_ids: string[]
}) {
  try {
    const { supabase } = await requirePermission('content.write')

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
        display_order: data.display_order
      })
      .select()
      .single()

    if (insertError) throw insertError

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
  } catch (err: any) {
    return { success: false, error: err.message }
  }
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
}) {
  try {
    const { supabase } = await requirePermission('content.write')

    // 1. Update Exam Set
    const { error: updateError, data: updateData } = await supabase
      .from('exam_sets')
      .update({
        package_id: data.package_id,
        name: data.name,
        description: data.description,
        duration_minutes: data.duration_minutes,
        is_sample: data.is_sample,
        sort_order: data.sort_order,
        display_order: data.display_order
      })
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
