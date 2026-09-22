import { ExternalLink } from 'lucide-react'
import type { AgencySource } from '@/lib/agency-profile'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencySourcesSectionProps {
  sources: readonly AgencySource[]
}

export default function AgencySourcesSection({ sources }: AgencySourcesSectionProps) {
  if (sources.length === 0) return null

  return (
    <section
      id="sources"
      aria-labelledby="agency-sources-heading"
      className={`${styles.relatedSection} ${styles.sourcesSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>REFERENCE DESK</p>
        <h2 id="agency-sources-heading" className={styles.relatedSectionHeading}>
          แหล่งข้อมูลอ้างอิงอย่างเป็นทางการ
        </h2>
        <p className={styles.relatedSectionDescription}>
          แหล่งข้อมูลภายนอกที่เชื่อมโยงกับหน่วยงานนี้
        </p>
      </header>

      <ul className={styles.sourcesList}>
        {sources.map((source, index) => (
          <li key={`${source.url}-${index}`} className={styles.sourceItem}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className={styles.sourceLink}
            >
              <span className={styles.sourceLabel}>{source.label || source.url}</span>
              <ExternalLink size={16} aria-hidden="true" className={styles.sourceIcon} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}
