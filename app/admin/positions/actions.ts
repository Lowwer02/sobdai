'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'


export async function createPositionAction(formData: FormData): Promise<{ success: boolean, error?: string } | void> {
  try {
    const { supabase } = await requirePermission('system.manage')

    const payload = {
      organization_id: formData.get('organization_id') as string,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
    }

    const { error, data } = await supabase.from('positions').insert([payload]).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Insert failed. You may not have permission.')

  } catch (error: any) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/positions')
  redirect('/admin/positions')
}

export async function updatePositionAction(id: string, formData: FormData): Promise<{ success: boolean, error?: string } | void> {
  try {
    const { supabase } = await requirePermission('system.manage')

    const payload = {
      organization_id: formData.get('organization_id') as string,
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || null,
    }

    const { error, data } = await supabase.from('positions').update(payload).eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission.')

  } catch (error: any) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/positions')
  redirect('/admin/positions')
}

export async function deletePosition(id: string) {
  try {
    const { supabase } = await requirePermission('system.manage')
    
    const { error, data } = await supabase.from('positions').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Delete failed. You may not have permission.')

    revalidatePath('/admin/positions')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
