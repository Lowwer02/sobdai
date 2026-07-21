import { createClient } from '@/lib/supabase/server'
import { ORDER_COMPLETED_STATUSES } from '@/lib/orderUtils'
import PackageClient from './PackageClient'
import { notFound } from 'next/navigation'
import { getPackagePublicCounts } from '@/lib/publicData'
import { applyContentOrdering } from '@/lib/contentOrdering'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { Suspense } from 'react'

interface PageProps {
  params: Promise<{ slug: string }>
}

export default async function PackagePage({ params }: PageProps) {
  const { slug } = await params

  const supabase = await createClient()

  // Fetch package + current user in parallel (independent of each other).
  // exam_sets is fetched as a SEPARATE ordered query (below) rather than as a
  // nested relation, because a nested relation cannot carry a multi-column
  // ORDER BY from the parent query — and Smart Content Ordering must be done
  // at the DB level only (no client-side sort).
  const [pkgResult, userResult] = await Promise.all([
    supabase
      .from('packages')
      .select(`
        *,
        organizations(name, logo_url),
        positions(name)
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
  const [countsMap, draftProfile, summaries, examSets, order, homepageSettings] = await Promise.all([
    getPackagePublicCounts([pkg.id]),
    // Only need a profile lookup if the package is an unpublished draft
    pkg.is_published
      ? Promise.resolve(null)
      : user
        ? supabase.from('profiles').select('role').eq('id', user.id).single()
        : Promise.resolve({ data: null }),
    // Smart Content Ordering (DB-side): display_order → released_at → updated_at → created_at
    applyContentOrdering(
      supabase
        .from('summaries')
        .select('id, title, slug, subject, topic, read_time_minutes, updated_at, is_published')
        .eq('package_id', pkg.id)
        .eq('is_published', true)
    ),
    // exam_sets with the same ordering chain, DB-side.
    // Only show published exam sets to end users (status filter mirrors summaries).
    applyContentOrdering(
      supabase
        .from('exam_sets')
        .select('id, name, description, duration_minutes, is_sample, sort_order, display_order')
        .eq('package_id', pkg.id)
        .eq('status', 'published')
    ),
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
    // Homepage settings (ISR-cached anon read) to get supportConfig.
    // Runs in the same parallel batch — no extra sequential round-trip.
    getHomepageSettings(),
  ])

  // Apply counts
  const pkgCounts = (countsMap as Record<string, any>)[pkg.id]
  pkg.total_questions = pkgCounts?.total_questions || 0
  pkg.total_exam_sets = pkgCounts?.total_exam_sets || 0
  const examSetsData = (examSets as any)?.data || []
  // Attach per-set question counts (from the RPC) onto the ordered list.
  examSetsData.forEach((es: any) => {
    es.qCount = pkgCounts?.exam_set_counts?.[es.id] || 0
  })

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
  const supportConfig = homepageSettings.support

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PackageClient pkg={pkg} examSets={examSetsData} summaries={summaries?.data || []} isPurchased={isPurchased} supportConfig={supportConfig} />
    </Suspense>
  )
}
