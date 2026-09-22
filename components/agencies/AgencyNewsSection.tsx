import Link from 'next/link'
import { ArrowUpRight, CalendarDays, Newspaper } from 'lucide-react'
import type { PublicAgencyContentItem } from '@/lib/agencies-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface AgencyNewsSectionProps {
  items: readonly PublicAgencyContentItem[]
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function AgencyNewsSection({ items }: AgencyNewsSectionProps) {
  if (items.length === 0) return null

  return (
    <section
      id="news"
      aria-labelledby="agency-news-heading"
      className={`${styles.relatedSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>RECRUITMENT UPDATES</p>
        <h2 id="agency-news-heading" className={styles.relatedSectionHeading}>
          ข่าวรับสมัครของหน่วยงาน
        </h2>
        <p className={styles.relatedSectionDescription}>
          ประกาศและข่าวการรับสมัครที่เกี่ยวข้องกับหน่วยงานนี้
        </p>
      </header>

      <ul className={styles.newsGrid}>
        {items.map((item) => {
          const publishedLabel = formatDate(item.published_at)

          return (
            <li key={item.id} className={styles.newsCardItem}>
              <Link href={`/news/${encodeURIComponent(item.slug)}`} className={styles.newsCard}>
                <span className={styles.newsIconWrap} aria-hidden="true">
                  <Newspaper className={styles.newsIcon} size={20} strokeWidth={1.5} />
                </span>
                <span className={styles.newsCardBody}>
                  {publishedLabel && (
                    <time dateTime={item.published_at || undefined} className={styles.contentDate}>
                      <CalendarDays size={13} aria-hidden="true" />
                      {publishedLabel}
                    </time>
                  )}
                  <span className={styles.newsTitle}>{item.title}</span>
                  {item.excerpt && <span className={styles.newsExcerpt}>{item.excerpt}</span>}
                  <span className={styles.contentCta}>
                    อ่านข่าว
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
