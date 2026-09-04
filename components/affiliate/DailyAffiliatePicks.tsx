import 'server-only'

import AffiliateRail from './AffiliateRail'
import { getAffiliateRailProducts } from '@/lib/affiliate-public'

interface DailyAffiliatePicksProps {
  collectionId: string | null
}

/**
 * Server-rendered Daily completion recommendations.
 *
 * The collection/product query, URL re-validation, disclosure, sponsored
 * semantics, and card styling all remain on the existing M1 rail path. The
 * client Daily runtime receives this component as a slot and decides when it
 * becomes visible; it is never rendered during active answering.
 */
export default async function DailyAffiliatePicks({ collectionId }: DailyAffiliatePicksProps) {
  if (!collectionId) return null

  try {
    const products = await getAffiliateRailProducts(collectionId)
    if (products.length === 0) return null

    return (
      <div
        className="mt-10 border-t border-[rgba(212,175,55,0.12)] pt-8"
        data-testid="daily-completion-affiliate"
      >
        <AffiliateRail
          products={products}
          collectionId={collectionId}
          contentType="daily"
          contentSlug="daily"
          clickPlacement="daily_complete"
          eyebrow="SOBDAI PICKS"
          heading="อุปกรณ์สำหรับคนเตรียมสอบ"
        />
      </div>
    )
  } catch (error) {
    console.error('DailyAffiliatePicks: optional query failed:', error)
    return null
  }
}
