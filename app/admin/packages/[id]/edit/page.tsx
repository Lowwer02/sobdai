import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import EditClient from './EditClient'

export default async function EditPackagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: pkg } = await supabase.from('packages').select('*').eq('id', id).single()
  if (!pkg) notFound()

  // Fetch all orgs
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, code')
    .order('name', { ascending: true })

  // Fetch all positions
  const { data: positions } = await supabase
    .from('positions')
    .select('id, organization_id, code, name')
    .order('name', { ascending: true })

  return <EditClient pkg={pkg} organizations={orgs || []} positions={positions || []} />
}
