import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/auth/rbac'
import { isUsableAccountProfile } from '@/lib/auth/server-protect'
import {
  ImageProcessingError,
  MAX_IMAGE_INPUT_BYTES,
  isValidAssetScope,
  isValidEntityUuid,
  processAndUploadImage,
} from '@/lib/storage'

/**
 * Maximum allowed Content-Length for the multipart request.
 * Accounts for the 4 MiB image file limit + form field/boundary overhead (~512 KiB buffer).
 */
export const MAX_MULTIPART_REQUEST_BYTES = 4.5 * 1024 * 1024

export async function POST(request: NextRequest) {
  // 1. Early request size gate: check Content-Length before buffering/parsing formData
  const contentLength = request.headers.get('content-length')
  if (contentLength) {
    const parsedLength = parseInt(contentLength, 10)
    if (!Number.isNaN(parsedLength) && parsedLength > MAX_MULTIPART_REQUEST_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: `Request payload exceeds maximum allowed limit (${MAX_IMAGE_INPUT_BYTES / (1024 * 1024)}MB image limit).`,
          code: 'OVERSIZED_INPUT',
        },
        { status: 413 },
      )
    }
  }

  // 2. Authenticate user session via Supabase server client
  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Server authentication initialization failed' },
      { status: 500 },
    )
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 },
    )
  }

  // 3. Authorize staff role against 'content.write' permission
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profileError || !isUsableAccountProfile(profile) || !hasPermission(profile.role, 'content.write')) {
    return NextResponse.json(
      { success: false, error: 'Forbidden: Insufficient permissions (content.write required)' },
      { status: 403 },
    )
  }

  // 4. Parse and validate FormData payload
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json(
      { success: false, error: 'Invalid multipart form data' },
      { status: 400 },
    )
  }

  const file = formData.get('file')
  if (!file || typeof file === 'string' || typeof (file as Blob).arrayBuffer !== 'function') {
    return NextResponse.json(
      { success: false, error: 'Missing or invalid "file" in upload request' },
      { status: 400 },
    )
  }

  const scope = formData.get('scope')
  if (!isValidAssetScope(scope)) {
    return NextResponse.json(
      { success: false, error: 'Invalid or missing "scope". Allowed scopes: "news", "articles"' },
      { status: 400 },
    )
  }

  const rawEntityId = formData.get('entityId')
  const entityId = typeof rawEntityId === 'string' && rawEntityId.trim() !== '' ? rawEntityId.trim() : null
  if (entityId !== null && !isValidEntityUuid(entityId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid "entityId". Must be a valid UUID' },
      { status: 400 },
    )
  }

  // 5. Process and upload to Cloudflare R2
  try {
    const asset = await processAndUploadImage({
      file: file as Blob,
      scope,
      entityId,
    })

    return NextResponse.json({
      success: true,
      asset,
    })
  } catch (error) {
    if (error instanceof ImageProcessingError) {
      return NextResponse.json(
        { success: false, error: error.message, code: error.code },
        { status: 400 },
      )
    }

    // Generic internal error response — never leak R2 endpoints, credentials, bucket names, or stack traces
    console.error('[Admin Media Upload] Internal unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Image upload failed' },
      { status: 500 },
    )
  }
}
