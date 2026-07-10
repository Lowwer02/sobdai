'use client'

/**
 * DownloadShareButton — renders a ShareResultCard off-screen and either:
 *   (a) shares it via the Web Share API (native share sheet) when supported,
 *       passing the PNG as a file so LINE/Facebook/Messenger/Threads/
 *       Instagram/X are all offered by the OS; or
 *   (b) falls back to a plain PNG download.
 *
 * Session 6.14.1:
 *   - Awaits `document.fonts.ready` before exporting so the Supermarket font
 *     is guaranteed to render into the PNG (no fallback font in the export).
 *   - Adds Native Share with automatic PNG-download fallback.
 *
 * Pure client-side: no upload, no DB, no API, no storage.
 */

import { useState, useRef, useCallback } from 'react'
import { toPng } from 'html-to-image'
import { Share2, Download, Loader2 } from 'lucide-react'
import ShareResultCard, { type ShareResultCardProps } from './ShareResultCard'

interface DownloadShareButtonProps extends ShareResultCardProps {
  filename?: string
}

export default function DownloadShareButton(props: DownloadShareButtonProps) {
  const [busy, setBusy] = useState<'share' | 'download' | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Produce the PNG data URL. Ensures the Supermarket font is loaded first so
  // the export never falls back to a system font.
  const renderPng = useCallback(async (): Promise<Blob> => {
    const node = document.getElementById('sobdai-share-card')
    if (!node) throw new Error('share card node not found')

    // Wait for webfonts so html-to-image bakes the real glyphs into the PNG.
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready } catch { /* fonts API best-effort */ }
    }

    const dataUrl = await toPng(node, {
      pixelRatio: 1,
      cacheBust: true,
      // width is fixed (1200); height is NOT passed so html-to-image uses the
      // node's real rendered height (content-driven). Passing height:1200 was
      // clipping the bottom when content exceeded 1200px.
      width: 1200,
      backgroundColor: '#0F0B07',
    })

    const res = await fetch(dataUrl)
    return res.blob()
  }, [])

  const baseFilename = props.filename || `sobdai-result-${props.scorePercent}`

  // Native share: try Web Share API with a file (best — native sheet handles
  // all apps). If unsupported or it fails, fall back to download.
  const handleShare = useCallback(async () => {
    if (busy) return
    setBusy('share')
    try {
      const blob = await renderPng()
      const file = new File([blob], `${baseFilename}.png`, { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean
        share?: (data: ShareData) => Promise<void>
      }

      const shareData: ShareData = {
        title: 'Sobdai — สรุปผลการทดสอบ',
        text: `ทำข้อสอบได้ ${props.scorePercent}% บน Sobdai`,
      }

      // Prefer sharing the image file when the browser allows it.
      if (nav.canShare && nav.canShare({ ...shareData, files: [file] }) && nav.share) {
        await nav.share({ ...shareData, files: [file] })
        return
      }

      // Text-only share (no image) if the browser supports Web Share but not
      // file sharing.
      if (nav.share) {
        await nav.share(shareData)
        return
      }

      // No Web Share API at all → download the PNG.
      triggerDownload(blob, `${baseFilename}.png`)
    } catch (err) {
      // User cancelling the share sheet throws AbortError — don't log that.
      const name = (err as { name?: string })?.name
      if (name !== 'AbortError') console.error('Share failed:', err)
    } finally {
      setBusy(null)
    }
  }, [busy, renderPng, baseFilename, props.scorePercent])

  // Plain PNG download (always available as an explicit option).
  const handleDownload = useCallback(async () => {
    if (busy) return
    setBusy('download')
    try {
      const blob = await renderPng()
      triggerDownload(blob, `${baseFilename}.png`)
    } catch (err) {
      console.error('ShareCard download failed:', err)
    } finally {
      setBusy(null)
    }
  }, [busy, renderPng, baseFilename])

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.download = filename
    link.href = url
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const sharing = busy === 'share'
  const downloading = busy === 'download'

  return (
    <>
      {/* Primary: Native Share (auto-fallbacks to download internally) */}
      <button
        type="button"
        onClick={handleShare}
        disabled={!!busy}
        className="flex-1 bg-[#D4AF37] hover:bg-[#F1D17A] text-[#1A140E] font-bold py-4 px-6 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {sharing ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
        {sharing ? 'กำลังเตรียม...' : 'แชร์ผลลัพธ์'}
      </button>

      {/* Secondary: explicit PNG download */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={!!busy}
        className="flex-1 bg-transparent border border-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.05)] text-[#F5E9D6] font-bold py-4 px-6 rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {downloading ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        {downloading ? 'กำลังเตรียม...' : 'ดาวน์โหลดรูป'}
      </button>

      {/* Off-screen card (capturable, never visible). Width fixed at 1200; the
          card grows to its natural content height, which html-to-image reads
          directly (no clipping). */}
      <div
        aria-hidden="true"
        ref={cardRef}
        style={{
          position: 'fixed',
          left: -2000,
          top: 0,
          width: 1200,
          pointerEvents: 'none',
          zIndex: -1,
        }}
      >
        <ShareResultCard {...props} />
      </div>
    </>
  )
}
