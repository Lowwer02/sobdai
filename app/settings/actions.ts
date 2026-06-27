'use server'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export async function updateProfile(formData: FormData) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll() {}
        },
      }
    )

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return { success: false, error: 'Unauthorized' }
    }

    // Extract and validate fields
    let displayName = (formData.get('display_name') as string) || ''
    let occupation = (formData.get('occupation') as string) || ''
    let phone = (formData.get('phone') as string) || ''

    // Trim whitespace
    displayName = displayName.trim()
    occupation = occupation.trim()
    phone = phone.trim()

    // Length Constraints
    if (displayName.length > 80) displayName = displayName.substring(0, 80)
    if (occupation.length > 120) occupation = occupation.substring(0, 120)

    // Basic HTML tag stripping
    displayName = displayName.replace(/<[^>]*>?/gm, '')
    occupation = occupation.replace(/<[^>]*>?/gm, '')
    phone = phone.replace(/<[^>]*>?/gm, '')

    // Prepare payload
    const payload = {
      display_name: displayName,
      occupation: occupation,
      phone: phone,
      updated_at: new Date().toISOString()
    }

    // Execute update against authenticated user ONLY
    const { error } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)

    if (error) {
      console.error('Update profile error:', error)
      return { success: false, error: error.message }
    }

    revalidatePath('/settings')
    return { success: true }
  } catch (error: any) {
    console.error('Update profile action error:', error)
    return { success: false, error: 'An unexpected error occurred' }
  }
}
