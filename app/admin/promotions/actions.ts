'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { validatePromotion } from '@/lib/promotions'

/** Create a promotion. Returns {success,error} OR redirects on success. */
export async function createPromotionAction(raw: any): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')
  const { ok, errors, clean } = validatePromotion(raw)
  if (!ok) {
    return { success: false, error: formatErrors(errors) }
  }

  const { error } = await supabase.from('promotions').insert(clean!)
  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/promotions')
  redirect('/admin/promotions')
}

/** Update a promotion. Stays on the edit page on validation error. */
export async function updatePromotionAction(id: string, raw: any): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await requirePermission('content.write')
  const { ok, errors, clean } = validatePromotion(raw)
  if (!ok) {
    return { success: false, error: formatErrors(errors) }
  }

  const { error, data } = await supabase.from('promotions').update(clean!).eq('id', id).select('id')
  if (error) {
    return { success: false, error: error.message }
  }
  if (!data || data.length === 0) {
    return { success: false, error: 'Update failed. You may not have permission.' }
  }

  revalidatePath('/admin/promotions')
  return { success: true }
}

/** Soft lifecycle: set status. Used by Publish / Unpublish / Archive buttons. */
export async function setPromotionStatusAction(id: string, status: 'draft' | 'published' | 'archived') {
  const { supabase } = await requirePermission('content.write')
  const { error, data } = await supabase
    .from('promotions')
    .update({ status })
    .eq('id', id)
    .select('id')

  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) return { success: false, error: 'Update failed. You may not have permission.' }

  revalidatePath('/admin/promotions')
  return { success: true }
}

/** Hard delete. */
export async function deletePromotionAction(id: string) {
  const { supabase } = await requirePermission('content.delete')
  const { error, data } = await supabase.from('promotions').delete().eq('id', id).select('id')
  if (error) return { success: false, error: error.message }
  if (!data || data.length === 0) return { success: false, error: 'Delete failed. You may not have permission.' }

  revalidatePath('/admin/promotions')
  return { success: true }
}

function formatErrors(errors: Record<string, string>): string {
  return Object.values(errors).join(' • ')
}
