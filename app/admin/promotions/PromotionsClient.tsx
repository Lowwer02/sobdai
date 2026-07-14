'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useTransition, useCallback } from 'react'
import { Plus, Search, Edit, Trash2, ChevronLeft, ChevronRight, Loader2, Send, Archive, FileEdit } from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import { setPromotionStatusAction, deletePromotionAction } from './actions'
import { PROMOTION_TYPES, type Promotion, type PromotionStatus } from '@/lib/promotions'

interface PromotionsClientProps {
  promotions: Promotion[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
  typeFilter: string
}

const STATUS_STYLES: Record<PromotionStatus, string> = {
  draft: 'bg-[#A1866B]/10 text-[#A1866B] border-[#A1866B]/30',
  published: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30',
  archived: 'bg-white/5 text-[#A1866B] border-white/10',
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return '—'
  }
}

export default function PromotionsClient({
  promotions,
  totalPages,
  currentPage,
  search,
  statusFilter,
  typeFilter,
}: PromotionsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean; promo: Promotion | null }>({ isOpen: false, promo: null })

  const updateParams = useCallback((updates: Record<string, string>) => {
    const params = new URLSearchParams(window.location.search)
    Object.entries(updates).forEach(([key, value]) => {
      if (value) params.set(key, value)
      else params.delete(key)
    })
    if (!updates.page) params.set('page', '1')
    startTransition(() => router.push(`${pathname}?${params.toString()}`))
  }, [pathname, router])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateParams({ q: searchInput })
  }

  const handleStatus = (id: string, status: PromotionStatus) => {
    setActingOnId(id)
    startTransition(async () => {
      const res = await setPromotionStatusAction(id, status)
      if (res.success) {
        toastEvent(status === 'published' ? 'เผยแพร่แล้ว' : status === 'archived' ? 'ย้ายไปคลังเก็บแล้ว' : 'ยกเลิกการเผยแพร่แล้ว', 'success')
      } else {
        toastEvent(res.error || 'ดำเนินการไม่สำเร็จ', 'error')
      }
      setActingOnId(null)
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal.promo) return
    setActingOnId(deleteModal.promo.id)
    startTransition(async () => {
      const res = await deletePromotionAction(deleteModal.promo!.id)
      if (res.success) {
        toastEvent('ลบโปรโมชั่นแล้ว')
        setDeleteModal({ isOpen: false, promo: null })
      } else {
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
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">Promotions</h1>
          <p className="text-[#A1866B] mt-1">จัดการโปรโมชั่นและประกาศ (ยังไม่แสดงบนหน้าเว็บ)</p>
        </div>
        <Link
          href="/admin/promotions/create"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors w-fit"
        >
          <Plus size={18} /> สร้างโปรโมชั่น
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
            placeholder="ค้นหาชื่อหรือ title..."
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
          />
        </form>
        <select
          value={statusFilter}
          onChange={e => updateParams({ status: e.target.value })}
          className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={typeFilter}
          onChange={e => updateParams({ type: e.target.value })}
          className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Types</option>
          {PROMOTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[#A1866B] text-xs uppercase tracking-wider">
                <th className="text-left p-4 font-semibold">Internal Name</th>
                <th className="text-left p-4 font-semibold">Title</th>
                <th className="text-left p-4 font-semibold">Type</th>
                <th className="text-left p-4 font-semibold">Status</th>
                <th className="text-center p-4 font-semibold">Priority</th>
                <th className="text-left p-4 font-semibold">Start</th>
                <th className="text-left p-4 font-semibold">End</th>
                <th className="text-right p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {promotions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#A1866B]">ยังไม่มีโปรโมชั่น — กด &quot;สร้างโปรโมชั่น&quot; เพื่อเริ่ม</td>
                </tr>
              ) : promotions.map(p => (
                <tr key={p.id} className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(212,175,55,0.03)] transition-colors">
                  <td className="p-4">
                    <div className="text-[#F5E9D6] font-medium">{p.internal_name}</div>
                    {!p.active && <span className="text-[10px] text-red-400">ปิดใช้งาน</span>}
                  </td>
                  <td className="p-4 text-[#A1866B] max-w-[200px] truncate">{p.title}</td>
                  <td className="p-4">
                    <span className="text-xs text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] px-2 py-1 rounded-md whitespace-nowrap">{p.type}</span>
                  </td>
                  <td className="p-4">
                    <span className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[p.status]}`}>{p.status}</span>
                  </td>
                  <td className="p-4 text-center text-[#F5E9D6] font-bold">{p.priority}</td>
                  <td className="p-4 text-[#A1866B] whitespace-nowrap">{fmtDate(p.start_at)}</td>
                  <td className="p-4 text-[#A1866B] whitespace-nowrap">{fmtDate(p.end_at)}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-end gap-1">
                      {/* Status actions */}
                      {p.status !== 'published' && (
                        <button
                          type="button"
                          onClick={() => handleStatus(p.id, 'published')}
                          disabled={isPending && actingOnId === p.id}
                          title="เผยแพร่"
                          className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isPending && actingOnId === p.id ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                        </button>
                      )}
                      {p.status === 'published' && (
                        <button
                          type="button"
                          onClick={() => handleStatus(p.id, 'draft')}
                          disabled={isPending && actingOnId === p.id}
                          title="ยกเลิกการเผยแพร่"
                          className="p-2 text-[#A1866B] hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isPending && actingOnId === p.id ? <Loader2 size={16} className="animate-spin" /> : <FileEdit size={16} />}
                        </button>
                      )}
                      {p.status !== 'archived' && (
                        <button
                          type="button"
                          onClick={() => handleStatus(p.id, 'archived')}
                          disabled={isPending && actingOnId === p.id}
                          title="ย้ายไปคลังเก็บ"
                          className="p-2 text-[#A1866B] hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Archive size={16} />
                        </button>
                      )}
                      <Link href={`/admin/promotions/${p.id}/edit`} className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors" title="แก้ไข">
                        <Edit size={16} />
                      </Link>
                      <button
                        type="button"
                        onClick={() => setDeleteModal({ isOpen: true, promo: p })}
                        title="ลบ"
                        className="p-2 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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
          <span className="text-sm text-[#A1866B] px-3">หน้า {currentPage} / {totalPages}</span>
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
        onClose={() => setDeleteModal({ isOpen: false, promo: null })}
        onConfirm={confirmDelete}
        title="ลบโปรโมชั่น"
        description={<>คุณแน่ใจหรือไม่? จะลบ <span className="font-bold text-[#D4AF37]">{deleteModal.promo?.internal_name}</span> ออกจากระบบอย่างถาวร</>}
        confirmText="ลบ"
        cancelText="ยกเลิก"
        isDestructive
        isLoading={isPending && actingOnId === deleteModal.promo?.id}
      />
    </div>
  )
}
