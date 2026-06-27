'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'


export async function createPositionAction(formData: FormData): Promise<void> {
  const { supabase } = await requirePermission('system.manage')

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
  const { supabase } = await requirePermission('system.manage')

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
    const { supabase } = await requirePermission('system.manage')
    
    const { error } = await supabase.from('positions').delete().eq('id', id)
    if (error) throw error

    revalidatePath('/admin/positions')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
