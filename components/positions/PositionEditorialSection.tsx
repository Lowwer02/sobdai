import Image from 'next/image'
import { ZoomIn } from 'lucide-react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import styles from '@/app/positions/[slug]/positions.module.css'

interface PositionEditorialSectionProps {
  content: string | null
  entitySlug: string
}

interface EditorialHeading {
  id: string
  text: string
}

interface EditorialInfographic {
  path: string
  alt: string
}

interface EditorialSegment {
  markdown?: string
  infographic?: EditorialInfographic
}

function cleanHeadingText(value: string): string {
  return value
    .replace(/\s+#+\s*$/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim()
}

const editorialInfographics = {
  work: {
    path: '/images/positions/policy-and-plan-analyst-work-infographic.webp',
    alt: 'อินโฟกราฟิกอธิบายหน้าที่ของนักวิเคราะห์นโยบายและแผน',
  },
  skills: {
    path: '/images/positions/policy-and-plan-analyst-skills-infographic.webp',
    alt: 'อินโฟกราฟิกทักษะสำคัญของนักวิเคราะห์นโยบายและแผน',
  },
  growth: {
    path: '/images/positions/policy-and-plan-analyst-growth-infographic.webp',
    alt: 'อินโฟกราฟิกเส้นทางการเติบโตของสายงานนักวิเคราะห์นโยบายและแผน',
  },
} as const

const POSITION_ENTITY_SLUG = 'policy-and-plan-analyst'

function headingTextFromLine(line: string): string | null {
  const match = line.match(/^\s*(#{1,2})(?!#)\s+(.+?)\s*$/)
  return match ? cleanHeadingText(match[2]) : null
}

function isSkillsHeading(value: string): boolean {
  return value === 'คุณสมบัติของนักวิเคราะห์นโยบายและแผน'
    || value === 'คุณสมบัติเด่นของนักวิเคราะห์นโยบายและแผน'
}

function buildEditorialSegments(content: string, entitySlug: string): EditorialSegment[] {
  if (entitySlug !== POSITION_ENTITY_SLUG) return [{ markdown: content }]

  const lines = content.split(/\r?\n/)
  const segments: EditorialSegment[] = []
  let markdownLines: string[] = []

  const pushMarkdown = () => {
    if (markdownLines.length === 0) return
    const markdown = markdownLines.join('\n')
    if (markdown.trim()) segments.push({ markdown })
    markdownLines = []
  }

  for (const line of lines) {
    const headingText = headingTextFromLine(line)

    if (headingText === 'เตรียมสอบนักวิเคราะห์นโยบายและแผนอย่างไร') {
      pushMarkdown()
      segments.push({ infographic: editorialInfographics.growth })
    }

    markdownLines.push(line)

    if (headingText === 'นักวิเคราะห์นโยบายและแผน ทำงานอะไร') {
      pushMarkdown()
      segments.push({ infographic: editorialInfographics.work })
    }

    if (headingText && isSkillsHeading(headingText)) {
      pushMarkdown()
      segments.push({ infographic: editorialInfographics.skills })
    }
  }

  pushMarkdown()
  return segments
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

function PositionInfographic({ infographic }: { infographic: EditorialInfographic }) {
  return (
    <figure className={styles.editorialInfographic}>
      <a
        href={infographic.path}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.editorialInfographicLink}
        aria-label={`เปิดภาพขนาดเต็ม: ${infographic.alt}`}
      >
        <Image
          src={infographic.path}
          alt={infographic.alt}
          width={1672}
          height={941}
          sizes="(max-width: 768px) calc(100vw - 2rem), 800px"
          className={styles.editorialInfographicImage}
          loading="lazy"
          unoptimized
        />
        <span className={styles.editorialInfographicHint}>
          <ZoomIn size={14} aria-hidden="true" />
          <span>ดูภาพขนาดเต็ม</span>
        </span>
      </a>
    </figure>
  )
}

export default function PositionEditorialSection({
  content: sourceContent,
  entitySlug,
}: PositionEditorialSectionProps) {
  const headings = sourceContent ? extractEditorialHeadings(sourceContent) : []
  const segments = sourceContent ? buildEditorialSegments(sourceContent, entitySlug) : []

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
        {sourceContent && (
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
          {sourceContent ? (
            segments.map((segment, index) => (
              segment.infographic ? (
                <PositionInfographic key={`infographic-${index}`} infographic={segment.infographic} />
              ) : (
                <div key={`markdown-${index}`} className={styles.editorialMarkdownSegment}>
                  <SummaryMarkdown content={segment.markdown || ''} headingMode="positionEditorial" />
                </div>
              )
            ))
          ) : (
            <p className={styles.editorialFallback}>ข้อมูลภาพรวมของตำแหน่งนี้กำลังจัดทำ</p>
          )}
        </div>
      </div>
    </section>
  )
}
