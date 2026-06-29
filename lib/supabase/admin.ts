import { createClient } from '@supabase/supabase-js'

/**
 * Creates a pure Service Role Supabase client that bypasses Row Level Security (RLS).
 * 
 * IMPORTANT: 
 * - This client MUST NOT be attached to Next.js cookies/session.
 * - If cookies are attached, the user's JWT will override the Service Role Key, downgrading privileges.
 * - Only use this client for backend API routes and server actions that require elevated privileges.
 * - Never expose this client or the SUPABASE_SERVICE_ROLE_KEY to the frontend.
 */
export function createAdminClient() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing env.SUPABASE_SERVICE_ROLE_KEY')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      }
    }
  )
}
