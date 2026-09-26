import Link from 'next/link'
import Image from 'next/image'
import type { PublicAgencyAuthor } from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyHeroProps {
  name: string
  shortName: string | null
  updatedLabel: string
  author: PublicAgencyAuthor | null
  /** Optional organization logo; renders nothing when absent. */
  logoUrl?: string | null
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

export default function AgencyHero({ name, shortName, updatedLabel, author, logoUrl }: AgencyHeroProps) {
  return (
    <header className={styles.hero}>
      <div className={styles.heroContent}>
        {logoUrl && (
          <div className={styles.heroLogo}>
            <Image
              src={logoUrl}
              alt=""
              width={56}
              height={56}
              className={styles.heroLogoImage}
              unoptimized
            />
          </div>
        )}
        <p className={styles.eyebrow}>AGENCY DETAIL</p>
        <h1 className={styles.heroTitle}>{name}</h1>
        {shortName && (
          <p className={styles.heroLead}>
            รู้จักกันในชื่อ {shortName} — สำรวจตำแหน่ง แพ็กเกจเตรียมสอบ ข่าวรับสมัคร และบทความที่เชื่อมโยงกับหน่วยงานนี้
          </p>
        )}
        {!shortName && (
          <p className={styles.heroLead}>
            สำรวจตำแหน่ง แพ็กเกจเตรียมสอบ ข่าวรับสมัคร และบทความที่เชื่อมโยงกับหน่วยงานนี้
          </p>
        )}

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
    </header>
  )
}
