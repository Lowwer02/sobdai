import styles from '@/app/about/about.module.css'

/**
 * AboutPrinciples — Sections 03 + 04: Why Sobdai Exists + How We Work
 *
 * Section 03: Exactly 3 principles.
 *   - Avoids guaranteed effectiveness claims.
 *   - Avoids universal explanation claims.
 *   - Avoids absolute diagnostic accuracy claims.
 *
 * Section 04: 4 editorial/source principles.
 *   - Avoids absolute universality language ("every item...").
 *   - Avoids formal review process claims.
 *   - Wording matches verified about.md truth.
 *
 * Server Component — no 'use client', no state.
 */

const PRINCIPLES = [
  {
    number: '01',
    title: 'เข้าใจ มากกว่าจำ',
    body: 'การเตรียมสอบที่ดีเริ่มจากความเข้าใจในหลักการ ไม่ใช่เพียงการท่องจำคำตอบ Sobdai จึงให้ความสำคัญกับการฝึกคิดและการทบทวนอย่างมีเหตุผล',
  },
  {
    number: '02',
    title: 'รู้จุดที่ควรพัฒนา มากกว่าดูแค่คะแนน',
    body: 'คะแนนบอกผลลัพธ์ได้ส่วนหนึ่ง แต่การมองเห็นหัวข้อที่ยังควรทบทวนช่วยให้ผู้เรียนวางแผนการฝึกครั้งต่อไปได้ชัดเจนขึ้น',
  },
  {
    number: '03',
    title: 'ฝึกอย่างมีทิศทาง มากกว่าทำข้อสอบไปเรื่อย ๆ',
    body: 'การฝึกที่มีเป้าหมายช่วยให้ผู้เรียนจัดลำดับสิ่งที่ควรทบทวน และใช้เวลาเตรียมสอบได้อย่างมีระบบมากขึ้น',
  },
] as const

const SOURCE_PRINCIPLES = [
  {
    title: 'มุ่งอ้างอิงจากแหล่งต้นทาง',
    body: 'ข้อมูลข่าวสาร สรุปประเด็น และเนื้อหาบน Sobdai มุ่งอ้างอิงแหล่งข้อมูลต้นทางที่เกี่ยวข้อง เช่น ประกาศจากหน่วยงาน หรือเอกสารทางการที่เผยแพร่ต่อสาธารณะ',
  },
  {
    title: 'แยกข้อมูลทางการออกจากเนื้อหาเพื่อการเรียนรู้',
    body: 'เนื้อหาบน Sobdai จัดทำขึ้นเพื่อช่วยในการศึกษาและเตรียมตัว ไม่ใช่การทดแทนประกาศอย่างเป็นทางการ',
  },
  {
    title: 'ยึดประกาศจริงเป็นหลัก',
    body: 'สำหรับการสมัครสอบ คุณสมบัติ กำหนดการ และเงื่อนไขอย่างเป็นทางการ ให้ยึดประกาศจริงของหน่วยงานเจ้าของประกาศเป็นสำคัญ',
  },
  {
    title: 'พัฒนาอย่างต่อเนื่อง',
    body: 'Sobdai พัฒนาและปรับปรุงแพลตฟอร์มอย่างต่อเนื่อง เพื่อให้การใช้งานและเนื้อหามีความเหมาะสมยิ่งขึ้น',
  },
] as const

export default function AboutPrinciples() {
  return (
    <>
      {/* ═══════════════ SECTION 03 — WHY SOBDAI EXISTS ═══════════════ */}
      <section aria-labelledby="about-principles-heading">
        <div className={styles.hairline} aria-hidden="true" />

        <div className={styles.sectionInner}>
          <div className={styles.sectionHeaderCentered}>
            <p className={styles.eyebrow}>แนวคิดเบื้องหลัง Sobdai</p>
            <h2 id="about-principles-heading" className={styles.sectionHeading}>
              สิ่งที่เราให้ความสำคัญ
            </h2>
          </div>

          <div className={styles.principlesGrid}>
            {PRINCIPLES.map((p) => (
              <div key={p.number} className={styles.principleCard}>
                <span className={styles.principleNumber} aria-hidden="true">{p.number}</span>
                <h3 className={styles.principleTitle}>{p.title}</h3>
                <p className={styles.principleBody}>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SECTION 04 — HOW WE WORK / SOURCES ═══════════════ */}
      <section aria-labelledby="about-sources-heading">
        <div className={styles.hairline} aria-hidden="true" />

        <div className={`${styles.sectionInner} ${styles.sectionNarrow}`}>
          <div className={styles.sectionHeaderCentered}>
            <p className={styles.eyebrow}>แนวทางการทำงาน</p>
            <h2 id="about-sources-heading" className={styles.sectionHeading}>
              ข้อมูลที่ตรวจสอบย้อนกลับได้
              <br />
              คือส่วนสำคัญของการเตรียมสอบ
            </h2>
          </div>

          <div className={styles.sourcesGrid}>
            {SOURCE_PRINCIPLES.map((s) => (
              <div key={s.title} className={styles.sourceItem}>
                <div className={styles.sourceAccent} aria-hidden="true" />
                <div>
                  <h3 className={styles.sourceTitle}>{s.title}</h3>
                  <p className={styles.sourceBody}>{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
