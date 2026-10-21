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
    <div className="min-h-screen bg-background py-12 px-4 text-foreground sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="mb-2 text-3xl font-display font-bold text-brand">{title}</h1>
        <p className="mb-8 border-b border-border pb-4 text-sm text-muted-foreground">
          อัปเดตล่าสุด: {legalConfig.lastUpdated} | เวอร์ชัน: {version}
        </p>

        <MarkdownRenderer content={content} />
      </div>
    </div>
  )
}
