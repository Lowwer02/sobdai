import { ArrowUpRight } from 'lucide-react'
import type { FooterSocialLink } from '@/lib/homepageConfig'
import { getHomepageSettings } from '@/lib/homepageConfig'
import { normalizeSocialHttpUrl } from '@/lib/socialFollowConfig'
import styles from '@/app/contact/contact.module.css'

/**
 * ContactSocial — Section 04.5: Social Follow
 *
 * Compact social follow area for community and updates.
 *
 * IMPORTANT:
 *   - This is a SOCIAL FOLLOW channel for updates and articles.
 *   - It is NOT a customer support channel (no Facebook/LINE/TikTok support or SLA claims).
 *   - Renders ONLY enabled channels with valid URLs from the existing global CMS source.
 *   - Does NOT render disabled channels, empty URLs, or inactive fallbacks.
 *   - Does NOT hardcode production social URLs.
 *
 * Server Component — no 'use client'.
 */

export interface ContactSocialProps {
  socialLinks?: FooterSocialLink[]
}

function SocialIcon({ name, size = 20 }: { name: string; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
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
  if (name === 'tiktok') {
    return (
      <svg {...common}>
        <path d="M9 12a4 4 0 1 0 4 4V4c1 2 2.5 3.5 5 4" />
      </svg>
    )
  }
  return null
}

function getChannelActionLabel(key: string): string {
  switch (key) {
    case 'facebook':
      return 'ติดตามเพจ'
    case 'line':
      return 'เพิ่มเพื่อน'
    case 'tiktok':
      return 'ติดตาม'
    default:
      return 'ติดตาม'
  }
}

function getChannelAriaLabel(label: string, key: string): string {
  if (key === 'line') {
    return `เพิ่มเพื่อน Sobdai บน ${label} (เปิดหน้าต่างใหม่)`
  }
  return `ติดตาม Sobdai บน ${label} (เปิดหน้าต่างใหม่)`
}

function formatSocialHandle(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl)
    const host = parsed.hostname.replace(/^www\./, '')
    const pathname = parsed.pathname.replace(/\/$/, '')
    if (pathname && pathname !== '/') {
      return `${host}${pathname}`
    }
    return host
  } catch {
    return rawUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
  }
}

export function filterActiveSocialChannels(
  channels: readonly FooterSocialLink[] | undefined
): (FooterSocialLink & { validUrl: string })[] {
  if (!channels || !Array.isArray(channels)) return []

  const result: (FooterSocialLink & { validUrl: string })[] = []
  for (const ch of channels) {
    if (!ch || ch.active !== true) continue
    const validUrl = normalizeSocialHttpUrl(ch.url)
    if (!validUrl) continue
    result.push({
      ...ch,
      validUrl,
    })
  }
  return result
}

export default async function ContactSocial({ socialLinks }: ContactSocialProps = {}) {
  const masterLinks = socialLinks ?? (await getHomepageSettings()).footer.social_links
  const activeChannels = filterActiveSocialChannels(masterLinks)

  if (activeChannels.length === 0) {
    return null
  }

  return (
    <section aria-labelledby="contact-social-heading">
      <div className={styles.hairline} aria-hidden="true" />

      <div className={`${styles.sectionInner} ${styles.socialSection}`}>
        <div className={styles.socialBox}>
          <div className={styles.sectionHeaderCentered}>
            <p className={styles.eyebrow}>ติดตามเรา</p>
            <h2 id="contact-social-heading" className={styles.sectionHeading}>
              ติดตาม Sobdai
            </h2>
            <p className={styles.sectionSubhead}>
              ติดตามข่าวสาร เนื้อหาใหม่ และอัปเดตจาก Sobdai
            </p>
          </div>

          <div className={styles.socialList}>
            {activeChannels.map((channel) => {
              const displayHandle = formatSocialHandle(channel.validUrl)
              const actionLabel = getChannelActionLabel(channel.key)
              const ariaLabel = getChannelAriaLabel(channel.label, channel.key)

              return (
                <a
                  key={channel.key}
                  href={channel.validUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialCard}
                  id={`contact-social-${channel.key}`}
                  aria-label={ariaLabel}
                >
                  <div className={styles.socialCardLeft}>
                    <div className={styles.socialIconBox}>
                      <SocialIcon name={channel.key} size={20} />
                    </div>
                    <div>
                      <h3 className={styles.socialTitle}>{channel.label}</h3>
                      <p className={styles.socialHandle}>{displayHandle}</p>
                    </div>
                  </div>

                  <div className={styles.socialCardRight}>
                    <span>{actionLabel}</span>
                    <ArrowUpRight size={16} className={styles.socialArrow} aria-hidden="true" />
                  </div>
                </a>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}
