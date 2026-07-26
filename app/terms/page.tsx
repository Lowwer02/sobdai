import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'
import { createPageMetadata } from '@/lib/seo'

export const metadata: Metadata = createPageMetadata({
  title: `เงื่อนไขการให้บริการ | ${LEGAL.companyName}`,
  description: 'เงื่อนไขการให้บริการและข้อตกลงการใช้งานระบบสอบออนไลน์',
  path: '/terms',
})

export default async function TermsPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'terms.md')
  const content = fs.readFileSync(filePath, 'utf8')

  return (
    <LegalLayout 
      title="เงื่อนไขการให้บริการ (Terms of Service)"
      version={LEGAL.termsVersion}
      content={content}
    />
  )
}
