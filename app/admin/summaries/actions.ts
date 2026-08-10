'use server'

import { requirePermission } from '@/lib/auth/server-protect'
import { isSummaryBankCompatibilityWriterError } from '@/lib/application/knowledge-platform'
import { createSummaryBankCompatibilityWriter } from '@/lib/infrastructure/knowledge-platform'

import { revalidatePath } from 'next/cache'


export async function createSummary(data: any) {
  try {
    const { user } = await requirePermission('content.write')
    const writer = createSummaryBankCompatibilityWriter()
    const result = await writer.create({
      actorId: user.id,
      packageId: data.package_id,
      title: data.title,
      slug: data.slug,
      subject: data.subject,
      document: data.document,
      law: data.law,
      topic: data.topic,
      contentMd: data.content_md,
      sortOrder: data.sort_order,
      displayOrder: data.display_order,
      isPublished: data.is_published,
    })

    revalidatePath('/admin/summaries')
    revalidatePath(`/package/${data.package_id}`)
    return { success: true, id: result.summaryId }
  } catch (err: any) {
    if (isSummaryBankCompatibilityWriterError(err) && err.code === 'duplicate_legacy_slug') {
      return { success: false, error: 'Slug already exists in this package.' }
    }
    return { success: false, error: err.message }
  }
}

export async function updateSummary(id: string, data: any) {
  try {
    const { user } = await requirePermission('content.write')
    const writer = createSummaryBankCompatibilityWriter()
    await writer.update({
      actorId: user.id,
      summaryId: id,
      packageId: data.package_id,
      title: data.title,
      slug: data.slug,
      subject: data.subject,
      document: data.document,
      law: data.law,
      topic: data.topic,
      contentMd: data.content_md,
      sortOrder: data.sort_order,
      displayOrder: data.display_order,
    })

    revalidatePath('/admin/summaries')
    if (data.package_id) {
       revalidatePath(`/package/${data.package_id}`)
       revalidatePath(`/package/${data.package_id}/summary/${data.slug}`)
    }
    return { success: true }
  } catch (err: any) {
    if (isSummaryBankCompatibilityWriterError(err) && err.code === 'duplicate_legacy_slug') {
      return { success: false, error: 'Slug already exists in this package.' }
    }
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
