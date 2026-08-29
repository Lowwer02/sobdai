'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronLeft, Loader2, Save } from 'lucide-react'
import { toastEvent } from '@/hooks/useToast'
import { saveAffiliateListingSettings } from '@/app/admin/affiliate/actions'
import {
  AFFILIATE_LISTING_KEYS,
  type AffiliateListingKey,
  type AffiliateListingSlotConfig,
} from '@/lib/affiliate-listing'

/**
 * Listing-strip settings form (M2) — the ONLY monetization controls for the
 * /news and /articles listings: per-listing Enabled + Affiliate Collection.
 * The two sections are independent in meaning (enabling news never touches
 * articles) but save together in one action call, which is also what keeps
 * the payload schema strict (both slots always present).
 *
 * Static explainer copies the frozen code rules so editors understand the
 * rendering contract without those rules being configurable.
 */

interface ListingSettingsClientProps {
  configs: Record<AffiliateListingKey, AffiliateListingSlotConfig>
  collections: { id: string; name: string; status: string }[]
  collectionsError?: string
}

const SLOT_META: Record<
  AffiliateListingKey,
  { title: string; path: string; description: string }
> = {
  news_list: {
    title: 'หน้ารวมข่าว (/news)',
    path: '/news',
    description: 'แสดงแถบ Sobdai Picks คั่นในรายการข่าว',
  },
  articles_list: {
    title: 'หน้ารวมบทความ (/articles)',
    path: '/articles',
    description: 'แสดงแถบ Sobdai Picks คั่นในรายการบทความ',
  },
}

export default function ListingSettingsClient({
  configs,
  collections,
  collectionsError,
}: ListingSettingsClientProps) {
  const [slots, setSlots] = useState<Record<AffiliateListingKey, { enabled: boolean; collection_id: string }>>(
    {
      news_list: {
        enabled: configs.news_list.enabled,
        collection_id: configs.news_list.collection_id ?? '',
      },
      articles_list: {
        enabled: configs.articles_list.enabled,
        collection_id: configs.articles_list.collection_id ?? '',
      },
    }
  )
  const [isPending, startTransition] = useTransition()

  const setSlot = (key: AffiliateListingKey, patch: Partial<{ enabled: boolean; collection_id: string }>) => {
    setSlots((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
  }

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveAffiliateListingSettings({
        news_list: slots.news_list,
        articles_list: slots.articles_list,
      })
      if (res.success) toastEvent('บันทึกการตั้งค่าแล้ว', 'success')
      else toastEvent(res.error || 'บันทึกไม่สำเร็จ', 'error')
    })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/affiliate"
            className="inline-flex items-center gap-1 text-sm text-[#A1866B] hover:text-[#D4AF37] transition-colors mb-2"
          >
            <ChevronLeft size={16} /> กลับสู่ Affiliate
          </Link>
          <h1 className="text-3xl font-bold font-display text-[#F5E9D6] tracking-tight">
            Listing Strip
          </h1>
          <p className="text-[#A1866B] mt-1">
            ตั้งค่าแถบ Sobdai Picks ที่แทรกในหน้ารวมข่าวและบทความ
          </p>
        </div>
      </div>

      {/* Frozen rendering rules — explainer only, deliberately NOT controls */}
      <div className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-4 text-sm text-[#A1866B] space-y-1">
        <p className="font-semibold text-[#F5E9D6]">กติกาการแสดงผล (ตายตัวในระบบ)</p>
        <p>• แทรกได้ครั้งละ 1 แถบ ต่อ 1 หน้า ตำแหน่งหลังรายการที่ 6 เสมอ</p>
        <p>• แสดงเฉพาะเมื่อหน้านั้นมีรายการแสดงผลตั้งแต่ 7 ชิ้นขึ้นไป</p>
        <p>• แสดงสินค้าจากคอลเลกชันสูงสุด 5 รายการ (ตามลำดับในคอลเลกชัน) เฉพาะสินค้าที่เผยแพร่แล้ว</p>
        <p>• คอลเลกชันต้องเผยแพร่และมีสินค้า จึงจะแสดงแถบ — ไม่มีสินค้าจะไม่แสดงผลใด ๆ</p>
      </div>

      {collectionsError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-200 text-sm rounded-xl p-4">
          {collectionsError}
        </div>
      )}

      {/* Per-listing sections */}
      {AFFILIATE_LISTING_KEYS.map((key) => {
        const meta = SLOT_META[key]
        const slot = slots[key]
        return (
          <section
            key={key}
            className="bg-[#1A140E] border border-[rgba(212,175,55,0.15)] rounded-2xl p-5 space-y-4"
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="font-bold text-[#F5E9D6]">{meta.title}</h2>
                <p className="text-sm text-[#A1866B] mt-0.5">{meta.description}</p>
              </div>
              {/* Toggle */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => setSlot(key, { enabled: e.target.checked })}
                  className="w-4 h-4 accent-[#D4AF37]"
                />
                <span className="text-sm text-[#F5E9D6]">เปิดใช้งาน</span>
              </label>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#A1866B] uppercase tracking-wider mb-1.5">
                Affiliate Collection
              </label>
              <select
                value={slot.collection_id}
                onChange={(e) => setSlot(key, { collection_id: e.target.value })}
                className="w-full bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] text-[#F5E9D6] rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-[#D4AF37]/50"
              >
                <option value="">— ไม่เลือกคอลเลกชัน —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.status !== 'published' ? ` (${c.status})` : ''}
                  </option>
                ))}
              </select>
              {slot.enabled && !slot.collection_id && (
                <p className="text-xs text-[#A1866B] mt-1.5">
                  เปิดใช้งานอยู่แต่ยังไม่เลือกคอลเลกชัน — หน้าเว็บจะไม่แสดงแถบจนกว่าจะเลือก
                </p>
              )}
              {slot.enabled && slot.collection_id && collections.some((c) => c.id === slot.collection_id && c.status !== 'published') && (
                <p className="text-xs text-[#A1866B] mt-1.5">
                  คอลเลกชันนี้ยังไม่เผยแพร่ — แถบจะแสดงหลังจากเผยแพร่คอลเลกชันแล้ว
                </p>
              )}
            </div>
          </section>
        )
      })}

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isPending}
          className="bg-[#D4AF37] hover:bg-[#F1D17A] disabled:opacity-50 text-[#1A140E] font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors"
        >
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
          บันทึกการตั้งค่า
        </button>
      </div>
    </div>
  )
}
