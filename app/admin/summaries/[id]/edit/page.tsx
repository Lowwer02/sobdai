import { requirePermission } from '@/lib/auth/server-protect'
import SummaryEditor from '@/components/admin/SummaryEditor'
import { updateSummary } from '../../actions'
import { redirect, notFound } from 'next/navigation'
import {
  assertPackageIdsAvailable,
  deriveSummaryKind,
  hydrateCurrentPackageIds,
} from '../../summary-action-logic'

export default async function EditSummaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requirePermission('content.read')

  const { id } = await params

  const { data: summary, error: summaryError } = await supabase
    .from('summaries')
    .select('id, package_id, title, slug, subject, document, law, topic, content_md, sort_order, display_order, is_published, summary_code')
    .eq('id', id)
    .maybeSingle()

  if (summaryError) throw new Error('Summary state could not be loaded safely.')
  if (!summary) return notFound()

  const summaryKind = deriveSummaryKind(summary.summary_code)
  let selectedPackageIds: string[]

  if (summaryKind === 'legacy') {
    selectedPackageIds = hydrateCurrentPackageIds('legacy', summary.package_id, [])
  } else {
    const { data: memberships, error: membershipsError } = await supabase
      .from('package_summaries')
      .select('package_id')
      .eq('summary_id', id)

    if (membershipsError || !Array.isArray(memberships)) {
      throw new Error('Current Summary Package memberships could not be loaded safely.')
    }

    // Load every membership row, including secondary Package memberships.
    selectedPackageIds = hydrateCurrentPackageIds(
      'kp_native',
      summary.package_id,
      memberships,
    )
  }

  const { data: packages, error: packagesError } = await supabase
    .from('packages')
    .select('id, name')
    .order('name')

  if (packagesError || !Array.isArray(packages)) {
    throw new Error('Available Packages could not be loaded safely.')
  }
  assertPackageIdsAvailable(
    selectedPackageIds,
    packages.map((pkg: { id?: unknown }) => pkg.id),
  )

  const handleUpdate = async (data: any) => {
    'use server'
    const res = await updateSummary(id, data)
    if (res.success) {
      redirect('/admin/summaries')
    }
    return res
  }

  return (
    <SummaryEditor 
      initialData={summary}
      packages={packages}
      onSubmit={handleUpdate}
      isEditing={true}
      summaryKind={summaryKind}
      selectedPackageIds={selectedPackageIds}
    />
  )
}
