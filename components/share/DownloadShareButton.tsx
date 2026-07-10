'use client'

/**
 * DownloadShareButton — renders a ShareResultCard off-screen (visually hidden
 * but in the DOM, so html-to-image can capture it) and exports it to a
 * 1200×1200 PNG on click.
 *
 * Pure client-side: no upload, no DB, no API, no storage. The PNG is produced
 * in-browser and offered as a download.
 */

import { useState, useRef, useCallback } from 'react'
import { toPng } from 'html-to-image'
import { Download, Loader2 } from 'lucide-react'
import ShareResultCard, { type ShareResultCardProps } from './ShareResultCard'

interface DownloadShareButtonProps extends ShareResultCardProps {
  /** Optional filename for the downloaded PNG (without extension). */
  filename?: string
}

export default function DownloadShareButton(props: DownloadShareButtonProps) {
  const [downloading, setDownloading] = useState(false)
  const cardRef = useRef<HTMLDivElement>(null)

  const handleDownload = useCallback(async () => {
    const node = document.getElementById('sobdai-share-card')
    if (!node || downloading) return

    setDownloading(true)
    try {
      // pixelRatio: 1 because the card is already 1200×1200 — we want the
      // exact native pixels, not a 2x upscale.
      const dataUrl = await toPng(node, {
        pixelRatio: 1,
        cacheBust: true,
        width: 1200,
        height: 1200,
        backgroundColor: '#0F0B07',
      })

      const link = document.createElement('a')
      const name = props.filename || `sobdai-result-${props.scorePercent}`
      link.download = `${name}.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('ShareCard export failed:', err)
    } finally {
      setDownloading(false)
    }
  }, [downloading, props.filename, props.scorePercent])

  return (
    <>
      {/* Visible button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {downloading ? 'กำลังเตรียมรูป...' : 'ดาวน์โหลดรูปแชร์'}
      </button>

      {/* Off-screen render of the 1200×1200 card. Positioned absolutely off
          the viewport so it is in the DOM (capturable) but never visible.
          pointer-events:none + aria-hidden keep it out of interaction/a11y. */}
      <div
        aria-hidden="true"
        ref={cardRef}
        style={{
          position: 'fixed',
          left: -2000,
          top: 0,
          width: 1200,
          height: 1200,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <ShareResultCard {...props} />
      </div>
    </>
  )
}
