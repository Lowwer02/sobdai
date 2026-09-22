import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyEditorialSectionProps {
  content: string | null
}

export default function AgencyEditorialSection({ content }: AgencyEditorialSectionProps) {
  return (
    <section
      id="overview"
      aria-labelledby="agency-overview-heading"
      className={`${styles.editorialSection} ${styles.anchorSection}`}
    >
      <header className={styles.editorialIntro}>
        <p className={styles.sectionEyebrow}>EDITORIAL OVERVIEW</p>
        <h2 id="agency-overview-heading" className={styles.editorialIntroHeading}>
          รู้จักหน่วยงานนี้
        </h2>
        {content && (
          <p className={styles.editorialIntroDescription}>
            ภาพรวมบทบาท ภารกิจ และการรับสมัครบุคลากรของหน่วยงาน จากเนื้อหาที่ผ่านการตรวจสอบของ Sobdai
          </p>
        )}
      </header>

      {content ? (
        <div className={styles.editorialBody}>
          <SummaryMarkdown content={content} />
        </div>
      ) : (
        <p className={styles.editorialIntroDescription}>
          ภาพรวมฉบับสมบูรณ์ของหน่วยงานนี้อยู่ระหว่างจัดทำ
        </p>
      )}
    </section>
  )
}
