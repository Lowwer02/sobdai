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

export async function updateUserRole(userId: string, newRole: 'admin' | 'user') {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) throw error

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateUserStatus(userId: string, newStatus: 'active' | 'banned') {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase
      .from('profiles')
      .update({ status: newStatus })
      .eq('id', userId)

    if (error) throw error

    revalidatePath('/admin/users')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
