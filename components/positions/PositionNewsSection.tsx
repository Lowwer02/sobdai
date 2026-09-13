import Link from 'next/link'
import { ArrowUpRight, CalendarDays, Newspaper } from 'lucide-react'
import type { PublicPositionContentItem } from '@/lib/positions-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionNewsSectionProps {
  items: readonly PublicPositionContentItem[]
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

export default function PositionNewsSection({ items }: PositionNewsSectionProps) {
  if (items.length === 0) return null

  return (
    <section
      id="news"
      aria-labelledby="position-news-heading"
      className={`${styles.relatedSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>RECRUITMENT UPDATES</p>
        <h2 id="position-news-heading" className={styles.relatedSectionHeading}>
          ข่าวรับสมัครที่เกี่ยวข้อง
        </h2>
        <p className={styles.relatedSectionDescription}>
          ข่าวประชาสัมพันธ์และประกาศที่เชื่อมโยงกับตำแหน่งนี้
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
