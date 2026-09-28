'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useConsent } from '@/components/consent/ConsentProvider'
import {
  queueGooglePrivacyChoicesOnce,
  subscribeToGooglePrivacyMessaging,
} from '@/lib/google-privacy-messaging'

export interface CookiePreferencesModalProps {
  isOpen: boolean
  onClose: () => void
}

export function CookiePreferencesModal({ isOpen, onClose }: CookiePreferencesModalProps) {
  const { hasAnalyticsConsent, acceptAnalytics, rejectAnalytics } = useConsent()
  const [analyticsEnabled, setAnalyticsEnabled] = useState<boolean>(hasAnalyticsConsent)
  const [googlePrivacyMessagingReady, setGooglePrivacyMessagingReady] = useState(false)
  const [googlePrivacyChoiceInProgress, setGooglePrivacyChoiceInProgress] = useState(false)
  const googlePrivacyChoiceActivationGuard = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setAnalyticsEnabled(hasAnalyticsConsent)
      googlePrivacyChoiceActivationGuard.current = false
      setGooglePrivacyChoiceInProgress(false)
    }
  }, [isOpen, hasAnalyticsConsent])

  useEffect(() => {
    return subscribeToGooglePrivacyMessaging(() => {
      setGooglePrivacyMessagingReady(true)
    })
  }, [])

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
    <div className="fixed inset-0 z-50 bg-overlay backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-modal-title"
        aria-describedby="cookie-modal-description"
        className="relative w-full max-w-2xl bg-surface-raised border border-border rounded-2xl p-5 sm:p-6 shadow-2xl space-y-6 my-auto"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <h2 id="cookie-modal-title" className="text-lg sm:text-xl font-bold text-brand">
              ตั้งค่าความเป็นส่วนตัว
            </h2>
            <p id="cookie-modal-description" className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              คุณสามารถจัดการคุกกี้วิเคราะห์ของ Sobdai ได้ที่นี่ ส่วนตัวเลือกโฆษณาจะจัดการโดย Google Privacy & messaging แยกจากตัวเลือกวิเคราะห์
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground bg-surface-muted hover:bg-muted border border-border rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand shrink-0"
          >
            ปิด
          </button>
        </div>

        {/* Categories List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* 1. Necessary Cookies */}
          <div className="p-4 bg-surface-muted border border-border rounded-xl space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-foreground">คุกกี้ที่จำเป็น</h3>
              <span className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-brand">
                เปิดใช้งานเสมอ
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              จำเป็นสำหรับการล็อกอิน การยืนยันตัวตน ความปลอดภัย และการทำงานหลักของเว็บไซต์
            </p>
          </div>

          {/* 2. Analytics Cookies */}
          <div className="p-4 bg-surface-muted border border-border rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-foreground">คุกกี้วิเคราะห์</h3>
              <label htmlFor="analytics-toggle" className="inline-flex items-center cursor-pointer select-none">
                <input
                  id="analytics-toggle"
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-brand rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-card-foreground after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-card-foreground after:border-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-solid relative"></div>
                <span className="ml-2.5 text-xs font-semibold text-foreground">
                  {analyticsEnabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                </span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              ช่วยให้ Sobdai เข้าใจลักษณะการใช้งานและปรับปรุงบริการ โดยใช้ Google Analytics และ Microsoft Clarity
            </p>
          </div>

          {/* 3. Advertising choices — owned by Google's certified CMP. */}
          <div className="p-4 bg-surface-muted border border-border rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-bold text-foreground">ตัวเลือกโฆษณา</h3>
              <span className="text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-md bg-muted text-faint border border-border">
                จัดการโดย Google
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              เมื่อ Sobdai แสดงโฆษณาจาก Google การตั้งค่าด้านโฆษณาและความเป็นส่วนตัวจะจัดการผ่าน Google Privacy & messaging แยกจากคุกกี้วิเคราะห์ของ Sobdai
            </p>
            <button
              type="button"
              onClick={() => {
                const result = queueGooglePrivacyChoicesOnce(googlePrivacyChoiceActivationGuard)
                if (result === 'queued') {
                  setGooglePrivacyChoiceInProgress(true)
                  onClose()
                }
              }}
              disabled={!googlePrivacyMessagingReady || googlePrivacyChoiceInProgress}
              data-testid="google-advertising-privacy-settings"
              className="w-full sm:w-auto px-3.5 py-2 text-xs font-semibold text-foreground bg-surface-muted hover:bg-muted border border-brand/40 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              จัดการตัวเลือกโฆษณาใน Google
            </button>
            {!googlePrivacyMessagingReady && (
              <p className="text-[11px] text-faint leading-relaxed">
                ตัวเลือกนี้จะพร้อมใช้งานบนหน้าที่รองรับการตั้งค่าโฆษณาของ Google
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link
            href="/cookies"
            className="text-xs text-brand underline hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded"
          >
            อ่านนโยบายคุกกี้และความเป็นส่วนตัว
          </Link>

          <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold text-foreground bg-transparent hover:bg-hover border border-border rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-bold text-brand-foreground bg-brand-solid hover:bg-brand-hover rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand shadow-sm"
            >
              บันทึกการตั้งค่า
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
