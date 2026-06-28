'use server'

import { requirePermission } from '@/lib/auth/server-protect'

import { revalidatePath } from 'next/cache'


export async function createSummary(data: any) {
  try {
    const { supabase } = await requirePermission('content.write')
    
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
    const { supabase } = await requirePermission('content.write')
    
    const { error, data: updateData } = await supabase
      .from('summaries')
      .update(data)
      .eq('id', id)
      .select('id')

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Slug already exists in this package.' }
      }
      throw error
    }
    if (!updateData || updateData.length === 0) throw new Error('Update failed. You may not have permission.')

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
    const { supabase } = await requirePermission('content.delete')
    
    const { error, data } = await supabase
      .from('summaries')
      .delete()
      .eq('id', id)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Delete failed. You may not have permission.')

    revalidatePath('/admin/summaries')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function toggleSummaryPublish(id: string, isPublished: boolean) {
  try {
    const { supabase } = await requirePermission('content.publish')
    
    const { error, data } = await supabase
      .from('summaries')
      .update({ is_published: isPublished })
      .eq('id', id)
      .select('id')

    if (error) throw error
    if (!data || data.length === 0) throw new Error('Publish failed. You may not have permission.')

    revalidatePath('/admin/summaries')
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
