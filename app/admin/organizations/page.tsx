import { requirePermission } from '@/lib/auth/server-protect'
import { redirect } from 'next/navigation'
import OrganizationsClient from './OrganizationsClient'

export const dynamic = 'force-dynamic'

export default async function OrganizationsPage() {
  
  const { supabase, profile } = await requirePermission('system.manage')

  const { data: organizations } = await supabase
    .from('organizations')
    .select('*')
    .order('created_at', { ascending: false })

  return <OrganizationsClient organizations={organizations || []} />
}
