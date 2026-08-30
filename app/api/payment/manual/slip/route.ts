import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  isPaymentSlipMimeType,
  isUuid,
  paymentSlipExtension,
  PAYMENT_SLIP_MAX_BYTES,
  sanitizeOriginalFilename,
  MANUAL_PAYMENT_PROVIDER,
} from '@/lib/payment/manual'
import {
  attemptPaymentSubmissionNotification,
  shouldDeleteAfterSubmissionError,
  shouldDeleteUploadedPaymentSlip,
} from '@/lib/payment/manual-slip-lifecycle'
import { notifyPaymentSubmission } from '@/lib/payment/telegram'

export const runtime = 'nodejs'

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte)
}

function hasWebpSignature(bytes: Uint8Array) {
  return startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46])
    && startsWithBytes(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
}

function hasValidFileSignature(bytes: Uint8Array, mimeType: string) {
  switch (mimeType) {
    case 'image/jpeg':
      return startsWithBytes(bytes, [0xff, 0xd8, 0xff])
    case 'image/png':
      return startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    case 'image/webp':
      return hasWebpSignature(bytes)
    case 'application/pdf':
      return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46])
    default:
      return false
  }
}

async function removeUploadedObject(adminSupabase: ReturnType<typeof createAdminClient>, path: string) {
  try {
    const { error } = await adminSupabase.storage.from('payment-slips').remove([path])
    if (error) console.error('[PAYMENT] failed to remove orphaned payment slip:', error.message)
  } catch (error) {
    console.error('[PAYMENT] failed to remove orphaned payment slip:', error)
  }
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function findSubmissionByIdempotencyKey(
  supabase: SupabaseClient,
  orderId: string,
  idempotencyKey: string,
) {
  return supabase
    .from('payment_submissions')
    .select('id, order_id, status, storage_object_path')
    .eq('idempotency_key', idempotencyKey)
    .eq('order_id', orderId)
    .maybeSingle()
}

export async function POST(request: Request) {
  let uploadedPath: string | null = null
  let adminSupabase: ReturnType<typeof createAdminClient> | null = null
  let submissionCommitted = false

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 })
    }

    const formData = await request.formData()
    const orderId = formData.get('orderId')
    const idempotencyKey = formData.get('idempotencyKey')
    const fileEntry = formData.get('file')

    if (!isUuid(orderId) || !isUuid(idempotencyKey)) {
      return NextResponse.json({ error: 'ข้อมูลคำสั่งซื้อไม่ถูกต้อง' }, { status: 400 })
    }

    if (!fileEntry || typeof fileEntry === 'string' || typeof fileEntry.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'กรุณาแนบสลิปการโอนเงิน' }, { status: 400 })
    }

    const file = fileEntry as File
    const mimeType = file.type.toLowerCase()

    if (!isPaymentSlipMimeType(mimeType)) {
      return NextResponse.json({ error: 'รองรับเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF' }, { status: 400 })
    }

    if (file.size <= 0 || file.size > PAYMENT_SLIP_MAX_BYTES) {
      return NextResponse.json({ error: 'ขนาดสลิปต้องไม่เกิน 4 MB' }, { status: 400 })
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, user_id, package_id, amount, status, payment_provider, packages!inner(name)')
      .eq('id', orderId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (orderError || !order || order.user_id !== user.id) {
      return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อของคุณ' }, { status: 404 })
    }

    if (
      order.status !== 'pending'
      || order.payment_provider !== MANUAL_PAYMENT_PROVIDER
      || Number(order.amount) <= 0
    ) {
      return NextResponse.json({ error: 'คำสั่งซื้อนี้ไม่อยู่ในสถานะรอชำระเงิน' }, { status: 409 })
    }

    // Replays return the existing durable result without creating another
    // object or notification. RLS limits this lookup to the caller's order.
    const { data: existingSubmission } = await supabase
      .from('payment_submissions')
      .select('id, order_id, status')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()

    if (existingSubmission) {
      if (existingSubmission.order_id !== orderId) {
        return NextResponse.json({ error: 'คำขออัปโหลดไม่ถูกต้อง' }, { status: 409 })
      }

      return NextResponse.json({
        success: true,
        orderId,
        paymentSubmissionId: existingSubmission.id,
        status: existingSubmission.status,
      })
    }

    const { data: submittedSubmission } = await supabase
      .from('payment_submissions')
      .select('id')
      .eq('order_id', orderId)
      .eq('status', 'submitted')
      .maybeSingle()

    if (submittedSubmission) {
      return NextResponse.json({ error: 'ระบบได้รับสลิปแล้ว กรุณารอการตรวจสอบ' }, { status: 409 })
    }

    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength !== file.size || !hasValidFileSignature(bytes, mimeType)) {
      return NextResponse.json({ error: 'ไฟล์สลิปไม่ตรงกับชนิดไฟล์ที่แจ้ง' }, { status: 400 })
    }

    const extension = paymentSlipExtension(mimeType)
    if (!extension) {
      return NextResponse.json({ error: 'ชนิดไฟล์สลิปไม่ถูกต้อง' }, { status: 400 })
    }

    const objectPath = `${user.id}/${orderId}/${crypto.randomUUID()}.${extension}`
    uploadedPath = objectPath
    adminSupabase = createAdminClient()

    const { error: uploadError } = await adminSupabase.storage
      .from('payment-slips')
      .upload(objectPath, Buffer.from(bytes), {
        contentType: mimeType,
        upsert: false,
      })

    if (uploadError) {
      console.error('[PAYMENT] payment slip upload failed:', uploadError.message)
      await removeUploadedObject(adminSupabase, objectPath)
      uploadedPath = null
      return NextResponse.json({ error: 'อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่' }, { status: 500 })
    }

    let data: any = null
    let submissionError: any = null

    try {
      const rpcResult = await supabase.rpc('submit_payment_slip', {
        p_order_id: orderId,
        p_idempotency_key: idempotencyKey,
        p_storage_object_path: objectPath,
        p_original_filename: sanitizeOriginalFilename(file.name),
        p_mime_type: mimeType,
        p_file_size_bytes: file.size,
      })
      data = rpcResult.data
      submissionError = rpcResult.error
    } catch (error) {
      submissionError = error
    }

    if (submissionError) {
      console.error('[PAYMENT] submit payment slip failed:', submissionError.message)
      // An RPC error can be transport-ambiguous: PostgreSQL may have committed
      // even though the client received an error. Reconcile by idempotency key
      // before deleting anything. If reconciliation is unavailable, preserve
      // the object for operator recovery instead of risking committed evidence.
      const { data: recoveredSubmission, error: recoveryError } =
        await findSubmissionByIdempotencyKey(supabase, orderId, idempotencyKey)

      if (recoveryError) {
        console.error('[PAYMENT] payment slip commit state is ambiguous:', recoveryError.message)
        uploadedPath = null
        return NextResponse.json({ error: 'ระบบกำลังตรวจสอบการส่งสลิป กรุณาลองใหม่อีกครั้ง' }, { status: 503 })
      }

      if (!recoveredSubmission) {
        if (shouldDeleteAfterSubmissionError({ recoveredSubmission, recoveryError: null })) {
          await removeUploadedObject(adminSupabase, objectPath)
          uploadedPath = null
          return NextResponse.json({ error: 'ไม่สามารถบันทึกสลิปได้ กรุณาลองใหม่' }, { status: 409 })
        }

        uploadedPath = null
        return NextResponse.json({ error: 'ระบบกำลังตรวจสอบการส่งสลิป กรุณาลองใหม่อีกครั้ง' }, { status: 503 })
      }

      submissionCommitted = true
      data = [{
        payment_submission_id: recoveredSubmission.id,
        order_id: recoveredSubmission.order_id,
        status: recoveredSubmission.status,
      }]
    }

    const row = Array.isArray(data) ? data[0] : data
    if (
      !row?.payment_submission_id
      || row.order_id !== orderId
      || !['submitted', 'approved', 'rejected'].includes(row.status)
    ) {
      // The RPC returned successfully, so the database may already reference
      // this object even if its response shape is unexpected. Preserve it.
      submissionCommitted = true
      uploadedPath = null
      return NextResponse.json({ error: 'ไม่สามารถบันทึกสลิปได้ กรุณาลองใหม่' }, { status: 409 })
    }

    submissionCommitted = true

    // Two requests can race with the same idempotency key after both pass the
    // preflight lookup. Only the request whose object path was committed owns
    // the uploaded object; clean up the loser's orphan before responding.
    const { data: persistedSubmission, error: persistedSubmissionError } = await supabase
      .from('payment_submissions')
      .select('id, order_id, status, storage_object_path')
      .eq('id', row.payment_submission_id)
      .maybeSingle()

    if (
      persistedSubmissionError
      || !persistedSubmission
      || persistedSubmission.order_id !== orderId
    ) {
      // The submission RPC has already returned successfully. A failed or
      // stale read must never delete an object that may now be referenced by a
      // durable payment_submissions row.
      if (persistedSubmissionError) {
        console.error('[PAYMENT] payment slip persistence verification failed:', persistedSubmissionError.message)
      }
      uploadedPath = null
      return NextResponse.json({ error: 'ระบบกำลังยืนยันการส่งสลิป กรุณาลองใหม่อีกครั้ง' }, { status: 503 })
    }

    if (shouldDeleteUploadedPaymentSlip({
      submissionCommitted,
      orderId,
      objectPath,
      persistedSubmission,
      persistedSubmissionError,
    })) {
      await removeUploadedObject(adminSupabase, objectPath)
      uploadedPath = null
      return NextResponse.json({
        success: true,
        orderId,
        paymentSubmissionId: persistedSubmission.id,
        status: persistedSubmission.status,
      })
    }

    const packageRelation = (order as any).packages
    const packageName = Array.isArray(packageRelation)
      ? packageRelation[0]?.name
      : packageRelation?.name

    const notification = await attemptPaymentSubmissionNotification(() => notifyPaymentSubmission({
      orderId,
      paymentSubmissionId: row.payment_submission_id,
      packageName: packageName || 'ไม่ระบุแพ็กเกจ',
      amount: Number(order.amount),
      userEmail: user.email || '',
    }))
    if (!notification.sent) {
      // The evidence row is already committed. Notification failure must not
      // change payment status or make the customer retry the upload.
      console.error('[PAYMENT NOTIFICATION] Telegram notification failed:', notification.error)
    }

    uploadedPath = null
    return NextResponse.json({
      success: true,
      orderId,
      paymentSubmissionId: row.payment_submission_id,
      status: persistedSubmission.status,
    })
  } catch (error) {
    console.error('[PAYMENT] submit payment slip route failed:', error)
    if (
      uploadedPath
      && adminSupabase
      && shouldDeleteUploadedPaymentSlip({ submissionCommitted, objectPath: uploadedPath })
    ) {
      await removeUploadedObject(adminSupabase, uploadedPath)
    }
    return NextResponse.json({ error: 'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status: 500 })
  }
}
