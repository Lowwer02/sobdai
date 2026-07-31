'use client'

import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import {
  Heading,
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Code,
  Eye,
  Pencil,
} from 'lucide-react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'

/**
 * Lightweight Markdown editor: a controlled textarea with a formatting
 * toolbar, an autosizing surface, a character counter, keyboard shortcuts, and
 * a live preview that reuses the canonical SummaryMarkdown renderer (the same
 * component that renders this markdown publicly — so the preview is faithful).
 *
 * No WYSIWYG / contentEditable / execCommand: per the codebase convention
 * (SummaryEditor) the editor is a plain textarea; this adds the toolbar +
 * split-view that the news body needs. All formatting is plain textarea
 * selection manipulation (setSelectionRange) — no editor framework introduced.
 *
 * Layout: split (editor | preview) on desktop (md+); a Write/Preview toggle on
 * mobile where split won't fit.
 *
 * The nominal body cap mirrors lib/news.ts MAX.body_markdown (100,000). It is
 * informational only — draft validation does not enforce a body length; the
 * counter just surfaces size.
 */

const MAX_BODY = 100_000

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

/** A toolbar button. type="button" so it never submits the parent form. */
function ToolButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()} // keep textarea focus + selection
      onClick={onClick}
      title={title}
      aria-label={title}
      className="p-2 text-[#A1866B] hover:text-[#D4AF37] hover:bg-[#D4AF37]/10 rounded-lg transition-colors"
    >
      {children}
    </button>
  )
}

export default function MarkdownEditor({
  value,
  onChange,
  placeholder = 'เริ่มเขียนเนื้อหาที่นี่...',
}: MarkdownEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const [mobileView, setMobileView] = useState<'write' | 'preview'>('write')

  // Autosize: grow to fit content, floor at 320px. Runs after every value change
  // (typed or toolbar-inserted). useLayoutEffect avoids a visible height flicker.
  useLayoutEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, 320)}px`
  }, [value])

  // Restore focus + selection AFTER the controlled re-render commits. requestIdle
  // is too late; rAF (before paint, after commit) is the standard fit here.
  const restoreSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = taRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(start, end)
    })
  }

  /** Wrap the current selection with `before`/`after` markers (bold/italic/code). */
  const wrapSelection = useCallback(
    (before: string, after: string = before) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const sel = value.slice(start, end)
      const next = value.slice(0, start) + before + sel + after + value.slice(end)
      onChange(next)
      restoreSelection(start + before.length, start + before.length + sel.length)
    },
    [value, onChange]
  )

  /** Prefix every line in the selection (heading/list/quote). */
  const prefixLines = useCallback(
    (prefix: string) => {
      const ta = taRef.current
      if (!ta) return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      // Expand to whole lines so a partial-line selection prefixes cleanly.
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      const nl = value.indexOf('\n', end)
      const lineEnd = nl === -1 ? value.length : nl
      const block = value.slice(lineStart, lineEnd)
      const replaced = block.split('\n').map(l => prefix + l).join('\n')
      const next = value.slice(0, lineStart) + replaced + value.slice(lineEnd)
      onChange(next)
      restoreSelection(lineStart, lineStart + replaced.length)
    },
    [value, onChange]
  )

  /** Insert a markdown link, selecting the URL placeholder for quick replacement. */
  const applyLink = useCallback(() => {
    const ta = taRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const sel = value.slice(start, end) || 'ข้อความลิงก์'
    const url = 'https://'
    const insert = `[${sel}](${url})`
    const next = value.slice(0, start) + insert + value.slice(end)
    onChange(next)
    const urlStart = start + 1 + sel.length + 2 // after `](`
    restoreSelection(urlStart, urlStart + url.length)
  }, [value, onChange])

  // Keyboard shortcuts: ⌘/Ctrl + B / I / K. "Where existing editor utilities
  // allow" — there are none, so these are standard textarea-level handlers.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'b') {
      e.preventDefault()
      wrapSelection('**')
    } else if (k === 'i') {
      e.preventDefault()
      wrapSelection('*')
    } else if (k === 'k') {
      e.preventDefault()
      applyLink()
    }
  }

  const overLimit = value.length > MAX_BODY
  const showPreview = value.trim().length > 0

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-1 flex-wrap bg-[#0F0B07] border border-[rgba(255,255,255,0.06)] rounded-xl px-2 py-1.5">
        <ToolButton onClick={() => prefixLines('## ')} title="หัวข้อ (Heading)">
          <Heading size={16} />
        </ToolButton>
        <ToolButton onClick={() => wrapSelection('**')} title="ตัวหนา (⌘B)">
          <Bold size={16} />
        </ToolButton>
        <ToolButton onClick={() => wrapSelection('*')} title="ตัวเอียง (⌘I)">
          <Italic size={16} />
        </ToolButton>
        <ToolButton onClick={applyLink} title="ลิงก์ (⌘K)">
          <LinkIcon size={16} />
        </ToolButton>
        <span className="w-px h-5 bg-[rgba(255,255,255,0.08)] mx-1" />
        <ToolButton onClick={() => prefixLines('- ')} title="รายการแบบจุด">
          <List size={16} />
        </ToolButton>
        <ToolButton onClick={() => prefixLines('1. ')} title="รายการแบบตัวเลข">
          <ListOrdered size={16} />
        </ToolButton>
        <ToolButton onClick={() => prefixLines('> ')} title="อ้างอิง (Quote)">
          <Quote size={16} />
        </ToolButton>
        <ToolButton onClick={() => wrapSelection('`')} title="โค้ด (Code)">
          <Code size={16} />
        </ToolButton>
      </div>

      {/* Mobile Write/Preview toggle (split is desktop-only) */}
      <div className="md:hidden flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMobileView('write')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
            mobileView === 'write'
              ? 'bg-[#D4AF37]/15 text-[#D4AF37]'
              : 'text-[#A1866B] hover:text-[#F5E9D6]'
          }`}
        >
          <Pencil size={14} /> เขียน
        </button>
        <button
          type="button"
          onClick={() => setMobileView('preview')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 transition-colors ${
            mobileView === 'preview'
              ? 'bg-[#D4AF37]/15 text-[#D4AF37]'
              : 'text-[#A1866B] hover:text-[#F5E9D6]'
          }`}
        >
          <Eye size={14} /> ตัวอย่าง
        </button>
      </div>

      {/* Split view: both panes on desktop; one pane on mobile per the toggle */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Editor pane */}
        <div className={mobileView === 'preview' ? 'hidden md:block' : ''}>
          <div className="bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
            <textarea
              ref={taRef}
              value={value}
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              spellCheck={false}
              className="w-full bg-transparent text-[#F5E9D6] p-4 resize-none focus:outline-none font-mono text-sm leading-relaxed"
            />
          </div>
          <div className="flex justify-between items-center mt-1.5 px-1">
            <p className="text-[10px] text-[#A1866B]">รองรับ Markdown</p>
            <p className={`text-[10px] ${overLimit ? 'text-red-400' : 'text-[#A1866B]'}`}>
              {value.length.toLocaleString()} / {MAX_BODY.toLocaleString()} ตัวอักษร
            </p>
          </div>
        </div>

        {/* Preview pane */}
        <div className={mobileView === 'write' ? 'hidden md:block' : ''}>
          <div className="min-h-[320px] bg-[#0F0B07] border border-[rgba(255,255,255,0.08)] rounded-xl p-4 overflow-y-auto max-h-[640px]">
            {showPreview ? (
              <SummaryMarkdown content={value} />
            ) : (
              <p className="text-[#A1866B] italic text-sm">ยังไม่มีเนื้อหาให้แสดงตัวอย่าง</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
