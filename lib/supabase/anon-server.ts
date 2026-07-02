import { createClient } from '@supabase/supabase-js'

/**
 * Server-side anonymous Supabase client.
 *
 * Unlike `lib/supabase/server`, this does NOT read `cookies()`, so it is safe
 * to use inside statically rendered routes / cached data fetching where
 * reading cookies would force the route to become dynamic.
 *
 * Use it only for public, non-user-scoped reads. The `get_package_public_counts`
 * RPC is SECURITY DEFINER and grants execute to `anon`, so this client is the
 * right choice for it.
 */
let cached: ReturnType<typeof createClient> | null = null

export function createAnonServerClient() {
  if (cached) return cached
  cached = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
  return cached
}
