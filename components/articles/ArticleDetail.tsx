import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Calendar, Clock, RefreshCw, Tag as TagIcon, FileText, User } from 'lucide-react'
import type { PublicArticleDetail } from '@/lib/articles-public'
import { calculateReadingTime } from '@/lib/articles'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import ArticleReferences from '@/components/articles/ArticleReferences'
import ArticleAuthorCard from '@/components/articles/ArticleAuthorCard'
import AdSenseUnit from '@/components/adsense/AdSenseUnit'
import { getAdsenseDetailConfig, type AdsenseDetailConfig } from '@/lib/adsense'

interface ArticleDetailProps {
  article: PublicArticleDetail
}

function formatDate(s?: string | null): string {
  if (!s || typeof s !== 'string') return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return ''
  }
}

function isDifferentDate(pub?: string | null, upd?: string | null): boolean {
  if (!pub || !upd) return false
  const d1 = new Date(pub).getTime()
  const d2 = new Date(upd).getTime()
  if (Number.isNaN(d1) || Number.isNaN(d2)) return false
  return Math.abs(d2 - d1) > 60_000
}

export default function ArticleDetail({ article }: ArticleDetailProps) {
  const publishedDateStr = formatDate(article.published_at)
  const updatedDateStr = formatDate(article.updated_at)
  const showUpdated = isDifferentDate(article.published_at, article.updated_at) && Boolean(updatedDateStr)
  const readingTime = calculateReadingTime(article.body_markdown || '')
  const altText = article.cover_image_alt || article.title
  // AdSense Conservative (M3): ONE manual display unit at the stable
  // editorial break right after the body box. The structured references +
  // tags that follow keep the ad separated from the affiliate rail / related
  // flow in document order (no mid-article Markdown slicing — the renderer
  // has no AST insertion point, and M3 explicitly excludes a renderer
  // refactor). Renders nothing without content opt-in + platform config.
  const detailAd: AdsenseDetailConfig | null = article.adsense_enabled
    ? getAdsenseDetailConfig()
    : null

  return (
    <article className="max-w-4xl mx-auto space-y-8 overflow-hidden break-words">
      {/* Back link */}
      <div>
        <Link
          href="/articles"
          className="inline-flex items-center gap-2 text-xs sm:text-sm text-[#A1866B] hover:text-[#D4AF37] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded-md p-1 -ml-1"
        >
          <ArrowLeft size={16} />
          <span>กลับสู่บทความทั้งหมด</span>
        </Link>
      </div>

      {/* Header section */}
      <header className="space-y-4 border-b border-[#D4AF37]/15 pb-6">
        {article.category && (
          <div>
            <span className="inline-block px-3 py-1 text-xs font-semibold bg-[#D4AF37]/10 border border-[#D4AF37]/30 text-[#D4AF37] rounded-md max-w-full truncate">
              {article.category}
            </span>
          </div>
        )}

        <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F5E9D6] tracking-tight leading-tight">
          {article.title}
        </h1>

        {article.excerpt && (
          <p className="text-sm sm:text-lg text-[#A1866B] leading-relaxed">
            {article.excerpt}
          </p>
        )}

        {/* Top Metadata row */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs sm:text-sm text-[#A1866B] pt-2">
          {/* Author Byline */}
          {article.author ? (
            <div className="flex items-center gap-1.5">
              <User size={15} className="text-[#D4AF37]" />
              <span>เขียนโดย:</span>
              <Link
                href={`/authors/${article.author.slug}`}
                className="font-medium text-[#F5E9D6] hover:text-[#D4AF37] underline decoration-[#D4AF37]/30 hover:decoration-[#D4AF37] transition-colors"
              >
                {article.author.display_name}
              </Link>
              {article.author.role_title && (
                <span className="text-[#A1866B]/70">· {article.author.role_title}</span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <User size={15} className="text-[#D4AF37]" />
              <span>เขียนโดย:</span>
              <span className="font-medium text-[#F5E9D6]">ทีมบรรณาธิการ Sobdai</span>
            </div>
          )}

          {publishedDateStr && (
            <div className="flex items-center gap-1.5">
              <Calendar size={15} className="text-[#D4AF37]" />
              <time dateTime={article.published_at}>เผยแพร่เมื่อ {publishedDateStr}</time>
            </div>
          )}

          {showUpdated && (
            <div className="flex items-center gap-1.5 text-[#A1866B]/80">
              <RefreshCw size={14} className="text-[#D4AF37]" />
              <time dateTime={article.updated_at}>อัปเดตเมื่อ {updatedDateStr}</time>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Clock size={15} className="text-[#D4AF37]" />
            <span>เวลาอ่านประมาณ {readingTime} นาที</span>
          </div>
        </div>
      </header>

      {/* Cover Image (16:9) */}
      {article.cover_image_url ? (
        <div className="relative aspect-video w-full bg-[#1A140E] border border-[#D4AF37]/20 rounded-2xl overflow-hidden shadow-xl">
          <Image
            src={article.cover_image_url}
            alt={altText}
            fill
            priority
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video w-full bg-gradient-to-br from-[#1A140E] to-[#0F0B07] border border-[#D4AF37]/20 rounded-2xl flex flex-col items-center justify-center text-[#A1866B]/40 p-6">
          <FileText size={48} className="mb-2 text-[#D4AF37]/30" />
          <span className="text-xs font-mono text-[#A1866B]/50">Sobdai Knowledge Hub</span>
        </div>
      )}

      {/* Main Body Markdown */}
      <div className="bg-[#1A140E]/60 border border-[#D4AF37]/15 rounded-2xl p-4 sm:p-8 max-w-full overflow-hidden">
        {article.body_markdown ? (
          <SummaryMarkdown content={article.body_markdown} />
        ) : (
          <p className="text-sm text-[#A1866B] italic">ไม่มีเนื้อหาบทความ</p>
        )}
      </div>

      {/* AdSense unit (M3 Conservative) — the ONE manual display unit, at the
          editorial break after the body box. Renders nothing (and loads no
          AdSense script) without content opt-in + platform config. */}
      {detailAd && <AdSenseUnit clientId={detailAd.clientId} slotId={detailAd.slotId} />}

      {/* Structured Sources / References */}
      {Array.isArray(article.sources) && article.sources.length > 0 && (
        <ArticleReferences sources={article.sources} />
      )}

      {/* NEW Author Bio Card */}
      {article.author && (
        <ArticleAuthorCard author={article.author} />
      )}

      {/* Tags section */}
      {Array.isArray(article.tags) && article.tags.length > 0 && (
        <div className="pt-4 border-t border-[#D4AF37]/15 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-[#A1866B]">
            <TagIcon size={14} className="text-[#D4AF37]" />
            <span>แท็ก:</span>
          </div>
          {article.tags.map((tag) => (
            <Link
              key={tag}
              href={`/articles?tag=${encodeURIComponent(tag)}`}
              className="px-2.5 py-1 text-xs bg-[#1A140E] border border-[#D4AF37]/20 hover:border-[#D4AF37] text-[#F5E9D6] hover:text-[#D4AF37] rounded-lg transition-colors"
            >
              #{tag}
            </Link>
          ))}
        </div>
      )}
    </article>
  )
}
