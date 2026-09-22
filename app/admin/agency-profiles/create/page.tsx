import { requirePermission } from '@/lib/auth/server-protect'
import AgencyProfileForm, {
  type AgencyProfileFormAuthor,
  type AgencyProfileFormOrganization,
} from '../AgencyProfileForm'

export default async function CreateAgencyProfilePage() {
  const { supabase } = await requirePermission('content.write')

  // One profile per organization: offer only organizations that do not carry a
  // profile yet. (Both tables are readable to the staff session.)
  const [orgRes, profileRes, authorRes] = await Promise.all([
    supabase.from('organizations').select('id, name, short_name').order('name', { ascending: true }),
    supabase.from('agency_profiles').select('organization_id'),
    supabase
      .from('article_authors')
      .select('id, display_name')
      .eq('is_active', true)
      .order('display_name', { ascending: true }),
  ])

  const profiledOrgIds = new Set(((profileRes.data ?? []) as any[]).map((row) => row.organization_id))
  const organizations: AgencyProfileFormOrganization[] = ((orgRes.data ?? []) as any[])
    .filter((row) => !profiledOrgIds.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name || null,
    }))

  const authors: AgencyProfileFormAuthor[] = ((authorRes.data ?? []) as any[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Create Agency Profile</h1>
        <p className="mt-1 text-[#A1866B]">Attach one editorial / SEO / publish profile to an existing canonical organization.</p>
      </div>
      <AgencyProfileForm
        organizations={organizations}
        authors={authors}
        canPublish={false}
        values={{
          id: null,
          organizationId: '',
          organizationName: null,
          slug: '',
          overview_markdown: '',
          seo_title: '',
          seo_description: '',
          status: 'draft',
          published_at: null,
          sources_json: '[]',
          author_id: '',
        }}
      />
    </div>
  )
}
