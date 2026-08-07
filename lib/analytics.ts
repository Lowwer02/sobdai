import { readConsentFromDocumentCookie } from '@/lib/consent'

declare global {
  interface Window {
    dataLayer?: Record<string, any>[]
  }
}

/**
 * Internal helper to safely push events to GTM dataLayer on client side.
 */
function pushToDataLayer(payload: Record<string, any>): void {
  if (typeof window === 'undefined') return

  const consent = readConsentFromDocumentCookie()
  if (!consent || !consent.analytics) return

  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

/**
 * Track user sign up event.
 */
export function signUp(method: string = 'email'): void {
  pushToDataLayer({
    event: 'sign_up',
    method,
  })
}

/**
 * Track user login event.
 */
export function login(method: string = 'email'): void {
  pushToDataLayer({
    event: 'login',
    method,
  })
}

/**
 * Track viewing a package detail.
 */
export function viewPackage(
  packageId: string | number,
  packageName: string,
  price: number
): void {
  pushToDataLayer({
    event: 'view_item',
    ecommerce: {
      currency: 'THB',
      value: price,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price,
        },
      ],
    },
  })
}

/**
 * Track initiating the checkout flow for a package.
 */
export function beginCheckout(
  packageId: string | number,
  packageName: string,
  value: number
): void {
  pushToDataLayer({
    event: 'begin_checkout',
    ecommerce: {
      currency: 'THB',
      value,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price: value,
        },
      ],
    },
  })
}

/**
 * Track successful order purchase.
 */
export function purchase(
  transactionId: string,
  packageId: string | number,
  packageName: string,
  value: number,
  currency: string = 'THB'
): void {
  pushToDataLayer({
    event: 'purchase',
    ecommerce: {
      transaction_id: transactionId,
      value,
      currency,
      items: [
        {
          item_id: String(packageId),
          item_name: packageName,
          price: value,
        },
      ],
    },
  })
}

/**
 * Track starting an exam session.
 */
export function startExam(
  examId: string | number,
  examName: string,
  category?: string
): void {
  pushToDataLayer({
    event: 'start_exam',
    exam_id: String(examId),
    exam_name: examName,
    ...(category ? { exam_category: category } : {}),
  })
}

/**
 * Track submitting an exam for grading.
 */
export function submitExam(examId: string | number): void {
  pushToDataLayer({
    event: 'submit_exam',
    exam_id: String(examId),
  })
}

/**
 * Track completing an exam and viewing final score/results.
 */
export function completeExam(
  examId: string | number,
  score: number,
  correct: number,
  wrong: number
): void {
  pushToDataLayer({
    event: 'complete_exam',
    exam_id: String(examId),
    score,
    correct_answers: correct,
    wrong_answers: wrong,
  })
}

/**
 * Track a click on a News CTA box button. Fired immediately before internal
 * navigation by the tiny client <NewsCtaLink> wrapper. Reuses the existing
 * SSR-safe pushToDataLayer (no gtag / no GA import). Parameters mirror the
 * spec's news_cta_click event; optional fields are omitted when absent so the
 * dataLayer entry stays clean.
 */
export function trackCtaClick(params: {
  news_id: string
  news_slug: string
  cta_position: 'primary' | 'secondary'
  destination_type: 'package' | 'summary' | 'exam' | 'internal'
  destination_id?: string | null
  destination_path: string
  button_label: string
}): void {
  pushToDataLayer({
    event: 'news_cta_click',
    news_id: params.news_id,
    news_slug: params.news_slug,
    cta_position: params.cta_position,
    destination_type: params.destination_type,
    ...(params.destination_id ? { destination_id: params.destination_id } : {}),
    destination_path: params.destination_path,
    button_label: params.button_label,
  })
}

/**
 * Track a click on a News share button (Facebook or LINE).
 */
export function trackNewsShareClick(params: {
  news_id: string
  news_slug: string
  platform: 'facebook' | 'line'
  share_location: 'article_header' | 'article_footer'
  destination_url: string
}): void {
  pushToDataLayer({
    event: 'news_share_click',
    news_id: params.news_id,
    news_slug: params.news_slug,
    platform: params.platform,
    share_location: params.share_location,
    destination_url: params.destination_url,
  })
}

/**
 * Track a click on a Homepage Latest News card.
 */
export function trackHomepageNewsClick(params: {
  news_id: string
  news_slug: string
  news_title: string
  position: number
  section_location: string
  destination_url: string
}): void {
  pushToDataLayer({
    event: 'homepage_news_click',
    news_id: params.news_id,
    news_slug: params.news_slug,
    news_title: params.news_title,
    position: params.position,
    section_location: params.section_location,
    destination_url: params.destination_url,
  })
}

/**
 * Track a click on the "View All" link in the Homepage Latest News section header.
 */
export function trackHomepageNewsViewAllClick(params: {
  section_location: string
  destination_url: string
}): void {
  pushToDataLayer({
    event: 'homepage_news_view_all_click',
    section_location: params.section_location,
    destination_url: params.destination_url,
  })
}

/**
 * Track a click on a Social Follow CTA link.
 */
export function trackSocialFollowClick(params: {
  platform: 'facebook' | 'line' | 'tiktok'
  placement: 'news_detail_end'
  content_id: string
}): void {
  pushToDataLayer({
    event: 'social_follow_click',
    platform: params.platform,
    placement: params.placement,
    content_id: params.content_id,
  })
}
