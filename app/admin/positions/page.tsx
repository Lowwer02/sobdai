import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import PositionsClient from './PositionsClient'

export const dynamic = 'force-dynamic'

export default async function PositionsPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() }
      }
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/admin')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/admin')

  const { data: positions } = await supabase
    .from('positions')
    .select('*, organizations(name, code)')
    .order('created_at', { ascending: false })

  return <PositionsClient positions={positions || []} />
}
