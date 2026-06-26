'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

async function getAdminSupabase() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
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

export async function validateSummaryImport(metadata: any) {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    // Find Package
    const { data: pkg, error: pkgError } = await supabase
      .from('packages')
      .select('id, name')
      .eq('slug', metadata.package_slug)
      .single()

    if (pkgError || !pkg) {
      return { success: false, error: `Package not found for slug: ${metadata.package_slug}` }
    }

    // Check Slug conflict
    const { data: existingSummary } = await supabase
      .from('summaries')
      .select('id')
      .eq('package_id', pkg.id)
      .eq('slug', metadata.slug)
      .single()

    return { 
      success: true, 
      packageId: pkg.id,
      packageName: pkg.name,
      isDuplicate: !!existingSummary 
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function commitSummaryImport(data: any, conflictResolution: 'replace' | 'new') {
  try {
    const { supabase, isAdmin } = await getAdminSupabase()
    if (!isAdmin) return { success: false, error: 'Unauthorized' }

    let finalSlug = data.slug

    if (conflictResolution === 'new' && data.isDuplicate) {
      // Find a unique slug suffix
      let suffix = 2
      let isUnique = false
      while (!isUnique) {
        const testSlug = `${data.slug}-${suffix}`
        const { data: existing } = await supabase
          .from('summaries')
          .select('id')
          .eq('package_id', data.packageId)
          .eq('slug', testSlug)
          .single()
        
        if (!existing) {
          finalSlug = testSlug
          isUnique = true
        } else {
          suffix++
        }
      }
    }

    const payload = {
      package_id: data.packageId,
      title: data.title,
      slug: finalSlug,
      subject: data.subject,
      law: data.law,
      topic: data.topic,
      content_md: data.content_md,
      read_time_minutes: data.read_time_minutes,
      sort_order: data.sort,
      is_published: data.published
    }

    let resultError = null
    
    if (conflictResolution === 'replace' && data.isDuplicate) {
      // Upsert/Update based on unique constraint (package_id, slug)
      const { error } = await supabase
        .from('summaries')
        .update(payload)
        .eq('package_id', data.packageId)
        .eq('slug', data.slug)
      
      resultError = error
    } else {
      const { error } = await supabase
        .from('summaries')
        .insert([payload])
      
      resultError = error
    }

    if (resultError) throw resultError

    revalidatePath('/admin/summaries')
    revalidatePath(`/package/${data.packageId}`)
    
    return { success: true, finalSlug }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
