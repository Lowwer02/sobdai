import type { MetadataRoute } from 'next'
import { SITE_DESCRIPTION, SITE_NAME, THEME_COLOR } from '@/lib/seo'

// The manifest is static: it cannot follow the runtime theme choice. The dark
// brand value is kept deliberately (it is the product's default identity, and
// an installed PWA launched from the home screen reads this before any JS).
// Browser chrome for in-app browsing does follow the theme via
// <meta name="theme-color"> (see app/layout.tsx + lib/theme.ts).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} - เตรียมสอบข้าราชการออนไลน์`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f0b08',
    theme_color: THEME_COLOR,
    icons: [
      {
        src: '/icon.png',
        sizes: 'any',
        type: 'image/png',
      },
      {
        src: '/apple-icon.png',
        sizes: 'any',
        type: 'image/png',
      },
    ],
  }
}
