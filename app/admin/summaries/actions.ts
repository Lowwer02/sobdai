'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getAdminSupabase() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
      },
    }
  )
  
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { supabase, isAdmin: false }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()
    
  return { supabase, isAdmin: profile?.role === 'admin' }
}

export async function createSummary(data: any) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { data: result, error } = await supabase
      .from('summaries')
      .insert([data])
      .select('id')
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Slug already exists in this package.' }
      }
      throw error
    }

    revalidatePath('/admin/summaries')
    revalidatePath(`/package/${data.package_id}`)
    return { success: true, id: result.id }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateSummary(id: string, data: any) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('summaries')
      .update(data)
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Slug already exists in this package.' }
      }
      throw error
    }

    revalidatePath('/admin/summaries')
    if (data.package_id) {
       revalidatePath(`/package/${data.package_id}`)
       revalidatePath(`/package/${data.package_id}/summary/${data.slug}`)
    }
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function deleteSummary(id: string) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('summaries')
      .delete()
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/summaries')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function toggleSummaryPublish(id: string, isPublished: boolean) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('summaries')
      .update({ is_published: isPublished })
      .eq('id', id)

    if (error) throw error

    revalidatePath('/admin/summaries')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
