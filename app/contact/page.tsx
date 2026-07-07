import fs from 'fs'
import path from 'path'
import { Metadata } from 'next'
import { LEGAL } from '@/lib/legal'
import LegalLayout from '@/components/legal/LegalLayout'

export const metadata: Metadata = {
  title: `ติดต่อเรา | ${LEGAL.companyName}`,
  description: 'ช่องทางการติดต่อทีมงาน Sobdai และการแจ้งปัญหาการใช้งาน',
}

export default async function ContactPage() {
  const filePath = path.join(process.cwd(), 'content', 'legal', 'contact.md')
  const content = fs.readFileSync(filePath, 'utf8')

  return (
    <LegalLayout 
      title="ติดต่อเรา"
      version={LEGAL.contactVersion}
      content={content}
    />
  )
}
