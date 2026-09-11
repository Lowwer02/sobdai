import { hasPermission } from '@/lib/auth/rbac'
import { requirePermission } from '@/lib/auth/server-protect'
import PositionEntitiesClient, { type PositionEntityListRow } from './PositionEntitiesClient'

export const dynamic = 'force-dynamic'

export default async function PositionEntitiesPage() {
  const { supabase, profile } = await requirePermission('content.read')
  const { data, error } = await supabase
    .from('position_entities')
    .select('id, slug, name, status, published_at, updated_at')
    .order('updated_at', { ascending: false })

  const entities = (data ?? []) as PositionEntityListRow[]
  const entityIds = entities.map((entity) => entity.id)
  const { data: mappedPositions } = entityIds.length > 0
    ? await supabase
        .from('positions')
        .select('id, name, position_entity_id, organizations(name, short_name)')
        .in('position_entity_id', entityIds)
        .order('name', { ascending: true })
    : { data: [] }

  const positionsByEntity = new Map<string, PositionEntityListRow['positions']>()
  for (const row of (mappedPositions ?? []) as any[]) {
    if (!row.position_entity_id) continue
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    const list = positionsByEntity.get(row.position_entity_id) ?? []
    list.push({
      id: row.id,
      name: row.name,
      organizationName: organization?.short_name || organization?.name || null,
    })
    positionsByEntity.set(row.position_entity_id, list)
  }

  return (
    <PositionEntitiesClient
      entities={entities.map((entity) => ({
        ...entity,
        positions: positionsByEntity.get(entity.id) ?? [],
      }))}
      canManage={hasPermission(profile.role, 'system.manage')}
      migrationError={error ? 'ยังไม่พบตาราง Position Entity กรุณาติดตั้ง migration 094 ก่อน' : undefined}
    />
  )
}
