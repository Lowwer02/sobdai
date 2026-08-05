import { notFound } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { getPublishedArticleBySlug } from '@/lib/articles-public'
import ArticleDetail from '@/components/articles/ArticleDetail'

export const revalidate = 300

export default async function ArticleDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const res = await getPublishedArticleBySlug(slug)

  // Query error / unexpected failure
  if (!res.success) {
    return (
      <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto bg-[#1A140E] border border-red-500/30 rounded-2xl p-8 text-center space-y-4 shadow-xl">
          <AlertTriangle className="mx-auto text-red-400" size={48} />
          <h1 className="text-xl font-bold text-red-300">เกิดข้อผิดพลาดในการโหลดบทความ</h1>
          <p className="text-xs sm:text-sm text-red-200/80">
            {res.error || 'ไม่สามารถโหลดข้อมูลบทความได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลัง'}
          </p>
          <div className="pt-2">
            <Link
              href="/articles"
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0F0B07] border border-[#D4AF37]/30 text-[#D4AF37] text-xs font-semibold rounded-lg hover:bg-[#D4AF37]/10 transition-colors"
            >
              <ArrowLeft size={14} /> กลับสู่หน้าบทความทั้งหมด
            </Link>
          </div>
        </div>
      </main>
    )
  }

  // Not found or not published -> 404
  if (!res.data) {
    notFound()
  }

  return (
    <main className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-8 sm:py-12 px-4 sm:px-6 lg:px-8">
      <ArticleDetail article={res.data} />
    </main>
  )
}
