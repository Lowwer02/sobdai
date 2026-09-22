import { hasPermission } from '@/lib/auth/rbac'
import { requirePermission } from '@/lib/auth/server-protect'
import AgencyProfilesClient, { type AgencyProfileListRow } from './AgencyProfilesClient'

export const dynamic = 'force-dynamic'

export default async function AgencyProfilesPage() {
  const { supabase, profile } = await requirePermission('content.read')
  const { data, error } = await supabase
    .from('agency_profiles')
    .select('id, slug, status, published_at, updated_at, organizations(name, short_name)')
    .order('updated_at', { ascending: false })

  const profiles: AgencyProfileListRow[] = ((data ?? []) as any[]).map((row) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    return {
      id: row.id,
      slug: row.slug,
      status: row.status,
      published_at: row.published_at,
      updated_at: row.updated_at,
      organizationName: organization?.name || 'ไม่ทราบหน่วยงาน',
      organizationShortName: organization?.short_name || null,
    }
  })

  return (
    <AgencyProfilesClient
      profiles={profiles}
      canWrite={hasPermission(profile.role, 'content.write')}
      migrationError={error ? 'ยังไม่พบตาราง Agency Profile กรุณาติดตั้ง migration 102 ก่อน' : undefined}
    />
  )
}
