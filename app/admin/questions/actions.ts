'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function createAdminClient() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Ignored in server action
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden: Admins only')
  }

  return supabase
}

export async function updateQuestionAction(id: string, formData: FormData) {
  try {
    const supabase = await createAdminClient()

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
      law: (formData.get('law') as string) || null,
      topic: (formData.get('topic') as string) || null,
      status: formData.get('status') as string,
      tags,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('questions')
      .update(payload)
      .eq('id', id)

    if (error) {
      console.error('Error updating question:', error)
      return { success: false, error: error.message }
    }

  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/questions')
  redirect('/admin/questions')
}

export async function deleteQuestionAction(id: string) {
  try {
    const supabase = await createAdminClient()

    const { error } = await supabase
      .from('questions')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting question:', error)
      return { success: false, error: error.message }
    }
    
    revalidatePath('/admin/questions')
    return { success: true }
    
  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }
}
