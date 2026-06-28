import { requirePermission } from '@/lib/auth/server-protect'
import PackagesClient from './PackagesClient'

export default async function PackagesPage() {
  const { supabase, profile } = await requirePermission('content.read')
  
  let packages: any[] = []
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://dummy.supabase.co') {
    const { data } = await supabase.from('packages').select('*').order('created_at', { ascending: false })
    if (data) packages = data
  }

  return <PackagesClient packages={packages} currentUserRole={profile?.role || 'user'} />
}
