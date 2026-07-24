/**
 * Client subcomponent for the Promotion banner image — the ONLY client piece
 * of the Promotion section. A plain <img> (not next/image, so onError is
 * trivially reliable) that hides itself on load failure via opacity 0; the
 * parent wrapper's gradient then shows through as a graceful fallback. No
 * layout shift because the wrapper keeps its fixed aspect-ratio.
 *
 * Plain <img> is used instead of next/image because promotion image_url
 * values are arbitrary admin-supplied URLs; next/image would require
 * allow-listing every possible host in next.config, which we must not change.
 */
'use client'

import { useState } from 'react'

export default function PromotionImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        objectFit: 'cover',
      }}
    />
  )
}
