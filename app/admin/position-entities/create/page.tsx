import { requirePermission } from '@/lib/auth/server-protect'
import PositionEntityForm, { type PositionEntityFormPosition } from '../PositionEntityForm'

export default async function CreatePositionEntityPage() {
  const { supabase } = await requirePermission('system.manage')
  const { data } = await supabase
    .from('positions')
    .select('id, name, organizations(name, short_name)')
    .order('name', { ascending: true })

  const positions: PositionEntityFormPosition[] = (data ?? []).map((row: any) => {
    const organization = Array.isArray(row.organizations) ? row.organizations[0] : row.organizations
    return {
      id: row.id,
      name: row.name,
      organizationName: organization?.short_name || organization?.name || null,
    }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Create Position Entity</h1>
        <p className="mt-1 text-[#A1866B]">Create one canonical evergreen role page and map verified operational positions.</p>
      </div>
      <PositionEntityForm
        positions={positions}
        values={{
          id: null,
          slug: '',
          name: '',
          overview_markdown: '',
          seo_title: '',
          seo_description: '',
          status: 'draft',
          sources_json: '[]',
          mappedPositionIds: [],
        }}
      />
    </div>
  )
}
