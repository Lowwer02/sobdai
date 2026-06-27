import { requirePermission } from '@/lib/auth/server-protect'
import { redirect } from 'next/navigation'
import CreateClient from './CreateClient'

export const dynamic = 'force-dynamic'

export default async function CreatePackagePage() {
  
  const { supabase, profile } = await requirePermission('content.read')

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

  return <CreateClient organizations={orgs || []} positions={positions || []} />
}
