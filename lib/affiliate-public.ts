import 'server-only'

import { cache } from 'react'
import { createAnonServerClient } from '@/lib/supabase/anon-server'
import {
  AFFILIATE_MAX_RAIL_PRODUCTS,
  cleanAffiliateUrl,
  type AffiliateRailProduct,
} from '@/lib/affiliate'

/**
 * Public affiliate reads — the lib/articles-public.ts pattern: 'server-only'
 * module, React cache() so generateMetadata/page share one round-trip, and the
 * cookie-free anon client (RLS is the only gate: published products in
 * published collections).
 *
 * ONE joined query per rail (no N+1): junction → products with an !inner embed
 * filtered on the embedded product's status, ordered by the junction's
 * sort_order (deterministic tie-break on product_id), capped at the rail max.
 *
 * Render-safety mirrors NewsCtaBox's resolution rules: rows whose affiliate
 * URL fails the HTTPS re-validation at render time are dropped rather than
 * rendered (defense in depth against a bad row edited outside the contract).
 */

interface RailItemRow {
  product_id: string
  product: {
    id: string
    name: string
    image_url: string | null
    image_alt: string | null
    merchant: string | null
    affiliate_url: string
    short_description: string | null
  } | null
}

/**
 * Resolve the rail products for a content row's assigned collection.
 * Returns [] for a null collection id, on query error, or when zero published
 * products survive — callers render nothing in that case (the NewsCtaBox
 * hide-when-empty contract).
 */
export const getAffiliateRailProducts = cache(
  async (collectionId: string | null): Promise<AffiliateRailProduct[]> => {
    if (!collectionId) return []

    try {
      const supabase = createAnonServerClient()
      const { data, error } = await supabase
        .from('affiliate_collection_items')
        .select(
          `product_id,
           product:affiliate_products!inner (
             id, name, image_url, image_alt, merchant, affiliate_url, short_description
           )`
        )
        .eq('collection_id', collectionId)
        .eq('product.status', 'published')
        .order('sort_order', { ascending: true })
        .order('product_id', { ascending: true })
        .limit(AFFILIATE_MAX_RAIL_PRODUCTS)

      if (error) {
        console.error('getAffiliateRailProducts query error:', error.message)
        return []
      }

      const rows = (data ?? []) as unknown as RailItemRow[]
      return rows
        .map((row) => {
          const p = row.product
          if (!p) return null
          // Re-validate the outbound URL server-side at render: a row that
          // somehow holds a non-HTTPS link must never reach an anchor.
          if (!cleanAffiliateUrl(p.affiliate_url)) return null
          if (!p.name) return null
          return {
            id: p.id,
            name: p.name,
            image_url: p.image_url ?? '',
            image_alt: p.image_alt,
            merchant: p.merchant || 'shopee',
            affiliate_url: p.affiliate_url,
            short_description: p.short_description,
          } satisfies AffiliateRailProduct
        })
        .filter((p): p is AffiliateRailProduct => p !== null)
    } catch (err) {
      console.error('Unexpected error in getAffiliateRailProducts:', err)
      return []
    }
  }
)
