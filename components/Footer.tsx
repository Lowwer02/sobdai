'use client'

import Link from 'next/link'
import { legalConfig, socialLinks, type SocialLink } from '@/lib/legal'

/** Minimal outline social icons (lucide-react has no brand icons). */
function SocialIcon({ name, size = 20 }: { name: SocialLink['key']; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
  if (name === 'facebook') {
    return (
      <svg {...common}>
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    )
  }
  if (name === 'line') {
    return (
      <svg {...common}>
        <path d="M12 3C6.5 3 2 6.6 2 11c0 4 3.5 7.3 8.2 7.9.3.1.7.2.8.4.1.2 0 .8 0 1.1l-.1 1.2c0 .2-.1.5.4.2 2.7-1.5 4.7-3.4 6.1-5.2C19.3 14.7 22 13.1 22 11c0-4.4-4.5-8-10-8z" />
      </svg>
    )
  }
  // tiktok
  return (
    <svg {...common}>
      <path d="M9 12a4 4 0 1 0 4 4V4c1 2 2.5 3.5 5 4" />
    </svg>
  )
}

export default function Footer() {
  return (
    <footer className="bg-[#0F0B07] border-t border-[rgba(212,175,55,0.1)] py-12 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Top row: brand + legal links (unchanged layout) */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col items-center md:items-start">
            <div className="text-xl font-display font-bold text-[#D4AF37] mb-2 tracking-wide">
              {legalConfig.companyName}
            </div>
            <p className="text-[#A1866B] text-sm">
              &copy; {new Date().getFullYear()} {legalConfig.companyName}. สงวนลิขสิทธิ์
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 text-sm font-medium text-[#A1866B]">
            <Link href="/terms" className="hover:text-[#F5E9D6] transition-colors">
              เงื่อนไขการให้บริการ
            </Link>
            <Link href="/privacy" className="hover:text-[#F5E9D6] transition-colors">
              นโยบายความเป็นส่วนตัว
            </Link>
            <Link href="/cookies" className="hover:text-[#F5E9D6] transition-colors">
              นโยบายคุกกี้
            </Link>
            <Link href="/about" className="hover:text-[#F5E9D6] transition-colors">
              เกี่ยวกับเรา
            </Link>
            <Link href="/contact" className="hover:text-[#F5E9D6] transition-colors">
              ติดต่อเรา
            </Link>
          </div>
        </div>

        {/* Social section — sits above copyright, separated by a divider.
            Future-ready: disabled entries (active:false) render greyed and
            non-interactive, so flipping them on later needs no layout change. */}
        <div className="mt-8 pt-8 border-t border-[rgba(255,255,255,0.05)]">
          <div className="flex flex-col items-center gap-4">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-[#A1866B]">
              ติดตามเรา
            </span>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {socialLinks.map((social) => {
                const baseClass =
                  'inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors min-h-[44px]'
                if (!social.active) {
                  // Reserved slot — visible but disabled, ready for future.
                  return (
                    <span
                      key={social.key}
                      aria-disabled="true"
                      className={`${baseClass} border-[rgba(255,255,255,0.05)] text-[#5a4a3a] cursor-not-allowed`}
                    >
                      <SocialIcon name={social.key} />
                      {social.label}
                    </span>
                  )
                }
                return (
                  <a
                    key={social.key}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`ติดตาม Sobdai บน ${social.label}`}
                    className={`${baseClass} border-[rgba(255,255,255,0.08)] text-[#A1866B] hover:text-[#D4AF37] hover:border-[rgba(212,175,55,0.3)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]`}
                  >
                    <SocialIcon name={social.key} />
                    {social.label}
                  </a>
                )
              })}
            </div>
          </div>
        </div>

      </div>
    </footer>
  )
}
