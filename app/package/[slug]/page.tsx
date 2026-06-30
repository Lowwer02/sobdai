import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
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
  
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
  )

  const { data: pkg, error } = await supabase
    .from('packages')
    .select(`
      *,
      organizations(name, logo_url),
      positions(name),
      exam_sets(
        *
      )
    `)
    .eq('slug', slug)
    .single()
  
  if (error || !pkg) {
    notFound()
  }

  // Calculate actual published question counts using public helper (bypassing RLS)
  const countsMap = await getPackagePublicCounts([pkg.id])
  const pkgCounts = countsMap[pkg.id]

  pkg.total_questions = pkgCounts?.total_questions || 0
  pkg.total_exam_sets = pkgCounts?.total_exam_sets || 0

  if (pkg.exam_sets) {
    pkg.exam_sets.forEach((es: any) => {
      es.qCount = pkgCounts?.exam_set_counts?.[es.id] || 0
    })
  }

  const { data: { user } } = await supabase.auth.getUser()

  if (!pkg.is_published) {
    let canViewDraft = false
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (profile && (profile.role === 'admin' || profile.role === 'owner')) {
        canViewDraft = true
      }
    }
    if (!canViewDraft) {
      notFound()
    }
  }

  // Fetch Summaries
  const { data: summaries } = await supabase
    .from('summaries')
    .select('id, title, slug, subject, topic, read_time_minutes, updated_at, is_published')
    .eq('package_id', pkg.id)
    .eq('is_published', true)
    .order('sort_order', { ascending: true })

  // Purchase check
  let isPurchased = false
  if (user) {
    const { data: order } = await supabase
      .from('orders')
      .select('id')
      .eq('user_id', user.id)
      .eq('package_id', pkg.id)
      .in('status', ORDER_COMPLETED_STATUSES)
      .maybeSingle()
    if (order) isPurchased = true
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PackageClient pkg={pkg} examSets={pkg.exam_sets || []} summaries={summaries || []} isPurchased={isPurchased} />
    </Suspense>
  )
}
