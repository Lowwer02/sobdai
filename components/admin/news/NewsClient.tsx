'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import {
  Plus,
  Search,
  Edit,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  Archive,
  RotateCcw,
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import { publishNews, archiveNews, restoreNews, deleteNews } from '@/app/admin/news/actions'
import { NEWS_STATUSES, type News, type NewsStatus } from '@/lib/news'

interface NewsClientProps {
  news: News[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
  categoryFilter: string
  categories: string[]
}

// Same badge palette as the promotions list for visual consistency.
const STATUS_STYLES: Record<NewsStatus, string> = {
  draft: 'bg-[#A1866B]/10 text-[#A1866B] border-[#A1866B]/30',
  published: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30',
  archived: 'bg-white/5 text-[#A1866B] border-white/10',
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return '—'
  }
}

export default function NewsClient({
  news,
  totalPages,
  currentPage,
  search,
  statusFilter,
  categoryFilter,
  categories,
}: NewsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; article: News | null }>({
    isOpen: false,
    article: null,
  })

  // URL is the single source of truth for filters. Any non-page change resets
  // to page 1 so a filtered view never lands on an out-of-range page.
  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(window.location.search)
      Object.entries(updates).forEach(([key, value]) => {
        if (value) params.set(key, value)
        else params.delete(key)
      })
      if (!updates.page) params.set('page', '1')
      startTransition(() => router.push(`${pathname}?${params.toString()}`))
    },
    [pathname, router]
  )

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  // News splits lifecycle into dedicated actions (publish/archive/restore),
  // unlike promotions' single setPromotionStatusAction.
  const runLifecycle = (
    id: string,
    fn: (id: string) => Promise<{ success: boolean; error?: string }>,
    okMsg: string
  ) => {
    setActingOnId(id)
    startTransition(async () => {
      const res = await fn(id)
      if (res.success) toastEvent(okMsg, 'success')
      else toastEvent(res.error || 'ดำเนินการไม่สำเร็จ', 'error')
      setActingOnId(null)
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal.article) return
    const target = deleteModal.article
    setActingOnId(target.id)
    startTransition(async () => {
      const res = await deleteNews(target.id)
      if (res.success) {
        toastEvent('ลบข่าวแล้ว')
        setDeleteModal({ isOpen: false, article: null })
      } else {
        // deleteNews refuses ever-published rows without a redirect; surface
        // that link-equity error verbatim.
        toastEvent(res.error || 'ลบไม่สำเร็จ', 'error')
      }
      setActingOnId(null)
    })
  }

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">News</h1>
          <p className="text-[#A1866B] mt-1">จัดการข่าวสารและประกาศจากหน่วยงานราชการ</p>
        </div>
        <Link
          href="/admin/news/create"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors w-fit"
        >
          <Plus size={18} /> สร้างข่าว
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="ค้นหาจากชื่อเรื่อง คำโปรย หรือ slug..."
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
          />
        </form>
        <select
          value={statusFilter}
          onChange={e => updateParams({ status: e.target.value })}
          className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          {NEWS_STATUSES.map(s => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={e => updateParams({ category: e.target.value })}
          className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Categories</option>
          {categories.map(c => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[#A1866B] text-xs uppercase tracking-wider">
                <th className="text-left p-4 font-semibold">Title</th>
                <th className="text-left p-4 font-semibold">Category</th>
                <th className="text-left p-4 font-semibold">Status</th>
                <th className="text-left p-4 font-semibold">Published</th>
                <th className="text-left p-4 font-semibold">Updated</th>
                <th className="text-right p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {news.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-[#A1866B]">
                    ยังไม่มีข่าว — กด &quot;สร้างข่าว&quot; เพื่อเริ่ม
                  </td>
                </tr>
              ) : (
                news.map(article => {
                  const acting = isPending && actingOnId === article.id
                  return (
                    <tr
                      key={article.id}
                      className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(212,175,55,0.03)] transition-colors"
                    >
                      <td className="p-4 max-w-[320px]">
                        <div className="text-[#F5E9D6] font-medium truncate">{article.title}</div>
                        {article.excerpt && (
                          <div className="text-xs text-[#A1866B] truncate">{article.excerpt}</div>
                        )}
                      </td>
                      <td className="p-4">
                        {article.category ? (
                          <span className="text-xs text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] px-2 py-1 rounded-md whitespace-nowrap">
                            {article.category}
                          </span>
                        ) : (
                          <span className="text-xs text-[#A1866B]/50">—</span>
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[article.status]}`}
                        >
                          {article.status}
                        </span>
                      </td>
                      <td className="p-4 text-[#A1866B] whitespace-nowrap">
                        {fmtDate(article.published_at)}
                      </td>
                      <td className="p-4 text-[#A1866B] whitespace-nowrap">
                        {fmtDate(article.updated_at)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          {/* Contextual lifecycle actions (News has no unpublish→draft;
                              archive is the path off the public site). */}
                          {article.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(article.id, publishNews, 'เผยแพร่แล้ว')
                              }
                              disabled={acting}
                              title="เผยแพร่"
                              className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {acting ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Send size={16} />
                              )}
                            </button>
                          )}
                          {article.status === 'archived' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(article.id, restoreNews, 'กู้คืนและเผยแพร่แล้ว')
                              }
                              disabled={acting}
                              title="กู้คืนเพื่อเผยแพร่"
                              className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {acting ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RotateCcw size={16} />
                              )}
                            </button>
                          )}
                          {article.status !== 'archived' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(article.id, archiveNews, 'ย้ายไปคลังเก็บแล้ว')
                              }
                              disabled={acting}
                              title="ย้ายไปคลังเก็บ"
                              className="p-2 text-[#A1866B] hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Archive size={16} />
                            </button>
                          )}
                          <Link
                            href={`/admin/news/${article.id}/edit`}
                            className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit size={16} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteModal({ isOpen: true, article })}
                            title="ลบ"
                            className="p-2 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => updateParams({ page: String(Math.max(1, currentPage - 1)) })}
            disabled={currentPage <= 1 || isPending}
            className="p-2 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] disabled:opacity-40"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-sm text-[#A1866B] px-3">
            หน้า {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => updateParams({ page: String(Math.min(totalPages, currentPage + 1)) })}
            disabled={currentPage >= totalPages || isPending}
            className="p-2 rounded-lg bg-[#1A140E] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] disabled:opacity-40"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, article: null })}
        onConfirm={confirmDelete}
        title="ลบข่าว"
        description={
          <>
            คุณแน่ใจหรือไม่? จะลบ{' '}
            <span className="font-bold text-[#D4AF37]">{deleteModal.article?.title}</span>{' '}
            ออกจากระบบอย่างถาวร
          </>
        }
        confirmText="ลบ"
        cancelText="ยกเลิก"
        isDestructive
        isLoading={isPending && actingOnId === deleteModal.article?.id}
      />
    </div>
  )
}
