'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2 } from 'lucide-react'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'
import { toastEvent } from '@/hooks/useToast'
import { createPromotionAction, updatePromotionAction } from './actions'
import { PROMOTION_TYPES, PROMOTION_STATUSES, type Promotion } from '@/lib/promotions'

const inputClass = 'w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50 transition-colors'
const labelClass = 'text-sm text-[#F5E9D6] font-medium block mb-1.5'

export default function PromotionForm({ promo, isEdit }: { promo: Promotion | null; isEdit: boolean }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')
  const [isDirty, setIsDirty] = useState(false)

  // Local form state — initialized from the promo (edit) or sensible defaults (create).
  const [internal_name, setInternalName] = useState(promo?.internal_name || '')
  const [type, setType] = useState(promo?.type || 'promotion')
  const [status, setStatus] = useState(promo?.status || 'draft')
  const [title, setTitle] = useState(promo?.title || '')
  const [subtitle, setSubtitle] = useState(promo?.subtitle || '')
  const [description, setDescription] = useState(promo?.description || '')
  const [image_url, setImageUrl] = useState(promo?.image_url || '')
  const [button_text, setButtonText] = useState(promo?.button_text || '')
  const [button_link, setButtonLink] = useState(promo?.button_link || '')
  const [link_type, setLinkType] = useState<'internal' | 'external'>(promo?.link_type || 'internal')
  const [open_in_new_tab, setOpenInNewTab] = useState<boolean>(promo?.open_in_new_tab || false)
  const [priority, setPriority] = useState(promo?.priority ?? 0)
  const [display_order, setDisplayOrder] = useState(promo?.display_order ?? 0)
  const [start_at, setStartAt] = useState(toLocalInput(promo?.start_at))
  const [end_at, setEndAt] = useState(toLocalInput(promo?.end_at))
  const [active, setActive] = useState<boolean>(promo?.active ?? true)

  useUnsavedChanges(isDirty)

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError('')

    const payload = {
      internal_name, type, status, title, subtitle, description, image_url,
      button_text, button_link, link_type,
      open_in_new_tab: link_type === 'external' ? open_in_new_tab : false,
      priority, display_order,
      // Convert local-datetime strings (or empty) → ISO timestamptz / null.
      start_at: start_at ? new Date(start_at).toISOString() : null,
      end_at: end_at ? new Date(end_at).toISOString() : null,
      active,
    }

    startTransition(async () => {
      const res = isEdit && promo
        ? await updatePromotionAction(promo.id, payload)
        : await createPromotionAction(payload)
      if (!res.success) {
        setError(res.error || 'บันทึกไม่สำเร็จ')
        toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
      } else if (isEdit) {
        toastEvent('บันทึกเรียบร้อย', 'success')
        setIsDirty(false)
      }
      // create path redirects on success (no toast needed).
    })
  }

  return (
    <div className="max-w-3xl space-y-6">
      <Link href="/admin/promotions" className="text-[#A1866B] hover:text-[#F5E9D6] flex items-center gap-2 text-sm">
        <ArrowLeft size={16} /> กลับไปหน้ารายการ
      </Link>

      <h1 className="text-3xl font-bold font-display text-[#F5E9D6]">{isEdit ? 'แก้ไขโปรโมชั่น' : 'สร้างโปรโมชั่น'}</h1>

      <form onSubmit={handleSubmit} onChange={() => setIsDirty(true)} className="space-y-6">
        {/* Admin */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">ข้อมูลภายใน (Admin)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Internal Name *</label>
              <input className={inputClass} value={internal_name} onChange={e => setInternalName(e.target.value)} required maxLength={120} placeholder="ชื่อสำหรับทีม เช่น แคมเปญสงกรานต์" />
            </div>
            <div>
              <label className={labelClass}>Type</label>
              <select className={inputClass} value={type} onChange={e => setType(e.target.value as any)}>
                {PROMOTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select className={inputClass} value={status} onChange={e => setStatus(e.target.value as any)}>
                {PROMOTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Active</label>
              <label className="flex items-center gap-3 cursor-pointer p-2.5">
                <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4 accent-[#D4AF37]" />
                <span className="text-sm text-[#A1866B]">เปิดใช้งาน (false = ปิดฉุกเฉิน ไม่แสดงแม้ status=published)</span>
              </label>
            </div>
          </div>
        </section>

        {/* Content */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">เนื้อหา</h2>
          <div>
            <label className={labelClass}>Title *</label>
            <input className={inputClass} value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} />
          </div>
          <div>
            <label className={labelClass}>Subtitle</label>
            <input className={inputClass} value={subtitle} onChange={e => setSubtitle(e.target.value)} maxLength={300} />
          </div>
          <div>
            <label className={labelClass}>Description</label>
            <textarea className={inputClass} rows={3} value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} />
          </div>
          <div>
            <label className={labelClass}>Image URL</label>
            <input className={inputClass} value={image_url} onChange={e => setImageUrl(e.target.value)} maxLength={500} placeholder="https://..." />
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">ปุ่ม (CTA)</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Button Text</label>
              <input className={inputClass} value={button_text} onChange={e => setButtonText(e.target.value)} maxLength={60} placeholder="เช่น สมัครเลย" />
            </div>
            <div>
              <label className={labelClass}>Link Type</label>
              <select className={inputClass} value={link_type} onChange={e => setLinkType(e.target.value as 'internal' | 'external')}>
                <option value="internal">Internal (ในเว็บ)</option>
                <option value="external">External (เว็บนอก)</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Button Link</label>
            <input
              className={inputClass}
              value={button_link}
              onChange={e => setButtonLink(e.target.value)}
              maxLength={500}
              placeholder={link_type === 'internal' ? '/packages หรือ #exams' : 'https://...'}
            />
          </div>
          {link_type === 'external' && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={open_in_new_tab} onChange={e => setOpenInNewTab(e.target.checked)} className="w-4 h-4 accent-[#D4AF37]" />
              <span className="text-sm text-[#A1866B]">เปิดในแท็บใหม่ (noopener noreferrer)</span>
            </label>
          )}
        </section>

        {/* Ordering + schedule */}
        <section className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-6 space-y-4">
          <h2 className="text-[#D4AF37] font-bold font-display">ลำดับและช่วงเวลา</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Priority</label>
              <input type="number" className={inputClass} value={priority} onChange={e => setPriority(parseInt(e.target.value) || 0)} />
              <p className="text-[10px] text-[#A1866B] mt-1">ค่ามากกว่า แสดงก่อน</p>
            </div>
            <div>
              <label className={labelClass}>Display Order</label>
              <input type="number" className={inputClass} value={display_order} onChange={e => setDisplayOrder(parseInt(e.target.value) || 0)} />
            </div>
            <div>
              <label className={labelClass}>Start At</label>
              <input type="datetime-local" className={inputClass} value={start_at} onChange={e => setStartAt(e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>End At</label>
              <input type="datetime-local" className={inputClass} value={end_at} onChange={e => setEndAt(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-[#A1866B]">หมายเหตุ: ตอนนี้ระบบยังไม่บังคับตารางเวลา — เก็บข้อมูลไว้สำหรับการแสดงผลในอนาคต</p>
        </section>

        {error && (
          <div className="text-sm text-red-400 bg-red-400/10 border border-red-400/30 rounded-xl px-4 py-3">{error}</div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={isPending} className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors">
            {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            {isEdit ? 'บันทึก' : 'สร้าง'}
          </button>
        </div>
      </form>
    </div>
  )
}

/** Convert an ISO timestamptz → value usable by <input type="datetime-local">. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    // datetime-local wants yyyy-MM-ddTHH:mm in local time.
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return ''
  }
}
