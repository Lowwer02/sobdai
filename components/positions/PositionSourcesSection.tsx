import { ExternalLink } from 'lucide-react'
import type { PositionSource } from '@/lib/position-entity'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionSourcesSectionProps {
  sources: readonly PositionSource[]
}

export default function PositionSourcesSection({ sources }: PositionSourcesSectionProps) {
  if (sources.length === 0) return null

  return (
    <section
      id="sources"
      aria-labelledby="position-sources-heading"
      className={`${styles.relatedSection} ${styles.sourcesSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>REFERENCE DESK</p>
        <h2 id="position-sources-heading" className={styles.relatedSectionHeading}>
          แหล่งข้อมูลอ้างอิงอย่างเป็นทางการ
        </h2>
        <p className={styles.relatedSectionDescription}>
          แหล่งข้อมูลภายนอกที่เชื่อมโยงกับเนื้อหาและตำแหน่งนี้
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
