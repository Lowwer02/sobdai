import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { createAdminClient } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/payment/manual'
import OrderPaymentDetailClient from './OrderPaymentDetailClient'

function relationObject(value: any) {
  return Array.isArray(value) ? value[0] : value
}
export default async function OrderPaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  if (!isUuid(id)) return notFound()

  const { supabase } = await requirePermission('financial.manage')

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, user_id, package_id, amount, status, payment_provider, created_at, updated_at, profiles!inner(email), packages!inner(name, slug)')
    .eq('id', id)
    .maybeSingle()

  if (orderError || !order) return notFound()

  const { data: rawSubmissions, error: submissionsError } = await supabase
    .from('payment_submissions')
    .select('id, order_id, storage_object_path, original_filename, mime_type, file_size_bytes, status, submitted_at, reviewed_at, reviewed_by, rejection_reason, created_at')
    .eq('order_id', id)
    .order('created_at', { ascending: false })

  if (submissionsError) {
    console.error('[PAYMENT] payment detail query failed:', submissionsError.message)
  }

  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  try {
    adminSupabase = createAdminClient()
  } catch (error) {
    console.error('[PAYMENT] private storage client unavailable:', error)
  }

  const submissions = await Promise.all((rawSubmissions || []).map(async (submission: any) => {
    let signedUrl: string | null = null

    if (adminSupabase) {
      const { data, error } = await adminSupabase.storage
        .from('payment-slips')
        .createSignedUrl(submission.storage_object_path, 300)

      if (error) {
        console.error('[PAYMENT] payment slip signed URL failed:', error.message)
      } else {
        signedUrl = data?.signedUrl || null
      }
    }

    return {
      id: submission.id,
      status: submission.status,
      originalFilename: submission.original_filename,
      mimeType: submission.mime_type,
      fileSizeBytes: Number(submission.file_size_bytes),
      submittedAt: submission.submitted_at,
      reviewedAt: submission.reviewed_at,
      reviewedBy: submission.reviewed_by,
      rejectionReason: submission.rejection_reason,
      createdAt: submission.created_at,
      signedUrl,
    }
  }))

  const profile = relationObject(order.profiles)
  const pkg = relationObject(order.packages)

  return (
    <OrderPaymentDetailClient
      order={{
        id: order.id,
        userId: order.user_id,
        packageId: order.package_id,
        amount: Number(order.amount),
        status: order.status,
        paymentProvider: order.payment_provider,
        createdAt: order.created_at,
        updatedAt: order.updated_at,
        userEmail: profile?.email || 'Unknown User',
        packageName: pkg?.name || 'Unknown Package',
        packageSlug: pkg?.slug || null,
      }}
      submissions={submissions}
    />
  )
}
