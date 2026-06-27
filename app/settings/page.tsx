import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SettingsClient from './SettingsClient'

export const metadata = {
  title: 'My Profile | Sobdai',
  description: 'Manage your Sobdai profile and account settings',
}

export default async function SettingsPage() {
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
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    redirect('/login')
  }

  // Fetch complete profile from public.profiles
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Should not happen theoretically since profiles are tied to auth.users,
    // but just in case, redirect.
    redirect('/login')
  }

  // Provide user auth info along with profile details
  const enhancedProfile = {
    ...profile,
    // Note: raw_app_meta_data contains provider info
    provider: user.app_metadata?.provider || 'email',
  }

  return (
    <div className="min-h-screen bg-[#0A0705] pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight mb-8">
          การตั้งค่า
        </h1>
        <SettingsClient initialProfile={enhancedProfile} />
      </div>
    </div>
  )
}
