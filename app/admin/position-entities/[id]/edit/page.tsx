import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { normalizePositionSources, serializePositionSources } from '@/lib/position-entity'
import PositionEntityForm, { type PositionEntityFormPosition } from '../../PositionEntityForm'

export default async function EditPositionEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requirePermission('system.manage')
  const { id } = await params
  const [{ data: entity, error: entityError }, { data: positions }] = await Promise.all([
    supabase
      .from('position_entities')
      .select('id, slug, name, overview_markdown, seo_title, seo_description, status, sources')
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('positions')
      .select('id, name, organization_id, position_entity_id, organizations(name, short_name)')
      .order('name', { ascending: true }),
  ])

  if (entityError || !entity) notFound()

  const positionOptions: PositionEntityFormPosition[] = (positions ?? []).map((row: any) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    return {
      id: row.id,
      name: row.name,
      organizationName: organization?.short_name || organization?.name || null,
    }
  })
  const mappedPositionIds = (positions ?? [])
    .filter((row: any) => row.position_entity_id === entity.id)
    .map((row: any) => row.id)

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Edit Position Entity</h1>
        <p className="mt-1 text-[#A1866B]">Update editorial content, lifecycle, sources, and verified mappings.</p>
      </div>
      <PositionEntityForm
        positions={positionOptions}
        values={{
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          overview_markdown: entity.overview_markdown || '',
          seo_title: entity.seo_title || '',
          seo_description: entity.seo_description || '',
          status: entity.status,
          sources_json: serializePositionSources(normalizePositionSources(entity.sources)),
          mappedPositionIds,
        }}
      />
    </div>
  )
}
