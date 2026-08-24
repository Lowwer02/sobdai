'use client'

import { useRef, useState, useEffect } from 'react'
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
  Columns2,
} from 'lucide-react'
import SummaryMarkdown from '@/components/summary/SummaryMarkdown'
import { ARTICLE_MAX_LENGTHS } from '@/lib/articles'

export type EditorMode = 'edit' | 'split' | 'preview'

interface ArticleMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function ToolButton({
  onClick,
  title,
  children,
  disabled = false,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="p-1.5 rounded hover:bg-[#D4AF37]/10 text-[#A1866B] hover:text-[#D4AF37] transition-colors disabled:opacity-40 disabled:pointer-events-none"
    >
      {children}
    </button>
  )
}

export default function ArticleMarkdownEditor({
  value,
  onChange,
  placeholder = 'พิมพ์เนื้อหาบทความแบบ Markdown ที่นี่...',
}: ArticleMarkdownEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<EditorMode>('split')

  // Responsive default: Switch to 'edit' mode on small viewports (<768px) on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMode('edit')
    }
  }, [])

  const insertWrap = (prefix: string, suffix: string = prefix, defaultText: string = '') => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || defaultText
    const replacement = `${prefix}${selected}${suffix}`
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next)

    requestAnimationFrame(() => {
      el.focus()
      const newStart = start + prefix.length
      const newEnd = newStart + selected.length
      el.setSelectionRange(newStart, newEnd)
    })
  }

  const insertLinePrefix = (prefix: string) => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const lineStart = value.lastIndexOf('\n', start - 1) + 1
    const next = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    onChange(next)

    requestAnimationFrame(() => {
      el.focus()
      const cursor = start + prefix.length
      el.setSelectionRange(cursor, cursor)
    })
  }

  return (
    <div className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-xl overflow-hidden flex flex-col h-[68vh] min-h-[540px] max-h-[780px]">
      {/* Sticky / Fixed Header Toolbar */}
      <div className="shrink-0 bg-[#1A140E] border-b border-[#D4AF37]/20 px-3 py-2 flex items-center justify-between gap-2 flex-wrap z-10">
        {/* Markdown Actions */}
        <div
          className={`flex items-center gap-1 flex-wrap transition-opacity duration-150 ${
            mode === 'preview' ? 'opacity-30 pointer-events-none' : 'opacity-100'
          }`}
        >
          <ToolButton onClick={() => insertLinePrefix('## ')} title="หัวข้อ (H2)" disabled={mode === 'preview'}>
            <Heading size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('**')} title="ตัวหนา (**text**)" disabled={mode === 'preview'}>
            <Bold size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('*')} title="ตัวเอียง (*text*)" disabled={mode === 'preview'}>
            <Italic size={16} />
          </ToolButton>
          <span className="h-4 w-[1px] bg-[#D4AF37]/20 mx-1" />
          <ToolButton
            onClick={() => insertWrap('[', '](https://)', 'ข้อความลิงก์')}
            title="ใส่ลิงก์"
            disabled={mode === 'preview'}
          >
            <LinkIcon size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('- ')} title="รายการ (List)" disabled={mode === 'preview'}>
            <List size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('1. ')} title="ลำดับ (Ordered List)" disabled={mode === 'preview'}>
            <ListOrdered size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('> ')} title="อ้างอิง (Quote)" disabled={mode === 'preview'}>
            <Quote size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('`')} title="โค้ดคำสั่ง (`code`)" disabled={mode === 'preview'}>
            <Code size={16} />
          </ToolButton>
        </div>

        {/* Mode Selector (Edit | Split | Preview) */}
        <div className="flex items-center bg-[#0F0B07] p-0.5 rounded-lg border border-[#D4AF37]/20 shrink-0">
          <button
            type="button"
            onClick={() => setMode('edit')}
            title="โหมดเขียน (Edit)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'edit'
                ? 'bg-[#D4AF37] text-[#0F0B07] font-bold shadow-sm'
                : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[#D4AF37]/10'
            }`}
          >
            <Pencil size={13} />
            <span>Edit</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('split')}
            title="โหมดแบ่งจอ (Split)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'split'
                ? 'bg-[#D4AF37] text-[#0F0B07] font-bold shadow-sm'
                : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[#D4AF37]/10'
            }`}
          >
            <Columns2 size={13} />
            <span>Split</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            title="โหมดตัวอย่าง (Preview)"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md transition-all ${
              mode === 'preview'
                ? 'bg-[#D4AF37] text-[#0F0B07] font-bold shadow-sm'
                : 'text-[#A1866B] hover:text-[#F5E9D6] hover:bg-[#D4AF37]/10'
            }`}
          >
            <Eye size={13} />
            <span>Preview</span>
          </button>
        </div>
      </div>

      {/* Editor & Preview Workspace */}
      <div className="flex-1 min-h-0 relative flex divide-y md:divide-y-0 md:divide-x divide-[#D4AF37]/20 overflow-hidden">
        {/* Markdown Editor Pane */}
        <div
          className={`min-h-0 flex flex-col bg-[#0F0B07] ${
            mode === 'preview'
              ? 'hidden'
              : mode === 'edit'
              ? 'w-full flex-1'
              : 'w-full md:w-1/2 flex-1 md:flex-initial'
          }`}
        >
          <div className="flex-1 min-h-0 p-4 flex flex-col">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              className="w-full flex-1 min-h-0 bg-transparent text-[#F5E9D6] font-mono text-sm leading-relaxed focus:outline-none resize-none overflow-y-auto"
            />
          </div>
          <div className="shrink-0 px-4 py-1.5 border-t border-[#D4AF37]/10 bg-[#140F0A]/50 flex items-center justify-between text-xs text-[#A1866B]">
            <span className="text-[11px] text-[#A1866B]/60 hidden sm:inline">Markdown Editor</span>
            <span className="ml-auto text-[11px]">
              {value.length.toLocaleString()} / {ARTICLE_MAX_LENGTHS.body_markdown.toLocaleString()} ตัวอักษร
            </span>
          </div>
        </div>

        {/* Live Preview Pane */}
        <div
          className={`min-h-0 flex flex-col bg-[#140F0A] ${
            mode === 'edit'
              ? 'hidden'
              : mode === 'preview'
              ? 'w-full flex-1'
              : 'hidden md:flex md:w-1/2 md:flex-initial'
          }`}
        >
          <div className="shrink-0 px-4 py-2 border-b border-[#D4AF37]/10 flex items-center justify-between text-xs text-[#A1866B]">
            <span className="uppercase font-bold tracking-wider text-[11px]">ตัวอย่างการเรนเดอร์ (Live Preview)</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
            {value.trim() ? (
              <SummaryMarkdown content={value} />
            ) : (
              <div className="text-sm text-[#A1866B]/50 italic">ยังไม่มีเนื้อหาสำหรับแสดงตัวอย่าง</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
