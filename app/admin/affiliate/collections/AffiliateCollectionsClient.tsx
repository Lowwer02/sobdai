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
  Package,
} from 'lucide-react'
import ConfirmDialog from '@/components/admin/ConfirmDialog'
import { toastEvent } from '@/hooks/useToast'
import {
  publishAffiliateCollection,
  archiveAffiliateCollection,
  restoreAffiliateCollection,
  deleteAffiliateCollection,
} from '@/app/admin/affiliate/actions'
import { AFFILIATE_STATUSES, type AffiliateStatus } from '@/lib/affiliate'

interface AffiliateCollectionsClientProps {
  collections: {
    id: string
    name: string
    status: AffiliateStatus
    product_count: number
    created_at: string
    updated_at: string
  }[]
  totalPages: number
  currentPage: number
  search: string
  statusFilter: string
}

const STATUS_STYLES: Record<AffiliateStatus, string> = {
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

export default function AffiliateCollectionsClient({
  collections,
  totalPages,
  currentPage,
  search,
  statusFilter,
}: AffiliateCollectionsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  const [searchInput, setSearchInput] = useState(search)
  const [actingOnId, setActingOnId] = useState<string | null>(null)
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean
    collection: AffiliateCollectionsClientProps['collections'][number] | null
  }>({ isOpen: false, collection: null })

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
    [pathname, router],
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
      if (res.success) toastEvent(okMsg, 'success')
      else toastEvent(res.error || 'ดำเนินการไม่สำเร็จ', 'error')
      setActingOnId(null)
    })
  }

  const confirmDelete = async () => {
    if (!deleteModal.collection) return
    const target = deleteModal.collection
    setActingOnId(target.id)
    startTransition(async () => {
      const res = await deleteAffiliateCollection(target.id)
      if (res.success) {
        toastEvent('ลบคอลเลกชันแล้ว')
        setDeleteModal({ isOpen: false, collection: null })
      } else {
        toastEvent(res.error || 'ลบไม่สำเร็จ', 'error')
      }
      setActingOnId(null)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/affiliate"
            className="text-[#A1866B] hover:text-[#F5E9D6] inline-flex items-center gap-2 text-sm"
          >
            <Package size={14} /> กลับหน้าสินค้า
          </Link>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight mt-1">
            Affiliate Collections
          </h1>
          <p className="text-[#A1866B] mt-1">ชุดสินค้าพันธมิตรสำหรับใช้กับหน้าข่าวและบทความ</p>
        </div>
        <Link
          href="/admin/affiliate/collections/create"
          className="bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors w-fit"
        >
          <Plus size={18} /> สร้างคอลเลกชัน
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={16} />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="ค้นหาชื่อคอลเลกชัน..."
            className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:border-[#D4AF37]/50"
          />
        </form>
        <select
          value={statusFilter}
          onChange={(e) => updateParams({ status: e.target.value })}
          className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Status</option>
          {AFFILIATE_STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.05)] text-[#A1866B] text-xs uppercase tracking-wider">
                <th className="text-left p-4 font-semibold">Collection</th>
                <th className="text-left p-4 font-semibold">Products</th>
                <th className="text-left p-4 font-semibold">Status</th>
                <th className="text-left p-4 font-semibold">Updated</th>
                <th className="text-right p-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {collections.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-[#A1866B]">
                    ยังไม่มีคอลเลกชัน — กด &quot;สร้างคอลเลกชัน&quot; เพื่อเริ่ม
                  </td>
                </tr>
              ) : (
                collections.map((collection) => {
                  const acting = isPending && actingOnId === collection.id
                  return (
                    <tr
                      key={collection.id}
                      className="border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(212,175,55,0.03)] transition-colors"
                    >
                      <td className="p-4 max-w-[360px]">
                        <div className="text-[#F5E9D6] font-medium truncate">{collection.name}</div>
                      </td>
                      <td className="p-4 text-[#A1866B] whitespace-nowrap">
                        {collection.product_count} รายการ
                      </td>
                      <td className="p-4">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[collection.status]}`}
                        >
                          {collection.status}
                        </span>
                      </td>
                      <td className="p-4 text-[#A1866B] whitespace-nowrap">
                        {fmtDate(collection.updated_at)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          {collection.status === 'draft' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(
                                  collection.id,
                                  publishAffiliateCollection,
                                  'เผยแพร่แล้ว'
                                )
                              }
                              disabled={acting || collection.product_count === 0}
                              title={
                                collection.product_count === 0
                                  ? 'ต้องเลือกอย่างน้อย 1 สินค้าก่อนเผยแพร่'
                                  : 'เผยแพร่'
                              }
                              className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {acting ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <Send size={16} />
                              )}
                            </button>
                          )}
                          {collection.status === 'archived' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(
                                  collection.id,
                                  restoreAffiliateCollection,
                                  'กู้คืนเป็น Draft แล้ว'
                                )
                              }
                              disabled={acting}
                              title="กู้คืนเป็น Draft"
                              className="p-2 text-[#22C55E] hover:bg-[#22C55E]/10 rounded-lg transition-colors disabled:opacity-50"
                            >
                              {acting ? (
                                <Loader2 size={16} className="animate-spin" />
                              ) : (
                                <RotateCcw size={16} />
                              )}
                            </button>
                          )}
                          {collection.status === 'published' && (
                            <button
                              type="button"
                              onClick={() =>
                                runLifecycle(
                                  collection.id,
                                  archiveAffiliateCollection,
                                  'ย้ายไปคลังเก็บแล้ว'
                                )
                              }
                              disabled={acting}
                              title="ย้ายไปคลังเก็บ"
                              className="p-2 text-[#A1866B] hover:bg-white/5 rounded-lg transition-colors disabled:opacity-50"
                            >
                              <Archive size={16} />
                            </button>
                          )}
                          <Link
                            href={`/admin/affiliate/collections/${collection.id}/edit`}
                            className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
                            title="แก้ไข"
                          >
                            <Edit size={16} />
                          </Link>
                          <button
                            type="button"
                            onClick={() => setDeleteModal({ isOpen: true, collection })}
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
        onClose={() => setDeleteModal({ isOpen: false, collection: null })}
        onConfirm={confirmDelete}
        title="ลบคอลเลกชัน"
        description={
          <>
            คุณแน่ใจหรือไม่? จะลบ{' '}
            <span className="font-bold text-[#D4AF37]">{deleteModal.collection?.name}</span>{' '}
            อย่างถาวร — ข่าว/บทความที่อ้างอิงอยู่จะปิดการแสดงสินค้าแนะนำโดยอัตโนมัติ
          </>
        }
        confirmText="ลบ"
        cancelText="ยกเลิก"
        isDestructive
        isLoading={isPending && actingOnId === deleteModal.collection?.id}
      />
    </div>
  )
}
