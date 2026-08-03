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
  FileText,
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import { publishArticle, archiveArticle, restoreArticle, deleteArticle } from '@/app/admin/articles/actions'
import { ARTICLE_STATUSES, type Article, type ArticleStatus } from '@/lib/articles'

interface ArticlesClientProps {
  articles: Article[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
  categoryFilter: string
  categories: string[]
}

const STATUS_STYLES: Record<ArticleStatus, string> = {
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

export default function ArticlesClient({
  articles,
  totalPages,
  currentPage,
  search,
  statusFilter,
  categoryFilter,
  categories,
}: ArticlesClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; article: Article | null }>({
    isOpen: false,
    article: null,
  })
  const [actionModal, setActionModal] = useState<{
    type: 'publish' | 'archive' | 'restore' | null
    article: Article | null
  }>({ type: null, article: null })

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

  const runLifecycle = (
    id: string,
    fn: (id: string) => Promise<{ success: boolean; error?: string }>,
    okMsg: string
  ) => {
    setActingOnId(id)
    startTransition(async () => {
      const res = await fn(id)
      setActingOnId(null)
      setActionModal({ type: null, article: null })
      if (!res.success) {
        toastEvent(res.error || 'เกิดข้อผิดพลาดในการทำรายการ', 'error')
      } else {
        toastEvent(okMsg, 'success')
        router.refresh()
      }
    })
  }

  const handleDelete = async () => {
    if (!deleteModal.article) return
    const id = deleteModal.article.id
    setActingOnId(id)
    startTransition(async () => {
      const res = await deleteArticle(id)
      setActingOnId(null)
      setDeleteModal({ isOpen: false, article: null })
      if (!res.success) {
        toastEvent(res.error || 'ลบไม่สำเร็จ', 'error')
      } else {
        toastEvent('ลบบทความเรียบร้อยแล้ว', 'success')
        router.refresh()
      }
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-[#F5E9D6] flex items-center gap-3">
            <FileText className="text-[#D4AF37]" size={28} />
            จัดการบทความคู่มือ (Articles)
          </h1>
          <p className="text-sm text-[#A1866B] mt-1">
            บทความความรู้เอเวอร์กรีน คู่มือสอบราชการ และคำแนะนำสำหรับการสอบ
          </p>
        </div>
        <Link
          href="/admin/articles/create"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#D4AF37] hover:bg-[#D4AF37]/90 text-[#0F0B07] font-semibold rounded-lg transition-all shadow-md shadow-[#D4AF37]/10"
        >
          <Plus size={18} />
          สร้างบทความใหม่
        </Link>
      </div>

      {/* Search & Filters */}
      <div className="bg-[#1A140E] p-4 rounded-xl border border-[#D4AF37]/20 flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
        <form onSubmit={handleSearchSubmit} className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={18} />
          <input
            type="text"
            placeholder="ค้นหาชื่อบทความ หรือ Slug..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg pl-10 pr-4 py-2 text-sm text-[#F5E9D6] placeholder-[#A1866B]/50 focus:outline-none focus:border-[#D4AF37]"
          />
        </form>

        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => updateParams({ status: e.target.value })}
            className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
          >
            <option value="">ทุกสถานะ</option>
            {ARTICLE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {/* Category Filter */}
          {categories.length > 0 && (
            <select
              value={categoryFilter}
              onChange={(e) => updateParams({ category: e.target.value })}
              className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg px-3 py-2 text-sm text-[#F5E9D6] focus:outline-none focus:border-[#D4AF37]"
            >
              <option value="">ทุกหมวดหมู่</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Table / List */}
      <div className="bg-[#1A140E] rounded-xl border border-[#D4AF37]/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-[#F5E9D6]">
            <thead className="bg-[#0F0B07] border-b border-[#D4AF37]/20 text-xs font-semibold text-[#A1866B] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">หัวข้อบทความ / Slug</th>
                <th className="px-6 py-4">หมวดหมู่</th>
                <th className="px-6 py-4">สถานะ</th>
                <th className="px-6 py-4">เผยแพร่เมื่อ</th>
                <th className="px-6 py-4">แก้ไขล่าสุด</th>
                <th className="px-6 py-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D4AF37]/10">
              {articles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-[#A1866B]">
                    ไม่พบข้อมูลบทความ
                  </td>
                </tr>
              ) : (
                articles.map((item) => {
                  const isThisActing = actingOnId === item.id
                  const isAnyBusy = actingOnId !== null
                  return (
                    <tr key={item.id} className="hover:bg-[#D4AF37]/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-[#F5E9D6] line-clamp-1">{item.title}</div>
                        <div className="text-xs text-[#A1866B] font-mono line-clamp-1">/{item.slug}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-block px-2.5 py-1 text-xs rounded-full bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20">
                          {item.category || 'ไม่ระบุ'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-block px-2.5 py-1 text-xs rounded-full border capitalize ${
                            STATUS_STYLES[item.status] || STATUS_STYLES.draft
                          }`}
                        >
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-[#A1866B]">{fmtDate(item.published_at)}</td>
                      <td className="px-6 py-4 text-xs text-[#A1866B]">{fmtDate(item.updated_at)}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/articles/${item.id}/edit`}
                            className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit size={16} />
                          </Link>

                          {item.status === 'draft' && (
                            <button
                              onClick={() => setActionModal({ type: 'publish', article: item })}
                              disabled={isAnyBusy}
                              className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                              title="เผยแพร่"
                            >
                              {isThisActing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                            </button>
                          )}

                          {item.status === 'published' && (
                            <button
                              onClick={() => setActionModal({ type: 'archive', article: item })}
                              disabled={isAnyBusy}
                              className="p-2 text-[#A1866B] hover:text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
                              title="จัดเก็บถาวร (Archive)"
                            >
                              {isThisActing ? <Loader2 size={16} className="animate-spin" /> : <Archive size={16} />}
                            </button>
                          )}

                          {item.status === 'archived' && (
                            <button
                              onClick={() => setActionModal({ type: 'restore', article: item })}
                              disabled={isAnyBusy}
                              className="p-2 text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors disabled:opacity-50"
                              title="กู้คืนเป็น Draft"
                            >
                              {isThisActing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                            </button>
                          )}

                          <button
                            onClick={() => setDeleteModal({ isOpen: true, article: item })}
                            disabled={isAnyBusy || item.status === 'published'}
                            className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
                            title={item.status === 'published' ? 'ต้องจัดเก็บ (Archive) ก่อนทำการลบ' : 'ลบ'}
                          >
                            {isThisActing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
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

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#D4AF37]/20 flex items-center justify-between">
            <span className="text-xs text-[#A1866B]">
              หน้า {currentPage} จาก {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage <= 1 || isPending}
                onClick={() => updateParams({ page: String(currentPage - 1) })}
                className="p-2 bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg text-[#F5E9D6] hover:border-[#D4AF37] disabled:opacity-50"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                disabled={currentPage >= totalPages || isPending}
                onClick={() => updateParams({ page: String(currentPage + 1) })}
                className="p-2 bg-[#0F0B07] border border-[#D4AF37]/20 rounded-lg text-[#F5E9D6] hover:border-[#D4AF37] disabled:opacity-50"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirm Action Modals */}
      {actionModal.type && actionModal.article && (
        <ConfirmDialog
          isOpen={true}
          onClose={() => setActionModal({ type: null, article: null })}
          onConfirm={() => {
            if (actionModal.type === 'publish') {
              runLifecycle(actionModal.article!.id, publishArticle, 'เผยแพร่บทความสำเร็จ')
            } else if (actionModal.type === 'archive') {
              runLifecycle(actionModal.article!.id, archiveArticle, 'จัดเก็บบทความสำเร็จ')
            } else if (actionModal.type === 'restore') {
              runLifecycle(actionModal.article!.id, restoreArticle, 'กู้คืนบทความสู่สถานะ Draft สำเร็จ')
            }
          }}
          title={
            actionModal.type === 'publish'
              ? 'ยืนยันการเผยแพร่บทความ'
              : actionModal.type === 'archive'
              ? 'ยืนยันการจัดเก็บบทความ (Archive)'
              : 'ยืนยันการกู้คืนเป็น Draft'
          }
          description={`คุณต้องการเปลี่ยนสถานะของบทความ "${actionModal.article.title}" ใช่หรือไม่?`}
          confirmText={
            actionModal.type === 'publish'
              ? 'เผยแพร่'
              : actionModal.type === 'archive'
              ? 'จัดเก็บ'
              : 'กู้คืน'
          }
        />
      )}

      {/* Delete Modal */}
      <ConfirmDialog
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal({ isOpen: false, article: null })}
        onConfirm={handleDelete}
        title="ยืนยันการลบบทความ"
        description={`คุณแน่ใจหรือไม่ว่าต้องการลบบทความ "${deleteModal.article?.title}" การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
        confirmText="ลบบทความ"
        isDestructive={true}
      />
    </div>
  )
}
