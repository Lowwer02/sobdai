'use client'

import { useRef, useState, useEffect, useCallback } from 'react'
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

export type EditorMode = 'edit' | 'split' | 'preview'

const MAX_BODY = 100_000

interface MarkdownEditorProps {
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
      onMouseDown={e => e.preventDefault()} // keep textarea focus + selection
      onClick={onClick}
      title={title}
      aria-label={title}
      disabled={disabled}
      className="p-1.5 rounded hover:bg-[#D4AF37]/10 text-[#A1866B] hover:text-[#D4AF37] transition-colors disabled:opacity-40 disabled:pointer-events-none"
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [mode, setMode] = useState<EditorMode>('split')

  // Responsive default: Switch to 'edit' mode on small viewports (<768px) on mount
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMode('edit')
    }
  }, [])

  const restoreSelection = (start: number, end: number) => {
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(start, end)
    })
  }

  const insertWrap = useCallback(
    (prefix: string, suffix: string = prefix, defaultText: string = '') => {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
      const selected = value.slice(start, end) || defaultText
      const replacement = `${prefix}${selected}${suffix}`
      const next = value.slice(0, start) + replacement + value.slice(end)
      onChange(next)
      restoreSelection(start + prefix.length, start + prefix.length + selected.length)
    },
    [value, onChange]
  )

  const insertLinePrefix = useCallback(
    (prefix: string) => {
      const el = textareaRef.current
      if (!el) return
      const start = el.selectionStart
      const end = el.selectionEnd
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

  const applyLink = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = value.slice(start, end) || 'ข้อความลิงก์'
    const url = 'https://'
    const replacement = `[${selected}](${url})`
    const next = value.slice(0, start) + replacement + value.slice(end)
    onChange(next)
    const urlStart = start + 1 + selected.length + 2 // after `](`
    restoreSelection(urlStart, urlStart + url.length)
  }, [value, onChange])

  // Keyboard shortcuts: ⌘/Ctrl + B / I / K
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey
    if (!mod) return
    const k = e.key.toLowerCase()
    if (k === 'b') {
      e.preventDefault()
      insertWrap('**')
    } else if (k === 'i') {
      e.preventDefault()
      insertWrap('*')
    } else if (k === 'k') {
      e.preventDefault()
      applyLink()
    }
  }

  const overLimit = value.length > MAX_BODY

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
          <ToolButton onClick={() => insertWrap('**')} title="ตัวหนา (⌘B)" disabled={mode === 'preview'}>
            <Bold size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertWrap('*')} title="ตัวเอียง (⌘I)" disabled={mode === 'preview'}>
            <Italic size={16} />
          </ToolButton>
          <span className="h-4 w-[1px] bg-[#D4AF37]/20 mx-1" />
          <ToolButton onClick={applyLink} title="ใส่ลิงก์ (⌘K)" disabled={mode === 'preview'}>
            <LinkIcon size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('- ')} title="รายการแบบจุด" disabled={mode === 'preview'}>
            <List size={16} />
          </ToolButton>
          <ToolButton onClick={() => insertLinePrefix('1. ')} title="รายการแบบลำดับ" disabled={mode === 'preview'}>
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
              onChange={e => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              spellCheck={false}
              className="w-full flex-1 min-h-0 bg-transparent text-[#F5E9D6] font-mono text-sm leading-relaxed focus:outline-none resize-none overflow-y-auto"
            />
          </div>
          <div className="shrink-0 px-4 py-1.5 border-t border-[#D4AF37]/10 bg-[#140F0A]/50 flex items-center justify-between text-xs text-[#A1866B]">
            <span className="text-[11px] text-[#A1866B]/60 hidden sm:inline">Markdown Editor</span>
            <span className={`ml-auto text-[11px] ${overLimit ? 'text-red-400 font-semibold' : ''}`}>
              {value.length.toLocaleString()} / {MAX_BODY.toLocaleString()} ตัวอักษร
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
