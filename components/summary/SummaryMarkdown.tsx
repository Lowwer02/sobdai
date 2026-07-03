'use client'

import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkGithubAlerts from 'remark-github-alerts'
import rehypeRaw from 'rehype-raw'

/**
 * Builds a URL-safe anchor id from a heading's text content. Supports Thai
 * characters. Kept in sync with the id generation in SummaryClient's TOC
 * extraction so TOC links resolve to the right heading.
 */
function slugifyChildren(children: React.ReactNode): string {
  const text = extractText(children)
  return text
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/g, '-')
    .replace(/(^-|-$)+/g, '')
}

/** Recursively pull plain text out of React children (strings/numbers/elements). */
function extractText(node: React.ReactNode): string {
  if (node == null || node === false) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    return extractText((node.props as { children?: React.ReactNode }).children)
  }
  return ''
}

interface SummaryMarkdownProps {
  content: string
}

/**
 * Renders Summary markdown content with a complete typography hierarchy,
 * GitHub-style alerts, responsive tables, and readable spacing.
 *
 * Wrapped in React.memo so scroll / TOC state changes in the parent do not
 * re-render the (potentially large) markdown tree.
 *
 * NOTE: this is intentionally a self-contained renderer — the `prose` classes
 * used previously had no effect because @tailwindcss/typography was never
 * installed, so every style must come from this component map.
 */
function SummaryMarkdownImpl({ content }: SummaryMarkdownProps) {
  return (
    <div className="summary-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkGithubAlerts]}
        rehypePlugins={[rehypeRaw]}
        components={{
          h1: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h1
                id={id}
                className="scroll-mt-24 font-display text-3xl md:text-4xl font-bold mt-14 mb-6 text-[#F5E9D6] leading-[1.25] tracking-tight"
                {...props}
              />
            )
          },
          h2: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h2
                id={id}
                className="scroll-mt-24 font-display text-2xl md:text-3xl font-bold mt-12 mb-5 text-[#F5E9D6] border-b border-[rgba(255,255,255,0.06)] pb-3 leading-[1.3]"
                {...props}
              />
            )
          },
          h3: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h3
                id={id}
                className="scroll-mt-24 font-display text-xl md:text-2xl font-bold mt-10 mb-4 text-[#F5E9D6] leading-[1.35]"
                {...props}
              />
            )
          },
          h4: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h4
                id={id}
                className="scroll-mt-24 text-lg md:text-xl font-bold mt-8 mb-3 text-[#F5E9D6] border-l-4 border-[#D4AF37] pl-4 py-1 bg-[rgba(212,175,55,0.04)] rounded-r-lg leading-[1.35]"
                {...props}
              />
            )
          },
          h5: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h5
                id={id}
                className="scroll-mt-24 text-base font-bold mt-6 mb-2 text-[#F5E9D6] uppercase tracking-wider"
                {...props}
              />
            )
          },
          h6: ({ node, ...props }) => {
            const id = slugifyChildren(props.children)
            return (
              <h6
                id={id}
                className="scroll-mt-24 text-sm font-bold mt-6 mb-2 text-[#A1866B] uppercase tracking-wider"
                {...props}
              />
            )
          },
          p: ({ node, ...props }) => (
            <p className="text-[#D6CBB8] leading-[1.85] mb-5 text-[15px] md:text-base" {...props} />
          ),
          a: ({ node, ...props }) => (
            <a
              className="text-[#D4AF37] underline decoration-[#D4AF37]/40 underline-offset-2 hover:decoration-[#D4AF37] transition-colors focus:outline-none focus:ring-2 focus:ring-[#D4AF37] rounded px-0.5"
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc pl-6 mb-5 mt-2 space-y-2 text-[#D6CBB8] marker:text-[#D4AF37]/60" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal pl-6 mb-5 mt-2 space-y-2 text-[#D6CBB8] marker:text-[#D4AF37]/60 marker:font-bold" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-[1.75] pl-1 [&>ul]:mt-2 [&>ol]:mt-2" {...props} />
          ),
          blockquote: ({ node, className, ...props }) => {
            // GitHub alerts are rendered by remark-github-alerts as a blockquote
            // with class "markdown-alert markdown-alert-{type}" — let those pass
            // through untouched. Only style plain blockquotes here.
            if (typeof className === 'string' && className.includes('markdown-alert')) {
              return <blockquote className={className} {...props} />
            }
            return (
              <blockquote className="border-l-4 border-[#A1866B]/50 bg-[rgba(255,255,255,0.02)] pl-5 pr-4 py-3 my-6 rounded-r-lg text-[#A1866B] italic leading-relaxed" {...props} />
            )
          },
          hr: ({ node, ...props }) => (
            <hr className="my-8 border-0 h-px bg-[rgba(255,255,255,0.08)]" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="my-6 overflow-x-auto rounded-xl border border-[rgba(255,255,255,0.06)] -mx-1 px-1">
              <div className="inline-block min-w-full align-middle">
                <table className="w-full text-left text-sm border-collapse" {...props} />
              </div>
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="sticky top-[3.5rem] z-10" {...props} />
          ),
          th: ({ node, ...props }) => (
            <th className="bg-[#1A140E] p-3 md:p-4 text-[#F5E9D6] font-bold text-left border-b border-[rgba(212,175,55,0.15)] whitespace-nowrap" {...props} />
          ),
          td: ({ node, ...props }) => (
            <td className="p-3 md:p-4 border-b border-[rgba(255,255,255,0.04)] bg-[#0F0B07] text-[#D6CBB8] align-top" {...props} />
          ),
          code: ({ node, className, children, ...props }) => {
            const match = /language-(\w+)/.exec(className || '')
            const isInline = !match && !String(children).includes('\n')
            return isInline ? (
              <code className="bg-[#1A140E] text-[#D4AF37] px-1.5 py-0.5 rounded-md text-[0.88em] border border-[rgba(212,175,55,0.18)] font-mono" {...props}>
                {children}
              </code>
            ) : (
              <code className={`${className ?? ''} font-mono`} {...props}>
                {children}
              </code>
            )
          },
          pre: ({ node, ...props }) => (
            <div className="relative group my-6">
              <div className="absolute -top-2.5 left-4 px-2 bg-[#0F0B07] text-[#A1866B] text-[10px] font-bold uppercase tracking-wider rounded">
                โค้ด
              </div>
              <pre className="bg-[#1A140E] p-4 pt-5 rounded-xl border border-[rgba(255,255,255,0.06)] overflow-x-auto text-[12.5px] md:text-[13px] leading-[1.7] text-[#F5E9D6]" {...props} />
            </div>
          ),
          img: ({ node, alt, src, ...props }) => (
            // Use a plain <img> rather than next/image: summary content images
            // come from arbitrary URLs (uploaded markdown), and opting every
            // one into next/image would require remotePatterns for unknown
            // hosts. Lazy loading + max-width keeps it safe and responsive.
            <span className="block my-6">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt={alt || ''}
                src={typeof src === 'string' ? src : undefined}
                loading="lazy"
                decoding="async"
                className="w-full h-auto rounded-2xl border border-[rgba(255,255,255,0.08)] shadow-[0_8px_30px_rgba(0,0,0,0.3)]"
                {...props}
              />
            </span>
          ),
          strong: ({ node, ...props }) => (
            <strong className="font-bold text-[#F5E9D6]" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="italic text-[#E5DCC8]" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

const SummaryMarkdown = React.memo(SummaryMarkdownImpl)
export default SummaryMarkdown
