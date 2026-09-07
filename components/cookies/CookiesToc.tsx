import React from 'react'
import Link from 'next/link'
import { CookiesSection } from '@/app/cookies/cookies-content'
import CookiePreferencesButton from '@/components/cookies/CookiePreferencesButton'
import styles from '@/app/cookies/cookies.module.css'

interface CookiesTocProps {
  sections: CookiesSection[]
}

/**
 * CookiesToc — Table of Contents & Privacy/Consent Settings Trigger
 *
 * Desktop: Sticky left rail with all 8 sections + "ต้องการจัดการคุกกี้?" card
 * Mobile: Compact jump-navigation pill grid
 *
 * Note: CookiesToc is a Server Component that embeds the tiny client island
 * CookiePreferencesButton for the "จัดการความเป็นส่วนตัว" action.
 */
export default function CookiesToc({ sections }: CookiesTocProps) {
  return (
    <>
      {/* ── Desktop Sticky TOC Rail ── */}
      <aside className={styles.tocRail} aria-label="สารบัญนโยบายคุกกี้">
        <div className={styles.tocCard}>
          <div className={styles.tocHeader}>
            <svg
              className={styles.tocIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            <span>สารบัญ</span>
          </div>

          <nav>
            <ol className={styles.tocNavList}>
              {sections.map((sec) => (
                <li key={sec.id}>
                  <Link
                    href={`#${sec.id}`}
                    className={styles.tocLink}
                    aria-label={`ไปยังข้อ ${sec.num}: ${sec.title}`}
                  >
                    <span className={styles.tocLinkNum}>{sec.numFormatted}.</span>
                    <span className={styles.tocLinkText}>{sec.title}</span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>

        {/* ── Desktop Cookie Settings CTA Card ── */}
        <div className={styles.tocSettingsCard} role="region" aria-label="การจัดการคุกกี้">
          <div className={styles.tocSettingsHeader}>
            <svg
              className={styles.tocSettingsIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <h3 className={styles.tocSettingsTitle}>ต้องการจัดการคุกกี้?</h3>
          </div>
          <p className={styles.tocSettingsText}>
            คุณสามารถตรวจสอบหรือเปลี่ยนแปลงความยินยอมคุกกี้วิเคราะห์ได้ตลอดเวลา
          </p>
          <CookiePreferencesButton className={styles.tocSettingsBtn}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
            </svg>
            จัดการความเป็นส่วนตัว
          </CookiePreferencesButton>
        </div>
      </aside>

      {/* ── Mobile Compact Jump-Navigation Presentation ── */}
      <div className={styles.mobileTocCard} role="region" aria-label="สารบัญแบบย่อสำหรับอุปกรณ์พกพา">
        <div className={styles.mobileTocHeader}>
          <svg
            className={styles.tocIcon}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <span>สารบัญหัวข้อ (1–8)</span>
        </div>

        <nav>
          <div className={styles.mobileTocGrid}>
            {sections.map((sec) => (
              <Link
                key={sec.id}
                href={`#${sec.id}`}
                className={styles.mobileTocPill}
                aria-label={`ไปยังข้อ ${sec.num}: ${sec.title}`}
              >
                <span className={styles.tocLinkNum}>{sec.numFormatted}.</span>
                <span className={styles.tocLinkText}>{sec.title}</span>
              </Link>
            ))}
          </div>
        </nav>

        <CookiePreferencesButton className={styles.mobileSettingsBtn}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5" />
          </svg>
          จัดการความเป็นส่วนตัว
        </CookiePreferencesButton>
      </div>
    </>
  )
}
