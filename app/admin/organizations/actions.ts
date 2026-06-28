'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'


export async function createOrganizationAction(formData: FormData): Promise<{ success: boolean, error?: string } | void> {
  try {
    const { supabase } = await requirePermission('system.manage')

    const payload = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      short_name: (formData.get('short_name') as string) || null,
      logo_url: (formData.get('logo_url') as string) || null,
      description: (formData.get('description') as string) || null,
    }

    const { error, data } = await supabase.from('organizations').insert([payload]).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Insert failed. You may not have permission.')

  } catch (error: any) {
    return { success: false, error: error.message }
  }
  
  revalidatePath('/admin/organizations')
  redirect('/admin/organizations')
}

export async function updateOrganizationAction(id: string, formData: FormData): Promise<{ success: boolean, error?: string } | void> {
  try {
    const { supabase } = await requirePermission('system.manage')

    const payload = {
      code: formData.get('code') as string,
      name: formData.get('name') as string,
      short_name: (formData.get('short_name') as string) || null,
      logo_url: (formData.get('logo_url') as string) || null,
      description: (formData.get('description') as string) || null,
    }

    const { error, data } = await supabase.from('organizations').update(payload).eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Update failed. You may not have permission.')

  } catch (error: any) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/organizations')
  redirect('/admin/organizations')
}

export async function deleteOrganization(id: string) {
  try {
    const { supabase } = await requirePermission('system.manage')
    
    const { error, data } = await supabase.from('organizations').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) throw new Error('Delete failed. You may not have permission.')

    revalidatePath('/admin/organizations')
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
