'use client'

import { useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Loader2,
  Send,
  Archive,
  RotateCcw,
  Search,
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import {
  createAffiliateCollection,
  updateAffiliateCollection,
  updateAffiliateCollectionItems,
  publishAffiliateCollection,
  archiveAffiliateCollection,
  restoreAffiliateCollection,
  listAffiliateProducts,
} from '@/app/admin/affiliate/actions'
import {
  AFFILIATE_MAX_COLLECTION_ITEMS,
  type AffiliateCollection,
} from '@/lib/affiliate'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

/** A product row in the picker (search result or selected item). */
interface PickerProduct {
  id: string
  name: string
  merchant: string
  status: string
}

/**
 * Affiliate collection editor — name + ordered product picker.
 *
 * Mirrors the news editor's relations model: content save (name) and items
 * (ordered full-replace) are separate actions; on submit the name saves FIRST,
 * then items ride alongside. The picker is a search + add list with ↑↓
 * reorder (no drag library) — the list order IS the public rail order, and the
 * rail renders the first 5 published products.
 */
export default function AffiliateCollectionEditorClient({
  collection,
  initialItems,
  isEdit,
}: {
  collection: AffiliateCollection | null
  initialItems: PickerProduct[]
  isEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLifecyclePending, startLifecycleTransition] = useTransition()
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [pendingPublish, setPendingPublish] = useState(false)

  const [name, setName] = useState(collection?.name || '')
  const [selected, setSelected] = useState<PickerProduct[]>(initialItems)

  // Picker search state.
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PickerProduct[]>([])
  const [isSearching, setIsSearching] = useState(false)

  useUnsavedChanges(isDirty)

  const inputClass =
    'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'
  const labelClass = 'text-sm text-[#F5E9D6] font-medium block mb-1.5'

  const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-[#A1866B]/10 text-[#A1866B] border-[#A1866B]/30',
    published: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30',
    archived: 'bg-white/5 text-[#A1866B] border-white/10',
  }

  // Debounced picker search (skips ids already selected).
  useEffect(() => {
    if (!isEdit) return // No parent collection exists until first save.
    const handle = setTimeout(async () => {
      setIsSearching(true)
      try {
        const { data } = await listAffiliateProducts({ q: query, limit: 8 })
        setResults((data ?? []).filter((p: PickerProduct) => !selected.some((s) => s.id === p.id)))
      } finally {
        setIsSearching(false)
      }
    }, 300)
    return () => clearTimeout(handle)
    // `selected` intentionally not a dependency — results refresh on query
    // change; already-selected rows are filtered at render time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, isEdit])

  const addProduct = (p: PickerProduct) => {
    if (selected.length >= AFFILIATE_MAX_COLLECTION_ITEMS) {
      toastEvent(`เลือกสินค้าได้ไม่เกิน ${AFFILIATE_MAX_COLLECTION_ITEMS} รายการ`, 'error')
      return
    }
    setSelected((prev) => [...prev, p])
    setResults((prev) => prev.filter((r) => r.id !== p.id))
    setIsDirty(true)
  }

  const removeProduct = (id: string) => {
    setSelected((prev) => prev.filter((p) => p.id !== id))
    setIsDirty(true)
  }

  const moveProduct = useCallback((index: number, direction: -1 | 1) => {
    setSelected((prev) => {
      const target = index + direction
      if (target < 0 || target >= prev.length) return prev
      const next = [...prev]
      const temp = next[index]
      next[index] = next[target]
      next[target] = temp
      return next
    })
    setIsDirty(true)
  }, [])

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      if (isEdit && collection) {
        const res = await updateAffiliateCollection(collection.id, { name })
        if (!res.success) {
          setError(res.error || 'บันทึกไม่สำเร็จ')
          toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
          return
        }
        // Items ride alongside the content save (news-relations convention);
        // a failure here warns but does not undo the name save.
        const itemsRes = await updateAffiliateCollectionItems(
          collection.id,
          selected.map((p) => p.id)
        )
        if (!itemsRes.success) {
          toastEvent(itemsRes.error || 'บันทึกรายการสินค้าไม่สำเร็จ', 'warning')
        }
        toastEvent('บันทึกเรียบร้อย', 'success')
        setIsDirty(false)
      } else {
        const res = await createAffiliateCollection({ name })
        if (!res.success) {
          setError(res.error || 'สร้างไม่สำเร็จ')
          toastEvent(res.error || 'สร้างไม่สำเร็จ', 'error')
        }
        // Success: createAffiliateCollection redirects internally.
      }
    })
  }

  const requestPublish = () => {
    if (!name.trim()) {
      toastEvent('กรุณาตั้งชื่อคอลเลกชันก่อนเผยแพร่', 'warning')
      return
    }
    if (selected.length === 0) {
      toastEvent('ต้องเลือกอย่างน้อย 1 สินค้าก่อนเผยแพร่', 'warning')
      return
    }
    setPendingPublish(true)
  }

  const confirmPublish = () => {
    startLifecycleTransition(async () => {
      if (!collection) {
        setPendingPublish(false)
        return
      }
      // Persist unsaved edits FIRST so the stored row matches the gate.
      if (isDirty) {
        const saveRes = await updateAffiliateCollection(collection.id, { name })
        if (!saveRes.success) {
          setPendingPublish(false)
          toastEvent(saveRes.error || 'บันทึกไม่สำเร็จ จึงยังเผยแพร่ไม่ได้', 'error')
          return
        }
        const itemsRes = await updateAffiliateCollectionItems(
          collection.id,
          selected.map((p) => p.id)
        )
        if (!itemsRes.success) {
          setPendingPublish(false)
          toastEvent(itemsRes.error || 'บันทึกรายการสินค้าไม่สำเร็จ จึงยังเผยแพร่ไม่ได้', 'error')
          return
        }
        setIsDirty(false)
      }
      const res = await publishAffiliateCollection(collection.id)
      setPendingPublish(false)
      if (!res.success) {
        toastEvent(res.error || 'เผยแพร่ไม่สำเร็จ', 'error')
        return
      }
      toastEvent('เผยแพร่แล้ว', 'success')
      router.push('/admin/affiliate/collections')
    })
  }

  const handleArchive = () => {
    startLifecycleTransition(async () => {
      if (!collection) return
      const res = await archiveAffiliateCollection(collection.id)
      if (!res.success) {
        toastEvent(res.error || 'เก็บถาวรไม่สำเร็จ', 'error')
        return
      }
      toastEvent('ย้ายไปคลังเก็บแล้ว', 'success')
      router.push('/admin/affiliate/collections')
    })
  }

  const handleRestore = () => {
    startLifecycleTransition(async () => {
      if (!collection) return
      const res = await restoreAffiliateCollection(collection.id)
      if (!res.success) {
        toastEvent(res.error || 'กู้คืนไม่สำเร็จ', 'error')
        return
      }
      toastEvent('กู้คืนเป็น Draft แล้ว', 'success')
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link
          href="/admin/affiliate/collections"
          className="text-[#A1866B] hover:text-[#F5E9D6] inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} /> กลับหน้ารายการคอลเลกชัน
        </Link>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">
          {isEdit ? 'แก้ไขคอลเลกชัน' : 'สร้างคอลเลกชัน'}
        </h1>
      </div>

      <form
        id="affiliate-collection-form"
        onSubmit={handleSubmit}
        onChange={() => setIsDirty(true)}
        className="max-w-3xl space-y-6"
      >
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">ข้อมูลคอลเลกชัน</h2>
          <div>
            <label className={labelClass}>ชื่อคอลเลกชัน *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="เช่น อุปกรณ์เตรียมสอบ ก.พ. 2026"
              className={inputClass}
            />
            <p className="text-[10px] text-[#A1866B] mt-1">
              ใช้ภายในหน้าจัดการเท่านั้น (คอลเลกชันไม่มีหน้าสาธารณะของตัวเอง)
            </p>
          </div>
        </section>

        {/* Product picker — edit mode only (no parent id at create time). */}
        {isEdit && collection && (
          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">สินค้าในคอลเลกชัน</h2>
            <p className="text-xs text-[#A1866B]">
              ลำดับจากบนลงล่างคือลำดับที่ผู้อ่านเห็น — หน้าเว็บจะแสดงสินค้าที่เผยแพร่แล้วสูงสุด 5 รายการแรก
            </p>

            {/* Selected, ordered list */}
            <div className="space-y-2">
              {selected.length === 0 ? (
                <p className="text-xs text-[#A1866B] bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl px-3 py-2.5">
                  ยังไม่มีสินค้าในคอลเลกชัน — ค้นหาและเพิ่มจากด้านล่าง
                </p>
              ) : (
                selected.map((p, index) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] rounded-xl px-3 py-2"
                  >
                    <span className="text-xs text-[#A1866B] w-6 shrink-0 text-center">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[#F5E9D6] font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-[#A1866B]">
                        {p.merchant} · {p.status}
                        {p.status !== 'published' && (
                          <span className="text-[#EAB308]"> (ยังไม่แสดงบนเว็บ)</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => moveProduct(index, -1)}
                      disabled={index === 0}
                      className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 transition-colors rounded"
                      title="เลื่อนขึ้น"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveProduct(index, 1)}
                      disabled={index === selected.length - 1}
                      className="p-1 text-[#A1866B] hover:text-[#D4AF37] disabled:opacity-30 transition-colors rounded"
                      title="เลื่อนลง"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeProduct(p.id)}
                      className="p-1 text-[#A1866B] hover:text-red-400 hover:bg-red-400/10 rounded transition-colors"
                      title="นำออก"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Search + add */}
            <div>
              <label className={labelClass}>ค้นหาสินค้าเพื่อเพิ่ม</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1866B]" size={15} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="พิมพ์ชื่อสินค้า..."
                  className={`${inputClass} pl-9`}
                />
                {isSearching && (
                  <Loader2 size={14} className="animate-spin absolute right-3 top-1/2 -translate-y-1/2 text-[#A1866B]" />
                )}
              </div>
              {results.length > 0 && (
                <div className="mt-2 space-y-1">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between gap-2 bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] hover:border-[#D4AF37]/40 rounded-xl px-3 py-2 transition-colors text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-sm text-[#F5E9D6] truncate">{p.name}</div>
                        <div className="text-[10px] text-[#A1866B]">
                          {p.merchant} · {p.status}
                        </div>
                      </div>
                      <Plus size={15} className="text-[#D4AF37] shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* Publish workflow — edit mode only. */}
        {isEdit && collection && (
          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">สถานะการเผยแพร่</h2>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-[#A1866B]">สถานะปัจจุบัน:</span>
              <span
                className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[collection.status]}`}
              >
                {collection.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {collection.status === 'draft' && (
                <button
                  type="button"
                  onClick={requestPublish}
                  disabled={isLifecyclePending}
                  className="bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#0F0B07] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {isLifecyclePending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                  เผยแพร่
                </button>
              )}
              {collection.status === 'published' && (
                <button
                  type="button"
                  onClick={handleArchive}
                  disabled={isLifecyclePending}
                  className="bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] disabled:opacity-50 text-[#F5E9D6] font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <Archive size={16} /> ย้ายไปคลังเก็บ
                </button>
              )}
              {collection.status === 'archived' && (
                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={isLifecyclePending}
                  className="bg-[#22C55E] hover:bg-[#16A34A] disabled:opacity-50 text-[#0F0B07] font-bold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  {isLifecyclePending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <RotateCcw size={16} />
                  )}
                  กู้คืนเป็น Draft
                </button>
              )}
            </div>
          </section>
        )}

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-3 flex items-center gap-2">
            <AlertTriangle size={16} className="shrink-0" /> {error}
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isPending}
            className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors"
          >
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </button>
        </div>
      </form>

      <ConfirmDialog
        isOpen={pendingPublish}
        onClose={() => setPendingPublish(false)}
        onConfirm={confirmPublish}
        title="ยืนยันการเผยแพร่"
        description={
          <>คุณแน่ใจหรือไม่? คอลเลกชันนี้จะพร้อมใช้กับหน้าข่าว/บทความที่เลือกทันที</>
        }
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isLoading={isLifecyclePending}
      />
    </div>
  )
}
