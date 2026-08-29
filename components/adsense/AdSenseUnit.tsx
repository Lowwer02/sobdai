'use client'

import { useEffect, useRef } from 'react'
import Script from 'next/script'
import { ADSENSE_LABEL } from '@/lib/adsense'

interface AdSenseUnitProps {
  clientId: string
  slotId: string
}

/**
 * The ONE AdSense manual responsive display unit (M3 Conservative) — the only
 * client island in the feature, and the ONLY place the AdSense network script
 * is ever requested: because surfaces mount this component only when the
 * content opted in AND the platform config resolved, the script cost is paid
 * exclusively by eligible /news/[slug] and /articles/[slug] renderings. Root
 * layout, listings, and all Core Product routes never mount it.
 *
 * SCRIPT LOADING
 *   - next/script `afterInteractive` keeps the page server-first: the label +
 *     <ins> are server-rendered; Google's JS hydrates afterwards. A stable
 *     script id (`adsbygoogle-init-<clientId>`) lets next/script dedupe
 *     injection across client-side navigations between eligible pages, so the
 *     network script is fetched once per session, not once per mount.
 *   - NO global loader, NO Auto Ads, NO vignette/anchor/multiplex config: the
 *     URL carries only the mandatory `client` parameter (adding Google's Auto
 *     Ads/`host`/`url-group` parameters would opt the site into page-level
 *     formats the M3 spec bans).
 *
 * NON-PERSONALIZED ADS
 *   - `requestNonPersonalizedAds = 1` is set before the first push. Sobdai's
 *     consent system (lib/consent.ts) has NO advertising category
 *     (`marketing` is hard-false; the banner collects analytics consent only),
 *     so the analytics flag must NOT be reused as an ads gate. Requesting
 *     non-personalized ads is Google's supported conservative posture for a
 *     property without a certified CMP; it also keeps behavior identical for
 *     consent-declining visitors (no per-user branching to maintain).
 *
 * DUPLICATE-PUSH SAFETY
 *   - The push effect is guarded by a data attribute on the <ins>, so React
 *     StrictMode's double-invoked effects (dev) or an island remount cannot
 *     enqueue a second `adsbygoogle.push({})` for the same slot — which would
 *     log "All ins elements already have ads" noise on every navigation.
 *
 * LAYOUT
 *   - A modest reserved min-height on the ins reduces layout shift when the
 *     unit fills, while staying a small strip (not a huge blank block) when it
 *     doesn't — there is intentionally NO fake placeholder visual. Only the
 *     container/label is styled; the Google ad content itself is untouched
 *     (per AdSense policy) and the strict `ca-pub-<digits>` / numeric slot
 *     validation in lib/adsense.ts makes attribute injection impossible.
 */
export default function AdSenseUnit({ clientId, slotId }: AdSenseUnitProps) {
  const insRef = useRef<HTMLModElement | null>(null)

  useEffect(() => {
    const ins = insRef.current
    if (!ins || ins.getAttribute('data-adsbygoogle-requested') === 'true') return
    ins.setAttribute('data-adsbygoogle-requested', 'true')

    const w = window as typeof window & {
      adsbygoogle?: unknown[] & { requestNonPersonalizedAds?: number }
    }
    w.adsbygoogle = w.adsbygoogle || []
    w.adsbygoogle.requestNonPersonalizedAds = 1
    try {
      w.adsbygoogle.push({})
    } catch {
      // Script blocked/failed → the <ins> simply stays an empty strip.
    }
  }, [])

  return (
    <aside
      aria-label={ADSENSE_LABEL}
      data-testid="adsense-unit"
      style={{ marginTop: 40, marginBottom: 8 }}
    >
      {/* Gold eyebrow label — same muted uppercase convention as the affiliate
          rail's "แนะนำจากพันธมิตร", so the ad reads as clearly distinct from
          editorial content without shouting. */}
      <p
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginBottom: 8,
        }}
      >
        {ADSENSE_LABEL}
      </p>
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 120 }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
      <Script
        id={`adsbygoogle-init-${clientId}`}
        strategy="afterInteractive"
        async
        crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(clientId)}`}
      />
    </aside>
  )
}
