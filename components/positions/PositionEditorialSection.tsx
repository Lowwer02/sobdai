import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionEditorialSectionProps {
  content: string | null
}

interface EditorialHeading {
  id: string
  text: string
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

function slugifyHeading(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

function extractEditorialHeadings(content: string): EditorialHeading[] {
  const parsed = content
    .split(/\r?\n/)
    .flatMap((line) => {
      const match = line.match(/^\s*(#{1,2})(?!#)\s+(.+?)\s*$/)
      if (!match) return []
      return [{ level: match[1].length, text: cleanHeadingText(match[2]) }]
    })

  // Position overviews are authored as Markdown H2 sections. The H1
  // fallback keeps the position-local navigation resilient to older rows
  // that used the renderer's legacy H1 convention.
  const sourceHeadings = parsed.filter((heading) => heading.level === 2)
  const headings = sourceHeadings.length > 0
    ? sourceHeadings
    : parsed.filter((heading) => heading.level === 1)
  const usedIds = new Map<string, number>()

  return headings.map((heading, index) => {
    const baseId = slugifyHeading(heading.text) || `editorial-section-${index + 1}`
    const occurrence = usedIds.get(baseId) ?? 0
    usedIds.set(baseId, occurrence + 1)
    return {
      text: heading.text,
      id: occurrence === 0 ? baseId : `${baseId}-${occurrence + 1}`,
    }
  })
}

export default function PositionEditorialSection({ content }: PositionEditorialSectionProps) {
  const headings = content ? extractEditorialHeadings(content) : []

  return (
    <section
      id="overview"
      aria-labelledby="position-overview-heading"
      className={`${styles.editorialSection} ${styles.anchorSection}`}
    >
      <header className={styles.editorialIntro}>
        <p className={styles.sectionEyebrow}>EDITORIAL OVERVIEW</p>
        <h2 id="position-overview-heading" className={styles.editorialIntroHeading}>
          ข้อมูลและบทบาทหน้าที่ของตำแหน่ง
        </h2>
        {content && (
          <p className={styles.editorialIntroDescription}>
            อ่านภาพรวมหน้าที่ คุณสมบัติ เนื้อหาการสอบ และแนวทางเตรียมตัวจากเนื้อหาที่เชื่อมโยงกับตำแหน่งนี้
          </p>
        )}
      </header>

      <div className={styles.editorialLayout}>
        {headings.length > 0 && (
          <aside className={styles.editorialToc} aria-labelledby="position-editorial-toc-heading">
            <p id="position-editorial-toc-heading" className={styles.editorialTocHeading}>
              <span className={styles.editorialTocMarker} aria-hidden="true" />
              สารบัญเนื้อหา
            </p>
            <nav aria-labelledby="position-editorial-toc-heading">
              <ol className={styles.editorialTocList}>
                {headings.map((heading, index) => (
                  <li key={heading.id}>
                    <a href={`#${heading.id}`} className={styles.editorialTocLink}>
                      <span className={styles.editorialTocIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <span>{heading.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        )}

        <div id="position-editorial-body" className={`${styles.editorialBody} ${styles.editorialMarkdown}`}>
          {content ? (
            <SummaryMarkdown content={content} headingMode="positionEditorial" />
          ) : (
            <p className={styles.editorialFallback}>ข้อมูลภาพรวมของตำแหน่งนี้กำลังจัดทำ</p>
          )}
        </div>
      </div>
    </section>
  )
}
