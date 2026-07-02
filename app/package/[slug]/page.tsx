import { createClient } from '@/lib/supabase/server'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import PackageClient from './PackageClient'
import { notFound } from 'next/navigation'
import { getPackagePublicCounts } from '@/lib/publicData'
import { Suspense } from 'react'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PackagePage({ params }: PageProps) {
  const { slug } = await params

  const supabase = await createClient()

  // Fetch package + current user in parallel (independent of each other).
  // Published counts depend on the package id, so they run in the next batch.
  const [pkgResult, userResult] = await Promise.all([
    supabase
      .from('packages')
      .select(`
        *,
        organizations(name, logo_url),
        positions(name),
        exam_sets(*)
      `)
      .eq('slug', slug)
      .single(),
    supabase.auth.getUser(),
  ])

  const pkg = pkgResult.data
  if (pkgResult.error || !pkg) {
    notFound()
  }

  // Now that we have the package id + user, run the dependent queries in parallel.
  const user = userResult.data.user
  const [countsMap, draftProfile, summaries, order] = await Promise.all([
    getPackagePublicCounts([pkg.id]),
    // Only need a profile lookup if the package is an unpublished draft
    pkg.is_published
      ? Promise.resolve(null)
      : user
        ? supabase.from('profiles').select('role').eq('id', user.id).single()
        : Promise.resolve({ data: null }),
    supabase
      .from('summaries')
      .select('id, title, slug, subject, topic, read_time_minutes, updated_at, is_published')
      .eq('package_id', pkg.id)
      .eq('is_published', true)
      .order('sort_order', { ascending: true }),
    // Purchase check only matters for logged-in users
    user
      ? supabase
          .from('orders')
          .select('id')
          .eq('user_id', user.id)
          .eq('package_id', pkg.id)
          .in('status', ORDER_COMPLETED_STATUSES)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Apply counts
  const pkgCounts = (countsMap as Record<string, any>)[pkg.id]
  pkg.total_questions = pkgCounts?.total_questions || 0
  pkg.total_exam_sets = pkgCounts?.total_exam_sets || 0
  if (pkg.exam_sets) {
    pkg.exam_sets.forEach((es: any) => {
      es.qCount = pkgCounts?.exam_set_counts?.[es.id] || 0
    })
  }

  // Draft visibility check
  if (!pkg.is_published) {
    const profile = (draftProfile as any)?.data
    const canViewDraft =
      profile && (profile.role === 'admin' || profile.role === 'owner')
    if (!canViewDraft) {
      notFound()
    }
  }

  const isPurchased = Boolean((order as any)?.data)

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PackageClient pkg={pkg} examSets={pkg.exam_sets || []} summaries={summaries?.data || []} isPurchased={isPurchased} />
    </Suspense>
  )
}
