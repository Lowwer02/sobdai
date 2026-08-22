import { ExternalLink, BookOpen } from 'lucide-react'
import type { ArticleSource } from '@/lib/articles'

interface ArticleReferencesProps {
  sources?: ArticleSource[] | null
}

export function formatThaiSourceDate(isoDate?: string | null): string {
  if (!isoDate || typeof isoDate !== 'string') return ''
  const trimmed = isoDate.trim()
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const d = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(d.getTime())) return ''
  try {
    return d.toLocaleDateString('th-TH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return ''
  }
}

export default function ArticleReferences({ sources }: ArticleReferencesProps) {
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return null
  }

  // Filter out any invalid / empty rows safely
  const validSources = sources.filter((s) => s && s.title && s.url)
  if (validSources.length === 0) {
    return null
  }

  return (
    <section
      aria-label="เอกสารและแหล่งข้อมูลอ้างอิง"
      className="bg-[#1A140E]/80 border border-[#D4AF37]/20 rounded-2xl p-5 sm:p-7 space-y-4"
    >
      <div className="flex items-center gap-2 border-b border-[#D4AF37]/15 pb-3">
        <BookOpen size={18} className="text-[#D4AF37] shrink-0" />
        <h2 className="text-base sm:text-lg font-bold text-[#F5E9D6]">
          เอกสารและแหล่งข้อมูลอ้างอิง
        </h2>
      </div>

      <ul className="space-y-3 list-none p-0 m-0">
        {validSources.map((source, index) => {
          const formattedDate = formatThaiSourceDate(source.source_date)
          return (
            <li
              key={index}
              className="flex items-start gap-2.5 text-xs sm:text-sm text-[#E5D7C5] group leading-relaxed"
            >
              <span className="text-[#D4AF37]/60 font-mono text-xs select-none shrink-0 mt-0.5">
                [{index + 1}]
              </span>
              <div className="flex-1 min-w-0">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[#F5E9D6] hover:text-[#D4AF37] underline decoration-[#D4AF37]/30 hover:decoration-[#D4AF37] transition-colors break-words"
                >
                  <span>{source.title}</span>
                  <ExternalLink size={13} className="text-[#D4AF37] shrink-0 opacity-70 group-hover:opacity-100 transition-opacity ml-0.5 inline" />
                </a>
                {formattedDate && (
                  <span className="block text-[11px] sm:text-xs text-[#A1866B] mt-0.5">
                    วันที่เอกสาร: {formattedDate}
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
