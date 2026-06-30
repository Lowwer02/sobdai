import type { Metadata } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ToastContainer from '@/components/admin/ToastContainer'
import Footer from '@/components/Footer'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
  description: 'ระบบข้อสอบออนไลน์เตรียมสอบข้าราชการ ฝึกทำข้อสอบทีละข้อ มีคำใบ้และเฉลยละเอียด ครบทุกกรมทุกตำแหน่ง',
  keywords: ['สอบข้าราชการ', 'ข้อสอบราชการ', 'เตรียมสอบ', 'ก.พ.', 'ข้อสอบออนไลน์'],
  openGraph: {
    title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
    description: 'ฝึกทำข้อสอบทีละข้อ มีคำใบ้และเฉลยละเอียด',
    locale: 'th_TH',
    type: 'website',
  },
}

export const viewport = {
  themeColor: '#0f0b08',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className={sarabun.variable}>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <Navbar />
        <main className="flex-grow">{children}</main>
        <Footer />
        <ToastContainer />
      </body>
    </html>
  )
}
