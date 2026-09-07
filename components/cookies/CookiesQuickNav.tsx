import React from 'react'
import Link from 'next/link'
import { QUICK_NAV_SECTIONS } from '@/app/cookies/cookies-content'
import styles from '@/app/cookies/cookies.module.css'

/**
 * CookiesQuickNav — 5 Quick Anchor Navigation Cards below Hero
 *
 * Targets:
 * - 02: ประเภทคุกกี้ที่ Sobdai ใช้ (#section-2)
 * - 03: คุกกี้และเครื่องมือที่อาจพบ (#section-3)
 * - 04: การยอมรับหรือปฏิเสธคุกกี้ (#section-4)
 * - 05: การเปลี่ยนแปลงหรือถอนความยินยอม (#section-5)
 * - 08: ติดต่อเรา (#section-8)
 *
 * 100% Server Component
 */
export default function CookiesQuickNav() {
  return (
    <section className={styles.quickNavSection} aria-label="ทางลัดหัวข้อนโยบายคุกกี้ที่สำคัญ">
      <div className={styles.container}>
        <div className={styles.quickNavHeader}>
          <p className={styles.quickNavTitle}>ทางลัดหัวข้อสำคัญ</p>
          <p className={styles.quickNavSubtitle}>เข้าถึงหัวข้อและข้อกำหนดเกี่ยวกับคุกกี้ที่ผู้ใช้สอบถามบ่อยที่สุด</p>
        </div>

        <div className={styles.quickGrid}>
          {QUICK_NAV_SECTIONS.map((item) => (
            <Link
              key={item.id}
              href={`#${item.id}`}
              className={styles.quickCard}
              aria-label={`ไปยังหัวข้อ ${item.num}: ${item.title}`}
            >
              <div>
                <div className={styles.quickCardTop}>
                  <span className={styles.quickCardBadge}>หมวด {item.numFormatted}</span>
                  <span className={styles.quickCardArrow} aria-hidden="true">
                    ↓
                  </span>
                </div>
                <h2 className={styles.quickCardTitle}>{item.title}</h2>
              </div>
              <p className={styles.quickCardDesc}>{item.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
