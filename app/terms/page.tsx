import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: `เงื่อนไขการให้บริการ | ${LEGAL.companyName}`,
  description: 'เงื่อนไขการให้บริการและข้อตกลงการใช้งานระบบสอบออนไลน์',
}

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
