import NewsSocialFollowLink from './NewsSocialFollowLink'
import type { ResolvedSocialChannel } from '@/lib/socialFollowConfig'

interface NewsSocialFollowBoxProps {
  heading: string
  description: string
  channels: readonly ResolvedSocialChannel[]
  contentId: string
}

/**
 * Public Social Follow Box — rendered near the bottom of news articles
 * (app/news/[slug]/page.tsx).
 *
 * Server Component (no 'use client'). Evaluates resolved channels and
 * renders a dark Sobdai gold card with external channel links via
 * NewsSocialFollowLink client leaf.
 * Returns null when no channels are available.
 */
export default function NewsSocialFollowBox({
  heading,
  description,
  channels,
  contentId,
}: NewsSocialFollowBoxProps) {
  if (!channels || channels.length === 0) return null

  return (
    <section aria-label="ติดตาม Sobdai" style={{ marginTop: 40 }}>
      <div className="card-gold" style={{ padding: '32px 28px' }}>
        {/* Gold eyebrow — mirrors NewsCtaBox and related content convention */}
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--gold-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 10,
          }}
        >
          ติดตาม Sobdai
        </p>

        <h2
          className="font-display"
          style={{
            fontSize: 'clamp(20px, 3vw, 26px)',
            fontWeight: 700,
            marginBottom: 10,
          }}
        >
          {heading}
        </h2>

        {description && (
          <p
            style={{
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
              marginBottom: 22,
            }}
          >
            {description}
          </p>
        )}

        {/* Channel Links — stack on mobile, inline on >=sm */}
        <div className="flex flex-col sm:flex-row gap-3">
          {channels.map((channel, index) => {
            const isPrimary = index === 0
            return (
              <NewsSocialFollowLink
                key={channel.key}
                platform={channel.key}
                url={channel.url}
                buttonLabel={channel.button_label}
                contentId={contentId}
                className={isPrimary ? 'btn-primary' : 'btn-outline'}
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}
