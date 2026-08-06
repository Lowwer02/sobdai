'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useConsent } from '@/components/consent/ConsentProvider'

export interface CookiePreferencesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CookiePreferencesModal({ isOpen, onClose }: CookiePreferencesModalProps) {
  const { hasAnalyticsConsent, acceptAnalytics, rejectAnalytics } = useConsent()
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(hasAnalyticsConsent)

  useEffect(() => {
    if (isOpen) {
      setAnalyticsEnabled(hasAnalyticsConsent)
    }
  }, [isOpen, hasAnalyticsConsent])

  if (!isOpen) {
    return null
  }

  const handleSave = () => {
    if (analyticsEnabled) {
      acceptAnalytics()
    } else {
      rejectAnalytics()
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-description"
        className="relative w-full max-w-2xl bg-[#0F0A06] border border-[#3A2A17] rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6 my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#3A2A17]">
          <div className="space-y-1">
            <h2 id="cookie-modal-title" className="text-lg sm:text-xl font-bold text-[#D4A63A]">
              ตั้งค่าคุกกี้
            </h2>
            <p id="cookie-modal-description" className="text-xs sm:text-sm text-[#C8BBA4] leading-relaxed">
              คุณสามารถเลือกอนุญาตหรือปฏิเสธคุกกี้วิเคราะห์ได้ คุกกี้ที่จำเป็นจะเปิดใช้งานเสมอเพื่อให้เว็บไซต์ทำงานได้อย่างถูกต้อง
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-[#C8BBA4] hover:text-[#F7F3EC] bg-[#1A120B] hover:bg-[#24180E] border border-[#3A2A17] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] shrink-0"
          >
            ปิด
          </button>
        </div>

        {/* Categories List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* 1. Necessary Cookies */}
          <div className="p-4 bg-[#1A120B] border border-[#3A2A17] rounded-xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#F7F3EC]">คุกกี้ที่จำเป็น</h3>
              <span className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-[#3A2A17] text-[#F2D37A]">
                เปิดใช้งานเสมอ
              </span>
            </div>
            <p className="text-xs text-[#C8BBA4] leading-relaxed">
              จำเป็นสำหรับการล็อกอิน การยืนยันตัวตน ความปลอดภัย และการทำงานหลักของเว็บไซต์
            </p>
          </div>

          {/* 2. Analytics Cookies */}
          <div className="p-4 bg-[#1A120B] border border-[#3A2A17] rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#F7F3EC]">คุกกี้วิเคราะห์</h3>
              <label htmlFor="analytics-toggle" className="inline-flex items-center cursor-pointer select-none">
                <input
                  id="analytics-toggle"
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#3A2A17] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#D4A63A] rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#D4A63A] relative"></div>
                <span className="ml-2.5 text-xs font-semibold text-[#F7F3EC]">
                  {analyticsEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </label>
            </div>
            <p className="text-xs text-[#C8BBA4] leading-relaxed">
              ช่วยให้ Sobdai เข้าใจลักษณะการใช้งานและปรับปรุงบริการ โดยใช้ Google Analytics และ Microsoft Clarity
            </p>
          </div>

          {/* 3. Marketing Cookies */}
          <div className="p-4 bg-[#1A120B] border border-[#3A2A17] rounded-xl space-y-2 opacity-75">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-[#F7F3EC]">คุกกี้การตลาด</h3>
              <span className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-[#24180E] text-[#8B7A63] border border-[#3A2A17]">
                ยังไม่เปิดใช้งาน
              </span>
            </div>
            <p className="text-xs text-[#8B7A63] leading-relaxed">
              สำรองไว้สำหรับเครื่องมือโฆษณาและการตลาดในอนาคต
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-[#3A2A17] flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/cookies"
            className="text-xs text-[#D4A63A] underline hover:text-[#F7F3EC] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] rounded"
          >
            อ่านนโยบายคุกกี้
          </Link>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold text-[#F7F3EC] bg-transparent hover:bg-white/5 border border-[#3A2A17] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A]"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-bold text-[#0F0A06] bg-[#D4A63A] hover:bg-[#E5B84A] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A63A] shadow-sm"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
