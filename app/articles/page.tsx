import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileText, SearchX, AlertTriangle, ArrowLeft } from 'lucide-react'
import { createPageMetadata } from '@/lib/seo'
import { getPublishedArticlesList } from '@/lib/articles-public'
import ArticleCard from '@/components/articles/ArticleCard'
import ArticlePagination, { buildArticlePageHref } from '@/components/articles/ArticlePagination'

export const metadata = createPageMetadata({
  title: 'บทความเตรียมสอบราชการ | Sobdai',
  description:
    'รวมบทความ เทคนิคการอ่านหนังสือ คู่มือเตรียมสอบราชการ ก.พ. และข้อควรรู้สำหรับผู้สอบงานราชการทุกสายงาน',
  path: '/articles',
})

const PAGE_SIZE = 9

function parseStrictPage(raw?: string | string[]): number {
  if (typeof raw !== 'string') return 1
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return 1
  const num = Number(trimmed)
  if (!Number.isSafeInteger(num) || num < 1) return 1
  return num
}

function sanitizeSearchInput(raw?: string): string {
  if (!raw) return ''
  return raw.replace(/[,.()'"\[\]\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 100)
}

export default async function ArticlesListPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const page = parseStrictPage(params.page)
  const search = sanitizeSearchInput(typeof params.q === 'string' ? params.q : '')
  const category = typeof params.category === 'string' ? params.category.trim().slice(0, 80) : ''
  const tag = typeof params.tag === 'string' ? params.tag.trim().slice(0, 50) : ''

  const res = await getPublishedArticlesList({
    page,
    limit: PAGE_SIZE,
    search,
    category,
    tag,
  })

  // Normalize invalid page when result contains items but current page exceeds totalPages
  if (res.success && res.totalPages > 0 && page > res.totalPages) {
    redirect(buildArticlePageHref(res.totalPages, search, category, tag))
  }

  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Page Header / Hero */}
        <header className="border-b border-[#D4AF37]/15 pb-6 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#D4AF37] uppercase tracking-wider">
            <FileText size={16} />
            <span>Sobdai Knowledge Hub</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#F5E9D6] tracking-tight">
            บทความเตรียมสอบราชการ
          </h1>

          <p className="text-sm sm:text-base text-[#A1866B] max-w-3xl leading-relaxed">
            รวบรวมบทความน่ารู้ เทคนิคการสอบ คู่มือเตรียมตัวสอบข้าราชการและพนักงานราชการ
            พร้อมข้อมูลอัปเดตเพื่อช่วยให้คุณเตรียมสอบได้อย่างมั่นใจ
          </p>

          {(category || tag || search) && (
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-xs text-[#A1866B]">ตัวกรองปัจจุบัน:</span>
              {category && (
                <span className="px-2.5 py-0.5 text-xs bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-md">
                  หมวดหมู่: {category}
                </span>
              )}
              {tag && (
                <span className="px-2.5 py-0.5 text-xs bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-md">
                  แท็ก: #{tag}
                </span>
              )}
              {search && (
                <span className="px-2.5 py-0.5 text-xs bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/30 rounded-md">
                  ค้นหา: &quot;{search}&quot;
                </span>
              )}
              <Link
                href="/articles"
                className="text-xs text-[#A1866B] hover:text-[#D4AF37] underline ml-1 transition-colors"
              >
                ล้างตัวกรอง
              </Link>
            </div>
          )}
        </header>

        {/* Error State */}
        {!res.success && (
          <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-2xl text-center space-y-3 my-8">
            <AlertTriangle className="mx-auto text-red-400" size={36} />
            <h2 className="text-lg font-bold text-red-300">เกิดข้อผิดพลาดในการโหลดบทความ</h2>
            <p className="text-xs sm:text-sm text-red-200/80 max-w-md mx-auto">
              {res.error || 'ไม่สามารถดึงข้อมูลบทความได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง'}
            </p>
            <div className="pt-2">
              <Link
                href="/articles"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A140E] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
              >
                <ArrowLeft size={14} /> กลับสู่หน้าบทความทั้งหมด
              </Link>
            </div>
          </div>
        )}

        {/* Success States */}
        {res.success && res.data.length === 0 && (
          <div className="bg-[#1A140E] border border-[#D4AF37]/15 rounded-2xl p-8 sm:p-12 text-center space-y-4 my-8 max-w-xl mx-auto">
            <SearchX className="mx-auto text-[#D4AF37]/40" size={48} />
            <h2 className="text-lg sm:text-xl font-bold text-[#F5E9D6]">
              ไม่พบบทความที่คุณค้นหา
            </h2>
            <p className="text-xs sm:text-sm text-[#A1866B]">
              ลองเปลี่ยนคำค้นหา หรือล้างตัวกรองเพื่อดูบทความทั้งหมดในระบบ
            </p>
            <div className="pt-2">
              <Link
                href="/articles"
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#D4AF37] text-[#0F0B07] text-xs font-bold rounded-lg hover:bg-[#D4AF37]/90 transition-colors shadow-md"
              >
                ดูบทความทั้งหมด
              </Link>
            </div>
          </div>
        )}

        {res.success && res.data.length > 0 && (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[#D4AF37]/10 gap-6 sm:gap-8">
              {res.data.map((article, idx) => (
                <ArticleCard key={article.id} article={article} index={idx} />
              ))}
            </div>

            <ArticlePagination
              currentPage={res.currentPage}
              totalPages={res.totalPages}
              category={category}
              tag={tag}
              search={search}
            />
          </div>
        )}
      </div>
    </main>
  )
}
