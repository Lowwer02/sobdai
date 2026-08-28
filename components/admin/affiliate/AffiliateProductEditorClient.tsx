'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Save,
  Loader2,
  Send,
  Archive,
  RotateCcw,
  AlertTriangle,
  Package,
} from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import {
  createAffiliateProduct,
  updateAffiliateProduct,
  publishAffiliateProduct,
  archiveAffiliateProduct,
  restoreAffiliateProduct,
} from '@/app/admin/affiliate/actions'
import {
  validateAffiliateProductForPublish,
  type AffiliateProduct,
} from '@/lib/affiliate'
import ConfirmDialog from '@/components/admin/ConfirmDialog'

/**
 * Affiliate product editor — the NewsEditorClient pattern (one client component
 * serving create + edit; per-field useState; single error banner; publish
 * gated client-side by the SAME pure validator the server action re-runs).
 *
 * Images are URL fields by design (no new Storage bucket / ingestion in M1):
 * external marketplace CDN URLs today, Sobdai-managed URLs later. The preview
 * uses a plain <img> with onError hide (PromotionImage pattern) because the
 * hosts are arbitrary and must not touch next.config remotePatterns.
 */
export default function AffiliateProductEditorClient({
  product,
  isEdit,
}: {
  product: AffiliateProduct | null
  isEdit: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isLifecyclePending, startLifecycleTransition] = useTransition()
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)
  const [publishErrors, setPublishErrors] = useState<Record<string, string>>({})
  const [pendingPublish, setPendingPublish] = useState(false)
  const [imagePreviewFailed, setImagePreviewFailed] = useState(false)

  const [name, setName] = useState(product?.name || '')
  const [merchant, setMerchant] = useState(product?.merchant || 'shopee')
  const [affiliateUrl, setAffiliateUrl] = useState(product?.affiliate_url || '')
  const [imageUrl, setImageUrl] = useState(product?.image_url || '')
  const [imageAlt, setImageAlt] = useState(product?.image_alt || '')
  const [shortDescription, setShortDescription] = useState(product?.short_description || '')
  const [tags, setTags] = useState((product?.tags ?? []).join(', '))

  useUnsavedChanges(isDirty)

  const inputClass =
    'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'
  const labelClass = 'text-sm text-[#F5E9D6] font-medium block mb-1.5'

  const STATUS_STYLES: Record<string, string> = {
    draft: 'bg-[#A1866B]/10 text-[#A1866B] border-[#A1866B]/30',
    published: 'bg-[#22C55E]/10 text-[#22C55E] border-[#22C55E]/30',
    archived: 'bg-white/5 text-[#A1866B] border-white/10',
  }

  const FIELD_LABELS: Record<string, string> = {
    name: 'ชื่อสินค้า',
    affiliate_url: 'ลิงก์พันธมิตร',
    image_url: 'รูปสินค้า',
    merchant: 'แพลตฟอร์ม',
  }

  const buildPayload = (): Record<string, unknown> => ({
    name,
    merchant,
    affiliate_url: affiliateUrl.trim() || null,
    image_url: imageUrl.trim() || null,
    image_alt: imageAlt.trim() || null,
    short_description: shortDescription.trim() || null,
    tags,
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')
    startTransition(async () => {
      const payload = buildPayload()
      const res = isEdit && product
        ? await updateAffiliateProduct(product.id, payload)
        : await createAffiliateProduct(payload)
      if (!res.success) {
        setError(res.error || 'บันทึกไม่สำเร็จ')
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
        return
      }
      if (isEdit) {
        toastEvent('บันทึกเรียบร้อย', 'success')
        setIsDirty(false)
      }
      // Create: createAffiliateProduct redirects internally.
    })
  }

  // Publish gate: run the SAME pure validator the server action re-runs, so
  // the editor gets an instant field-specific summary with no round-trip.
  const requestPublish = () => {
    const { ok, errors } = validateAffiliateProductForPublish(buildPayload())
    if (!ok) {
      setPublishErrors(errors)
      toastEvent('ข้อมูลสินค้ายังไม่พร้อมเผยแพร่ กรุณาตรวจสอบ', 'warning')
      return
    }
    setPublishErrors({})
    setPendingPublish(true)
  }

  const confirmPublish = () => {
    startLifecycleTransition(async () => {
      if (!product) {
        setPendingPublish(false)
        return
      }
      // Persist unsaved edits FIRST so the stored row matches what was gated.
      if (isDirty) {
        const saveRes = await updateAffiliateProduct(product.id, buildPayload())
        if (!saveRes.success) {
          setPendingPublish(false)
          toastEvent(saveRes.error || 'บันทึกไม่สำเร็จ จึงยังเผยแพร่ไม่ได้', 'error')
          return
        }
        setIsDirty(false)
      }
      const res = await publishAffiliateProduct(product.id)
      setPendingPublish(false)
      if (!res.success) {
        toastEvent(res.error || 'เผยแพร่ไม่สำเร็จ', 'error')
        return
      }
      toastEvent('เผยแพร่แล้ว', 'success')
      router.push('/admin/affiliate')
    })
  }

  const handleArchive = () => {
    startLifecycleTransition(async () => {
      if (!product) return
      const res = await archiveAffiliateProduct(product.id)
      if (!res.success) {
        toastEvent(res.error || 'เก็บถาวรไม่สำเร็จ', 'error')
        return
      }
      toastEvent('ย้ายไปคลังเก็บแล้ว', 'success')
      router.push('/admin/affiliate')
    })
  }

  const handleRestore = () => {
    startLifecycleTransition(async () => {
      if (!product) return
      const res = await restoreAffiliateProduct(product.id)
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
          href="/admin/affiliate"
          className="text-[#A1866B] hover:text-[#F5E9D6] inline-flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} /> กลับหน้ารายการสินค้า
        </Link>
        <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">
          {isEdit ? 'แก้ไขสินค้าพันธมิตร' : 'เพิ่มสินค้าพันธมิตร'}
        </h1>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        <form
          id="affiliate-product-form"
          onSubmit={handleSubmit}
          onChange={() => {
            setIsDirty(true)
            setPublishErrors({})
          }}
          className="flex-1 max-w-3xl min-w-0 space-y-6"
        >
          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">ข้อมูลสินค้า</h2>

            <div>
              <label className={labelClass}>ชื่อสินค้า *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={200}
                placeholder="เช่น หนังสือเตรียมสอบ ภาค ก."
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">ฟิลด์เดียวที่จำเป็นตอนเก็บฉบับร่าง</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>แพลตฟอร์ม / ร้านค้า</label>
                <input
                  type="text"
                  value={merchant}
                  onChange={(e) => setMerchant(e.target.value)}
                  maxLength={40}
                  placeholder="shopee"
                  className={inputClass}
                />
                <p className="text-[10px] text-[#A1866B] mt-1">
                  ค่าเริ่มต้น shopee — เพิ่มแพลตฟอร์มอื่นได้ในอนาคต เช่น lazada
                </p>
              </div>
              <div>
                <label className={labelClass}>แท็ก</label>
                <input
                  type="text"
                  value={tags}
                  onChange={(e) => setTags(e.target.value)}
                  placeholder="คั่นด้วยจุลภาค เช่น หนังสือ, อุปกรณ์เครื่องเขียน"
                  className={inputClass}
                />
                <p className="text-[10px] text-[#A1866B] mt-1">สูงสุด 8 แท็ก (คั่นด้วยจุลภาค)</p>
              </div>
            </div>

            <div>
              <label className={labelClass}>ลิงก์พันธมิตร (Affiliate URL) *</label>
              <input
                type="url"
                value={affiliateUrl}
                onChange={(e) => setAffiliateUrl(e.target.value)}
                maxLength={2048}
                placeholder="https://shopee.co.th/..."
                className={inputClass}
              />
              <p className="text-[10px] text-[#A1866B] mt-1">
                ต้องเป็น https:// เท่านั้น — ระบบจะตรวจสอบก่อนบันทึกและก่อนเผยแพร่ทุกครั้ง
              </p>
            </div>

            <div>
              <label className={labelClass}>คำอธิบายสั้น</label>
              <textarea
                value={shortDescription}
                onChange={(e) => setShortDescription(e.target.value)}
                rows={2}
                maxLength={320}
                placeholder="สรุปสั้นๆ แสดงบนการ์ดแนะนำ (ไม่เกิน 2 บรรทัด)"
                className={inputClass}
              />
            </div>
          </section>

          <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
            <h2 className="text-[#D4AF37] font-bold font-display">รูปสินค้า</h2>

            <div className="flex items-center gap-4">
              <div
                className="w-24 h-24 rounded-xl bg-[#0F0B07] border border-[rgba(255,255,255,0.05)] overflow-hidden flex items-center justify-center shrink-0"
                style={{ aspectRatio: '1 / 1' }}
              >
                {imageUrl && !imagePreviewFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageUrl}
                    alt={imageAlt || name || 'product'}
                    className="w-full h-full object-cover"
                    onError={() => setImagePreviewFailed(true)}
                  />
                ) : (
                  <Package size={24} className="text-[#A1866B]" />
                )}
              </div>
              <p className="text-xs text-[#A1866B]">
                วาง URL รูปจากแพลตฟอร์ม (https://) — ระบบยังไม่เปิดอัปโหลดไฟล์สำหรับสินค้าพันธมิตร
              </p>
            </div>

            <div>
              <label className={labelClass}>URL รูปสินค้า *</label>
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => {
                  setImageUrl(e.target.value)
                  setImagePreviewFailed(false)
                }}
                maxLength={1000}
                placeholder="https://.../product.webp"
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>คำอธิบายรูป (Alt text)</label>
              <input
                type="text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                maxLength={300}
                placeholder="อธิบายรูปสินค้าเพื่อการเข้าถึง"
                className={inputClass}
              />
            </div>
          </section>

          {/* Publish workflow — edit mode only (no id at create time). */}
          {isEdit && product && (
            <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
              <h2 className="text-[#D4AF37] font-bold font-display">สถานะการเผยแพร่</h2>

              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm text-[#A1866B]">สถานะปัจจุบัน:</span>
                <span
                  className={`text-xs font-bold px-2 py-1 rounded-md border whitespace-nowrap ${STATUS_STYLES[product.status]}`}
                >
                  {product.status}
                </span>
              </div>

              {Object.keys(publishErrors).length > 0 && (
                <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-3">
                  <p className="font-bold mb-2">ข้อมูลยังไม่พร้อมเผยแพร่ กรุณาแก้ไข:</p>
                  <ul className="list-disc list-inside space-y-1">
                    {Object.entries(publishErrors).map(([field, msg]) => (
                      <li key={field}>
                        <span className="text-[#F5E9D6]">{FIELD_LABELS[field] || field}</span>: {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {product.status === 'draft' && (
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
                {product.status === 'published' && (
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={isLifecyclePending}
                    className="bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] border border-[rgba(255,255,255,0.1)] disabled:opacity-50 text-[#F5E9D6] font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
                  >
                    <Archive size={16} /> ย้ายไปคลังเก็บ
                  </button>
                )}
                {product.status === 'archived' && (
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

        {/* Desktop sticky action panel (NewsEditorClient pattern). */}
        <aside className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-6 space-y-4 bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-5 shadow-xl">
            <h3 className="text-xs font-bold text-[#A1866B] uppercase tracking-wider">
              {isEdit ? 'การจัดการสินค้า' : 'สินค้าใหม่'}
            </h3>
            <button
              type="submit"
              form="affiliate-product-form"
              disabled={isPending}
              className="w-full bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-4 py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors shadow-lg"
            >
              {isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEdit ? 'บันทึก' : 'สร้าง'}
            </button>

            {isPending ? (
              <p className="text-xs text-[#A1866B] flex items-center gap-1.5">
                <Loader2 size={12} className="animate-spin" /> กำลังบันทึก...
              </p>
            ) : isDirty ? (
              <p className="text-xs text-[#D4AF37] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-pulse" />
                ยังไม่ได้บันทึกการเปลี่ยนแปลง
              </p>
            ) : null}

            <p className="text-xs text-[#A1866B] leading-relaxed">
              สินค้าที่เผยแพร่แล้วจะแสดงในคอลเลกชัน และปรากฏบนหน้าข่าว/บทความที่เปิดใช้งาน
            </p>
            <div className="pt-3 border-t border-[rgba(255,255,255,0.05)]">
              <Link
                href="/admin/affiliate"
                className="w-full text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[rgba(255,255,255,0.05)] px-3 py-2 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft size={16} /> กลับหน้ารายการ
              </Link>
            </div>
          </div>
        </aside>
      </div>

      <ConfirmDialog
        isOpen={pendingPublish}
        onClose={() => setPendingPublish(false)}
        onConfirm={confirmPublish}
        title="ยืนยันการเผยแพร่"
        description={<>คุณแน่ใจหรือไม่? สินค้านี้จะปรากฏในคอลเลกชันที่เผยแพร่แล้วทันที</>}
        confirmText="ยืนยัน"
        cancelText="ยกเลิก"
        isLoading={isLifecyclePending}
      />
    </div>
  )
}
