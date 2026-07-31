import { requirePermission } from '@/lib/auth/server-protect'
import { hasPermission } from '@/lib/auth/rbac'

import GenerateAssessmentClient from './GenerateAssessmentClient'
import { ADMIN_ASSESSMENT_BLUEPRINTS } from './config'

export default async function GenerateAssessmentPage() {
  const { supabase, profile } = await requirePermission('content.write')
  const { data: packages } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  return (
    <GenerateAssessmentClient
      blueprints={ADMIN_ASSESSMENT_BLUEPRINTS.map((blueprint) => ({
        key: blueprint.key,
        title: blueprint.title,
        description: blueprint.description,
      }))}
      packages={packages ?? []}
      canPublish={hasPermission(profile.role, 'content.publish')}
    />
  )
}
