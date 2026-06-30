import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: `นโยบายความเป็นส่วนตัว | ${LEGAL.companyName}`,
  description: 'นโยบายการเก็บรักษาและคุ้มครองข้อมูลส่วนบุคคล (Privacy Policy)',
}

export default async function PrivacyPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'privacy.md')
  const content = fs.readFileSync(filePath, 'utf8')

  return (
    <LegalLayout 
      title="นโยบายความเป็นส่วนตัว (Privacy Policy)"
      version={LEGAL.privacyVersion}
      content={content}
    />
  )
}
