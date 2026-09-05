import Link from 'next/link'
import styles from '@/app/about/about.module.css'

/**
 * AboutTrust — Sections 05 + 06 + 07:
 *   Independence & Trust + Continuous Improvement + Final CTA
 *
 * Trust copy matches content/legal/about.md "ความเป็นอิสระของแพลตฟอร์ม"
 * and "แหล่งข้อมูลและการอ้างอิง" — factual truth preserved verbatim.
 *
 * Section 06 does NOT claim:
 *   - systematic learner feedback program
 *   - behavioral observation system
 *   - real-user research program
 *
 * Section 07 CTAs link to /packages and /help only.
 * /faq appears as a quiet micro-link.
 *
 * Server Component — no 'use client'.
 */
export default function AboutTrust() {
  return (
    <>
      {/* ═══════════════ SECTION 05 — INDEPENDENCE + TRUST ═══════════════ */}
      <section aria-labelledby="about-trust-heading">
        <div className={styles.hairline} aria-hidden="true" />

        <div className={`${styles.sectionInner} ${styles.sectionNarrow}`}>
          <div className={styles.trustCard}>
            {/* Subtle corner glow */}
            <div className={styles.trustGlow} aria-hidden="true" />

            <div className={styles.trustContent}>
              <p className={styles.eyebrow}>ความโปร่งใส</p>
              <h2 id="about-trust-heading" className={`${styles.sectionHeading} ${styles.trustHeading}`}>
                ความเป็นอิสระของแพลตฟอร์ม
              </h2>

              <div className={styles.trustBody}>
                <p>
                  Sobdai เป็นแพลตฟอร์มอิสระเพื่อการเรียนรู้และเตรียมตัวสอบ
                  มิได้เป็นหน่วยงานของรัฐ มิได้เป็นตัวแทนของส่วนราชการใด ๆ
                  และมิได้รับมอบหมายให้เป็นผู้ออกประกาศรับสมัครสอบอย่างเป็นทางการ
                </p>
                <p>
                  ข้อมูลและเนื้อหาบน Sobdai จัดทำขึ้นเพื่อประโยชน์ในการเรียนรู้
                  และผู้ใช้งานควรตรวจสอบข้อมูลสำคัญจากประกาศต้นทาง
                  ก่อนดำเนินการสมัครสอบหรือใช้ข้อมูลอย่างเป็นทางการ
                </p>
                <p>
                  Sobdai ให้ความสำคัญกับการคุ้มครองข้อมูลส่วนบุคคลของผู้ใช้งาน
                  และดำเนินการตามกฎหมายที่เกี่ยวข้อง
                </p>
              </div>

              {/* Policy links */}
              <nav aria-label="ลิงก์นโยบายของ Sobdai" className={styles.trustLinks}>
                <Link href="/privacy" className={styles.trustLink}>
                  นโยบายความเป็นส่วนตัว
                </Link>
                <span className={styles.trustSeparator} aria-hidden="true">·</span>
                <Link href="/cookies" className={styles.trustLink}>
                  นโยบายคุกกี้
                </Link>
                <span className={styles.trustSeparator} aria-hidden="true">·</span>
                <Link href="/terms" className={styles.trustLink}>
                  เงื่อนไขการใช้งาน
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 06 — CONTINUOUS IMPROVEMENT ═══════════════ */}
      <section aria-labelledby="about-improvement-heading">
        <div className={styles.hairline} aria-hidden="true" />

        <div className={`${styles.sectionInner} ${styles.sectionNarrow}`}>
          <p className={`${styles.eyebrow} ${styles.centered}`}>การพัฒนาต่อเนื่อง</p>
          <h2 id="about-improvement-heading" className={`${styles.sectionHeading} ${styles.centered}`}>
            Sobdai ยังเดินหน้าพัฒนาต่อ
          </h2>
          <p className={styles.improvementBody}>
            Sobdai ยังคงพัฒนาแพลตฟอร์ม เนื้อหา และประสบการณ์การใช้งานอย่างต่อเนื่อง
            โดยมีเป้าหมายให้การเตรียมสอบเป็นระบบ เข้าใจง่าย
            และช่วยให้ผู้เรียนเห็นสิ่งที่ควรพัฒนาต่อได้ชัดเจนขึ้น
          </p>
        </div>
      </section>

      {/* ═══════════════ SECTION 07 — FINAL CTA ═══════════════ */}
      <section aria-labelledby="about-cta-heading">
        <div className={styles.hairline} aria-hidden="true" />

        <div className={`${styles.sectionInner} ${styles.ctaSection}`}>
          <h2 id="about-cta-heading" className={styles.ctaHeading}>
            เริ่มต้นกับ Sobdai
          </h2>

          <div className={styles.ctaButtons}>
            <Link href="/packages" className={styles.ctaPrimary} id="about-cta-packages">
              ดูแนวข้อสอบราชการ
            </Link>
            <Link href="/help" className={styles.ctaSecondary} id="about-cta-help">
              อ่านคู่มือการใช้งาน
            </Link>
          </div>

          <p className={styles.ctaMicro}>
            มีคำถามเกี่ยวกับแพ็กเกจหรือการใช้งาน?{' '}
            <Link href="/faq" className={styles.ctaFaqLink} id="about-cta-faq">
              ดูคำถามที่พบบ่อย
            </Link>
          </p>
        </div>
      </section>
    </>
  )
}
