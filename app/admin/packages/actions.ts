'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// Helper to create authenticated supabase client
async function createAdminClient() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Ignored in server action
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthorized')

  // Verify admin role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    throw new Error('Forbidden: Admins only')
  }

  return supabase
}

// Generate a slug from package name (handles Thai and English)
function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\sก-๙]/g, '') // Keep alphanum, spaces, and Thai characters
    .replace(/\s+/g, '-') // Replace spaces with dashes
    .replace(/-+/g, '-') // Remove duplicate dashes
    .trim()
}

export async function createPackageAction(formData: FormData) {
  try {
    const supabase = await createAdminClient()

    let slug = formData.get('slug') as string
    const name = formData.get('name') as string
    
    if (!slug || slug.trim() === '') {
      slug = generateSlug(name)
    } else {
      slug = generateSlug(slug)
    }

    const payload = {
      package_code: formData.get('package_code') as string,
      slug,
      name,
      org_name: formData.get('org_name') as string,
      logo_url: (formData.get('logo_url') as string) || null,
      cover_image_url: (formData.get('cover_image_url') as string) || null,
      description: formData.get('description') as string,
      current_price: Number(formData.get('current_price')),
      original_price: Number(formData.get('original_price')),
      difficulty: formData.get('difficulty') as string,
      seo_title: formData.get('seo_title') as string,
      seo_description: formData.get('seo_description') as string,
      features: JSON.parse((formData.get('features') as string) || '[]'),
    }

    const { error } = await supabase.from('packages').insert(payload)

    if (error) {
      console.error('Error creating package:', error)
      return { success: false, error: error.message }
    }

  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/packages')
  redirect('/admin/packages')
}

export async function updatePackageAction(id: string, formData: FormData) {
  try {
    const supabase = await createAdminClient()

    let slug = formData.get('slug') as string
    const name = formData.get('name') as string
    
    if (!slug || slug.trim() === '') {
      slug = generateSlug(name)
    } else {
      slug = generateSlug(slug)
    }

    const payload = {
      package_code: formData.get('package_code') as string,
      slug,
      name,
      org_name: formData.get('org_name') as string,
      logo_url: (formData.get('logo_url') as string) || null,
      cover_image_url: (formData.get('cover_image_url') as string) || null,
      description: formData.get('description') as string,
      current_price: Number(formData.get('current_price')),
      original_price: Number(formData.get('original_price')),
      difficulty: formData.get('difficulty') as string,
      seo_title: formData.get('seo_title') as string,
      seo_description: formData.get('seo_description') as string,
      features: JSON.parse((formData.get('features') as string) || '[]'),
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase.from('packages').update(payload).eq('id', id)

    if (error) {
      console.error('Error updating package:', error)
      return { success: false, error: error.message }
    }

  } catch (error: any) {
    console.error('Action error:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/packages')
  revalidatePath(`/package/${formData.get('slug')}`) // revalidate public page too
  redirect('/admin/packages')
}
