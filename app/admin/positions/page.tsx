import { requirePermission } from '@/lib/auth/server-protect'
import { redirect } from 'next/navigation'
import PositionsClient from './PositionsClient'

export const dynamic = 'force-dynamic'

export default async function PositionsPage() {
  
  const { supabase, profile } = await requirePermission('system.manage')

  const { data: positions } = await supabase
    .from('positions')
    .select('*, organizations(name, code)')
    .order('created_at', { ascending: false })

  return <PositionsClient positions={positions || []} />
}
