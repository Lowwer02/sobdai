import React from 'react'
import { legalConfig } from '@/lib/legal'
import MarkdownRenderer from './MarkdownRenderer'

interface LegalLayoutProps {
  title: string
  version: string
  content: string
}

export default function LegalLayout({ title, version, content }: LegalLayoutProps) {
  return (
    <div className="min-h-screen bg-[#0F0B07] text-[#F5E9D6] py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-display font-bold text-[#D4AF37] mb-2">{title}</h1>
        <p className="text-[#A1866B] text-sm mb-8 border-b border-[rgba(212,175,55,0.1)] pb-4">
          อัปเดตล่าสุด: {legalConfig.lastUpdated} | เวอร์ชัน: {version}
        </p>

        <MarkdownRenderer content={content} />
      </div>
    </div>
  )
}
