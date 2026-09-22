import { notFound } from 'next/navigation'
import { hasPermission } from '@/lib/auth/rbac'
import { requirePermission } from '@/lib/auth/server-protect'
import { normalizeAgencySources, serializeAgencySources } from '@/lib/agency-profile'
import AgencyProfileForm, {
  type AgencyProfileFormAuthor,
} from '../../AgencyProfileForm'

export default async function EditAgencyProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, profile } = await requirePermission('content.write')
  const { id } = await params

  const [{ data: entity, error: entityError }, authorRes] = await Promise.all([
    supabase
      .from('agency_profiles')
      .select('id, organization_id, slug, overview_markdown, seo_title, seo_description, status, published_at, sources, author_id, organizations(name, short_name)')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('article_authors')
      .select('id, display_name')
      .eq('is_active', true)
      .order('display_name', { ascending: true }),
  ])

  if (entityError || !entity) notFound()

  const organization = Array.isArray((entity as any).organizations)
    ? (entity as any).organizations[0]
    : (entity as any).organizations

  const authors: AgencyProfileFormAuthor[] = ((authorRes.data ?? []) as any[]).map((row) => ({
    id: row.id,
    displayName: row.display_name,
  }))

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Edit Agency Profile</h1>
        <p className="mt-1 text-[#A1866B]">
          {organization?.short_name ? `${organization.short_name} — ` : ''}{organization?.name ?? 'ไม่ทราบหน่วยงาน'}
        </p>
      </div>
      <AgencyProfileForm
        organizations={[]}
        authors={authors}
        canPublish={hasPermission(profile.role, 'content.publish')}
        values={{
          id: (entity as any).id,
          organizationId: (entity as any).organization_id,
          organizationName: organization?.name || null,
          slug: (entity as any).slug,
          overview_markdown: (entity as any).overview_markdown || '',
          seo_title: (entity as any).seo_title || '',
          seo_description: (entity as any).seo_description || '',
          status: (entity as any).status,
          published_at: (entity as any).published_at,
          sources_json: serializeAgencySources(normalizeAgencySources((entity as any).sources)),
          author_id: (entity as any).author_id || '',
        }}
      />
    </div>
  )
}
