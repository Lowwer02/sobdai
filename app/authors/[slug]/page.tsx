import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, User, FileText, BookOpen } from 'lucide-react'
import {
  getActiveAuthorBySlug,
  getPublishedArticlesByAuthorSlug,
} from '@/lib/articles-public'
import {
  createPageMetadata,
  absoluteUrl,
  SITE_NAME,
} from '@/lib/seo'
import ArticleCard from '@/components/articles/ArticleCard'
import StructuredData from '@/components/StructuredData'

export const revalidate = 300

interface AuthorPageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: AuthorPageProps): Promise<Metadata> {
  const { slug } = await params
  const res = await getActiveAuthorBySlug(slug)

  if (!res.success || !res.data) {
    return createPageMetadata({
      title: `ไม่พบผู้เขียน | ${SITE_NAME}`,
      description: 'ไม่พบข้อมูลผู้เขียนที่คุณต้องการ หรือผู้เขียนยังไม่เปิดใช้งาน',
      path: `/authors/${encodeURIComponent(slug || '')}`,
      noindex: true,
    })
  }

  const author = res.data
  const title = `${author.display_name} | ผู้เขียน ${SITE_NAME}`
  const description =
    author.short_bio ||
    `บทความและคู่มือการเตรียมสอบราชการ เขียนโดย ${author.display_name} บน Sobdai`
  const canonicalPath = `/authors/${author.slug}`

  // Check if author has published articles to decide indexing
  const articlesRes = await getPublishedArticlesByAuthorSlug(slug, { limit: 1 })
  const hasPublishedArticles = articlesRes.success && articlesRes.count > 0

  return createPageMetadata({
    title,
    description,
    path: canonicalPath,
    ...(author.avatar_url ? { image: author.avatar_url } : {}),
    noindex: !hasPublishedArticles,
  })
}

export default async function AuthorProfilePage({ params }: AuthorPageProps) {
  const { slug } = await params

  const [authorRes, articlesRes] = await Promise.all([
    getActiveAuthorBySlug(slug),
    getPublishedArticlesByAuthorSlug(slug, { limit: 50 }),
  ])

  if (!authorRes.success || !authorRes.data) {
    notFound()
  }

  const author = authorRes.data
  const articles = articlesRes.success ? articlesRes.data : []
  const count = articlesRes.success ? articlesRes.count : 0

  const canonicalUrl = absoluteUrl(`/authors/${author.slug}`)

  const profileJsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: author.display_name,
      url: canonicalUrl,
      ...(author.role_title ? { jobTitle: author.role_title } : {}),
      ...(author.short_bio ? { description: author.short_bio } : {}),
      ...(author.avatar_url ? { image: absoluteUrl(author.avatar_url) } : {}),
    },
  }

  return (
    <main className="min-h-screen bg-background text-foreground py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <StructuredData data={profileJsonLd} />

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Back Link */}
        <div>
          <Link
            href="/articles"
            className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground hover:text-brand transition-colors focus:outline-none focus:ring-2 focus:ring-brand rounded-md p-1 -ml-1"
          >
            <ArrowLeft size={16} />
            <span>กลับสู่บทความทั้งหมด</span>
          </Link>
        </div>

        {/* Author Bio Header Card */}
        <header className="bg-card border border-brand/20 rounded-2xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
            {/* Avatar */}
            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-wash border-2 border-brand/40 flex items-center justify-center shrink-0 text-brand font-extrabold text-3xl overflow-hidden shadow-lg">
              {author.avatar_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={author.avatar_url}
                  alt={author.display_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                author.display_name.charAt(0).toUpperCase()
              )}
            </div>

            {/* Details */}
            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
                  {author.display_name}
                </h1>
                {author.role_title && (
                  <span className="inline-block px-3 py-0.5 text-xs font-semibold bg-wash border border-brand/30 text-brand rounded-full">
                    {author.role_title}
                  </span>
                )}
              </div>

              {author.short_bio ? (
                <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-3xl">
                  {author.short_bio}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  ผู้เขียนและผู้จัดทำเนื้อหาการเรียนรู้สำหรับเตรียมสอบราชการบน Sobdai
                </p>
              )}

              <div className="flex items-center justify-center sm:justify-start gap-4 text-xs text-muted-foreground pt-1">
                <span className="flex items-center gap-1.5">
                  <BookOpen size={14} className="text-brand" />
                  <span>ผลงานบทความ: <strong>{count}</strong> บทความ</span>
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* Authored Articles Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-border-subtle pb-4">
            <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center gap-2">
              <FileText className="text-brand" size={20} />
              บทความโดย {author.display_name}
            </h2>
            <span className="text-xs text-muted-foreground">
              ทั้งหมด {count} บทความ
            </span>
          </div>

          {articles.length === 0 ? (
            <div className="bg-card/50 border border-border-subtle rounded-xl p-12 text-center text-muted-foreground space-y-2">
              <FileText size={36} className="mx-auto text-brand/40 mb-2" />
              <p className="text-base font-semibold text-foreground">ยังไม่มีบทความที่เผยแพร่</p>
              <p className="text-xs">
                ผู้เขียนท่านนี้ยังไม่มีบทความที่เผยแพร่สู่สาธารณะในขณะนี้
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map((item) => (
                <ArticleCard key={item.id} article={item} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
