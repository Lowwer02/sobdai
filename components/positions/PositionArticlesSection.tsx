import Link from 'next/link'
import { ArrowUpRight, BookOpen, CalendarDays } from 'lucide-react'
import type { PublicPositionContentItem } from '@/lib/positions-public'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionArticlesSectionProps {
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

export default function PositionArticlesSection({ items }: PositionArticlesSectionProps) {
  if (items.length === 0) return null

  return (
    <section
      id="articles"
      aria-labelledby="position-articles-heading"
      className={`${styles.relatedSection} ${styles.articlesSection} ${styles.anchorSection}`}
    >
      <header className={styles.relatedSectionHeader}>
        <p className={styles.sectionEyebrow}>STUDY NOTES</p>
        <h2 id="position-articles-heading" className={styles.relatedSectionHeading}>
          บทความเตรียมสอบที่เกี่ยวข้อง
        </h2>
        <p className={styles.relatedSectionDescription}>
          บทความอ่านประกอบเพื่อทบทวนเนื้อหาและวางแผนการเตรียมสอบ
        </p>
      </header>

      <ul className={styles.articleGrid}>
        {items.map((item) => {
          const publishedLabel = formatDate(item.published_at)

          return (
            <li key={item.id} className={styles.articleCardItem}>
              <Link href={`/articles/${encodeURIComponent(item.slug)}`} className={styles.articleCard}>
                <span className={styles.articleCardTop}>
                  <span className={styles.articleIconWrap} aria-hidden="true">
                    <BookOpen className={styles.articleIcon} size={19} strokeWidth={1.5} />
                  </span>
                  {publishedLabel && (
                    <time dateTime={item.published_at || undefined} className={styles.contentDate}>
                      <CalendarDays size={13} aria-hidden="true" />
                      {publishedLabel}
                    </time>
                  )}
                </span>
                <span className={styles.articleTitle}>{item.title}</span>
                {item.excerpt && <span className={styles.articleExcerpt}>{item.excerpt}</span>}
                <span className={styles.contentCta}>
                  อ่านบทความ
                  <ArrowUpRight size={15} aria-hidden="true" />
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
