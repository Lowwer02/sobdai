'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

async function getAdminSupabase() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
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

export async function createPositionAction(formData: FormData): Promise<void> {
  const { supabase, isAdmin } = await getAdminSupabase()
  if (!isAdmin) throw new Error('Unauthorized')

  const payload = {
    organization_id: formData.get('organization_id') as string,
    code: formData.get('code') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
  }

  const { error } = await supabase.from('positions').insert([payload])
  if (error) throw error

  revalidatePath('/admin/positions')
  redirect('/admin/positions')
}

export async function updatePositionAction(id: string, formData: FormData): Promise<void> {
  const { supabase, isAdmin } = await getAdminSupabase()
  if (!isAdmin) throw new Error('Unauthorized')

  const payload = {
    organization_id: formData.get('organization_id') as string,
    code: formData.get('code') as string,
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || null,
  }

  const { error } = await supabase.from('positions').update(payload).eq('id', id)
  if (error) throw error

  revalidatePath('/admin/positions')
  redirect('/admin/positions')
}

export async function deletePosition(id: string) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    const { error } = await supabase.from('positions').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/positions')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
