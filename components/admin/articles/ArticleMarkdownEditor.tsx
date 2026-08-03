'use client'

import { useRef, useState, useLayoutEffect, useCallback } from 'react'
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
import { ARTICLE_MAX_LENGTHS } from '@/lib/articles'

interface ArticleMarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

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
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={title}
      className="p-1.5 rounded hover:bg-[#D4AF37]/10 text-[#A1866B] hover:text-[#D4AF37] transition-colors"
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
  const [mobileTab, setMobileTab] = useState<'write' | 'preview'>('write')

  const adjustHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(300, el.scrollHeight)}px`
  }, [])

  useLayoutEffect(() => {
    adjustHeight()
  }, [value, adjustHeight])

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
    <div className="bg-[#0F0B07] border border-[#D4AF37]/20 rounded-xl overflow-hidden">
      {/* Toolbar */}
      <div className="bg-[#1A140E] border-b border-[#D4AF37]/20 px-3 py-2 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <ToolButton onClick={() => insertLinePrefix('## ')} title="หัวข้อ (H2)">
            <Heading size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('**')} title="ตัวหนา (**text**)">
            <Bold size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('*')} title="ตัวเอียง (*text*)">
            <Italic size={16} />
          </ToolButton>
          <span className="h-4 w-[1px] bg-[#D4AF37]/20 mx-1" />
          <ToolButton onClick={() => insertWrap('[', '](https://)', 'ข้อความลิงก์')} title="ใส่ลิงก์">
            <LinkIcon size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('- ')} title="รายการ (List)">
            <List size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('1. ')} title="ลำดับ (Ordered List)">
            <ListOrdered size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('> ')} title="อ้างอิง (Quote)">
            <Quote size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('`')} title="โค้ดคำสั่ง (`code`)">
            <Code size={16} />
          </ToolButton>
        </div>

        {/* Mobile Write/Preview Toggle */}
        <div className="md:hidden flex items-center bg-[#0F0B07] p-1 rounded-lg border border-[#D4AF37]/20">
          <button
            type="button"
            onClick={() => setMobileTab('write')}
            className={`px-2.5 py-1 text-xs font-semibold rounded ${
              mobileTab === 'write' ? 'bg-[#D4AF37] text-[#0F0B07]' : 'text-[#A1866B]'
            }`}
          >
            <Pencil size={12} className="inline mr-1" /> เขียน
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('preview')}
            className={`px-2.5 py-1 text-xs font-semibold rounded ${
              mobileTab === 'preview' ? 'bg-[#D4AF37] text-[#0F0B07]' : 'text-[#A1866B]'
            }`}
          >
            <Eye size={12} className="inline mr-1" /> ตัวอย่าง
          </button>
        </div>
      </div>

      {/* Editor & Preview Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#D4AF37]/20">
        {/* Write Pane */}
        <div className={`p-4 ${mobileTab === 'preview' ? 'hidden md:block' : 'block'}`}>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full bg-transparent text-[#F5E9D6] font-mono text-sm leading-relaxed focus:outline-none resize-none min-h-[300px]"
          />
          <div className="mt-2 text-right text-xs text-[#A1866B]">
            {value.length.toLocaleString()} / {ARTICLE_MAX_LENGTHS.body_markdown.toLocaleString()} ตัวอักษร
          </div>
        </div>

        {/* Preview Pane */}
        <div className={`p-4 bg-[#140F0A] overflow-y-auto max-h-[600px] ${mobileTab === 'write' ? 'hidden md:block' : 'block'}`}>
          <div className="text-xs text-[#A1866B] uppercase font-bold tracking-wider mb-3">
            ตัวอย่างการเรนเดอร์ (Live Preview)
          </div>
          {value.trim() ? (
            <SummaryMarkdown content={value} />
          ) : (
            <div className="text-sm text-[#A1866B]/50 italic">ยังไม่มีเนื้อหาสำหรับแสดงตัวอย่าง</div>
          )}
        </div>
      </div>
    </div>
  )
}
