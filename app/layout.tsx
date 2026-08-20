import type { Metadata, Viewport } from 'next'
import { Sarabun } from 'next/font/google'
import './globals.css'
import Navbar from '@/components/Navbar'
import ToastContainer from '@/components/admin/ToastContainer'
import Footer from '@/components/Footer'
import FloatingSupport from '@/components/FloatingSupport'
import ActivityProvider from '@/components/ActivityProvider'
import { getHomepageSettings } from '@/lib/homepageConfig'
import StructuredData from '@/components/StructuredData'
import { DEFAULT_OG_IMAGE, SITE_DESCRIPTION, SITE_NAME, SITE_URL, THEME_COLOR, createPageMetadata } from '@/lib/seo'
import { ConsentProvider } from '@/components/consent/ConsentProvider'
import { ConsentManager } from '@/components/consent/ConsentManager'
import { ConsentAnalyticsLoader } from '@/components/consent/ConsentAnalyticsLoader'

const sarabun = Sarabun({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sarabun',
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  ...createPageMetadata({
    title: 'สอบได้ — เตรียมสอบข้าราชการออนไลน์',
    description: SITE_DESCRIPTION,
    path: '/',
  }),
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  creator: SITE_NAME,
  publisher: SITE_NAME,
  keywords: ['สอบข้าราชการ', 'ข้อสอบราชการ', 'เตรียมสอบ', 'ก.พ.', 'ข้อสอบออนไลน์'],
  manifest: '/manifest.webmanifest',
  verification: {
    google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || 'google-site-verification-placeholder',
  },
}

export const viewport: Viewport = {
  themeColor: THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const homepageSettings = await getHomepageSettings()

  return (
    <html lang="th" className={sarabun.variable}>
      <head>
        <StructuredData
          data={{
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            '@id': `${SITE_URL}/#website`,
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
            inLanguage: 'th-TH',
            image: `${SITE_URL}${DEFAULT_OG_IMAGE}`,
            publisher: {
              '@id': `${SITE_URL}/#organization`,
            },
          }}
        />
      </head>
      <body className={`${sarabun.className} min-h-screen flex flex-col`}>
        <ConsentProvider>
          <ConsentAnalyticsLoader gtmId={process.env.NEXT_PUBLIC_GTM_ID} />
          <ConsentManager />
          <ActivityProvider />
          <Navbar />
          <main className="flex-grow">{children}</main>
          <Footer supportConfig={homepageSettings.support} footerConfig={homepageSettings.footer} />
          <FloatingSupport supportConfig={homepageSettings.support} />
          <ToastContainer />
        </ConsentProvider>
      </body>
    </html>
  )
}
