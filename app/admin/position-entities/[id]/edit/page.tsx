import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth/server-protect'
import { normalizePositionSources, serializePositionSources } from '@/lib/position-entity'
import PositionEntityForm, { type PositionEntityFormPosition } from '../../PositionEntityForm'

export default async function EditPositionEntityPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requirePermission('system.manage')
  const { id } = await params
  const [{ data: entity, error: entityError }, { data: mappedRows }, { data: organizationRows }] =
    await Promise.all([
      supabase
        .from('position_entities')
        .select('id, slug, name, overview_markdown, seo_title, seo_description, status, sources')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('positions')
        .select('id, code, name, organization_id, position_entity_id, organizations(id, name, short_name)')
        .eq('position_entity_id', id)
        .order('name', { ascending: true }),
      supabase.from('organizations').select('id, name, short_name').order('name', { ascending: true }),
    ])

  if (entityError || !entity) notFound()

  const loadedPositions: PositionEntityFormPosition[] = (mappedRows ?? []).map((row: any) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    return {
      id: row.id,
      name: row.name,
      code: row.code ?? null,
      organizationId: row.organization_id ?? null,
      organizationName: organization?.short_name || organization?.name || null,
    }
  })

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Edit Position Entity</h1>
        <p className="mt-1 text-[#A1866B]">Update editorial content, lifecycle, sources, and verified mappings.</p>
      </div>
      <PositionEntityForm
        loadedPositions={loadedPositions}
        organizations={organizationRows ?? []}
        values={{
          id: entity.id,
          slug: entity.slug,
          name: entity.name,
          overview_markdown: entity.overview_markdown || '',
          seo_title: entity.seo_title || '',
          seo_description: entity.seo_description || '',
          status: entity.status,
          sources_json: serializePositionSources(normalizePositionSources(entity.sources)),
        }}
      />
    </div>
  )
}
