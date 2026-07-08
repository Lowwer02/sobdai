'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'



export async function updateQuestionAction(id: string, formData: FormData) {
  try {
    const { supabase } = await requirePermission('content.write')

    // Process Tags (comma separated string -> text[])
    const tagsRaw = formData.get('tags') as string
    const tags = tagsRaw 
      ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) 
      : []

    const payload = {
      content: formData.get('content') as string,
      choice_a: formData.get('choice_a') as string,
      choice_b: formData.get('choice_b') as string,
      choice_c: formData.get('choice_c') as string,
      choice_d: formData.get('choice_d') as string,
      correct_answer: formData.get('correct_answer') as string,
      hint: (formData.get('hint') as string) || null,
      full_explanation: (formData.get('full_explanation') as string) || null,
      why_a_wrong: (formData.get('why_a_wrong') as string) || null,
      why_b_wrong: (formData.get('why_b_wrong') as string) || null,
      why_c_wrong: (formData.get('why_c_wrong') as string) || null,
      why_d_wrong: (formData.get('why_d_wrong') as string) || null,
      reference: (formData.get('reference') as string) || null,
      difficulty: formData.get('difficulty') as string,
      category: (formData.get('category') as string) || null,
      subject: (formData.get('subject') as string) || null,
      document: (formData.get('document') as string) || null,
      law: (formData.get('law') as string) || null,
      topic: (formData.get('topic') as string) || null,
      status: formData.get('status') as string,
      tags,
      updated_at: new Date().toISOString()
    }

    const { error, data } = await supabase
      .from('questions')
      .update(payload)
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('Error updating question:', error)
      return { success: false, error: error.message }
    }
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission.')

  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/questions')
  redirect('/admin/questions')
}

export async function deleteQuestionAction(id: string) {
  try {
    const { supabase } = await requirePermission('content.delete')

    const { error, data } = await supabase
      .from('questions')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) {
      console.error('Error deleting question:', error)
      return { success: false, error: error.message }
    }
    if (!data || data.length === 0) throw new Error('Delete failed. You may not have permission.')
    
    revalidatePath('/admin/questions')
    return { success: true }
    
  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }
}
export async function bulkUpdateQuestionStatusAction(ids: string[], status: 'Published' | 'Draft' | 'Review') {
  try {
    const { supabase } = await requirePermission('content.write')

    if (!ids || ids.length === 0) return { success: false, error: 'No questions selected' }

    const { error, data } = await supabase
      .from('questions')
      .update({ status, updated_at: new Date().toISOString() })
      .in('id', ids)
      .select('id')

    if (error) {
      console.error('Error bulk updating questions:', error)
      return { success: false, error: error.message }
    }
    
    revalidatePath('/admin/questions')
    return { success: true, count: data?.length || 0 }
    
  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }
}
