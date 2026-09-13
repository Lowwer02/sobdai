import Link from 'next/link'
import type { PublicPositionAuthor } from '@/lib/positions-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionHeroProps {
  name: string
  updatedLabel: string
  author: PublicPositionAuthor | null
}

function BuildingMark() {
  return (
    <svg viewBox="0 0 144 144" className={styles.heroMarkIcon} aria-hidden="true">
      <path d="M31 112h82" className={styles.heroMarkLine} />
      <path d="M43 112V45l29-16 29 16v67" className={styles.heroMarkLine} />
      <path d="M55 54h10M79 54h10M55 70h10M79 70h10M55 86h10M79 86h10" className={styles.heroMarkWindow} />
      <path d="M68 112V92h16v20M72 29V19" className={styles.heroMarkLine} />
      <circle cx="72" cy="15" r="3" className={styles.heroMarkDot} />
    </svg>
  )
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" className={styles.metaIcon} aria-hidden="true">
      <rect x="3" y="4.5" width="14" height="12" rx="2" />
      <path d="M6.5 3v3M13.5 3v3M3 8h14" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 20 20" className={styles.metaIcon} aria-hidden="true">
      <circle cx="10" cy="7" r="3" />
      <path d="M4.5 16c.8-2.4 2.6-3.6 5.5-3.6s4.7 1.2 5.5 3.6" />
    </svg>
  )
}

export default function PositionHero({ name, updatedLabel, author }: PositionHeroProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        <p className={styles.eyebrow}>POSITION DETAIL</p>
        <h1 className={styles.heroTitle}>{name}</h1>
        <p className={styles.heroLead}>
          สำรวจหน่วยงาน แพ็กเกจเตรียมสอบ และเนื้อหาที่เชื่อมโยงกับตำแหน่งนี้
        </p>

        {(updatedLabel || author) && (
          <div className={styles.metaRow}>
            {updatedLabel && (
              <span className={styles.metaItem}>
                <CalendarIcon />
                <span>อัปเดตข้อมูล {updatedLabel}</span>
              </span>
            )}
            {author && (
              <span className={styles.metaItem}>
                <UserIcon />
                <span>
                  โดย{' '}
                  <Link
                    href={`/authors/${encodeURIComponent(author.slug)}`}
                    className={styles.metaLink}
                  >
                    {author.display_name}
                  </Link>
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      <div className={styles.heroEmblem} aria-hidden="true">
        <BuildingMark />
      </div>
    </header>
  )
}
