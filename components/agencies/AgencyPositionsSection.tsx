import Link from 'next/link'
import { ArrowUpRight, BookOpen, Briefcase } from 'lucide-react'
import {
  resolveAgencyPositionCards,
  type AgencyPositionCard,
} from '@/lib/agency-profile'
import type { PublicAgencyOperationalPosition } from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyPositionsSectionProps {
  positions: readonly PublicAgencyOperationalPosition[]
  /** Optional extra classes (e.g. agency detail's first-section spacing). */
  className?: string
}

function PositionCard({ card }: { card: AgencyPositionCard }) {
  // Informational-only card (no canonical Position Entity and no related
  // package): still rendered, never a fake CTA.
  if (!card.cta) {
    return (
      <div className={styles.newsCard}>
        <span className={styles.newsIconWrap} aria-hidden="true">
          <Briefcase className={styles.newsIcon} size={20} strokeWidth={1.5} />
        </span>
        <span className={styles.newsCardBody}>
          <span className={styles.newsTitle}>{card.name}</span>
          <span className={styles.newsExcerpt}>ข้อมูลเพิ่มเติมกำลังจัดเตรียม</span>
        </span>
      </div>
    )
  }

  const isPackageCta = card.cta.href.startsWith('/package/')

  return (
    <Link href={card.cta.href} className={styles.newsCard}>
      <span className={styles.newsIconWrap} aria-hidden="true">
        {isPackageCta ? (
          <BookOpen className={styles.newsIcon} size={20} strokeWidth={1.5} />
        ) : (
          <Briefcase className={styles.newsIcon} size={20} strokeWidth={1.5} />
        )}
      </span>
      <span className={styles.newsCardBody}>
        <span className={styles.newsTitle}>{card.name}</span>
        <span className={styles.contentCta}>
          {card.cta.label}
          <ArrowUpRight size={15} aria-hidden="true" />
        </span>
      </span>
    </Link>
  )
}

export default function AgencyPositionsSection({
  positions,
  className,
}: AgencyPositionsSectionProps) {
  const cards = resolveAgencyPositionCards(positions)
  if (cards.length === 0) return null

  return (
    <section
      id="positions"
      aria-labelledby="agency-positions-heading"
      className={[
        styles.relatedSection,
        styles.anchorSection,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <header className={styles.relatedSectionHeader}>
        <h2 id="agency-positions-heading" className={styles.relatedSectionHeading}>
          ตำแหน่งที่เกี่ยวข้อง
        </h2>
        <p className={styles.relatedSectionDescription}>
          ตำแหน่งที่ Sobdai มีข้อมูลหรือชุดเตรียมสอบที่เกี่ยวข้องกับหน่วยงานนี้
        </p>
      </header>

      <ul className={styles.newsGrid}>
        {cards.map((card) => (
          <li key={card.id} className={styles.newsCardItem}>
            <PositionCard card={card} />
          </li>
        ))}
      </ul>
    </section>
  )
}
