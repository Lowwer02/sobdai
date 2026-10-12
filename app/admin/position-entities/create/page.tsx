import { requirePermission } from '@/lib/auth/server-protect'
import PositionEntityForm from '../PositionEntityForm'

export default async function CreatePositionEntityPage() {
  const { supabase } = await requirePermission('system.manage')
  const { data: organizationRows } = await supabase
    .from('organizations')
    .select('id, name, short_name')
    .order('name', { ascending: true })

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-20">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-[#F5E9D6]">Create Position Entity</h1>
        <p className="mt-1 text-[#A1866B]">Create one canonical evergreen role page and map verified operational positions.</p>
      </div>
      <PositionEntityForm
        loadedPositions={[]}
        organizations={organizationRows ?? []}
        values={{
          id: null,
          slug: '',
          name: '',
          overview_markdown: '',
          seo_title: '',
          seo_description: '',
          status: 'draft',
          sources_json: '[]',
        }}
      />
    </div>
  )
}
