import { requirePermission } from '@/lib/auth/server-protect'
import { notFound } from 'next/navigation'
import NewsEditorClient from '@/components/admin/news/NewsEditorClient'
import type { News } from '@/lib/news'
import type { RelatedItem } from '@/components/admin/news/NewsRelationPicker'

/**
 * Government News — Edit route (Server Component).
 *
 * Mirrors the promotions edit page: permission + RLS-enforced fetch of the full
 * row (select('*') so the editor can pass through fields it doesn't own — see
 * NewsEditorClient), then notFound() if the row is missing or RLS-hidden.
 *
 * Also pre-loads the article's related packages / summaries (the news_packages
 * + news_summaries junctions) so the relation picker has its initial selection
 * on first paint. Joined to packages.name / summaries.title so the picker shows
 * a human label (not just an id). RLS already gates these to the parent being
 * visible to the caller.
 */
export default async function EditNewsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { supabase } = await requirePermission('content.write')
  const { id } = await params

  const { data: article } = await supabase
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!article) notFound()

  // Pre-load related packages + summaries for the picker's initial selection.
  // Joined to the label column so RelatedItem.label is human-readable; ordered
  // by sort_order so the editor opens in the same order visitors see them.
  const [pkgRes, sumRes] = await Promise.all([
    supabase
      .from('news_packages')
      .select(`sort_order, package_id, packages ( slug, name )`)
      .eq('news_id', id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('news_summaries')
      .select(`sort_order, summary_id, summaries ( slug, title )`)
      .eq('news_id', id)
      .order('sort_order', { ascending: true }),
  ])

  const relatedPackages: RelatedItem[] = ((pkgRes.data ?? []) as unknown as {
    package_id: string
    packages: { slug: string | null; name: string | null } | null
  }[])
    .filter(r => r.packages)
    .map(r => ({
      id: r.package_id,
      slug: r.packages!.slug,
      label: r.packages!.name || r.packages!.slug || r.package_id,
    }))

  const relatedSummaries: RelatedItem[] = ((sumRes.data ?? []) as unknown as {
    summary_id: string
    summaries: { slug: string | null; title: string | null } | null
  }[])
    .filter(r => r.summaries)
    .map(r => ({
      id: r.summary_id,
      slug: r.summaries!.slug,
      label: r.summaries!.title || r.summaries!.slug || r.summary_id,
    }))

  return (
    <NewsEditorClient
      article={article as News}
      isEdit
      initialRelatedPackages={relatedPackages}
      initialRelatedSummaries={relatedSummaries}
    />
  )
}
