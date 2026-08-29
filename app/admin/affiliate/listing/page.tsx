import { requirePermission } from '@/lib/auth/server-protect'
import { getAffiliateListingConfigs } from '@/lib/affiliate-public'
import { listAffiliateCollectionsForContent } from '../actions'
import ListingSettingsClient from './ListingSettingsClient'

/**
 * Affiliate Listing Strip settings — admin page (Server Component).
 *
 * M2 scope: ONE screen configuring the two frozen listing slots (/news,
 * /articles). Each slot has exactly two controls — enabled + collection — per
 * the M2 non-goals (no position/count/multi-slot controls; position after item
 * #6 is frozen in code).
 *
 * Convention: requirePermission('content.read') guards the page like the other
 * affiliate admin pages; the save action re-gates on content.write. Config
 * rows are read via the public fetcher (RLS public-select, non-sensitive) and
 * the collection picker via the shared M1 read action.
 */
export default async function AffiliateListingSettingsPage() {
  await requirePermission('content.read')

  const [configs, collectionsRes] = await Promise.all([
    getAffiliateListingConfigs(),
    listAffiliateCollectionsForContent(),
  ])

  return (
    <ListingSettingsClient
      configs={configs}
      collections={collectionsRes.success ? collectionsRes.data : []}
      collectionsError={collectionsRes.success ? undefined : collectionsRes.error}
    />
  )
}
