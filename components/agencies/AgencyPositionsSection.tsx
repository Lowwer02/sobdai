import Link from 'next/link'
import { ArrowUpRight, Briefcase } from 'lucide-react'
import type {
  PublicAgencyCanonicalPosition,
  PublicAgencyOperationalPosition,
} from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyPositionsSectionProps {
  positions: readonly PublicAgencyOperationalPosition[]
  canonicalPositions: readonly PublicAgencyCanonicalPosition[]
}

export default function AgencyPositionsSection({
  positions,
  canonicalPositions,
}: AgencyPositionsSectionProps) {
  if (positions.length === 0 && canonicalPositions.length === 0) return null

  return (
    <section
      id="positions"
      aria-labelledby="agency-positions-heading"
      className={`${styles.relatedSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>OPEN POSITIONS</p>
        <h2 id="agency-positions-heading" className={styles.relatedSectionHeading}>
          ตำแหน่งงานภายใต้หน่วยงานนี้
        </h2>
        <p className={styles.relatedSectionDescription}>
          ตำแหน่งอยู่ภายใต้หน่วยงานนี้ พร้อมหน้าข้อมูลตำแหน่งฉบับสมบูรณ์เมื่อพร้อมเผยแพร่
        </p>
      </header>

      {canonicalPositions.length > 0 && (
        <ul className={styles.newsGrid}>
          {canonicalPositions.map((position) => (
            <li key={position.id} className={styles.newsCardItem}>
              <Link href={`/positions/${encodeURIComponent(position.slug)}`} className={styles.newsCard}>
                <span className={styles.newsIconWrap} aria-hidden="true">
                  <Briefcase className={styles.newsIcon} size={20} strokeWidth={1.5} />
                </span>
                <span className={styles.newsCardBody}>
                  <span className={styles.newsTitle}>{position.name}</span>
                  <span className={styles.contentCta}>
                    ดูข้อมูลตำแหน่ง
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {canonicalPositions.length === 0 && positions.length > 0 && (
        <ul className={styles.sourcesList}>
          {positions.map((position) => (
            <li key={position.id} className={styles.sourceItem}>
              <span className={styles.sourceLabel}>{position.name}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
