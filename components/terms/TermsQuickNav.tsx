import React from 'react'
import { QUICK_NAV_SECTIONS } from '@/app/terms/terms-content'
import styles from '@/app/terms/terms.module.css'

export default function TermsQuickNav() {
  return (
    <section className={styles.quickNavSection} aria-label="หมวดหมู่ข้อกำหนดสำคัญ">
      <div className={styles.container}>
        <div className={styles.quickNavHeader}>
          <p className={styles.quickNavTitle}>หมวดหมู่สำคัญ</p>
          <p className={styles.quickNavSubtitle}>เข้าถึงข้อกำหนดหลักที่ผู้ใช้งานควรอ่านทำความเข้าใจ</p>
        </div>

        <div className={styles.quickGrid}>
          {QUICK_NAV_SECTIONS.map((item) => (
            <a key={item.id} href={`#${item.id}`} className={styles.quickCard}>
              <div>
                <div className={styles.quickCardTop}>
                  <span className={styles.quickCardBadge}>ข้อ {item.num}</span>
                  <span className={styles.quickCardArrow} aria-hidden="true">
                    ↓
                  </span>
                </div>
                <h3 className={styles.quickCardTitle}>{item.title}</h3>
                <p className={styles.quickCardDesc}>{item.description}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
