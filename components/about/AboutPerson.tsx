import Image from 'next/image'
import styles from '@/app/about/about.module.css'

/**
 * AboutPerson — Section 02: Person Behind Sobdai
 *
 * Presents the approved personal identity:
 *   กิตติพงษ์ จงคล้ายกลาง | นักวิชาการศึกษา
 *
 * Strict fact boundary: name and professional title only.
 * No employer, no ministry, no agency, no degree, no awards,
 * no coaching history, no personal anecdotes.
 *
 * Uses the verified real portrait asset:
 *   /images/about/kittipong-portrait.webp (800x1000, 4:5 vertical)
 *
 * Independence statement is placed immediately below the identity
 * so users reading the title "นักวิชาการศึกษา" cannot assume
 * government affiliation.
 *
 * Server Component — no 'use client', no state, no event handlers.
 */
export default function AboutPerson() {
  return (
    <section aria-labelledby="about-person-heading">
      {/* ── Gold hairline separator ── */}
      <div className={styles.hairline} aria-hidden="true" />

      <div className={styles.sectionInner}>
        {/* Eyebrow */}
        <p className={styles.eyebrow} aria-label="section label">คนเบื้องหลัง Sobdai</p>

        <div className={styles.personGrid}>
          {/* ── LEFT: Real portrait card ── */}
          <div className={styles.personCardCol}>
            <div className={styles.personCard}>
              <Image
                src="/images/about/kittipong-portrait.webp"
                alt="กิตติพงษ์ จงคล้ายกลาง นักวิชาการศึกษา"
                width={800}
                height={1000}
                sizes="(max-width: 768px) 280px, 360px"
                className={styles.personImage}
              />

              {/* Bottom gradient overlay for nameplate readability */}
              <div className={styles.personOverlay} aria-hidden="true" />

              {/* Name + title */}
              <div className={styles.personNameplate}>
                <p className={styles.personName}>กิตติพงษ์ จงคล้ายกลาง</p>
                <p className={styles.personTitle}>นักวิชาการศึกษา</p>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Heading, narrative, independence note ── */}
          <div className={styles.personStoryCol}>
            <h2 id="about-person-heading" className={styles.sectionHeading}>
              จากคนทำงานด้านการศึกษา
              <br />
              สู่ความตั้งใจในการสร้างพื้นที่สำหรับคนเตรียมสอบราชการ
            </h2>

            <div className={styles.personNarrative}>
              <p>
                Sobdai เริ่มต้นจากความสนใจในเรื่องการเรียนรู้
                และความตั้งใจที่จะทำให้การเตรียมสอบมีโครงสร้างที่ชัดขึ้น
              </p>
              <p>
                แทนที่จะมองการทำข้อสอบเป็นเพียงการจำคำตอบ
                Sobdai จึงให้ความสำคัญกับการฝึกคิด การทบทวน
                การมองเห็นจุดที่ควรพัฒนา
                และการกลับไปตรวจสอบข้อมูลจากแหล่งต้นทาง
              </p>
            </div>

            {/* Independence note — placed adjacent to the identity to prevent
                users from reading "นักวิชาการศึกษา" as government affiliation */}
            <div className={styles.independenceInline} role="note" aria-label="ข้อมูลความเป็นอิสระของแพลตฟอร์ม">
              <p>
                Sobdai เป็นแพลตฟอร์มอิสระเพื่อการเรียนรู้และเตรียมสอบราชการ
                ไม่ได้เป็นเว็บไซต์หรือหน่วยงานของรัฐ
                และไม่ได้เป็นตัวแทนอย่างเป็นทางการของส่วนราชการใด
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
